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

// 소리가 멎었을 때 이만큼 기다렸다가 다시 붙입니다.
const STALL_WAIT = 6000;

// 다시 붙여 보는 횟수. 이만큼도 안 되면 바를 감춥니다.
const MAX_RETRIES = 3;

const audio = new Audio();

let root = null;
let fill = null;
let progress = null;
let volumeSlider = null;

// 음소거를 풀 때 돌아갈 음량.
let lastVolume = 1;

// '지금 나와야 하는 상태인가'. 사람이 멈춘 것과 끊겨서 멎은 것을 가릅니다.
let wantPlaying = false;

let retries = 0;
let stallTimer = null;

// 한 번이라도 소리가 나간 적이 있는가. 주소가 아예 틀린 경우와 가릅니다.
let everPlayed = false;

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
  // 사람이 직접 정했으니, 자동 재생은 더 기다리지 않습니다.
  stopWaitingForFirstTouch();

  if (audio.paused) {
    wantPlaying = true;
    // 사람이 직접 눌렀으면 다시 붙여 보는 횟수를 되돌립니다.
    // 잠깐 끊겼다가 돌아온 경우에도 이 단추 하나로 다시 들을 수 있습니다.
    retries = 0;
    if (audio.error) reattach(audio.currentTime || 0);
    else audio.play().catch(error => console.warn('[player] 재생하지 못했습니다:', error.message));
  } else {
    wantPlaying = false;
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

/* ------------------------------------------------------------ 자동 재생 */

/*
 * 브라우저는 사람이 아무것도 하지 않은 상태에서 소리가 나는 걸 막습니다.
 *
 * 여기서 조심할 게 하나 있습니다. mousemove 는 브라우저가 '사람이 조작했다'로
 * 쳐 주지 않습니다. 그래서 '첫 조작 때 한 번만 시도하고 끝'으로 두면,
 * 거의 언제나 그 한 번을 마우스 움직임에 써 버리고 막힌 채 끝나서
 * 노래가 영영 시작되지 않습니다. 실제로 그런 상태였습니다.
 *
 * 그래서 **성공할 때까지** 기다립니다.
 * 다만 mousemove 는 1초에도 수십 번 오므로 한 번만 해 보고 손을 뗍니다.
 */
const START_EVENTS = ['mousemove', 'pointerdown', 'keydown', 'touchstart'];

// 앞의 시도가 아직 끝나지 않았으면 겹쳐 부르지 않습니다.
let trying = false;

function stopWaitingForFirstTouch() {
  for (const type of START_EVENTS) window.removeEventListener(type, tryAutoplay);
}

function tryAutoplay(event) {
  if (trying || !audio.paused) return;

  /*
   * 재생바를 직접 누른 것이면 여기서 틀지 않습니다.
   *
   * 누르면 pointerdown 이 먼저 오고 click 이 뒤따릅니다.
   * 여기서 먼저 틀어 버리면, 이어지는 click 이 '이미 나오는 중'으로 보고
   * 도로 멈춰서 첫 누름이 아무 일도 안 한 것처럼 보입니다.
   */
  if (event && root && root.contains(event.target)) return;

  // 마우스 움직임은 어차피 대개 막히므로 한 번만 해 봅니다.
  if (event && event.type === 'mousemove') window.removeEventListener('mousemove', tryAutoplay);

  trying = true;
  audio.play().then(
    () => { wantPlaying = true; stopWaitingForFirstTouch(); },
    () => { trying = false; }        // 아직 막혀 있습니다. 다음 조작 때 다시.
  );
}

/* --------------------------------------------------------- 끊겼을 때 */

/*
 * 바깥 저장소에서 받아 오는 파일이라 중간에 끊길 수 있습니다.
 * 그냥 두면 소리만 멎고 아무 일도 일어나지 않으므로,
 * 듣던 자리를 기억해 두었다가 다시 붙입니다.
 */
let resumeAt = 0;

function resumeAfterReattach() {
  try { if (resumeAt) audio.currentTime = resumeAt; } catch { /* 길이를 아직 모르면 처음부터 */ }
  if (wantPlaying) audio.play().catch(() => {});
}

function reattach(at) {
  resumeAt = at;

  // 앞서 붙여 둔 게 남아 있을 수 있으니 한 번 떼고 답니다.
  audio.removeEventListener('loadedmetadata', resumeAfterReattach);
  audio.addEventListener('loadedmetadata', resumeAfterReattach, { once: true });

  audio.src = SONG.src;
  audio.load();
}

function clearStallWatch() {
  if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
}

function watchStall() {
  if (stallTimer || !wantPlaying) return;

  const at = audio.currentTime;
  stallTimer = setTimeout(() => {
    stallTimer = null;
    // 그 사이에 조금이라도 나갔으면 그냥 받는 중이었던 겁니다.
    if (!wantPlaying || audio.currentTime > at + 0.2) return;
    console.info('[player] 소리가 멎어서 다시 붙입니다.');
    reattach(at);
  }, STALL_WAIT);
}

function handleError() {
  clearStallWatch();

  if (retries < MAX_RETRIES) {
    retries += 1;
    const at = audio.currentTime || 0;
    console.warn(`[player] 음악이 끊겼습니다. 다시 붙여 봅니다 (${retries}/${MAX_RETRIES})`);
    // 1초, 2초, 4초. 잠깐 끊긴 것이라면 이 사이에 돌아옵니다.
    setTimeout(() => reattach(at), 1000 * Math.pow(2, retries - 1));
    return;
  }

  /*
   * 여기까지 왔다는 건 여러 번 시도해도 안 됐다는 뜻입니다.
   *
   * 한 번이라도 소리가 나갔었다면 주소는 멀쩡하고 잠깐 막힌 것이므로,
   * 바를 그대로 두고 멈춰만 둡니다. ▶ 를 누르면 다시 시도합니다.
   * 한 번도 나간 적이 없다면 주소 자체가 잘못된 것이라 바를 감춥니다.
   */
  console.warn(`[player] 음악을 불러오지 못했습니다: ${SONG.src}`);
  if (!everPlayed) root.hidden = true;
}

/*
 * 작은 창으로 띄울 때 원래 창의 노래를 멈춥니다.
 * 두 창에서 같은 노래가 겹쳐 나오지 않게 하려는 것입니다.
 */
export function pauseMusic() {
  wantPlaying = false;
  clearStallWatch();
  try { audio.pause(); } catch { /* 아직 준비 전이면 그냥 넘어갑니다 */ }
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

  // 한 자락이라도 나가면 '끊김 감시'를 풀고, 다시 붙여 본 횟수도 되돌립니다.
  audio.addEventListener('playing', () => { clearStallWatch(); retries = 0; everPlayed = true; });
  audio.addEventListener('stalled', watchStall);
  audio.addEventListener('waiting', watchStall);
  audio.addEventListener('error', handleError);

  root.querySelector('.music-play').addEventListener('click', togglePlay);
  root.querySelector('.music-mute').addEventListener('click', toggleMute);
  progress.addEventListener('click', seek);
  volumeSlider.addEventListener('input', () => applyVolume(Number(volumeSlider.value)));

  // once 를 쓰지 않습니다. 재생바를 누른 경우엔 그냥 넘겨야 하는데,
  // once 면 넘기든 말든 그 한 번으로 listener 가 사라집니다.
  for (const type of START_EVENTS) {
    window.addEventListener(type, tryAutoplay, { passive: true });
  }
}
