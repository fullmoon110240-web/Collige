# 콜리지 캐릭터 영역 + 아이템 영역

GitHub Pages용 정적 웹 프로젝트입니다.

## GitHub Pages 배포

저장소 루트에 `index.html`이 있어야 합니다.

GitHub → Settings → Pages → Build and deployment → Source에서 `Deploy from a branch`를 선택하고,
Branch는 `main`, Folder는 `/(root)`로 설정하세요.

이 프로젝트는 아래처럼 저장소 최상단에 `index.html`이 있어야 합니다.

```text
repository-root/
├─ index.html
├─ css/
├─ js/
├─ supabase/
└─ .nojekyll
```

GitHub Pages의 프로젝트 사이트 주소는 기본적으로 `https://<사용자명>.github.io/<저장소명>/` 형태입니다.

## Supabase

`js/config.js`에 Supabase Project URL과 Publishable Key가 설정되어 있습니다.
브라우저에 노출되는 키이므로 Supabase RLS 정책으로 쓰기 권한을 제한해야 합니다.

`supabase/schema.sql`을 Supabase SQL Editor에서 실행해 테이블과 RLS 정책을 생성하세요.


## Responsive layout

캐릭터 행과 아이템 행을 하나의 고정 비율 스테이지로 묶어 창의 가로/세로 형태에 따라 전체 크기만 비례 축소·확대합니다. 콜은 중앙 말풍선 영역의 왼쪽 안쪽 가장자리에, 엘리는 오른쪽 안쪽 가장자리에 붙고 아이템은 중앙 말풍선 영역 아래에 배치됩니다.
