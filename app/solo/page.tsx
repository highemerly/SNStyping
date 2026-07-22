'use client';

// ソロプレイ(/solo)。制限時間・単語リスト(TSVアップロード可)を選んでスタート。
// 設定画面とゲーム本体は同じURLのまま内部stateで切り替える(playing)。
//
// クエリパラメータ ?t=<秒>&list=<リストID> があれば、その設定でそのままゲームに入る。
// プレイ開始時にURLも同じ形に揃えるので、リザルト画面のURLがそのまま共有・ブックマーク可能。

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import SoloGame from '@/components/SoloGame';
import { normalizeReading, parseKana } from '@/lib/engine/romaji';
import { loadWordList, parseWordList } from '@/lib/engine/words';
import { EMPTY_CATALOG, fetchCatalog, findWordList, groupWordsByCategory, wordListUrl } from '@/lib/dictsource';
import type { Word, WordList, Catalog } from '@/components/modeTypes';
import { Field, SegmentedControl, Select } from '@/components/Controls';

export default function SoloPage() {
  const router = useRouter();
  const [playing, setPlaying] = useState(false);

  // 辞書のカタログ(snstyping-dict の GitHub Pages から実行時取得)
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
  useEffect(() => {
    fetchCatalog().then(setCatalog);
  }, []);

  const [words, setWords] = useState<Word[]>([]);
  const [wordSource, setWordSource] = useState('読み込み中…');
  const [durationSec, setDurationSec] = useState(60);
  const [wordListId, setWordListId] = useState('basic');
  // アップロードされた単語リスト(選択肢 'upload' として使う)
  const [uploaded, setUploaded] = useState<{ title: string; words: Word[] } | null>(null);
  const [uploadNote, setUploadNote] = useState('');

  // URLのクエリから設定を読み込む(マウント時のみ)。t=制限時間 / list=リストID。
  // 有効なら autoStart を立て、単語リストが読み込め次第そのままゲームに入る。
  const autoStartRef = useRef(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = Number(p.get('t'));
    const list = p.get('list');
    if ([30, 60, 120].includes(t)) setDurationSec(t);
    if (list && list !== 'upload') {
      setWordListId(list);
      autoStartRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 登録済みリストなら共有可能なURL。アップロード(=in-memory)は共有不可。
  const sameModeHref =
    wordListId === 'upload' ? null : `/solo?t=${durationSec}&list=${encodeURIComponent(wordListId)}`;

  // プレイ開始。開始時にURLも設定に揃える(リザルトのURLがそのまま共有可能になる)。
  const startPlaying = () => {
    if (sameModeHref) router.replace(sameModeHref);
    setPlaying(true);
  };

  // 単語リストが読み込めたら、URL指定(autoStart)のときは自動でゲームに入る
  useEffect(() => {
    if (autoStartRef.current && words.length > 0 && !playing) {
      autoStartRef.current = false;
      startPlaying();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words.length, playing]);

  useEffect(() => {
    if (wordListId === 'upload') {
      if (!uploaded) {
        // 「TSVをアップロードする…」を選んだ直後(ファイル未選択)
        setWords([]);
        setWordSource('ファイルを選択してください');
        return;
      }
      setWords(uploaded.words);
      const preview = uploaded.words.slice(0, 3).map((x) => x.display).join('、');
      setWordSource(`${preview} …(${uploaded.words.length}語)`);
      return;
    }
    const list = findWordList(catalog, wordListId);
    setWords([]);
    setWordSource('読み込み中…');
    if (!list) return; // カタログ取得待ち
    loadWordList(wordListUrl(list.file, list.version)).then(({ words: w }: { words: Word[]; source: string }) => {
      setWords(w);
      // 例:「今日はいい天気です、新幹線、抹茶ラテ …(40語)」
      const preview = w.slice(0, 3).map((x: Word) => x.display).join('、');
      setWordSource(`${preview} …(${w.length}語)`);
    });
  }, [wordListId, uploaded, catalog]);

  // TSV アップロード: パースして、読みが打てないお題は除外して使う
  const pickWordFile = (file: File | undefined) => {
    if (!file) return;
    file
      .text()
      .then((text) => {
        const parsed = parseWordList(text);
        const typeable = parsed.filter((w) => {
          try {
            return parseKana(normalizeReading(w.reading)).length > 0;
          } catch {
            return false;
          }
        });
        if (typeable.length === 0) {
          setUploadNote('使えるお題がありません(形式: 1行 =「表示テキスト<TAB>ふりがな」)');
          return;
        }
        const dropped = parsed.length - typeable.length;
        setUploadNote(dropped > 0 ? `${dropped}語は読みが打てないため除外しました` : '');
        setUploaded({ title: file.name.replace(/\.(tsv|txt)$/i, ''), words: typeable });
        setWordListId('upload');
      })
      .catch(() => setUploadNote('ファイルを読み込めませんでした'));
  };

  const wordListTitle =
    wordListId === 'upload' ? (uploaded?.title ?? 'アップロード') : (findWordList(catalog, wordListId)?.title ?? '');

  // 設定画面では Space でスタート、Esc でメニューへ戻る。
  // (ゲーム中は SoloGame 側が Space/Esc を扱うのでここでは何もしない)
  useEffect(() => {
    if (playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        router.push('/');
        return;
      }
      if (e.code !== 'Space' && e.key !== ' ') return;
      // セレクトやファイル選択にフォーカスがあるときは、その本来の動作を優先する
      const el = document.activeElement;
      if (el && (el.tagName === 'SELECT' || el.tagName === 'INPUT')) return;
      e.preventDefault();
      if (words.length > 0) startPlaying();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, words.length, router]);

  if (playing) {
    return (
      <main className="app">
        <SoloGame
          words={words}
          config={{ durationSec, wordListTitle, wordListId }}
          onExit={() => setPlaying(false)}
          onHome={() => router.push('/')}
        />
      </main>
    );
  }

  return (
    <main className="app">
      <section className="screen-box">
        <h2>ソロプレイ</h2>
        <div className="card-settings">
          <Field label="制限時間">
            <SegmentedControl<number>
              value={durationSec}
              onChange={setDurationSec}
              data-testid="duration-select"
              options={[
                { value: 30, label: '30秒' },
                { value: 60, label: '60秒' },
                { value: 120, label: '120秒' },
              ]}
            />
          </Field>
          <Field label="単語リスト">
            <Select value={wordListId} onChange={(e) => setWordListId(e.target.value)} data-testid="wordlist-select">
              {groupWordsByCategory(catalog).map((g) => (
                <optgroup key={g.category} label={g.category}>
                  {g.lists.map((l: WordList) => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </optgroup>
              ))}
              <option value="upload">
                {uploaded ? `アップロード: ${uploaded.title}` : 'TSVをアップロードする…'}
              </option>
            </Select>
          </Field>
          {wordListId === 'upload' && (
            <>
              <label className="ghost-file-label">
                {'ファイルを選択(1行 =「表示テキスト<TAB>ふりがな」のTSV)'}
                <input
                  type="file"
                  accept=".tsv,.txt,text/tab-separated-values,text/plain"
                  data-testid="wordlist-file"
                  onChange={(e) => pickWordFile(e.target.files?.[0])}
                />
              </label>
              {uploadNote && <p className="notice">{uploadNote}</p>}
            </>
          )}
          <p className="word-source">{wordSource}</p>
        </div>
        <div className="button-row">
          <button
            className="primary"
            data-testid="solo-start"
            disabled={words.length === 0}
            onClick={startPlaying}
          >
            スタート <kbd>Space</kbd>
          </button>
          <button onClick={() => router.push('/')}>戻る <kbd>Esc</kbd></button>
        </div>
      </section>
    </main>
  );
}
