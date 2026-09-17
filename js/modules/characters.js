import { CHARACTER_DATA } from '../data/characters.js';
import { state, getQuotes, upsertLocalQuote, removeLocalQuote } from '../state.js';
import { createQuote, deleteQuote, updateQuote } from '../supabase.js';
import { $ } from '../ui.js';

export const characters = new Map();

export class ShimejiCharacter {
  constructor(config) {
    this.config = config;
    this.element = $(config.id);
    this.image = $(config.imageId);
    this.bubble = $(config.bubbleId);
    this.otherBubble = $(config.otherBubbleId);
    this.card = $(config.cardId);
    this.addButton = $(config.addButtonId);
    this.listButton = $(config.listButtonId);
    this.defaultImage = config.defaultImage;
    this.timer = null;

    this.image.src = this.defaultImage;
    this.bindEvents();
  }

  get id() { return this.config.id; }
  get name() { return this.config.name; }
  get color() { return this.config.color; }

  bindEvents() {
    const activate = event => {
      event?.preventDefault?.();
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

  getQuotes() {
    return getQuotes(this.id);
  }

  getExpressions() {
    return state.expressionsByCharacter[this.id] ?? [];
  }

  async addQuote(text, itemName = '') {
    const row = await createQuote({ characterId: this.id, text, itemName });
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
    const baseQuotes = this.getQuotes().filter(q => !String(q.item_name ?? '').trim());
    if (baseQuotes.length === 0) return;
    showHeart(this, event);
    const quote = baseQuotes[Math.floor(Math.random() * baseQuotes.length)];
    this.displayQuote(quote);
  }

  speakItemQuote(itemName) {
    hideGuide();
    const itemQuotes = this.getQuotes().filter(q => String(q.item_name ?? '') === itemName);
    if (itemQuotes.length === 0) {
      alert(`${this.name}에게 등록된 '${itemName}' 상호작용 대사가 없습니다.`);
      return;
    }
    this.displayQuote(itemQuotes[Math.floor(Math.random() * itemQuotes.length)]);
  }

  displayQuote(quote) {
    this.bubble.textContent = String(quote.text ?? '');
    this.bubble.style.display = 'block';
    this.image.src = String(quote.image ?? '').trim() || this.defaultImage;

    this.bubble.style.animation = 'none';
    void this.bubble.offsetHeight;
    this.bubble.style.animation = 'bubblePop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.bubble.style.display = 'none';
      this.image.src = this.defaultImage;
    }, 4000);
  }
}

export function initializeCharacters() {
  for (const config of Object.values(CHARACTER_DATA)) {
    characters.set(config.id, new ShimejiCharacter(config));
  }
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
