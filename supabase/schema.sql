-- 콜리지 놀이 - Supabase 초기 스키마
-- 브라우저에는 Publishable Key만 들어가며, 실제 데이터 접근은 RLS가 결정합니다.

create extension if not exists pgcrypto;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  character_id text not null,
  text text not null,
  image text not null default '',
  image_title text not null default '',
  item_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.expressions (
  id uuid primary key default gen_random_uuid(),
  character_id text not null,
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);

alter table public.quotes
  add column if not exists created_at timestamptz not null default now();

alter table public.expressions
  add column if not exists created_at timestamptz not null default now();

create index if not exists quotes_character_created_idx
  on public.quotes (character_id, created_at, id);

create index if not exists expressions_character_created_idx
  on public.expressions (character_id, created_at, id);

create index if not exists quotes_item_idx
  on public.quotes (character_id, item_name);

create index if not exists quotes_expression_title_idx
  on public.quotes (character_id, image_title);

-- 표정 이름/URL을 수정하면 연결된 대사의 이미지 정보도 같이 갱신합니다.
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
         and image_title = OLD.name;
    else
      update public.quotes
         set image = '',
             image_title = ''
       where character_id = OLD.character_id
         and image_title = OLD.name;
    end if;
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    update public.quotes
       set image = '',
           image_title = ''
     where character_id = OLD.character_id
       and image_title = OLD.name;
    return OLD;
  end if;

  return NEW;
end;
$$;

drop trigger if exists expressions_sync_quote_links on public.expressions;
create trigger expressions_sync_quote_links
after update or delete on public.expressions
for each row execute function public.sync_expression_links();

-- GitHub Pages처럼 로그인 없이 브라우저에서 사용하는 현재 버전의 정책입니다.
-- Publishable Key 자체는 공개되어도 되지만, 아래 정책을 쓰면 누구나 이 프로젝트의
-- quotes/expressions 데이터를 읽고 쓰고 삭제할 수 있습니다.
-- 개인 전용 운영으로 전환할 때는 Supabase Auth 기반 정책으로 교체해야 합니다.

alter table public.quotes enable row level security;
alter table public.expressions enable row level security;

drop policy if exists "quotes_public_select" on public.quotes;
drop policy if exists "quotes_public_insert" on public.quotes;
drop policy if exists "quotes_public_update" on public.quotes;
drop policy if exists "quotes_public_delete" on public.quotes;

drop policy if exists "expressions_public_select" on public.expressions;
drop policy if exists "expressions_public_insert" on public.expressions;
drop policy if exists "expressions_public_update" on public.expressions;
drop policy if exists "expressions_public_delete" on public.expressions;

create policy "quotes_public_select"
  on public.quotes for select to anon, authenticated using (true);

create policy "quotes_public_insert"
  on public.quotes for insert to anon, authenticated with check (true);

create policy "quotes_public_update"
  on public.quotes for update to anon, authenticated using (true) with check (true);

create policy "quotes_public_delete"
  on public.quotes for delete to anon, authenticated using (true);

create policy "expressions_public_select"
  on public.expressions for select to anon, authenticated using (true);

create policy "expressions_public_insert"
  on public.expressions for insert to anon, authenticated with check (true);

create policy "expressions_public_update"
  on public.expressions for update to anon, authenticated using (true) with check (true);

create policy "expressions_public_delete"
  on public.expressions for delete to anon, authenticated using (true);

-- Data API에서 테이블을 사용할 수 있도록 최소 권한을 부여합니다.
grant select, insert, update, delete on public.quotes to anon, authenticated;
grant select, insert, update, delete on public.expressions to anon, authenticated;
