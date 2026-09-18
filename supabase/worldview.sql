-- =====================================================================
-- 콜리지 놀이 - 세계관(worldview) 마이그레이션
--
-- 이미 운영 중인 데이터베이스에 세계관 기능을 얹는 스크립트입니다.
-- Supabase SQL Editor에서 STEP 0부터 순서대로 실행하세요.
-- 처음부터 새로 만드는 경우에는 supabase/schema.sql 하나만 실행하면 됩니다.
-- =====================================================================


-- =====================================================================
-- STEP 0. 백업 먼저
--
-- public이 아닌 backup 스키마에 둡니다. Supabase는 API Settings에 등록된
-- 스키마(기본값: public, graphql_public)만 PostgREST로 노출하므로,
-- backup 스키마는 브라우저의 Publishable Key로 읽지도 지우지도 못합니다.
-- 재분류 작업 중 실수로 원본을 건드려도 백업본은 안전합니다.
-- =====================================================================

create schema if not exists backup;

revoke all on schema backup from anon, authenticated;
revoke all on all tables in schema backup from anon, authenticated;
alter default privileges in schema backup
  revoke all on tables from anon, authenticated;

-- 오늘자 스냅샷. 날짜 태그를 바꿔 여러 세대를 남겨두세요.
create table backup.quotes_20260918      as table public.quotes;
create table backup.expressions_20260918 as table public.expressions;

-- 참고: create table ... as table ... 은 "데이터만" 복사합니다.
--       PK / default / index / RLS는 따라오지 않습니다.
--       되돌리기용 스냅샷 목적에는 이 편이 가볍고 안전합니다.


-- 매번 손으로 치기 번거로우면 스냅샷 함수를 만들어 두세요.
create or replace function backup.snapshot(
  p_table text,
  p_tag   text default to_char(now(), 'YYYYMMDD_HH24MI')
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := p_table || '_' || p_tag;
begin
  execute format('create table backup.%I as table public.%I', v_name, p_table);
  return 'backup.' || v_name;
end;
$$;

-- 사용법
--   select backup.snapshot('quotes');        -- backup.quotes_20260918_1432
--   select backup.snapshot('expressions');

-- 보관 중인 스냅샷 확인
--   select table_name,
--          pg_size_pretty(pg_total_relation_size(format('backup.%I', table_name))) as size
--   from information_schema.tables
--   where table_schema = 'backup'
--   order by table_name desc;

-- 오래된 스냅샷 정리
--   drop table backup.quotes_20260901;


-- ---------------------------------------------------------------------
-- 되돌리기 (복원)
--
-- worldview_id를 추가한 뒤에는 select * 가 어긋나므로 컬럼을 명시합니다.
-- ---------------------------------------------------------------------
-- begin;
--   delete from public.quotes;
--   insert into public.quotes (id, character_id, text, image, image_title, item_name, created_at)
--   select                     id, character_id, text, image, image_title, item_name, created_at
--   from backup.quotes_20260918;
-- commit;
--
-- 세계관 분류만 통째로 되돌리고 싶을 때:
--   update public.quotes set worldview_id = null;


-- ---------------------------------------------------------------------
-- (선택) 재분류 중 실수로 지운 행까지 남기는 이력 테이블
-- ---------------------------------------------------------------------
-- create table if not exists backup.quotes_history (
--   history_id bigserial primary key,
--   changed_at timestamptz not null default now(),
--   operation  text not null,
--   row_data   jsonb not null
-- );
--
-- create or replace function backup.log_quote_change()
-- returns trigger language plpgsql security definer set search_path = '' as $$
-- begin
--   insert into backup.quotes_history (operation, row_data) values (tg_op, to_jsonb(old));
--   return old;
-- end;
-- $$;
--
-- create trigger quotes_history_trg
--   before update or delete on public.quotes
--   for each row execute function backup.log_quote_change();
--
-- 끄기: drop trigger quotes_history_trg on public.quotes;


-- ---------------------------------------------------------------------
-- 파일 단위 백업도 따로 챙기세요
--   Dashboard → Database → Backups  (자동 일일 백업, Pro 이상은 PITR)
--   supabase db dump -f collige_20260918.sql --linked
--   표정/아이템 이미지를 Storage에 올렸다면 해당 버킷도 따로 내려받기
-- ---------------------------------------------------------------------



-- =====================================================================
-- STEP 1. 세계관 테이블
-- =====================================================================
create extension if not exists pgcrypto;

create table if not exists public.worldviews (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 대소문자만 다른 중복 이름 방지
create unique index if not exists worldviews_name_uniq
  on public.worldviews (lower(name));

create index if not exists worldviews_order_idx
  on public.worldviews (sort_order, created_at);


-- =====================================================================
-- STEP 2. 세계관별 캐릭터 기본 이미지
-- character_id는 앱의 캐릭터 키를 그대로 씁니다: 'shimeji-cole' / 'shimeji-ellie'
-- =====================================================================
create table if not exists public.worldview_characters (
  worldview_id      uuid not null references public.worldviews(id) on delete cascade,
  character_id      text not null,
  default_image_url text not null,
  created_at        timestamptz not null default now(),
  primary key (worldview_id, character_id)
);


-- =====================================================================
-- STEP 3. 기존 테이블에 세계관 연결
--
-- on delete set null인 이유:
--   세계관을 지워도 대사와 표정은 살아남아 '미분류'가 됩니다.
--   미분류는 버튼을 전부 해제한 상태에서 계속 보이므로,
--   실수로 세계관을 지워도 데이터가 조용히 사라지지 않습니다.
-- =====================================================================
alter table public.quotes
  add column if not exists worldview_id uuid
  references public.worldviews(id) on delete set null;

alter table public.expressions
  add column if not exists worldview_id uuid
  references public.worldviews(id) on delete set null;

create index if not exists quotes_worldview_idx
  on public.quotes (worldview_id, character_id);

create index if not exists expressions_worldview_idx
  on public.expressions (worldview_id, character_id);


-- =====================================================================
-- STEP 4. 표정 동기화 트리거를 세계관까지 보도록 수정
--
-- 세계관마다 같은 이름의 표정('웃음' 등)을 따로 둘 수 있게 되었으므로,
-- 이름만 보고 대사를 갱신하면 다른 세계관의 대사까지 건드립니다.
-- worldview_id가 같은 대사만 갱신하도록 조건을 추가합니다.
-- (is not distinct from: 양쪽 다 null인 미분류끼리도 정상 매칭)
-- =====================================================================
create or replace function public.sync_expression_links()
returns trigger
language plpgsql
security invoker
as $$
begin
  if TG_OP = 'UPDATE' then
    if OLD.character_id = NEW.character_id then
      update public.quotes
         set image = NEW.url,
             image_title = NEW.name
       where character_id = NEW.character_id
         and image_title = OLD.name
         and worldview_id is not distinct from NEW.worldview_id;
    else
      update public.quotes
         set image = '',
             image_title = ''
       where character_id = OLD.character_id
         and image_title = OLD.name
         and worldview_id is not distinct from OLD.worldview_id;
    end if;
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    update public.quotes
       set image = '',
           image_title = ''
     where character_id = OLD.character_id
       and image_title = OLD.name
       and worldview_id is not distinct from OLD.worldview_id;
    return OLD;
  end if;

  return NEW;
end;
$$;

drop trigger if exists expressions_sync_quote_links on public.expressions;
create trigger expressions_sync_quote_links
after update or delete on public.expressions
for each row execute function public.sync_expression_links();


-- =====================================================================
-- STEP 5. RLS - 기존 quotes/expressions와 같은 수준으로 맞춥니다.
-- 로그인 없이 브라우저에서 쓰는 현재 방식이므로 누구나 읽고 쓸 수 있습니다.
-- 개인 전용으로 전환할 때는 네 테이블을 함께 Auth 기반 정책으로 바꾸세요.
-- =====================================================================
alter table public.worldviews enable row level security;
alter table public.worldview_characters enable row level security;

drop policy if exists "worldviews_public_select" on public.worldviews;
drop policy if exists "worldviews_public_insert" on public.worldviews;
drop policy if exists "worldviews_public_update" on public.worldviews;
drop policy if exists "worldviews_public_delete" on public.worldviews;

create policy "worldviews_public_select"
  on public.worldviews for select to anon, authenticated using (true);
create policy "worldviews_public_insert"
  on public.worldviews for insert to anon, authenticated with check (true);
create policy "worldviews_public_update"
  on public.worldviews for update to anon, authenticated using (true) with check (true);
create policy "worldviews_public_delete"
  on public.worldviews for delete to anon, authenticated using (true);

drop policy if exists "worldview_characters_public_select" on public.worldview_characters;
drop policy if exists "worldview_characters_public_insert" on public.worldview_characters;
drop policy if exists "worldview_characters_public_update" on public.worldview_characters;
drop policy if exists "worldview_characters_public_delete" on public.worldview_characters;

create policy "worldview_characters_public_select"
  on public.worldview_characters for select to anon, authenticated using (true);
create policy "worldview_characters_public_insert"
  on public.worldview_characters for insert to anon, authenticated with check (true);
create policy "worldview_characters_public_update"
  on public.worldview_characters for update to anon, authenticated using (true) with check (true);
create policy "worldview_characters_public_delete"
  on public.worldview_characters for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.worldviews to anon, authenticated;
grant select, insert, update, delete on public.worldview_characters to anon, authenticated;


-- =====================================================================
-- STEP 6. 재분류 작업용 쿼리 모음
-- =====================================================================

-- 세계관 만들기 (앱의 + 버튼으로도 됩니다)
-- insert into public.worldviews (name, sort_order) values
--   ('학원', 0),
--   ('중세', 1),
--   ('현대', 2);

-- 세계관별 기본 이미지 (앱의 ≡ → 이미지 버튼으로도 됩니다)
-- insert into public.worldview_characters (worldview_id, character_id, default_image_url)
-- select id, 'shimeji-cole', 'https://.../cole_academy.png'
--   from public.worldviews where name = '학원'
-- on conflict (worldview_id, character_id)
-- do update set default_image_url = excluded.default_image_url;

-- 대사를 세계관으로 옮기기
-- update public.quotes
--    set worldview_id = (select id from public.worldviews where name = '중세')
--  where character_id = 'shimeji-cole'
--    and id in ('...', '...');

-- 표정 이름으로 묶어서 옮기기
-- update public.expressions
--    set worldview_id = (select id from public.worldviews where name = '중세')
--  where name in ('분노', '미소');

-- 표정을 옮겼으면 그 표정을 쓰는 대사도 같이 옮겨야 짝이 맞습니다.
-- update public.quotes q
--    set worldview_id = e.worldview_id
--   from public.expressions e
--  where q.character_id = e.character_id
--    and q.image_title = e.name
--    and q.image_title <> '';

-- 아직 분류하지 않은 것
-- select character_id, count(*) from public.quotes
--  where worldview_id is null group by 1;

-- 세계관별 현황
-- select coalesce(w.name, '(미분류)') as worldview, q.character_id, count(*)
--   from public.quotes q
--   left join public.worldviews w on w.id = q.worldview_id
--  group by 1, 2 order by 1, 2;
