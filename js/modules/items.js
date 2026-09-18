import { ITEM_DATA } from '../data/items.js';
import { getCharacter } from './characters.js';
import { showModal, $ } from '../ui.js';

/*
 * 아이템 끌어놓기.
 *
 * HTML5 드래그앤드롭(dragstart/drop)은 모바일 브라우저가 터치로 발생시키지
 * 않습니다. 그래서 포인터 이벤트로 직접 구현합니다. 포인터 이벤트는 마우스와
 * 터치, 펜을 한 코드로 처리하므로 데스크톱 동작도 그대로 유지됩니다.
 */

const DRAG_THRESHOLD = 8;
const DROP_TARGETS = [
  ['cole-card', 'shimeji-cole'],
  ['ellie-card', 'shimeji-ellie']
];

let drag = null;
let suppressClick = false;

export function initializeItems() {
  document.querySelectorAll('.item-btn').forEach(button => {
    const itemId = button.dataset.itemId;
    const item = ITEM_DATA[itemId];
    if (!item) return;

    const image = button.querySelector('img');
    if (image) image.src = item.img;

    button.addEventListener('click', () => {
      // 끌어놓기 직후에 따라오는 click은 무시합니다.
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      openItemDetail(item);
    });

    button.addEventListener('pointerdown', event => beginDrag(event, button, itemId));
  });
}

function beginDrag(event, button, itemId) {
  if (drag || (event.button !== undefined && event.button !== 0)) return;

  drag = {
    pointerId: event.pointerId,
    itemId,
    button,
    startX: event.clientX,
    startY: event.clientY,
    started: false,
    ghost: null
  };
  suppressClick = false;

  // 포인터를 붙잡아 두면 손가락이 버튼 밖으로 나가도 계속 추적됩니다.
  button.setPointerCapture?.(event.pointerId);
  button.addEventListener('pointermove', onPointerMove);
  button.addEventListener('pointerup', onPointerUp);
  button.addEventListener('pointercancel', onPointerCancel);
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;

  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;

  if (!drag.started) {
    // 살짝 흔들린 탭까지 끌기로 치지 않도록 문턱을 둡니다.
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.started = true;
    drag.ghost = createGhost(drag.itemId, drag.button);
    drag.button.classList.add('is-dragging');
  }

  event.preventDefault();
  moveGhost(drag.ghost, event.clientX, event.clientY);
  highlightTarget(findDropTarget(event.clientX, event.clientY));
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;

  const { started, itemId } = drag;
  const target = started ? findDropTarget(event.clientX, event.clientY) : null;
  cleanup();

  // 움직이지 않았으면 그냥 탭입니다. click이 상세 창을 엽니다.
  if (!started) return;
  suppressClick = true;

  if (!target) return;
  const item = ITEM_DATA[itemId];
  getCharacter(target.characterId)?.speakItemQuote(itemId, item?.name ?? itemId);
}

function onPointerCancel(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const started = drag.started;
  cleanup();
  if (started) suppressClick = true;
}

function cleanup() {
  if (!drag) return;
  const { button, pointerId, ghost } = drag;

  button.removeEventListener('pointermove', onPointerMove);
  button.removeEventListener('pointerup', onPointerUp);
  button.removeEventListener('pointercancel', onPointerCancel);
  if (button.hasPointerCapture?.(pointerId)) button.releasePointerCapture(pointerId);
  button.classList.remove('is-dragging');
  ghost?.remove();

  for (const [cardId] of DROP_TARGETS) {
    document.getElementById(cardId)?.classList.remove('drag-over');
  }
  drag = null;
}

// 손가락이나 커서 아래에 어떤 캐릭터 카드가 있는지 찾습니다.
// 따라다니는 이미지는 pointer-events: none이라 여기에 걸리지 않습니다.
function findDropTarget(x, y) {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;

  for (const [cardId, characterId] of DROP_TARGETS) {
    if (element.closest(`#${cardId}`)) {
      return { cardId, characterId };
    }
  }
  return null;
}

function highlightTarget(target) {
  for (const [cardId] of DROP_TARGETS) {
    document.getElementById(cardId)?.classList.toggle('drag-over', target?.cardId === cardId);
  }
}

function createGhost(itemId, button) {
  const rect = button.getBoundingClientRect();
  const ghost = document.createElement('img');
  ghost.className = 'item-drag-ghost';
  ghost.src = ITEM_DATA[itemId]?.img ?? '';
  ghost.alt = '';
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);
  return ghost;
}

function moveGhost(ghost, x, y) {
  if (!ghost) return;
  ghost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(1.15)`;
}

function openItemDetail(item) {
  $('item-detail-img').src = item.img;
  $('item-detail-name').textContent = item.name;
  $('item-detail-desc').textContent = item.desc;
  showModal('item-detail-modal');
}

export function populateItemSelectList(onSelect) {
  const list = $('item-select-list');
  list.replaceChildren();

  const defaultItem = document.createElement('li');
  defaultItem.className = 'expression-select-item default-tag';
  defaultItem.textContent = '[기본] (아이템 없음)';
  defaultItem.addEventListener('click', () => onSelect(''));
  list.appendChild(defaultItem);

  for (const [itemId, item] of Object.entries(ITEM_DATA)) {
    const li = document.createElement('li');
    li.className = 'expression-select-item';
    li.textContent = item.name;
    li.addEventListener('click', () => onSelect(itemId));
    list.appendChild(li);
  }
}
