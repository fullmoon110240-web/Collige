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
