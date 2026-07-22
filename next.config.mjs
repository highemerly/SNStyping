/** @type {import('next').NextConfig} */
const nextConfig = {
  // WS接続を useEffect で張るため、開発時のStrictModeの二重マウントで
  // join → 即切断 → 再join が走り、満室判定と競合するのを避ける
  reactStrictMode: false,

  // kuromoji はランタイムに辞書ファイルを fs から読む。サーバーレス関数の
  // バンドルに辞書を同梱しないと本番で「辞書が無い」で落ちるため明示的に含める。
  outputFileTracingIncludes: {
    '/api/contribute/fetch': ['./node_modules/kuromoji/dict/**'],
  },
};

export default nextConfig;
