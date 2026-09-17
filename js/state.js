export const state = {
  quotesByCharacter: Object.create(null),
  expressionsByCharacter: Object.create(null),
  activeCharacterId: null,
  editingQuoteId: null,
  editingExpressionId: null,
  editingQuote: null,
  pendingQuoteText: '',
  editingExpression: null,
  idleTimer: null,
  busy: false
};

export function setLoadedData({ quotes, expressions }) {
  state.quotesByCharacter = Object.create(null);
  state.expressionsByCharacter = Object.create(null);

  for (const row of quotes ?? []) {
    const id = String(row.character_id);
    if (!state.quotesByCharacter[id]) state.quotesByCharacter[id] = [];
    state.quotesByCharacter[id].push(row);
  }

  for (const row of expressions ?? []) {
    const id = String(row.character_id);
    if (!state.expressionsByCharacter[id]) state.expressionsByCharacter[id] = [];
    state.expressionsByCharacter[id].push(row);
  }
}

export function getQuotes(characterId) {
  return state.quotesByCharacter[characterId] ?? (state.quotesByCharacter[characterId] = []);
}

export function getExpressions(characterId) {
  return state.expressionsByCharacter[characterId] ?? (state.expressionsByCharacter[characterId] = []);
}

export function upsertLocalQuote(row) {
  const rows = getQuotes(row.character_id);
  const index = rows.findIndex(item => item.id === row.id);
  if (index === -1) rows.push(row);
  else rows[index] = row;
  rows.sort(compareCreatedAt);
}

export function removeLocalQuote(id, characterId) {
  state.quotesByCharacter[characterId] = getQuotes(characterId).filter(row => row.id !== id);
}

export function upsertLocalExpression(row) {
  const rows = getExpressions(row.character_id);
  const index = rows.findIndex(item => item.id === row.id);
  if (index === -1) rows.push(row);
  else rows[index] = row;
  rows.sort(compareCreatedAt);
}

export function removeLocalExpression(id, characterId) {
  state.expressionsByCharacter[characterId] = getExpressions(characterId).filter(row => row.id !== id);
}

function compareCreatedAt(a, b) {
  const at = new Date(a.created_at ?? 0).getTime();
  const bt = new Date(b.created_at ?? 0).getTime();
  if (at !== bt) return at - bt;
  return String(a.id).localeCompare(String(b.id));
}
