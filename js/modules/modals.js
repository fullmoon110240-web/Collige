import { ITEM_DATA } from '../data/items.js';
import {
  state,
  getQuotes,
  getVisibleQuotes,
  getExpressions,
  getVisibleExpressions,
  getExpressionById,
  getActiveWorldview,
  sameWorldview,
  upsertLocalExpression,
  removeLocalExpression,
  upsertLocalQuote
} from '../state.js';
import { createExpression, deleteExpression, updateExpression } from '../supabase.js';
import { $, hideModal, isHttpUrl, isTemporaryDriveUrl, normalizeImageUrl, showModal, flashError } from '../ui.js';
import { getCharacter } from './characters.js';
import { populateItemSelectList } from './items.js';
import { isWorldviewAvailable } from './worldview.js';

// 이 모달들은 열려 있는 캐릭터의 색을 따라갑니다. (콜=남색, 엘리=청록)
const CHARACTER_THEMED_MODALS = [
  'quote-modal',
  'quote-add-modal',
  'quote-edit-modal',
  'expression-select-modal',
  'item-select-modal',
  'worldview-select-modal'
];

// 표정 목록은 세계관 목록에서 열리므로, 어느 캐릭터의 표정인지 따로 기억합니다.
function getExpressionCharacter() {
  return getCharacter(state.expressionCharacterId) ?? getCharacter('shimeji-cole');
}

export function initializeModals() {
  document.addEventListener('colliji:quote-add', event => {
    const character = event.detail?.characterId ? getCharacter(event.detail.characterId) : null;
    if (character) openQuoteAddModal(character);
  });

  document.addEventListener('colliji:quote-list', event => {
    const character = event.detail?.characterId ? getCharacter(event.detail.characterId) : null;
    if (character) openQuoteModal(character);
  });

  document.addEventListener('colliji:worldview-change', () => {
    if (isModalOpen('quote-modal')) renderQuoteList();
    if (isModalOpen('expression-modal')) renderExpressionList();
  });

  const closers = [
    ['modal-close-btn', 'quote-modal'],
    ['quote-add-modal-close-btn', 'quote-add-modal'],
    ['quote-edit-modal-close-btn', 'quote-edit-modal'],
    ['expression-modal-close-btn', 'expression-modal'],
    ['exp-edit-modal-close-btn', 'expression-edit-modal'],
    ['exp-select-close-btn', 'expression-select-modal'],
    ['item-select-close-btn', 'item-select-modal'],
    ['item-detail-close-btn', 'item-detail-modal'],
    ['worldview-select-close-btn', 'worldview-select-modal']
  ];

  for (const [buttonId, modalId] of closers) {
    $(buttonId).addEventListener('click', () => hideModal(modalId));
  }

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target === modal) hideModal(modal.id);
    });
  });

  $('expression-manage-btn').addEventListener('click', () => openExpressionModal());

  for (const buttonId of ['expression-character-cole-btn', 'expression-character-ellie-btn']) {
    $(buttonId).addEventListener('click', event => {
      state.expressionCharacterId = event.currentTarget.dataset.characterId;
      openExpressionModal();
    });
  }

  $('quote-edit-item-btn').addEventListener('click', () => {
    if (state.editingQuoteId) openItemSelectModalForQuote(state.editingQuoteId);
  });
  $('quote-edit-expression-btn').addEventListener('click', () => {
    if (state.editingQuoteId) openExpressionSelectModal(state.editingQuoteId);
  });
  $('quote-edit-worldview-btn').addEventListener('click', () => {
    if (state.editingQuoteId) openWorldviewSelectModal(state.editingQuoteId);
  });
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

// 모달 안의 모든 버튼/목록이 해당 캐릭터 색을 쓰도록 표시만 남깁니다. 색은 CSS가 결정합니다.
function applyCharacterTheme() {
  const characterId = state.activeCharacterId ?? '';
  for (const modalId of CHARACTER_THEMED_MODALS) {
    document.getElementById(modalId)?.setAttribute('data-character', characterId);
  }
}

export function openQuoteAddModal(character) {
  state.activeCharacterId = character.id;
  state.pendingQuoteText = '';
  applyCharacterTheme();
  $('quote-add-modal-title').textContent = `${character.name} 대사 추가`;
  $('quote-add-input').value = '';
  $('quote-add-item-checkbox').checked = false;
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

  for (const [itemId, item] of Object.entries(ITEM_DATA)) {
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
        await character.addQuote(text, itemId);
        if (isModalOpen('quote-modal')) renderQuoteList();
      }, '아이템 상호작용 대사를 저장하지 못했습니다.');
    });
    list.appendChild(li);
  }

  showModal('item-select-modal');
}

export function openQuoteModal(character) {
  state.activeCharacterId = character.id;
  applyCharacterTheme();
  $('modal-title').textContent = `${character.name} 대사 목록`;
  renderQuoteList();
  showModal('quote-modal');
}

export function renderQuoteList() {
  const character = getActiveCharacter();
  if (!character) return;

  const list = $('modal-quote-list');
  list.replaceChildren();
  const quotes = getVisibleQuotes(character.id);

  if (quotes.length === 0) {
    const worldview = getActiveWorldview();
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = worldview
      ? `'${worldview.name}' 세계관에 등록된 대사가 없습니다.`
      : '등록된 대사가 없습니다.';
    list.appendChild(empty);
    return;
  }

  for (const quote of quotes) {
    const row = document.createElement('li');
    row.className = 'quote-row';

    const text = document.createElement('span');
    text.className = 'quote-text';
    text.textContent = quote.text;

    const actions = document.createElement('div');
    actions.className = 'quote-actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'quote-action-btn';
    editButton.textContent = '수정';
    editButton.addEventListener('click', () => openQuoteEditModal(quote));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-btn';
    deleteButton.textContent = '✕';
    deleteButton.setAttribute('aria-label', '대사 삭제');
    deleteButton.addEventListener('click', () => deleteQuoteRow(quote));

    actions.append(editButton, deleteButton);
    row.append(text, actions);
    list.appendChild(row);
  }
}

// 아이템 / 표정 / 세계관은 대사 수정 모달 안에서 바꿉니다.
function renderQuoteEditTags(quote) {
  const themeClass = quote.character_id === 'shimeji-cole' ? 'cole-tag' : 'ellie-tag';

  applyTagButton($('quote-edit-item-btn'), ITEM_DATA[quote.item_id]?.name, themeClass, '기본');

  const expression = getExpressionById(quote.expression_id);
  applyTagButton($('quote-edit-expression-btn'), expression?.name, themeClass, '기본');
  const mismatched = Boolean(expression) && !sameWorldview(expression.worldview_id, quote.worldview_id);
  $('quote-edit-expression-btn').classList.toggle('is-mismatched', mismatched);
  if (mismatched) {
    const other = state.worldviews.find(row => sameWorldview(row.id, expression.worldview_id));
    $('quote-edit-expression-btn').title = `'${other?.name ?? '미분류'}' 세계관의 표정입니다.`;
  }

  const worldview = state.worldviews.find(row => sameWorldview(row.id, quote.worldview_id));
  applyTagButton($('quote-edit-worldview-btn'), worldview?.name, themeClass, '미분류');
  $('quote-edit-worldview-wrap').hidden = !isWorldviewAvailable();
}

function applyTagButton(button, value, theme, fallback) {
  const hasValue = String(value ?? '').trim() !== '';
  button.className = `quote-tag-btn ${hasValue ? `active-tag ${theme}` : 'default-tag'}`;
  button.textContent = hasValue ? value : fallback;
  button.title = hasValue ? value : fallback;
}

export function openItemSelectModalForQuote(quoteId) {
  const character = getActiveCharacter();
  if (!character) return;
  populateItemSelectList(async itemId => {
    hideModal('item-select-modal');
    await saveQuotePatch(quoteId, { item_id: itemId });
  });
  showModal('item-select-modal');
}

/**
 * 대사에 붙일 표정을 고릅니다.
 *
 * 중요: 지금 선택된 세계관이 아니라 "그 대사가 속한 세계관"의 표정만 보여줍니다.
 * 세계관을 전부 해제한 상태에서는 모든 세계관의 표정이 섞여 보이는데,
 * 이름이 같은 표정이 여러 세계관에 있으면 목록에서 구분할 수가 없어
 * 엉뚱한 세계관의 표정을 붙이게 됩니다.
 */
export function openExpressionSelectModal(quoteId) {
  const character = getActiveCharacter();
  if (!character) return;

  const quote = getQuotes(character.id).find(row => row.id === quoteId);
  if (!quote) return;

  const quoteWorldview = state.worldviews.find(row => sameWorldview(row.id, quote.worldview_id));
  $('expression-select-title').textContent = quoteWorldview
    ? `표정 선택 · ${quoteWorldview.name}`
    : '표정 선택';

  const list = $('expression-select-list');
  list.replaceChildren();

  const defaultLi = document.createElement('li');
  defaultLi.className = 'expression-select-item default-tag';
  defaultLi.textContent = '[기본] (이미지 없음)';
  defaultLi.addEventListener('click', async () => {
    hideModal('expression-select-modal');
    await saveQuotePatch(quoteId, { expression_id: null });
  });
  list.appendChild(defaultLi);

  const options = getExpressions(character.id).filter(row =>
    sameWorldview(row.worldview_id, quote.worldview_id)
  );

  if (options.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = quoteWorldview
      ? `'${quoteWorldview.name}' 세계관에 등록된 표정이 없습니다.`
      : '미분류 표정이 없습니다.';
    list.appendChild(empty);
  }

  for (const expression of options) {
    const li = document.createElement('li');
    li.className = 'expression-select-item';
    if (String(expression.id) === String(quote.expression_id)) li.classList.add('is-current');
    li.textContent = `[${expression.name}]`;
    li.addEventListener('click', async () => {
      hideModal('expression-select-modal');
      await saveQuotePatch(quoteId, { expression_id: expression.id });
    });
    list.appendChild(li);
  }

  showModal('expression-select-modal');
}

/**
 * 이미 등록된 대사의 세계관을 바꿉니다.
 * 표정은 세계관별로 따로 관리되므로, 옮긴 세계관에 같은 이름의 표정이 있으면
 * 그쪽으로 다시 연결하고, 없으면 물어본 뒤 표정을 해제합니다.
 */
export function openWorldviewSelectModal(quoteId) {
  const character = getActiveCharacter();
  if (!character) return;

  const quote = getQuotes(character.id).find(row => row.id === quoteId);
  if (!quote) return;

  const list = $('worldview-select-list');
  list.replaceChildren();

  const defaultLi = document.createElement('li');
  defaultLi.className = 'expression-select-item default-tag';
  defaultLi.textContent = '[미분류] (세계관 없음)';
  defaultLi.addEventListener('click', () => chooseWorldview(quote, null));
  list.appendChild(defaultLi);

  if (state.worldviews.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = '등록된 세계관이 없습니다.';
    list.appendChild(empty);
  }

  for (const worldview of state.worldviews) {
    const li = document.createElement('li');
    li.className = 'expression-select-item';
    if (sameWorldview(worldview.id, quote.worldview_id)) li.classList.add('is-current');
    li.textContent = `[${worldview.name}]`;
    li.addEventListener('click', () => chooseWorldview(quote, worldview.id));
    list.appendChild(li);
  }

  showModal('worldview-select-modal');
}

async function chooseWorldview(quote, worldviewId) {
  if (sameWorldview(quote.worldview_id, worldviewId)) {
    hideModal('worldview-select-modal');
    return;
  }

  const patch = { worldview_id: worldviewId ?? null };
  const current = getExpressionById(quote.expression_id);

  if (current && !sameWorldview(current.worldview_id, worldviewId)) {
    const replacement = getExpressions(quote.character_id).find(
      row => row.name === current.name && sameWorldview(row.worldview_id, worldviewId)
    );

    if (replacement) {
      patch.expression_id = replacement.id;
    } else {
      const moved = confirm(
        `옮기려는 세계관에 '${current.name}' 표정이 없습니다.\n\n표정을 해제하고 대사만 옮길까요?`
      );
      if (!moved) return;
      patch.expression_id = null;
    }
  }

  hideModal('worldview-select-modal');
  await saveQuotePatch(quote.id, patch);
}

export function openQuoteEditModal(quote) {
  state.editingQuoteId = quote.id;
  state.editingQuote = quote;
  applyCharacterTheme();
  $('quote-edit-input').value = quote.text ?? '';
  renderQuoteEditTags(quote);
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
  const character = getExpressionCharacter();
  state.expressionCharacterId = character.id;

  const worldview = getActiveWorldview();
  $('expression-modal-title').textContent = worldview
    ? `표정 목록 · ${worldview.name}`
    : '표정 목록 · 전체';

  for (const buttonId of ['expression-character-cole-btn', 'expression-character-ellie-btn']) {
    const button = $(buttonId);
    button.classList.toggle('is-active', button.dataset.characterId === character.id);
  }

  $('expression-modal').setAttribute('data-character', character.id);
  $('expression-edit-modal').setAttribute('data-character', character.id);
  renderExpressionList();
  showModal('expression-modal');
}

function renderExpressionList() {
  const character = getExpressionCharacter();
  if (!character) return;

  const list = $('expression-list');
  list.replaceChildren();
  const expressions = getVisibleExpressions(character.id);

  if (expressions.length === 0) {
    const worldview = getActiveWorldview();
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = worldview
      ? `'${worldview.name}' 세계관에 등록된 표정이 없습니다.`
      : '등록된 표정이 없습니다.';
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
    edit.className = 'quote-action-btn';
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


// 만료되는 임시 링크면 한 번 알려주고, 그래도 쓰겠다면 그대로 진행합니다.
function confirmTemporaryUrl(url) {
  if (!isTemporaryDriveUrl(url)) return true;
  return confirm(
    '드라이브 미리보기에서 복사한 임시 주소로 보입니다.\n시간이 지나면 이미지가 깨집니다.\n\n' +
      '드라이브에서 파일 공유 링크를 복사해 쓰는 편이 좋습니다.\n그래도 이대로 등록할까요?'
  );
}

async function submitAddExpression() {
  const character = getExpressionCharacter();
  if (!character) return;

  const name = $('exp-name-input').value.trim();
  const url = normalizeImageUrl($('exp-url-input').value);
  if (!name || !url) {
    alert('이름과 URL을 모두 입력해주세요.');
    return;
  }
  if (!isHttpUrl(url)) {
    alert('이미지 URL은 http:// 또는 https://로 시작해야 합니다.');
    return;
  }
  if (!confirmTemporaryUrl(url)) return;

  await runBusy(async () => {
    const row = await createExpression({
      characterId: character.id,
      name,
      url,
      worldviewId: state.activeWorldviewId
    });
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
  const character = getExpressionCharacter();
  if (!character || !state.editingExpressionId) return;

  const name = $('exp-edit-name-input').value.trim();
  const url = normalizeImageUrl($('exp-edit-url-input').value);
  if (!name || !url) {
    alert('표정 이름과 URL은 비워둘 수 없습니다.');
    return;
  }
  if (!isHttpUrl(url)) {
    alert('이미지 URL은 http:// 또는 https://로 시작해야 합니다.');
    return;
  }
  if (!confirmTemporaryUrl(url)) return;

  await runBusy(async () => {
    // 대사는 expression_id로만 표정을 가리키므로, 이름과 URL을 고쳐도
    // 따로 맞춰줄 곳이 없습니다. (예전의 동기화 트리거가 하던 일입니다)
    const row = await updateExpression(state.editingExpressionId, { name, url });
    upsertLocalExpression(row);

    state.editingExpressionId = null;
    state.editingExpression = null;
    hideModal('expression-edit-modal');
    renderExpressionList();
    if (isModalOpen('quote-modal')) renderQuoteList();
  }, '표정을 수정하지 못했습니다.');
}

async function deleteExpressionRow(expression) {
  const character = getExpressionCharacter();
  if (!character || !confirm(`'${expression.name}' 표정을 삭제하시겠습니까?`)) return;

  await runBusy(async () => {
    // DB는 on delete set null, 로컬은 removeLocalExpression이 함께 정리합니다.
    await deleteExpression(expression.id);
    removeLocalExpression(expression.id, character.id);

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

    // 대사 수정 모달을 열어둔 채 태그를 바꿨다면 그 안의 표시도 맞춥니다.
    if (state.editingQuoteId === quoteId) {
      state.editingQuote = row;
      renderQuoteEditTags(row);
    }
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
