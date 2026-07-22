// 各モード画面(/solo・/ghost・/online)で共有する辞書カタログまわりの型。
// 以前は app/page.tsx にインライン定義していたが、ページ分割で共通化した。

export interface Word {
  display: string;
  reading: string;
}

export interface WordList {
  id: string;
  title: string;
  category: string;
  version: string | null;
  file: string;
}

export interface Catalog {
  words: WordList[];
  ghosts: { id: string; title: string; file: string }[];
}
