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
      event.dataTransfer.setData('text/plain', item.name);
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
      const itemName = event.dataTransfer.getData('text/plain');
      if (!itemName) return;
      getCharacter(characterId)?.speakItemQuote(itemName);
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

  for (const item of Object.values(ITEM_DATA)) {
    const li = document.createElement('li');
    li.className = 'expression-select-item';
    li.textContent = item.name;
    li.addEventListener('click', () => onSelect(item.name));
    list.appendChild(li);
  }
}
