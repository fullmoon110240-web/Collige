import { CHARACTER_DATA } from '../data/characters.js';
import {
  state,
  setActiveWorldview,
  setWorldviewImage,
  getWorldviewImage,
  upsertLocalWorldview,
  removeLocalWorldview
} from '../state.js';
import {
  createWorldview,
  deleteWorldview,
  getWorldviewReason,
  isWorldviewSupported,
  saveWorldviewImage,
  updateWorldview
} from '../supabase.js';
import { $, flashError, hideModal, isHttpUrl, normalizeImageUrl, showModal } from '../ui.js';

// 화면에는 항상 4칸만 보입니다. 4개를 넘으면 좌우로 무한 순환 스크롤됩니다.
const VISIBLE_SLOTS = 4;
const STORAGE_KEY = 'colliji:active-worldview';
const DRAG_THRESHOLD = 6;

let bar = null;
let viewport = null;
let track = null;

let available = false;
let looping = false;
let listWidth = 0;
let dragging = false;
let dragStartX = 0;
let dragStartScroll = 0;
let dragDistance = 0;
let suppressClick = false;

/**
 * 저장해 둔 선택을 state에 복원합니다.
 * 캐릭터를 만들기 전에 불러야 첫 화면부터 올바른 기본 이미지가 나옵니다.
 */
export function restoreWorldviewSelection() {
  if (!state.worldviewSupported) return null;
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }

  const applied = setActiveWorldview(saved);
  if (saved && !applied) {
    // 저장된 세계관이 사라졌으면 기록도 지웁니다.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 무시
    }
  }
  return applied;
}

export function isWorldviewAvailable() {
  return isWorldviewSupported() && state.worldviewSupported;
}

export function initializeWorldview() {
  bar = document.getElementById('worldview-bar');
  if (!bar) return;

  viewport = $('worldview-viewport');
  track = $('worldview-track');

  // 세계관 스키마가 아직 없어도 바는 항상 보여줍니다.
  // 조용히 사라지면 무엇이 잘못됐는지 알 수가 없기 때문입니다.
  available = isWorldviewAvailable();
  bar.classList.toggle('is-unavailable', !available);

  bindBarEvents();
  bindModalEvents();
  renderTrack();
}

function warnUnavailable() {
  const reason = getWorldviewReason();
  alert(
    '세계관 기능을 아직 쓸 수 없습니다.\n\n' +
      'Supabase SQL Editor에서 supabase/worldview.sql을 실행한 뒤 새로고침해 주세요.' +
      (reason ? `\n\n(원인: ${reason})` : '')
  );
}

/* ------------------------------------------------------------------ */
/* 버튼 바                                                             */
/* ------------------------------------------------------------------ */

function bindBarEvents() {
  track.addEventListener('click', event => {
    const button = event.target.closest('.worldview-btn');
    if (!button) return;
    if (!available) {
      warnUnavailable();
      return;
    }
    if (button.disabled) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const id = button.dataset.worldviewId;
    // 같은 버튼을 다시 누르면 해제됩니다. 중복 선택은 되지 않습니다.
    applySelection(state.activeWorldviewId === id ? null : id);
  });

  viewport.addEventListener('scroll', wrapScroll, { passive: true });

  // 터치는 브라우저 기본 가로 스크롤을 그대로 쓰고, 마우스만 직접 끌어줍니다.
  viewport.addEventListener('pointerdown', event => {
    if (!looping || event.pointerType === 'touch' || event.button !== 0) return;
    dragging = true;
    dragDistance = 0;
    suppressClick = false;
    dragStartX = event.clientX;
    dragStartScroll = viewport.scrollLeft;
    viewport.classList.add('is-dragging');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });

  window.addEventListener('resize', () => {
    if (looping) requestAnimationFrame(primeScroll);
  });
}

function onPointerMove(event) {
  if (!dragging) return;
  const delta = event.clientX - dragStartX;
  dragDistance = Math.max(dragDistance, Math.abs(delta));
  viewport.scrollLeft = dragStartScroll - delta;
}

function onPointerUp() {
  if (!dragging) return;
  dragging = false;
  suppressClick = dragDistance > DRAG_THRESHOLD;
  viewport.classList.remove('is-dragging');
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
}

/**
 * 목록을 세 벌 이어 붙여 두고, 양 끝에 닿기 전에 한 벌만큼 순간이동시킵니다.
 * 첫 버튼 왼쪽에서 마지막 버튼이, 마지막 버튼 오른쪽에서 첫 버튼이 이어집니다.
 */
function wrapScroll() {
  if (!looping || !listWidth) return;

  const current = viewport.scrollLeft;
  let shift = 0;
  if (current < listWidth * 0.5) shift = listWidth;
  else if (current > listWidth * 1.5) shift = -listWidth;
  if (!shift) return;

  jumpTo(current + shift);
  // 드래그 도중에 순간이동했다면 기준 좌표도 같은 만큼 옮깁니다.
  if (dragging) dragStartScroll += shift;
}

function jumpTo(position) {
  const previous = viewport.style.scrollBehavior;
  viewport.style.scrollBehavior = 'auto';
  viewport.scrollLeft = position;
  viewport.style.scrollBehavior = previous;
}

function primeScroll() {
  if (!looping) {
    listWidth = 0;
    jumpTo(0);
    return;
  }
  listWidth = viewport.scrollWidth / 3;
  jumpTo(listWidth);
}

function renderTrack() {
  const worldviews = state.worldviews;
  looping = worldviews.length > VISIBLE_SLOTS;

  const slots = looping
    ? [...worldviews, ...worldviews, ...worldviews]
    : padToVisible(worldviews);

  track.replaceChildren(...slots.map(createSlot));
  viewport.classList.toggle('is-scrollable', looping);
  syncActiveButtons();
  requestAnimationFrame(primeScroll);
}

// 세계관이 5개 이하면 남는 칸은 이름 없는 비활성 버튼으로 채웁니다.
function padToVisible(worldviews) {
  const slots = worldviews.slice(0, VISIBLE_SLOTS);
  while (slots.length < VISIBLE_SLOTS) slots.push(null);
  return slots;
}

function createSlot(worldview) {
  const slot = document.createElement('div');
  slot.className = 'worldview-slot';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'worldview-btn';

  const label = document.createElement('span');
  label.className = 'worldview-btn-label';

  if (!worldview) {
    button.classList.add('is-empty');
    button.disabled = true;
    button.tabIndex = -1;
    button.setAttribute('aria-hidden', 'true');
  } else {
    button.dataset.worldviewId = String(worldview.id);
    label.textContent = worldview.name;
    button.title = worldview.name;
    button.setAttribute('aria-pressed', 'false');
  }

  button.appendChild(label);
  slot.appendChild(button);
  return slot;
}

function syncActiveButtons() {
  for (const button of track.querySelectorAll('.worldview-btn')) {
    if (!button.dataset.worldviewId) continue;
    const active = button.dataset.worldviewId === state.activeWorldviewId;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function applySelection(worldviewId) {
  const applied = setActiveWorldview(worldviewId);

  try {
    if (applied) localStorage.setItem(STORAGE_KEY, applied);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장에 실패해도 이번 세션 동작에는 영향이 없습니다.
  }

  syncActiveButtons();
  document.dispatchEvent(
    new CustomEvent('colliji:worldview-change', { detail: { worldviewId: applied } })
  );
}

/* ------------------------------------------------------------------ */
/* 모달                                                                */
/* ------------------------------------------------------------------ */

function bindModalEvents() {
  const closers = [
    ['worldview-list-close-btn', 'worldview-list-modal'],
    ['worldview-add-close-btn', 'worldview-add-modal'],
    ['worldview-edit-close-btn', 'worldview-edit-modal']
  ];
  for (const [buttonId, modalId] of closers) {
    $(buttonId).addEventListener('click', () => hideModal(modalId));
  }

  $('worldview-list-btn').addEventListener('click', () => {
    if (!available) return warnUnavailable();
    openWorldviewListModal();
  });

  $('worldview-add-btn').addEventListener('click', () => {
    if (!available) return warnUnavailable();
    openWorldviewAddModal();
  });
  $('worldview-add-submit-btn').addEventListener('click', submitAddWorldview);
  $('worldview-edit-submit-btn').addEventListener('click', submitEditWorldview);

  $('worldview-add-input').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submitAddWorldview();
  });

  $('worldview-edit-input').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submitEditWorldview();
  });

  for (const inputId of ['worldview-image-cole-input', 'worldview-image-ellie-input']) {
    $(inputId).addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      submitEditWorldview();
    });
  }
}

function openWorldviewAddModal() {
  $('worldview-add-input').value = '';
  showModal('worldview-add-modal');
  $('worldview-add-input').focus();
}

async function submitAddWorldview() {
  const input = $('worldview-add-input');
  const name = input.value.trim();
  if (!name) return;

  if (state.worldviews.some(row => row.name.toLowerCase() === name.toLowerCase())) {
    alert('같은 이름의 세계관이 이미 있습니다.');
    return;
  }

  await runBusy(async () => {
    const sortOrder = state.worldviews.length
      ? Math.max(...state.worldviews.map(row => Number(row.sort_order ?? 0))) + 1
      : 0;
    const row = await createWorldview({ name, sortOrder });
    upsertLocalWorldview(row);
    input.value = '';
    hideModal('worldview-add-modal');
    renderTrack();
    if (isModalOpen('worldview-list-modal')) renderWorldviewList();
  }, '세계관을 저장하지 못했습니다.');
}

function openWorldviewListModal() {
  renderWorldviewList();
  showModal('worldview-list-modal');
}

function renderWorldviewList() {
  const list = $('worldview-list');
  list.replaceChildren();

  if (state.worldviews.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = '등록된 세계관이 없습니다. + 로 추가하세요.';
    list.appendChild(empty);
    return;
  }

  for (const worldview of state.worldviews) {
    const row = document.createElement('li');
    row.className = 'worldview-row';
    if (String(worldview.id) === state.activeWorldviewId) row.classList.add('is-active');

    const name = document.createElement('span');
    name.className = 'worldview-row-name';
    name.textContent = worldview.name;

    const actions = document.createElement('div');
    actions.className = 'worldview-row-actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'worldview-action-btn';
    editButton.textContent = '수정';
    editButton.addEventListener('click', () => openWorldviewEditModal(worldview));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-btn';
    deleteButton.textContent = '✕';
    deleteButton.setAttribute('aria-label', '세계관 삭제');
    deleteButton.addEventListener('click', () => deleteWorldviewRow(worldview));

    actions.append(editButton, deleteButton);
    row.append(name, actions);
    list.appendChild(row);
  }
}

function openWorldviewEditModal(worldview) {
  state.editingWorldviewId = worldview.id;
  $('worldview-edit-modal-title').textContent = `${worldview.name} 수정`;
  $('worldview-edit-input').value = worldview.name ?? '';
  $('worldview-image-cole-input').value = getWorldviewImage(worldview.id, 'shimeji-cole');
  $('worldview-image-ellie-input').value = getWorldviewImage(worldview.id, 'shimeji-ellie');
  showModal('worldview-edit-modal');
  $('worldview-edit-input').focus();
}

async function submitEditWorldview() {
  const id = state.editingWorldviewId;
  if (!id) return;

  const name = $('worldview-edit-input').value.trim();
  if (!name) return;

  const duplicated = state.worldviews.some(
    row => String(row.id) !== String(id) && row.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicated) {
    alert('같은 이름의 세계관이 이미 있습니다.');
    return;
  }

  const images = [
    ['shimeji-cole', normalizeImageUrl($('worldview-image-cole-input').value)],
    ['shimeji-ellie', normalizeImageUrl($('worldview-image-ellie-input').value)]
  ];

  for (const [characterId, url] of images) {
    if (url && !isHttpUrl(url)) {
      const label = CHARACTER_DATA[characterId]?.name ?? characterId;
      alert(`${label} 기본 이미지 URL은 http:// 또는 https://로 시작해야 합니다.`);
      return;
    }
  }

  await runBusy(async () => {
    const current = state.worldviews.find(row => String(row.id) === String(id));
    if (!current || current.name !== name) {
      upsertLocalWorldview(await updateWorldview(id, { name }));
    }

    for (const [characterId, url] of images) {
      if (getWorldviewImage(id, characterId) === url) continue;
      await saveWorldviewImage({ worldviewId: id, characterId, url });
      setWorldviewImage(id, characterId, url);
    }

    state.editingWorldviewId = null;
    hideModal('worldview-edit-modal');
    renderTrack();
    renderWorldviewList();
    notifyWorldviewChanged();
  }, '세계관을 수정하지 못했습니다.');
}

async function deleteWorldviewRow(worldview) {
  const confirmed = confirm(
    `'${worldview.name}' 세계관을 삭제하시겠습니까?\n\n이 세계관의 대사와 표정은 지워지지 않고 미분류로 남습니다.`
  );
  if (!confirmed) return;

  await runBusy(async () => {
    const wasActive = String(worldview.id) === state.activeWorldviewId;
    await deleteWorldview(worldview.id);
    removeLocalWorldview(worldview.id);

    renderTrack();
    renderWorldviewList();

    if (wasActive) applySelection(null);
    else notifyWorldviewChanged();
  }, '세계관을 삭제하지 못했습니다.');
}

/* ------------------------------------------------------------------ */
/* 공용                                                                */
/* ------------------------------------------------------------------ */

// 선택은 그대로 둔 채, 목록을 다시 그려야 할 때만 알립니다.
function notifyWorldviewChanged() {
  document.dispatchEvent(
    new CustomEvent('colliji:worldview-change', { detail: { worldviewId: state.activeWorldviewId } })
  );
}

function isModalOpen(id) {
  return document.getElementById(id)?.classList.contains('is-open');
}

async function runBusy(task, fallbackMessage) {
  if (state.busy) return;
  state.busy = true;
  try {
    await task();
  } catch (error) {
    console.error(error);
    flashError(`${fallbackMessage}\n\n${error.message || error}`);
  } finally {
    state.busy = false;
  }
}
