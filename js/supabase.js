import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, TABLES } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

const QUOTE_COLUMNS = 'id,character_id,text,image,image_title,item_name,created_at';
const EXPRESSION_COLUMNS = 'id,character_id,name,url,created_at';

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

export async function fetchAllData() {
  const [quotesResult, expressionsResult] = await Promise.all([
    supabase
      .from(TABLES.quotes)
      .select(QUOTE_COLUMNS)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    supabase
      .from(TABLES.expressions)
      .select(EXPRESSION_COLUMNS)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
  ]);

  return {
    quotes: unwrap(quotesResult, '대사 데이터를 불러오지 못했습니다.') ?? [],
    expressions: unwrap(expressionsResult, '표정 데이터를 불러오지 못했습니다.') ?? []
  };
}

export async function createQuote({ characterId, text, itemName = '' }) {
  const result = await supabase
    .from(TABLES.quotes)
    .insert({
      character_id: characterId,
      text,
      image: '',
      image_title: '',
      item_name: itemName
    })
    .select(QUOTE_COLUMNS)
    .single();

  return unwrap(result, '대사를 저장하지 못했습니다.');
}

export async function updateQuote(id, patch) {
  const result = await supabase
    .from(TABLES.quotes)
    .update(patch)
    .eq('id', id)
    .select(QUOTE_COLUMNS)
    .single();

  return unwrap(result, '대사를 수정하지 못했습니다.');
}

export async function deleteQuote(id) {
  const result = await supabase.from(TABLES.quotes).delete().eq('id', id);
  unwrap(result, '대사를 삭제하지 못했습니다.');
}

export async function createExpression({ characterId, name, url }) {
  const result = await supabase
    .from(TABLES.expressions)
    .insert({ character_id: characterId, name, url })
    .select(EXPRESSION_COLUMNS)
    .single();

  return unwrap(result, '표정을 저장하지 못했습니다.');
}

export async function updateExpression(id, patch) {
  const result = await supabase
    .from(TABLES.expressions)
    .update(patch)
    .eq('id', id)
    .select(EXPRESSION_COLUMNS)
    .single();

  return unwrap(result, '표정을 수정하지 못했습니다.');
}

export async function deleteExpression(id) {
  const result = await supabase.from(TABLES.expressions).delete().eq('id', id);
  unwrap(result, '표정을 삭제하지 못했습니다.');
}
