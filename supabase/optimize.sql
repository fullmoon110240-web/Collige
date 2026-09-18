-- =====================================================================
-- 콜리지 놀이 - 데이터베이스 간소화 (STEP 2)
--
-- supabase/worldview.sql을 먼저 실행한 뒤 이 파일을 실행하세요.
-- 실행 순서: 이 SQL 먼저 → 코드 배포 → 확인 후 맨 아래 STEP 9(정리)
--
-- 무엇을 정리하는가
--   1) quotes.image / quotes.image_title 를 expression_id 외래키 하나로 대체
--      → 같은 값을 두 테이블에 중복 저장하지 않게 됩니다.
--      → 이를 유지하려고 만든 sync_expression_links 트리거가 통째로 사라집니다.
--      → 세계관마다 같은 이름의 표정을 둘 때 생기던 충돌 문제도 같이 사라집니다.
--   2) quotes.item_name(한글 표시명) → item_id(고정 키)
--      → 아이템 이름을 바꿔도 대사 연결이 끊기지 않습니다.
--   3) 실제로 쓰이지 않는 인덱스 4개 제거
--      → 앱은 전체를 한 번에 읽고 브라우저에서 거르므로 WHERE 절이 없습니다.
--         쓰이지 않는 인덱스는 쓰기 비용과 저장공간만 잡아먹습니다.
--      → 외래키(on delete set null) 조회를 받쳐주는 인덱스만 남깁니다.
-- =====================================================================


-- =====================================================================
-- STEP 0. 백업
-- =====================================================================
select backup.snapshot('quotes');
select backup.snapshot('expressions');

-- backup 스키마가 아직 없다면 supabase/worldview.sql의 STEP 0을 먼저 실행하세요.


-- =====================================================================
-- STEP 1. 표정 참조를 외래키로
-- =====================================================================
alter table public.quotes
  add column if not exists expression_id uuid
  references public.expressions(id) on delete set null;


-- =====================================================================
-- STEP 2. 기존 image_title 값을 expression_id로 옮기기
-- 캐릭터 + 표정이름 + 세계관이 모두 같은 표정을 찾아 연결합니다.
-- =====================================================================
update public.quotes q
   set expression_id = e.id
  from public.expressions e
 where q.expression_id is null
   and coalesce(q.image_title, '') <> ''
   and e.character_id = q.character_id
   and e.name = q.image_title
   and e.worldview_id is not distinct from q.worldview_id;

-- 세계관이 어긋나 연결하지 못한 대사가 있는지 확인합니다. 0이면 완벽합니다.
select count(*) as unmatched
  from public.quotes
 where coalesce(image_title, '') <> ''
   and expression_id is null;

-- 남아 있다면 세계관을 무시하고 이름만으로 한 번 더 연결합니다.
-- (여러 세계관에 같은 이름의 표정이 있으면 가장 먼저 만든 것을 씁니다)
-- update public.quotes q
--    set expression_id = e.id
--   from (
--     select distinct on (character_id, name) id, character_id, name
--       from public.expressions
--      order by character_id, name, created_at
--   ) e
--  where q.expression_id is null
--    and coalesce(q.image_title, '') <> ''
--    and e.character_id = q.character_id
--    and e.name = q.image_title;


-- =====================================================================
-- STEP 3. 아이템 참조를 고정 키로
-- 키 값은 js/data/items.js의 키와 같아야 합니다.
-- =====================================================================
alter table public.quotes
  add column if not exists item_id text not null default '';

update public.quotes
   set item_id = case coalesce(item_name, '')
                   when '단검'   then 'dagger'
                   when '코코아' then 'cocoa'
                   when '심장'   then 'heart'
                   when '금화'   then 'gold'
                   else ''
                 end
 where item_id = '';

-- 매칭되지 않은 아이템 이름이 있는지 확인합니다. 결과가 없으면 정상입니다.
select distinct item_name
  from public.quotes
 where coalesce(item_name, '') <> ''
   and item_id = '';


-- =====================================================================
-- STEP 4. 동기화 트리거 제거
-- 이제 표정 이름/URL은 expressions 한 곳에만 있으므로 맞춰줄 것이 없습니다.
-- =====================================================================
drop trigger if exists expressions_sync_quote_links on public.expressions;
drop function if exists public.sync_expression_links();


-- =====================================================================
-- STEP 5. 쓰이지 않는 인덱스 제거
--
-- 앱의 유일한 조회는 "전체를 created_at 순으로" 이며 WHERE 절이 없습니다.
-- 아래 네 개는 어떤 쿼리도 타지 않고 INSERT/UPDATE만 느리게 만듭니다.
-- =====================================================================
drop index if exists public.quotes_character_created_idx;
drop index if exists public.expressions_character_created_idx;
drop index if exists public.quotes_item_idx;
drop index if exists public.quotes_expression_title_idx;

-- 외래키를 받쳐주는 인덱스만 남깁니다.
-- (on delete set null이 참조 행을 찾을 때 실제로 사용됩니다)
drop index if exists public.quotes_worldview_idx;
drop index if exists public.expressions_worldview_idx;

create index if not exists quotes_worldview_idx
  on public.quotes (worldview_id);

create index if not exists expressions_worldview_idx
  on public.expressions (worldview_id);

create index if not exists quotes_expression_idx
  on public.quotes (expression_id);


-- =====================================================================
-- STEP 6. 확인
-- =====================================================================
-- 표정이 연결된 대사
-- select q.text, e.name, e.url
--   from public.quotes q
--   join public.expressions e on e.id = q.expression_id
--  limit 20;

-- 인덱스 현황
-- select tablename, indexname
--   from pg_indexes
--  where schemaname = 'public'
--    and tablename in ('quotes', 'expressions', 'worldviews', 'worldview_characters')
--  order by tablename, indexname;


-- =====================================================================
-- STEP 9. 옛 컬럼 정리  ← 코드 배포 후 며칠 써보고 문제없을 때 실행
--
-- 이 세 컬럼을 지우기 전까지는 예전 코드로 되돌려도 그대로 동작합니다.
-- 그래서 일부러 분리해 두었습니다. 서두르지 마세요.
-- =====================================================================
-- alter table public.quotes drop column if exists image;
-- alter table public.quotes drop column if exists image_title;
-- alter table public.quotes drop column if exists item_name;
