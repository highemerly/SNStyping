'use client';

// プレイルール(時間指定 / ワード数指定)の選択UI。ソロの設定・部屋作成(幹事方式)・
// 対戦ロビーの提案で共通に使う。ルールの値の検証は lib/engine/rule.js。

import { Field, SegmentedControl } from './Controls';
import { DURATION_OPTIONS, WORD_COUNT_OPTIONS } from '@/lib/engine/rule';
import type { PlayMode } from './modeTypes';

interface RuleAmount {
  mode: PlayMode;
  durationSec: number;
  wordCount: number;
}

interface Props<R extends RuleAmount> {
  rule: R;
  onChange: (rule: R) => void;
  disabled?: boolean;
  // data-testid の接頭辞(例: 'vs-' → 'vs-mode-select' / 'vs-duration-select' / 'vs-wordcount-select')
  testIdPrefix?: string;
}

const MODE_OPTIONS: { value: PlayMode; label: string }[] = [
  { value: 'time', label: '時間指定' },
  { value: 'words', label: 'ワード数指定' },
];

// 「時間指定 / ワード数指定」の切り替え
export function ModeControl<R extends RuleAmount>({ rule, onChange, disabled, testIdPrefix = '' }: Props<R>) {
  return (
    <SegmentedControl<PlayMode>
      value={rule.mode}
      disabled={disabled}
      data-testid={`${testIdPrefix}mode-select`}
      options={MODE_OPTIONS}
      onChange={(mode) => onChange({ ...rule, mode })}
    />
  );
}

// モードに応じて「30秒/60秒/120秒」か「10語/15語/20語/30語」
export function AmountControl<R extends RuleAmount>({ rule, onChange, disabled, testIdPrefix = '' }: Props<R>) {
  if (rule.mode === 'words') {
    return (
      <SegmentedControl<number>
        value={rule.wordCount}
        disabled={disabled}
        data-testid={`${testIdPrefix}wordcount-select`}
        options={WORD_COUNT_OPTIONS.map((n) => ({ value: n, label: `${n}語` }))}
        onChange={(wordCount) => onChange({ ...rule, wordCount })}
      />
    );
  }
  return (
    <SegmentedControl<number>
      value={rule.durationSec}
      disabled={disabled}
      data-testid={`${testIdPrefix}duration-select`}
      options={DURATION_OPTIONS.map((n) => ({ value: n, label: `${n}秒` }))}
      onChange={(durationSec) => onChange({ ...rule, durationSec })}
    />
  );
}

// 設定画面向け: ラベル付きの2行(モード + 制限時間/ワード数)
export function RuleFields<R extends RuleAmount>(props: Props<R>) {
  return (
    <>
      <Field label="モード">
        <ModeControl {...props} />
      </Field>
      <Field label={props.rule.mode === 'words' ? 'ワード数' : '制限時間'}>
        <AmountControl {...props} />
      </Field>
    </>
  );
}
