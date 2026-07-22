// 効果音(Web Audio でその場で発振、音源ファイルなし)

let ctx: AudioContext | null = null;
let enabled = true;

const STORAGE_KEY = 'snstyping:sound';

export function setSoundEnabled(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem(STORAGE_KEY, v ? 'on' : 'off');
  } catch {
    // localStorage 不可の環境ではセッション内のみ有効
  }
}

// 保存済みの設定を読み込んで適用する(ページ初期化時に呼ぶ)
export function loadSoundPref(): boolean {
  try {
    enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    enabled = true;
  }
  return enabled;
}

function beep(freq: number, durationMs: number, type: OscillatorType = 'square', gain = 0.04) {
  if (!enabled || typeof window === 'undefined') return;
  ctx ??= new AudioContext();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
}

export const soundMiss = () => beep(110, 80);
export const soundWord = () => beep(880, 90, 'sine', 0.06);
export const soundCount = () => beep(440, 100, 'sine', 0.05);
export const soundGo = () => beep(660, 180, 'sine', 0.06);
// ルーレットの回転音(短いクリック)
export const soundTick = () => beep(1200, 35, 'square', 0.03);
