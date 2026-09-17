import { fetchAllData } from './supabase.js';
import { setLoadedData } from './state.js';
import { initializeCharacters, setupGlobalGuideTimer } from './modules/characters.js';
import { initializeItems } from './modules/items.js';
import { initializeModals } from './modules/modals.js';
import { hideLoading, setLoadingMessage } from './ui.js';

async function boot() {
  try {
    const data = await fetchAllData();
    setLoadedData(data);
  } catch (error) {
    console.error('Supabase 데이터 로드 실패:', error);
    setLoadingMessage('데이터를 불러오지 못했습니다. Supabase 설정과 RLS를 확인해 주세요.');
    // 화면 자체는 빈 데이터로 계속 열어둔다. 저장 기능은 이후 오류를 표시한다.
    setLoadedData({ quotes: [], expressions: [] });
  }

  try {
    initializeModals();
    initializeCharacters();
    initializeItems();
    setupGlobalGuideTimer();
  } catch (error) {
    console.error('화면 초기화 실패:', error);
    setLoadingMessage('화면을 준비하는 중 문제가 발생했습니다.');
  } finally {
    hideLoading();
  }
}

document.addEventListener('DOMContentLoaded', boot, { once: true });
