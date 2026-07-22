'use client';

// トップページ・オンライン対戦ロビーから開く共通の設定モーダル。
// 設定値は localStorage に即時保存され(components/settings.ts / sound.ts)、
// 開いている間だけマウントされる。Esc かオーバーレイのクリックで閉じる。

import { useEffect, useState } from 'react';
import {
  loadInputModePref,
  loadNamePref,
  loadRomajiStylePref,
  loadThemePref,
  missFlashEnabled,
  romajiGuideVisible,
  setInputModePref,
  setMissFlashPref,
  setNamePref,
  setRomajiGuidePref,
  setRomajiStylePref,
  setThemePref,
  type InputMode,
  type RomajiStyle,
  type Theme,
} from './settings';
import { loadSoundPref, setSoundEnabled } from './sound';
import { Field, SegmentedControl, Toggle } from './Controls';

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sound, setSound] = useState(true);
  const [romajiStyle, setRomajiStyleState] = useState<RomajiStyle>('hepburn');
  const [playerName, setPlayerName] = useState('');
  const [missFlash, setMissFlash] = useState(true);
  const [romajiGuide, setRomajiGuide] = useState(true);
  const [theme, setTheme] = useState<Theme>('dark');
  const [inputMode, setInputMode] = useState<InputMode>('romaji');

  // 開くたびに保存済みの値を読み直す(別画面で変更されていることがある)
  useEffect(() => {
    if (!open) return;
    setSound(loadSoundPref());
    setRomajiStyleState(loadRomajiStylePref());
    setPlayerName(loadNamePref());
    setMissFlash(missFlashEnabled());
    setRomajiGuide(romajiGuideVisible());
    setTheme(loadThemePref());
    setInputMode(loadInputModePref());
  }, [open]);

  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-overlay" data-testid="settings" onClick={onClose}>
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="設定"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-modal-head">
          <h2>設定</h2>
          <button className="settings-close" data-testid="settings-close" aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="card-settings">
          <label className="field">
            <span className="field-label">プレイヤー名</span>
            <input
              type="text"
              className="name-input"
              value={playerName}
              maxLength={20}
              placeholder="ゲスト"
              data-testid="setting-name"
              onChange={(e) => {
                setPlayerName(e.target.value);
                setNamePref(e.target.value);
              }}
            />
          </label>
          <Toggle
            label="効果音"
            checked={sound}
            data-testid="setting-sound"
            onChange={(e) => {
              setSound(e.target.checked);
              setSoundEnabled(e.target.checked);
            }}
          />
          <Toggle
            label="ミス時の赤フラッシュ"
            checked={missFlash}
            data-testid="setting-missflash"
            onChange={(e) => {
              setMissFlash(e.target.checked);
              setMissFlashPref(e.target.checked);
            }}
          />
          <Field label="テーマ">
            <SegmentedControl<Theme>
              value={theme}
              data-testid="setting-theme"
              options={[
                { value: 'dark', label: 'ダーク' },
                { value: 'light', label: 'ライト' },
              ]}
              onChange={(t) => {
                setTheme(t);
                setThemePref(t);
              }}
            />
          </Field>
          <div className="setting-group">
            <Field label="入力方式">
              <SegmentedControl<InputMode>
                value={inputMode}
                data-testid="setting-input"
                options={[
                  { value: 'romaji', label: 'ローマ字' },
                  { value: 'kana', label: 'かな入力' },
                ]}
                onChange={(mode) => {
                  setInputMode(mode);
                  setInputModePref(mode);
                }}
              />
            </Field>
            <p className="field-note">
              かな入力は JISかな配列で判定します。
            </p>
          </div>
          <div className="setting-group">
            <Field label="ローマ字表示">
              <SegmentedControl<RomajiStyle | 'none'>
                value={romajiGuide ? romajiStyle : 'none'}
                data-testid="setting-romaji"
                options={[
                  { value: 'none', label: 'なし' },
                  { value: 'hepburn', label: 'ヘボン式優先' },
                  { value: 'kunrei', label: '訓令式優先' },
                ]}
                onChange={(value) => {
                  if (value === 'none') {
                    setRomajiGuide(false);
                    setRomajiGuidePref(false);
                  } else {
                    setRomajiGuide(true);
                    setRomajiGuidePref(true);
                    setRomajiStyleState(value);
                    setRomajiStylePref(value);
                  }
                }}
              />
            </Field>
            <p className="field-note">
              設定によらず、どの綴りでも入力できます。このオプションは表示だけが変わります。
            </p>
          </div>
        </div>
        <div className="button-row">
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
