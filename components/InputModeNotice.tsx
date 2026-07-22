'use client';

// 各モードの開始直前(ready)画面に置く、現在の入力方式の表示 + 設定モーダルを開くボタン。
// モーダルの開閉状態は自分で持ち、onOpenChange で親に通知する
// (親は開いている間 Space/Esc などのショートカットを止める)。
// モーダルを閉じたら入力方式を読み直して表示に反映する。

import { useEffect, useState } from 'react';
import SettingsModal from './SettingsModal';
import { loadInputModePref, type InputMode } from './settings';

export default function InputModeNotice({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [mode, setMode] = useState<InputMode>('romaji');
  const [open, setOpen] = useState(false);

  useEffect(() => setMode(loadInputModePref()), []);

  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) setMode(loadInputModePref()); // 閉じたら最新の設定を反映
  };

  return (
    <>
      <p className="input-mode-line" data-testid="input-mode-line">
        入力方式: <strong>{mode === 'kana' ? 'かな入力' : 'ローマ字入力'}</strong>
        <button
          type="button"
          className="input-mode-settings"
          data-testid="open-settings"
          onClick={() => change(true)}
        >
          ⚙ 設定
        </button>
      </p>
      <SettingsModal open={open} onClose={() => change(false)} />
    </>
  );
}
