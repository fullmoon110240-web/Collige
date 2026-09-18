import { ITEM_DATA } from '../data/items.js';
import { getCharacter } from './characters.js';
import { showModal, $ } from '../ui.js';

export function initializeItems() {
  document.querySelectorAll('.item-btn').forEach(button => {
    const itemId = button.dataset.itemId;
    const item = ITEM_DATA[itemId];
    if (!item) return;

    const image = button.querySelector('img');
    if (image) image.src = item.img;

    button.addEventListener('click', () => openItemDetail(item));

    button.addEventListener('dragstart', event => {
      event.dataTransfer.effectAllowed = 'copy';
      // 표시 이름이 아니라 고정 키를 넘깁니다. 이름을 바꿔도 연결이 유지됩니다.
      event.dataTransfer.setData('text/plain', itemId);
    });
  });

  for (const [cardId, characterId] of [['cole-card', 'shimeji-cole'], ['ellie-card', 'shimeji-ellie']]) {
    const card = $(cardId);
    card.addEventListener('dragover', event => {
      event.preventDefault();
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', event => {
      event.preventDefault();
      card.classList.remove('drag-over');
      const itemId = event.dataTransfer.getData('text/plain');
      if (!itemId || !ITEM_DATA[itemId]) return;
      getCharacter(characterId)?.speakItemQuote(itemId, ITEM_DATA[itemId].name);
    });
  }
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
