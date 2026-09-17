import { ITEM_DATA } from '../data/items.js';
import { state, getQuotes, getExpressions, upsertLocalExpression, removeLocalExpression, upsertLocalQuote } from '../state.js';
import { createExpression, deleteExpression, updateExpression } from '../supabase.js';
import { $, hideModal, isHttpUrl, showModal, flashError } from '../ui.js';
import { getCharacter } from './characters.js';
import { populateItemSelectList } from './items.js';

export function initializeModals() {
  document.addEventListener('colliji:quote-add', event => {
    const character = event.detail?.characterId ? getCharacter(event.detail.characterId) : null;
    if (character) openQuoteAddModal(character);
  });

  document.addEventListener('colliji:quote-list', event => {
    const character = event.detail?.characterId ? getCharacter(event.detail.characterId) : null;
    if (character) openQuoteModal(character);
  });

  const closers = [
    ['modal-close-btn', 'quote-modal'],
    ['quote-add-modal-close-btn', 'quote-add-modal'],
    ['quote-edit-modal-close-btn', 'quote-edit-modal'],
    ['expression-modal-close-btn', 'expression-modal'],
    ['exp-edit-modal-close-btn', 'expression-edit-modal'],
    ['exp-select-close-btn', 'expression-select-modal'],
    ['item-select-close-btn', 'item-select-modal'],
    ['item-detail-close-btn', 'item-detail-modal']
  ];

  for (const [buttonId, modalId] of closers) {
    $(buttonId).addEventListener('click', () => hideModal(modalId));
  }

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target === modal) hideModal(modal.id);
    });
  });

  $('expression-manage-btn').addEventListener('click', openExpressionModal);
  $('quote-add-submit-btn').addEventListener('click', submitAddQuote);
  $('quote-edit-submit-btn').addEventListener('click', submitEditQuote);
  $('add-expression-btn').addEventListener('click', submitAddExpression);
  $('exp-edit-submit-btn').addEventListener('click', submitEditExpression);

  for (const inputId of ['quote-add-input', 'quote-edit-input', 'exp-name-input', 'exp-url-input', 'exp-edit-name-input', 'exp-edit-url-input']) {
    $(inputId).addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (inputId === 'quote-add-input') submitAddQuote();
      if (inputId === 'quote-edit-input') submitEditQuote();
      if (inputId === 'exp-name-input' || inputId === 'exp-url-input') submitAddExpression();
      if (inputId === 'exp-edit-name-input' || inputId === 'exp-edit-url-input') submitEditExpression();
    });
  }
}

export function openQuoteAddModal(character) {
  state.activeCharacterId = character.id;
  state.pendingQuoteText = '';
  $('quote-add-modal-title').textContent = `${character.name} 대사 추가`;
  $('quote-add-input').value = '';
  $('quote-add-item-checkbox').checked = false;
  $('quote-add-submit-btn').classList.toggle('ellie-theme-btn', character.id === 'shimeji-ellie');
  showModal('quote-add-modal');
  $('quote-add-input').focus();
}

async function submitAddQuote() {
  const character = getActiveCharacter();
  if (!character) return;

  const input = $('quote-add-input');
  const text = input.value;

  if (!text.trim()) return;

  if ($('quote-add-item-checkbox').checked) {
    state.pendingQuoteText = text;
    hideModal('quote-add-modal');
    openItemSelectForNewQuote();
    return;
  }

  await runBusy(async () => {
    await character.addQuote(text, '');
    hideModal('quote-add-modal');
    if (isModalOpen('quote-modal')) renderQuoteList();
  }, '대사를 저장하지 못했습니다.');
}

function openItemSelectForNewQuote() {
  const list = $('item-select-list');
  list.replaceChildren();

  for (const item of Object.values(ITEM_DATA)) {
    const li = document.createElement('li');
    li.className = 'expression-select-item';
    li.textContent = item.name;
    li.addEventListener('click', async () => {
      const character = getActiveCharacter();
      const text = state.pendingQuoteText;
      state.pendingQuoteText = '';
      hideModal('item-select-modal');
      if (!character || !text.trim()) return;

      await runBusy(async () => {
        await character.addQuote(text, item.name);
        if (isModalOpen('quote-modal')) renderQuoteList();
      }, '아이템 상호작용 대사를 저장하지 못했습니다.');
    });
    list.appendChild(li);
  }

  showModal('item-select-modal');
}

export function openQuoteModal(character) {
  state.activeCharacterId = character.id;
  $('modal-title').textContent = `${character.name} 대사 목록`;
  renderQuoteList();
  showModal('quote-modal');
}

export function renderQuoteList() {
  const character = getActiveCharacter();
  if (!character) return;

  const list = $('modal-quote-list');
  list.replaceChildren();
  const quotes = getQuotes(character.id);

  if (quotes.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = '등록된 대사가 없습니다.';
    list.appendChild(empty);
    return;
  }

  const tagThemeClass = character.id === 'shimeji-cole' ? 'cole-tag' : 'ellie-tag';
  for (const quote of quotes) {
    const row = document.createElement('li');
    row.className = 'quote-row';

    const text = document.createElement('span');
    text.className = 'quote-text';
    text.textContent = quote.text;

    const actions = document.createElement('div');
    actions.className = 'quote-actions';

    const itemButton = createTagButton(quote.item_name, tagThemeClass, '기본', () => openItemSelectModalForQuote(quote.id));
    const expressionButton = createTagButton(quote.image_title, tagThemeClass, '기본', () => openExpressionSelectModal(quote.id));

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = `quote-action-btn ${character.id === 'shimeji-ellie' ? 'edit-ellie' : 'edit-cole'}`;
    editButton.textContent = '수정';
    editButton.addEventListener('click', () => openQuoteEditModal(quote));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-btn';
    deleteButton.textContent = '✕';
    deleteButton.setAttribute('aria-label', '대사 삭제');
    deleteButton.addEventListener('click', () => deleteQuoteRow(quote));

    actions.append(itemButton, expressionButton, editButton, deleteButton);
    row.append(text, actions);
    list.appendChild(row);
  }
}

function createTagButton(value, theme, fallback, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  const hasValue = String(value ?? '').trim() !== '';
  button.className = `quote-tag-btn ${hasValue ? `active-tag ${theme}` : 'default-tag'}`;
  button.textContent = hasValue ? value : fallback;
  button.addEventListener('click', handler);
  return button;
}

export function openItemSelectModalForQuote(quoteId) {
  const character = getActiveCharacter();
  if (!character) return;
  populateItemSelectList(async itemName => {
    hideModal('item-select-modal');
    await saveQuotePatch(quoteId, { item_name: itemName });
  });
  showModal('item-select-modal');
}

export function openExpressionSelectModal(quoteId) {
  const character = getActiveCharacter();
  if (!character) return;

  const list = $('expression-select-list');
  list.replaceChildren();

  const defaultLi = document.createElement('li');
  defaultLi.className = 'expression-select-item default-tag';
  defaultLi.textContent = '[기본] (이미지 없음)';
  defaultLi.addEventListener('click', async () => {
    hideModal('expression-select-modal');
    await saveQuotePatch(quoteId, { image: '', image_title: '' });
  });
  list.appendChild(defaultLi);

  for (const expression of getExpressions(character.id)) {
    const li = document.createElement('li');
    li.className = 'expression-select-item';
    li.textContent = `[${expression.name}]`;
    li.addEventListener('click', async () => {
      hideModal('expression-select-modal');
      await saveQuotePatch(quoteId, { image: expression.url, image_title: expression.name });
    });
    list.appendChild(li);
  }

  showModal('expression-select-modal');
}

export function openQuoteEditModal(quote) {
  state.editingQuoteId = quote.id;
  state.editingQuote = quote;
  $('quote-edit-input').value = quote.text ?? '';
  $('quote-edit-submit-btn').classList.toggle('ellie-theme-btn', state.activeCharacterId === 'shimeji-ellie');
  showModal('quote-edit-modal');
  $('quote-edit-input').focus();
}

async function submitEditQuote() {
  const character = getActiveCharacter();
  const id = state.editingQuoteId;
  if (!character || !id) return;

  // 입력한 문장을 trim하여 재작성하지 않는다. 빈 문자열 여부만 별도로 검사한다.
  const newText = $('quote-edit-input').value;
  if (!newText.trim()) return;

  await runBusy(async () => {
    await character.updateQuote(id, { text: newText });
    hideModal('quote-edit-modal');
    state.editingQuoteId = null;
    state.editingQuote = null;
    renderQuoteList();
  }, '대사를 수정하지 못했습니다.');
}

async function deleteQuoteRow(quote) {
  const character = getActiveCharacter();
  if (!character || !confirm('정말 삭제하시겠습니까?')) return;

  await runBusy(async () => {
    await character.deleteQuote(quote.id);
    renderQuoteList();
  }, '대사를 삭제하지 못했습니다.');
}

export function openExpressionModal() {
  renderExpressionList();
  showModal('expression-modal');
}

function renderExpressionList() {
  const character = getActiveCharacter();
  if (!character) return;

  const list = $('expression-list');
  list.replaceChildren();
  const expressions = getExpressions(character.id);

  if (expressions.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = '등록된 표정이 없습니다.';
    list.appendChild(empty);
    return;
  }

  for (const expression of expressions) {
    const row = document.createElement('li');
    row.className = 'expression-item';

    const info = document.createElement('span');
    info.className = 'quote-text';
    info.textContent = `[${expression.name}]`;

    const actions = document.createElement('div');
    actions.className = 'expression-actions';

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = `quote-action-btn ${character.id === 'shimeji-ellie' ? 'edit-ellie' : 'edit-cole'}`;
    edit.textContent = '수정';
    edit.addEventListener('click', () => openExpressionEditModal(expression));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete-btn';
    del.textContent = '✕';
    del.setAttribute('aria-label', '표정 삭제');
    del.addEventListener('click', () => deleteExpressionRow(expression));

    actions.append(edit, del);
    row.append(info, actions);
    list.appendChild(row);
  }
}

async function submitAddExpression() {
  const character = getActiveCharacter();
  if (!character) return;

  const name = $('exp-name-input').value.trim();
  const url = $('exp-url-input').value.trim();
  if (!name || !url) {
    alert('이름과 URL을 모두 입력해주세요.');
    return;
  }
  if (!isHttpUrl(url)) {
    alert('이미지 URL은 http:// 또는 https://로 시작해야 합니다.');
    return;
  }

  await runBusy(async () => {
    const row = await createExpression({ characterId: character.id, name, url });
    upsertLocalExpression(row);
    $('exp-name-input').value = '';
    $('exp-url-input').value = '';
    renderExpressionList();
  }, '표정을 저장하지 못했습니다.');
}

function openExpressionEditModal(expression) {
  state.editingExpressionId = expression.id;
  state.editingExpression = expression;
  $('exp-edit-name-input').value = expression.name ?? '';
  $('exp-edit-url-input').value = expression.url ?? '';
  showModal('expression-edit-modal');
}

async function submitEditExpression() {
  const character = getActiveCharacter();
  if (!character || !state.editingExpressionId) return;

  const name = $('exp-edit-name-input').value.trim();
  const url = $('exp-edit-url-input').value.trim();
  if (!name || !url) {
    alert('표정 이름과 URL은 비워둘 수 없습니다.');
    return;
  }
  if (!isHttpUrl(url)) {
    alert('이미지 URL은 http:// 또는 https://로 시작해야 합니다.');
    return;
  }

  await runBusy(async () => {
    const row = await updateExpression(state.editingExpressionId, { name, url });
    upsertLocalExpression(row);

    // DB trigger가 연결된 대사의 image/image_title을 함께 변경한다.
    // 해당 결과를 로컬에도 반영하여 새로고침 전 UI도 서버와 동일하게 유지한다.
    const old = state.editingExpression;
    if (old && (old.name !== name || old.url !== url)) {
      for (const quote of getQuotes(character.id)) {
        if (quote.image_title === old.name) {
          quote.image = url;
          quote.image_title = name;
        }
      }
    }

    state.editingExpressionId = null;
    state.editingExpression = null;
    hideModal('expression-edit-modal');
    renderExpressionList();
    if (isModalOpen('quote-modal')) renderQuoteList();
  }, '표정을 수정하지 못했습니다.');
}

async function deleteExpressionRow(expression) {
  const character = getActiveCharacter();
  if (!character || !confirm(`'${expression.name}' 표정을 삭제하시겠습니까?`)) return;

  await runBusy(async () => {
    await deleteExpression(expression.id);
    removeLocalExpression(expression.id, character.id);

    for (const quote of getQuotes(character.id)) {
      if (quote.image_title === expression.name) {
        quote.image = '';
        quote.image_title = '';
      }
    }

    renderExpressionList();
    if (isModalOpen('quote-modal')) renderQuoteList();
  }, '표정을 삭제하지 못했습니다.');
}

async function saveQuotePatch(quoteId, patch) {
  const character = getActiveCharacter();
  if (!character) return;

  await runBusy(async () => {
    const row = await character.updateQuote(quoteId, patch);
    upsertLocalQuote(row);
    renderQuoteList();
  }, '대사 설정을 저장하지 못했습니다.');
}

function getActiveCharacter() {
  return state.activeCharacterId ? getCharacter(state.activeCharacterId) : null;
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
