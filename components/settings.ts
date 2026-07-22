// トップページ「設定」の localStorage 読み書き。
// 効果音は components/sound.ts が同じパターンで管理している。

import { setRomajiStyle } from '@/lib/engine/romaji';

export type RomajiStyle = 'hepburn' | 'kunrei';

const ROMAJI_STORAGE_KEY = 'snstyping:romaji';
export const NAME_STORAGE_KEY = 'snstyping:name';

export function setRomajiStylePref(style: RomajiStyle) {
  setRomajiStyle(style);
  try {
    localStorage.setItem(ROMAJI_STORAGE_KEY, style);
  } catch {
    // localStorage 不可の環境ではセッション内のみ有効
  }
}

// 保存済みの設定をエンジンに適用して返す(ゲーム画面・設定画面の初期化時に呼ぶ)
export function loadRomajiStylePref(): RomajiStyle {
  let style: RomajiStyle = 'hepburn';
  try {
    if (localStorage.getItem(ROMAJI_STORAGE_KEY) === 'kunrei') style = 'kunrei';
  } catch {
    // 既定のヘボン式のまま
  }
  setRomajiStyle(style);
  return style;
}

// 入力方式。'romaji' = ローマ字入力 / 'kana' = JISかな入力。
// お題開始時(usePlayerGame.start)に読み込んでエンジンへ渡す。
export type InputMode = 'romaji' | 'kana';

const INPUT_STORAGE_KEY = 'snstyping:input';

export function setInputModePref(mode: InputMode) {
  try {
    localStorage.setItem(INPUT_STORAGE_KEY, mode);
  } catch {
    // 保存できない環境では無視
  }
}

export function loadInputModePref(): InputMode {
  try {
    if (localStorage.getItem(INPUT_STORAGE_KEY) === 'kana') return 'kana';
  } catch {
    // 既定のローマ字のまま
  }
  return 'romaji';
}

// ミス時の赤フラッシュ(WordArea がミスのたびに参照する)
const MISS_FLASH_STORAGE_KEY = 'snstyping:missflash';
let missFlash: boolean | null = null; // null = 未読み込み

export function missFlashEnabled(): boolean {
  if (missFlash === null) {
    try {
      missFlash = localStorage.getItem(MISS_FLASH_STORAGE_KEY) !== 'off';
    } catch {
      missFlash = true;
    }
  }
  return missFlash;
}

export function setMissFlashPref(v: boolean) {
  missFlash = v;
  try {
    localStorage.setItem(MISS_FLASH_STORAGE_KEY, v ? 'on' : 'off');
  } catch {
    // localStorage 不可の環境ではセッション内のみ有効
  }
}

// ローマ字ガイドの表示有無(WordArea が描画のたびに参照する)
const ROMAJI_GUIDE_STORAGE_KEY = 'snstyping:romajiguide';
let romajiGuide: boolean | null = null; // null = 未読み込み

export function romajiGuideVisible(): boolean {
  if (romajiGuide === null) {
    try {
      romajiGuide = localStorage.getItem(ROMAJI_GUIDE_STORAGE_KEY) !== 'off';
    } catch {
      romajiGuide = true;
    }
  }
  return romajiGuide;
}

export function setRomajiGuidePref(v: boolean) {
  romajiGuide = v;
  try {
    localStorage.setItem(ROMAJI_GUIDE_STORAGE_KEY, v ? 'on' : 'off');
  } catch {
    // localStorage 不可の環境ではセッション内のみ有効
  }
}

// テーマ。<html data-theme="light"> で globals.css の変数が切り替わる。
// 初期表示のちらつき防止のため layout.tsx のインラインスクリプトでも同じキーを読む。
export type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'snstyping:theme';

function applyTheme(theme: Theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
}

export function setThemePref(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 保存できない環境では無視
  }
}

export function loadThemePref(): Theme {
  let theme: Theme = 'dark';
  try {
    if (localStorage.getItem(THEME_STORAGE_KEY) === 'light') theme = 'light';
  } catch {
    // 既定のダークのまま
  }
  applyTheme(theme);
  return theme;
}

// リザルト共有先の Mastodon インスタンス(例: 'mastodon.social')
const MASTODON_STORAGE_KEY = 'snstyping:mastodon';

export function setMastodonPref(host: string) {
  try {
    localStorage.setItem(MASTODON_STORAGE_KEY, host);
  } catch {
    // 保存できない環境では無視
  }
}

export function loadMastodonPref(): string {
  try {
    return localStorage.getItem(MASTODON_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

// プレイヤー名(ゴースト保存・オンライン対戦の入室時と同じキーを共有)
export function setNamePref(name: string) {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name.trim().slice(0, 20));
  } catch {
    // 保存できない環境では無視
  }
}

export function loadNamePref(): string {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
