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
