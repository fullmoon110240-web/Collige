import { fetchAllData } from './supabase.js';
import { setLoadedData } from './state.js';
import { initializeCharacters, setupGlobalGuideTimer } from './modules/characters.js';
import { initializeItems } from './modules/items.js';
import { initializeModals } from './modules/modals.js';
import { initializeWorldview, restoreWorldviewSelection } from './modules/worldview.js';
import { initializeCursorTrail } from './modules/cursor.js';
import { initializeMusicPlayer } from './modules/player.js';
import { initializeUpdates } from './modules/update.js';
import { initializeAlwaysOnTop } from './modules/ontop.js';
import { initializeSfx } from './modules/sfx.js';
import { initializeControls } from './modules/controls.js';
import { hideLoading, setLoadingMessage } from './ui.js';

// 주소에 ?pip=1 이 붙어 있으면 '항상 위에 띄운 작은 창' 안입니다.
const EMBEDDED = new URLSearchParams(location.search).has('pip');

// supabase/optimize.sql을 실행하지 않은 채 새 코드를 올렸을 때를 알아봅니다.
function isMigrationPending(error) {
  return /item_id|expression_id/.test(String(error?.message ?? ''));
}

async function boot() {
  try {
    const data = await fetchAllData();
    setLoadedData(data);
  } catch (error) {
    console.error('Supabase 데이터 로드 실패:', error);

    if (isMigrationPending(error)) {
      // 이 경우엔 데이터가 통째로 없으므로 화면을 열지 않고 안내만 남깁니다.
      console.error('[migration] supabase/optimize.sql을 아직 실행하지 않았습니다.');
      setLoadingMessage(`supabase/optimize.sql을 먼저 실행한 뒤 새로고침해 주세요. (${error.message || error})`);
      return;
    }

    setLoadingMessage('데이터를 불러오지 못했습니다. Supabase 설정과 RLS를 확인해 주세요.');
    // 화면 자체는 빈 데이터로 계속 열어둔다. 저장 기능은 이후 오류를 표시한다.
    setLoadedData({ quotes: [], expressions: [], worldviews: [], worldviewImages: [], worldviewSupported: false });
  }

  try {
    // 캐릭터를 만들기 전에 복원해야 첫 화면부터 세계관 기본 이미지가 맞습니다.
    restoreWorldviewSelection();

    // 효과음은 캐릭터를 만들기 전에 준비해 둡니다.
    initializeSfx();

    initializeModals();
    initializeCharacters();
    initializeItems();
    initializeWorldview();

    // 왼쪽 위 효과음 · AUTO 단추. 캐릭터를 만든 뒤라야 말을 시킬 수 있습니다.
    initializeControls();
    setupGlobalGuideTimer();

    /*
     * 아래 셋은 '항상 위에 띄운 작은 창' 안에서는 켜지 않습니다.
     * 그 창은 이 앱을 ?pip=1 로 한 벌 더 띄운 것이라,
     * 커서 캐릭터가 두 쌍이 되고 알림도 두 번 뜨기 때문입니다.
     */
    // 오른쪽 위 음악 재생바. 작은 창에서도 씁니다.
    // (원래 창의 노래는 작은 창을 띄울 때 멈춥니다 - modules/ontop.js)
    initializeMusicPlayer();

    if (!EMBEDDED) {
      // 마우스를 따라다니는 캐릭터. 그림은 modules/cursor.js 에 적혀 있습니다.
      initializeCursorTrail();

      // 앱으로 설치하기 + 새 버전 알림.
      initializeUpdates();

      // 왼쪽 위 '항상 위에 띄우기' 단추. 크롬·엣지(컴퓨터)에서만 나옵니다.
      initializeAlwaysOnTop();
    }
  } catch (error) {
    console.error('화면 초기화 실패:', error);
    setLoadingMessage('화면을 준비하는 중 문제가 발생했습니다.');
  } finally {
    hideLoading();
  }
}

document.addEventListener('DOMContentLoaded', boot, { once: true });
