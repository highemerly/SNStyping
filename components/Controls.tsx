'use client';

// 設定UIの共通コントロール。プルダウン(Select)・トグル(Toggle)・
// ラベル行(Field)を1か所に集約し、各画面のマークアップとCSSの重複をなくす。
// 見た目は app/globals.css の .field / .ui-select / .toggle 系で定義する。

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

// 「ラベル(左)＋コントロール(右)」の1行。card-settings などの中に並べる。
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

// OS差をなくしたカスタム矢印つきプルダウン。<option> は children で渡す。
export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`ui-select ${className}`.trim()} {...props} />;
}

type Option<T> = { value: T; label: ReactNode };

// 選択肢が2〜3個の設定向けのセグメントコントロール(横並びボタン)。
export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  disabled = false,
  'data-testid': testId,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  disabled?: boolean;
  'data-testid'?: string;
}) {
  return (
    <div className={`segmented${disabled ? ' is-disabled' : ''}`} role="radiogroup" data-testid={testId}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          disabled={disabled}
          className={`segmented-option${opt.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// 選択肢ごとに説明文が付くような縦並びのラジオグループ。
export function RadioGroup<T extends string | number>({
  value,
  onChange,
  name,
  options,
  'data-testid': testId,
}: {
  value: T;
  onChange: (value: T) => void;
  name: string;
  options: Option<T>[];
  'data-testid'?: string;
}) {
  return (
    <div className="radio-group" role="radiogroup" data-testid={testId}>
      {options.map((opt) => (
        <label key={String(opt.value)} className="radio-option">
          <input
            type="radio"
            name={name}
            checked={opt.value === value}
            onChange={() => onChange(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

// トグルスイッチ。checkbox の意味論はそのまま、見た目だけスイッチに置換する。
export function Toggle({
  label,
  className = '',
  ...props
}: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <label className={`field toggle-field ${className}`.trim()}>
      <span className="field-label">{label}</span>
      <span className="toggle">
        <input type="checkbox" className="toggle-input" {...props} />
        <span className="toggle-track" aria-hidden="true" />
      </span>
    </label>
  );
}
