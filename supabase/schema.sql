-- 콜리지 놀이 - Supabase 스키마 (정리본)
-- 브라우저에는 Publishable Key만 들어가며, 실제 데이터 접근은 RLS가 결정합니다.
--
-- 새로 만드는 경우: 이 파일 하나만 실행하면 됩니다.
-- 이미 운영 중인 경우: supabase/worldview.sql → supabase/optimize.sql 순서로 실행하세요.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 세계관
-- ---------------------------------------------------------------------
create table if not exists public.worldviews (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists worldviews_name_uniq
  on public.worldviews (lower(name));

-- 세계관별 캐릭터 기본 이미지.
-- character_id는 앱의 캐릭터 키입니다: 'shimeji-cole' / 'shimeji-ellie'
create table if not exists public.worldview_characters (
  worldview_id      uuid not null references public.worldviews(id) on delete cascade,
  character_id      text not null,
  default_image_url text not null,
  created_at        timestamptz not null default now(),
  primary key (worldview_id, character_id)
);

-- ---------------------------------------------------------------------
-- 표정
-- 이미지 URL은 오직 여기에만 있습니다. 대사는 id로 이 행을 가리킵니다.
-- ---------------------------------------------------------------------
create table if not exists public.expressions (
  id           uuid primary key default gen_random_uuid(),
  character_id text not null,
  name         text not null,
  url          text not null,
  worldview_id uuid references public.worldviews(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 대사
--   expression_id : 표정 참조. 없으면 기본 이미지로 말합니다.
--   item_id       : js/data/items.js의 키 ('dagger' 등). 비어 있으면 일반 대사.
--   worldview_id  : 없으면 미분류. 세계관을 전부 해제했을 때만 함께 나옵니다.
-- ---------------------------------------------------------------------
create table if not exists public.quotes (
  id            uuid primary key default gen_random_uuid(),
  character_id  text not null,
  text          text not null,
  item_id       text not null default '',
  expression_id uuid references public.expressions(id) on delete set null,
  worldview_id  uuid references public.worldviews(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 인덱스
--
-- 앱은 전체를 한 번에 읽고 브라우저에서 거릅니다. WHERE 절이 없으므로
-- 조회용 인덱스는 필요하지 않습니다. 아래 셋은 외래키의 on delete set null이
-- 참조 행을 찾을 때 실제로 사용되는 것들입니다.
-- ---------------------------------------------------------------------
create index if not exists quotes_expression_idx  on public.quotes (expression_id);
create index if not exists quotes_worldview_idx   on public.quotes (worldview_id);
create index if not exists expressions_worldview_idx on public.expressions (worldview_id);

-- ---------------------------------------------------------------------
-- RLS
--
-- GitHub Pages처럼 로그인 없이 브라우저에서 사용하는 현재 버전의 정책입니다.
-- Publishable Key 자체는 공개되어도 되지만, 아래 정책을 쓰면 누구나 이 프로젝트의
-- 데이터를 읽고 쓰고 삭제할 수 있습니다.
-- 개인 전용 운영으로 전환할 때는 네 테이블을 함께 Supabase Auth 기반 정책으로
-- 교체해야 합니다.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  op text;
begin
  foreach t in array array['quotes', 'expressions', 'worldviews', 'worldview_characters'] loop
    execute format('alter table public.%I enable row level security', t);

    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', t || '_public_' || op, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_public_select', t);
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated with check (true)',
      t || '_public_insert', t);
    execute format(
      'create policy %I on public.%I for update to anon, authenticated using (true) with check (true)',
      t || '_public_update', t);
    execute format(
      'create policy %I on public.%I for delete to anon, authenticated using (true)',
      t || '_public_delete', t);

    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end;
$$;
