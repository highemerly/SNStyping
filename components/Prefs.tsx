'use client';

// この端末に保存された効果音・ローマ字の綴り・テーマの設定を、どのページを最初に
// 開いても(/solo などへ直接来ても)反映させるための副作用専用コンポーネント。
// レイアウトに一度だけ置く。描画は行わない。

import { useEffect } from 'react';
import { loadRomajiStylePref, loadThemePref } from '@/components/settings';
import { loadSoundPref } from '@/components/sound';

export default function Prefs() {
  useEffect(() => {
    loadSoundPref();
    loadRomajiStylePref();
    loadThemePref();
  }, []);
  return null;
}
