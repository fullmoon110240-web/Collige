-- =====================================================================
-- 콜리지 놀이 - 대사와 표정의 세계관 맞추기 (정비용)
--
-- 대사는 expression_id로 표정을 정확히 가리킵니다.
-- 그래서 대사만 다른 세계관으로 옮기면 표정은 옛 세계관 것을 계속 물고 있습니다.
--   예) 크그 대사가 미분류 '분노' 이미지를 그대로 보여줌
--
-- 앱에서 세계관 태그로 옮길 때는 자동으로 맞춰주지만,
-- SQL로 한꺼번에 재분류한 뒤에는 이 파일을 실행해 주세요.
-- 여러 번 실행해도 안전합니다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 1. 어긋난 것 확인
-- ---------------------------------------------------------------------
select q.character_id                        as 캐릭터,
       e.name                                as 표정,
       coalesce(we.name, '(미분류)')          as 표정_세계관,
       coalesce(wq.name, '(미분류)')          as 대사_세계관,
       count(*)                              as 대사수
  from public.quotes q
  join public.expressions e       on e.id  = q.expression_id
  left join public.worldviews we  on we.id = e.worldview_id
  left join public.worldviews wq  on wq.id = q.worldview_id
 where e.worldview_id is distinct from q.worldview_id
 group by 1, 2, 3, 4
 order by 1, 2;


-- ---------------------------------------------------------------------
-- STEP 2. 대사가 속한 세계관에 같은 이름의 표정이 있으면 그쪽으로 다시 연결
--
-- 없는 경우에는 건드리지 않습니다. (표정이 통째로 사라지지 않게)
-- 그런 대사는 STEP 3에서 따로 확인하세요.
-- ---------------------------------------------------------------------
update public.quotes q
   set expression_id = (
     select e.id
       from public.expressions e
      where e.character_id = q.character_id
        and e.name = cur.name
        and e.worldview_id is not distinct from q.worldview_id
      order by e.created_at
      limit 1
   )
  from public.expressions cur
 where cur.id = q.expression_id
   and cur.worldview_id is distinct from q.worldview_id
   and exists (
     select 1
       from public.expressions e
      where e.character_id = q.character_id
        and e.name = cur.name
        and e.worldview_id is not distinct from q.worldview_id
   );


-- ---------------------------------------------------------------------
-- STEP 3. 아직 어긋나 있는 것
--
-- 대사가 속한 세계관에 같은 이름의 표정이 아예 없는 경우입니다.
-- 그 세계관에 표정을 먼저 만든 뒤 STEP 2를 한 번 더 실행하거나,
-- 앱의 대사 목록에서 노란색으로 표시된 표정 태그를 눌러 직접 지정하세요.
-- ---------------------------------------------------------------------
select q.id,
       q.text                                as 대사,
       e.name                                as 표정,
       coalesce(we.name, '(미분류)')          as 표정_세계관,
       coalesce(wq.name, '(미분류)')          as 대사_세계관
  from public.quotes q
  join public.expressions e       on e.id  = q.expression_id
  left join public.worldviews we  on we.id = e.worldview_id
  left join public.worldviews wq  on wq.id = q.worldview_id
 where e.worldview_id is distinct from q.worldview_id
 order by 5, 3;


-- ---------------------------------------------------------------------
-- 참고: 표정을 세계관별로 복제하기
--
-- 한 표정('분노')이 여러 세계관의 대사에 걸쳐 있으면 한쪽으로 몰 수 없습니다.
-- 세계관마다 하나씩 만들어 두고 STEP 2로 이어붙이는 편이 깔끔합니다.
-- 아래는 미분류 표정을 특정 세계관으로 복사하는 예시입니다.
-- ---------------------------------------------------------------------
-- insert into public.expressions (character_id, name, url, worldview_id)
-- select e.character_id, e.name, e.url, w.id
--   from public.expressions e
--   cross join (select id from public.worldviews where name = '크그') w
--  where e.worldview_id is null
--    and not exists (
--      select 1 from public.expressions x
--       where x.character_id = e.character_id
--         and x.name = e.name
--         and x.worldview_id = w.id
--    );
