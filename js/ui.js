export function $(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`필수 요소를 찾을 수 없습니다: #${id}`);
  return element;
}

export function showModal(id) {
  const modal = $(id);
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

export function hideModal(id) {
  const modal = $(id);
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

export function setLoadingMessage(message) {
  const element = document.getElementById('loading-message');
  if (element) element.textContent = message;
}

export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('is-hidden');
}

export function showLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.remove('is-hidden');
}

export function flashError(message) {
  console.error(message);
  alert(message);
}

export function isHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value ?? '').trim());
}

const DRIVE_FILE_ID = /(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{20,})/;

/**
 * 구글 드라이브 링크를 누구나 볼 수 있는 형태로 바꿉니다.
 *
 *   https://lh3.google.com/u/0/d/<ID>=w545-h909-iv1   ← 내 계정으로 로그인해야만 보임
 *   https://drive.google.com/file/d/<ID>/view         ← 페이지 주소라 이미지가 아님
 *        -> https://lh3.googleusercontent.com/d/<ID>
 *
 * 드라이브 미리보기에서 복사되는 rd-d/... 주소는 파일 ID가 들어있지 않아
 * 변환할 수 없습니다. 그대로 두고 경고는 호출한 쪽에서 합니다.
 */
export function normalizeImageUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) return '';

  if (/^https:\/\/(lh3\.google\.com\/u\/|drive\.google\.com\/)/i.test(url)) {
    const match = url.match(DRIVE_FILE_ID);
    if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }

  return url;
}

// 만료되는 임시 주소인지 (드라이브 미리보기에서 복사한 링크)
export function isTemporaryDriveUrl(value) {
  return /\/rd-d\/|auditContext=/i.test(String(value ?? ''));
}
