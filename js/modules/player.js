/*
 * 오른쪽 위 음악 재생바.
 *
 * 앱스스크립트 사이드바에 있던 재생기를 옮겨 온 것입니다.
 * 판(vinyl)과 앨범 표지는 뺐습니다. 표지 주소가 만료되는 임시 주소였고,
 * 좁은 막대에는 들어가지도 않기 때문입니다.
 */

const SONG = {
  artist: 'ⓒsyong',
  src: 'https://cdn.jsdelivr.net/gh/fullmoon110240-web/-@main/%EC%8A%A4%EB%A6%B4%EB%9F%AC_%EB%A1%9C%EB%A7%A8%EC%8A%A4(reverb).mp3'
};

const audio = new Audio();

let root = null;
let fill = null;
let progress = null;
let volumeSlider = null;

// 음소거를 풀 때 돌아갈 음량.
let lastVolume = 1;

// 자동 재생은 한 번만 시도합니다.
let autoplayTried = false;

function setPlaying(isPlaying) {
  root.classList.toggle('is-playing', isPlaying);
  root.querySelector('.music-play').setAttribute('aria-label', isPlaying ? '멈춤' : '재생');
}

function setMuted(isMuted) {
  root.classList.toggle('is-muted', isMuted);
}

function updateProgress() {
  if (!audio.duration) return;
  const percent = (audio.currentTime / audio.duration) * 100;
  fill.style.width = `${percent}%`;
  progress.setAttribute('aria-valuenow', String(Math.round(percent)));
}

function togglePlay() {
  if (audio.paused) {
    audio.play().catch(error => console.warn('[player] 재생하지 못했습니다:', error.message));
  } else {
    audio.pause();
  }
}

function seek(event) {
  if (!audio.duration) return;
  const box = progress.getBoundingClientRect();
  const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
  audio.currentTime = ratio * audio.duration;
  updateProgress();
}

function applyVolume(value) {
  audio.volume = value;
  audio.muted = value === 0;
  setMuted(audio.muted);
}

function toggleMute() {
  if (audio.muted || audio.volume === 0) {
    const next = lastVolume > 0 ? lastVolume : 0.5;
    volumeSlider.value = String(next);
    applyVolume(next);
  } else {
    lastVolume = audio.volume;
    volumeSlider.value = '0';
    applyVolume(0);
  }
}

/*
 * 브라우저는 사용자가 아무것도 하지 않은 상태에서 소리가 나는 걸 막습니다.
 * 그래서 첫 조작(마우스 움직임 · 클릭 · 키 입력) 때 한 번만 시도합니다.
 * 막히면 조용히 넘어가고, 재생 버튼을 누르면 그때 나옵니다.
 */
function tryAutoplay() {
  if (autoplayTried) return;
  autoplayTried = true;
  audio.play().catch(() => {
    console.info('[player] 자동 재생이 막혔습니다. 재생 버튼을 눌러 주세요.');
  });
}

export function initializeMusicPlayer() {
  root = document.getElementById('music-player');
  if (!root) return;

  fill = document.getElementById('music-fill');
  progress = document.getElementById('music-progress');
  volumeSlider = document.getElementById('music-volume-slider');

  root.querySelector('.music-artist').textContent = SONG.artist;

  audio.src = SONG.src;
  audio.preload = 'metadata';
  audio.loop = true;           // 끝나면 처음부터 다시
  audio.volume = Number(volumeSlider.value);

  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('error', () => {
    console.warn(`[player] 음악을 불러오지 못했습니다: ${SONG.src}`);
    root.hidden = true;
  });

  root.querySelector('.music-play').addEventListener('click', togglePlay);
  root.querySelector('.music-mute').addEventListener('click', toggleMute);
  progress.addEventListener('click', seek);
  volumeSlider.addEventListener('input', () => applyVolume(Number(volumeSlider.value)));

  for (const type of ['mousemove', 'pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(type, tryAutoplay, { once: true, passive: true });
  }
}
