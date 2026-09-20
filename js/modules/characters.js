import { CHARACTER_DATA } from '../data/characters.js';
import {
  state,
  getQuotes,
  getVisibleQuotes,
  getVisibleExpressions,
  getWorldviewImage,
  getExpressionById,
  upsertLocalQuote,
  removeLocalQuote
} from '../state.js';
import { createQuote, deleteQuote, updateQuote } from '../supabase.js';
import { $ } from '../ui.js';
import { playPop } from './sfx.js';

export const characters = new Map();

// 말풍선이 떠 있는 시간. 예전 4초에서 두 배로 늘렸습니다.
const BUBBLE_DURATION = 8000;

// 콜과 엘리 말풍선이 겹칠 때 나중에 말한 쪽이 위로 오도록,
// 말할 때마다 z-index를 하나씩 올려서 붙입니다.
let bubbleStackOrder = 10;

/*
 * 말풍선을 띄운 채로 두는 모드. AUTO 를 켜면 켜집니다.
 * 켜져 있는 동안에는 시간이 지나도 사라지지 않고, 다음 대사로 갈아끼워집니다.
 */
let bubblesHeld = false;

export function setBubblesHeld(on) {
  bubblesHeld = Boolean(on);

  for (const character of characters.values()) {
    if (bubblesHeld) {
      // 사라질 예정이던 것을 취소합니다.
      if (character.timer) {
        clearTimeout(character.timer);
        character.timer = null;
      }
    } else if (character.bubble.style.display === 'block') {
      // 붙잡기를 풀면, 지금 떠 있는 것부터 평소대로 사라집니다.
      character.scheduleHide();
    }
  }
}

class ShimejiCharacter {
  constructor(config) {
    this.config = config;
    this.element = $(config.id);
    this.image = $(config.imageId);
    this.bubble = $(config.bubbleId);
    this.otherBubble = $(config.otherBubbleId);
    this.card = $(config.cardId);
    this.addButton = $(config.addButtonId);
    this.listButton = $(config.listButtonId);
    this.fallbackImage = config.defaultImage;
    this.timer = null;

    this.image.src = this.defaultImage;
    this.image.addEventListener('error', () => this.handleImageError());
    this.bindEvents();
  }

  get id() { return this.config.id; }

  // 말풍선이 없는 평상시 이미지.
  // 세계관이 선택되어 있으면 그 세계관의 기본 이미지를, 없으면 원래 기본 이미지를 씁니다.
  get defaultImage() {
    return getWorldviewImage(state.activeWorldviewId, this.id) || this.fallbackImage;
  }

  /**
   * 대사를 말할 때 쓸 기본 이미지.
   *
   * 세계관을 전부 해제하면 모든 세계관의 대사가 섞여 나옵니다.
   * 이때는 "지금 선택된 세계관"이 아니라 "그 대사가 속한 세계관"을 따라가야
   * 중세 대사에 중세 모습이, 학원 대사에 학원 모습이 나옵니다.
   * 미분류 대사이거나 그 세계관에 지정된 이미지가 없으면 원래 기본 이미지를 씁니다.
   */
  baseImageFor(quote) {
    const worldviewId = quote?.worldview_id ?? state.activeWorldviewId;
    return getWorldviewImage(worldviewId, this.id) || this.fallbackImage;
  }

  get name() { return this.config.name; }
  get color() { return this.config.color; }

  // 이미지가 깨지면 엑박 대신 원래 기본 이미지로 돌아가고, 콘솔에 주소를 남깁니다.
  handleImageError() {
    const failed = this.image.src;
    if (!failed || failed === this.fallbackImage) return;
    console.warn(`[image] 불러오지 못했습니다: ${failed}`);
    this.image.src = this.fallbackImage;
  }

  bindEvents() {
    const activate = event => {
      event?.preventDefault?.();
      playPop();
      showRandomQuote(this, event);
    };

    this.element.addEventListener('click', activate);
    this.element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });

    this.addButton.addEventListener('click', event => {
      event.stopPropagation();
      document.dispatchEvent(new CustomEvent('colliji:quote-add', { detail: { characterId: this.id } }));
    });

    this.listButton.addEventListener('click', event => {
      event.stopPropagation();
      document.dispatchEvent(new CustomEvent('colliji:quote-list', { detail: { characterId: this.id } }));
    });
  }

  // 현재 세계관에 해당하는 것만. 전부 해제 상태면 전체가 섞여 나옵니다.
  getQuotes() {
    return getVisibleQuotes(this.id);
  }

  getAllQuotes() {
    return getQuotes(this.id);
  }

  getExpressions() {
    return getVisibleExpressions(this.id);
  }

  // 세계관을 바꾸면 말풍선을 닫고 기본 이미지를 다시 맞춥니다.
  resetToDefault() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.bubble.style.display = 'none';
    this.image.src = this.defaultImage;
  }

  async addQuote(text, options = {}) {
    const row = await createQuote({
      characterId: this.id,
      text,
      itemId: options.itemId ?? '',
      expressionId: options.expressionId ?? null,
      worldviewId: options.worldviewId ?? null
    });
    upsertLocalQuote(row);
    return row;
  }

  async updateQuote(id, patch) {
    const row = await updateQuote(id, patch);
    upsertLocalQuote(row);
    return row;
  }

  async deleteQuote(id) {
    await deleteQuote(id);
    removeLocalQuote(id, this.id);
  }

  speakRandomQuote(event) {
    hideGuide();
    const baseQuotes = this.getQuotes().filter(q => !String(q.item_id ?? '').trim());
    if (baseQuotes.length === 0) return;
    showHeart(this, event);
    const quote = baseQuotes[Math.floor(Math.random() * baseQuotes.length)];
    this.displayQuote(quote);
  }

  speakItemQuote(itemId, itemName = itemId) {
    hideGuide();
    const itemQuotes = this.getQuotes().filter(q => String(q.item_id ?? '') === itemId);
    if (itemQuotes.length === 0) {
      alert(`${this.name}에게 등록된 '${itemName}' 상호작용 대사가 없습니다.`);
      return;
    }
    this.displayQuote(itemQuotes[Math.floor(Math.random() * itemQuotes.length)]);
  }

  displayQuote(quote) {
    this.bubble.style.zIndex = String(++bubbleStackOrder);
    this.bubble.textContent = String(quote.text ?? '');
    this.bubble.style.display = 'block';
    // 표정 URL은 expressions 테이블 한 곳에만 있습니다. 여기서 찾아 씁니다.
    // 표정이 없으면 그 대사가 속한 세계관의 기본 이미지로 말합니다.
    const expression = getExpressionById(quote.expression_id);
    this.image.src = String(expression?.url ?? '').trim() || this.baseImageFor(quote);

    this.bubble.style.animation = 'none';
    void this.bubble.offsetHeight;
    this.bubble.style.animation = 'bubblePop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';

    if (this.timer) clearTimeout(this.timer);
    this.timer = null;

    // AUTO 로 붙잡아 둔 동안에는 사라지지 않습니다.
    if (!bubblesHeld) this.scheduleHide();
  }

  scheduleHide() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.bubble.style.display = 'none';
      this.image.src = this.defaultImage;
    }, BUBBLE_DURATION);
  }
}

export function initializeCharacters() {
  for (const config of Object.values(CHARACTER_DATA)) {
    characters.set(config.id, new ShimejiCharacter(config));
  }

  document.addEventListener('colliji:worldview-change', refreshCharacterImages);
}

function refreshCharacterImages() {
  for (const character of characters.values()) character.resetToDefault();
}

export function getCharacter(id) {
  return characters.get(id) ?? null;
}

function showRandomQuote(character, event) {
  character.speakRandomQuote(event);
}

function showHeart(character, event) {
  if (!event?.clientX || !event?.clientY) return;
  const heart = document.createElement('div');
  heart.className = 'heart';
  heart.textContent = '♥';
  heart.style.color = character.color;

  const rect = character.card.getBoundingClientRect();
  heart.style.left = `${event.clientX - rect.left}px`;
  heart.style.top = `${event.clientY - rect.top - 10}px`;
  character.card.appendChild(heart);
  setTimeout(() => heart.remove(), 800);
}

function hideGuide() {
  const guide = document.getElementById('initial-guide-bubble');
  if (!guide) return;
  guide.classList.add('fade-out');
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => guide.classList.remove('fade-out'), 10000);
}

export function setupGlobalGuideTimer() {
  const trigger = () => hideGuide();
  window.addEventListener('mousemove', trigger);
  window.addEventListener('click', trigger);
}
