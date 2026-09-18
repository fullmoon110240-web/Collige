import { fetchAllData } from './supabase.js';
import { setLoadedData } from './state.js';
import { initializeCharacters, setupGlobalGuideTimer } from './modules/characters.js';
import { initializeItems } from './modules/items.js';
import { initializeModals } from './modules/modals.js';
import { initializeWorldview, restoreWorldviewSelection } from './modules/worldview.js';
import { hideLoading, setLoadingMessage } from './ui.js';

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

    initializeModals();
    initializeCharacters();
    initializeItems();
    initializeWorldview();
    setupGlobalGuideTimer();
  } catch (error) {
    console.error('화면 초기화 실패:', error);
    setLoadingMessage('화면을 준비하는 중 문제가 발생했습니다.');
  } finally {
    hideLoading();
  }
}

document.addEventListener('DOMContentLoaded', boot, { once: true });
