import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, TABLES } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

const QUOTE_COLUMNS_BASE = 'id,character_id,text,item_id,expression_id,created_at';
const EXPRESSION_COLUMNS_BASE = 'id,character_id,name,url,created_at';
const QUOTE_COLUMNS = `${QUOTE_COLUMNS_BASE},worldview_id`;
const EXPRESSION_COLUMNS = `${EXPRESSION_COLUMNS_BASE},worldview_id`;
const WORLDVIEW_COLUMNS = 'id,name,sort_order,created_at';
const WORLDVIEW_IMAGE_COLUMNS = 'worldview_id,character_id,default_image_url';

// supabase/worldview.sql을 아직 실행하지 않은 상태에서도 기존 화면이 그대로
// 동작하도록, 세계관 스키마가 없으면 자동으로 예전 방식으로 내려갑니다.
let worldviewSupported = true;
let worldviewReason = '';

export function isWorldviewSupported() {
  return worldviewSupported;
}

// 세계관 바가 왜 비활성인지 화면과 콘솔에서 알려주기 위한 정보입니다.
export function getWorldviewReason() {
  return worldviewReason;
}

function disableWorldview(error, where) {
  if (!worldviewSupported) return;
  worldviewSupported = false;
  worldviewReason = error ? `${where}: ${error.message || error.code || error}` : where;
  console.warn(
    `[worldview] 세계관 스키마를 찾지 못해 기능을 끕니다. (${worldviewReason})\n` +
      'Supabase SQL Editor에서 supabase/worldview.sql을 실행해 주세요.'
  );
}

function quoteColumns() {
  return worldviewSupported ? QUOTE_COLUMNS : QUOTE_COLUMNS_BASE;
}

function expressionColumns() {
  return worldviewSupported ? EXPRESSION_COLUMNS : EXPRESSION_COLUMNS_BASE;
}

function isWorldviewMissing(error) {
  if (!error) return false;
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  // 42P01: undefined_table, 42703: undefined_column
  if (code === '42P01' || code === '42703') return true;
  if (code.startsWith('PGRST') && /worldview/i.test(message)) return true;
  return false;
}

function unwrap(result, message) {
  if (result.error) {
    const error = new Error(result.error.message || message);
    error.code = result.error.code;
    error.details = result.error.details;
    error.hint = result.error.hint;
    throw error;
  }
  return result.data;
}

function orderedSelect(table, columns) {
  return supabase
    .from(table)
    .select(columns)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
}

async function selectRows(table, fullColumns, baseColumns) {
  if (worldviewSupported) {
    const result = await orderedSelect(table, fullColumns);
    if (!result.error) return result;
    if (!isWorldviewMissing(result.error)) return result;
    disableWorldview(result.error, `${table}.worldview_id`);
  }
  return orderedSelect(table, baseColumns);
}

async function fetchWorldviewData() {
  const [worldviewResult, imageResult] = await Promise.all([
    supabase
      .from(TABLES.worldviews)
      .select(WORLDVIEW_COLUMNS)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase.from(TABLES.worldviewCharacters).select(WORLDVIEW_IMAGE_COLUMNS)
  ]);

  if (isWorldviewMissing(worldviewResult.error)) {
    disableWorldview(worldviewResult.error, TABLES.worldviews);
    return { worldviews: [], worldviewImages: [] };
  }

  if (isWorldviewMissing(imageResult.error)) {
    disableWorldview(imageResult.error, TABLES.worldviewCharacters);
    return { worldviews: [], worldviewImages: [] };
  }

  return {
    worldviews: unwrap(worldviewResult, '세계관 목록을 불러오지 못했습니다.') ?? [],
    worldviewImages: unwrap(imageResult, '세계관 기본 이미지를 불러오지 못했습니다.') ?? []
  };
}

export async function fetchAllData() {
  const [quotesResult, expressionsResult] = await Promise.all([
    selectRows(TABLES.quotes, QUOTE_COLUMNS, QUOTE_COLUMNS_BASE),
    selectRows(TABLES.expressions, EXPRESSION_COLUMNS, EXPRESSION_COLUMNS_BASE)
  ]);

  const quotes = unwrap(quotesResult, '대사 데이터를 불러오지 못했습니다.') ?? [];
  const expressions = unwrap(expressionsResult, '표정 데이터를 불러오지 못했습니다.') ?? [];

  const worldviewData = worldviewSupported
    ? await fetchWorldviewData()
    : { worldviews: [], worldviewImages: [] };

  if (worldviewSupported) {
    console.info(`[worldview] 사용 가능. 등록된 세계관 ${worldviewData.worldviews.length}개.`);
  }

  return {
    quotes,
    expressions,
    ...worldviewData,
    worldviewSupported,
    worldviewReason
  };
}

export async function createQuote({ characterId, text, itemId = '', expressionId = null, worldviewId = null }) {
  const payload = {
    character_id: characterId,
    text,
    item_id: itemId,
    expression_id: expressionId
  };
  if (worldviewSupported) payload.worldview_id = worldviewId;

  const result = await supabase
    .from(TABLES.quotes)
    .insert(payload)
    .select(quoteColumns())
    .single();

  return unwrap(result, '대사를 저장하지 못했습니다.');
}

export async function updateQuote(id, patch) {
  const result = await supabase
    .from(TABLES.quotes)
    .update(patch)
    .eq('id', id)
    .select(quoteColumns())
    .single();

  return unwrap(result, '대사를 수정하지 못했습니다.');
}

export async function deleteQuote(id) {
  const result = await supabase.from(TABLES.quotes).delete().eq('id', id);
  unwrap(result, '대사를 삭제하지 못했습니다.');
}

export async function createExpression({ characterId, name, url, worldviewId = null }) {
  const payload = { character_id: characterId, name, url };
  if (worldviewSupported) payload.worldview_id = worldviewId;

  const result = await supabase
    .from(TABLES.expressions)
    .insert(payload)
    .select(expressionColumns())
    .single();

  return unwrap(result, '표정을 저장하지 못했습니다.');
}

export async function updateExpression(id, patch) {
  const result = await supabase
    .from(TABLES.expressions)
    .update(patch)
    .eq('id', id)
    .select(expressionColumns())
    .single();

  return unwrap(result, '표정을 수정하지 못했습니다.');
}

export async function deleteExpression(id) {
  const result = await supabase.from(TABLES.expressions).delete().eq('id', id);
  unwrap(result, '표정을 삭제하지 못했습니다.');
}

export async function createWorldview({ name, sortOrder = 0 }) {
  const result = await supabase
    .from(TABLES.worldviews)
    .insert({ name, sort_order: sortOrder })
    .select(WORLDVIEW_COLUMNS)
    .single();

  return unwrap(result, '세계관을 저장하지 못했습니다.');
}

export async function updateWorldview(id, patch) {
  const result = await supabase
    .from(TABLES.worldviews)
    .update(patch)
    .eq('id', id)
    .select(WORLDVIEW_COLUMNS)
    .single();

  return unwrap(result, '세계관을 수정하지 못했습니다.');
}

export async function deleteWorldview(id) {
  const result = await supabase.from(TABLES.worldviews).delete().eq('id', id);
  unwrap(result, '세계관을 삭제하지 못했습니다.');
}

export async function saveWorldviewImage({ worldviewId, characterId, url }) {
  const trimmed = String(url ?? '').trim();

  if (!trimmed) {
    const result = await supabase
      .from(TABLES.worldviewCharacters)
      .delete()
      .eq('worldview_id', worldviewId)
      .eq('character_id', characterId);
    unwrap(result, '세계관 기본 이미지를 지우지 못했습니다.');
    return null;
  }

  const result = await supabase
    .from(TABLES.worldviewCharacters)
    .upsert(
      { worldview_id: worldviewId, character_id: characterId, default_image_url: trimmed },
      { onConflict: 'worldview_id,character_id' }
    )
    .select(WORLDVIEW_IMAGE_COLUMNS)
    .single();

  return unwrap(result, '세계관 기본 이미지를 저장하지 못했습니다.');
}
