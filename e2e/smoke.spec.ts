// E2E スモーク: 画面が開けて壊れていないか、対戦サーバーで試合が始まるか、だけを見る。
// 画面の操作（タイピング）はまだ入れない。
import { expect, test } from '@playwright/test';
import { WORKER_URL } from '../playwright.config';

const PAGES = ['/', '/solo', '/online', '/ghost', '/stats', '/contribute'];

for (const path of PAGES) {
  test(`page ${path} loads without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    // 辞書の取得や Worker への問い合わせが終わるのを待つ
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}

test('solo page reads the dictionary catalog from NEXT_PUBLIC_DICT_BASE_URL', async ({ page }) => {
  await page.goto('/solo');
  // e2e/fixtures/dict/words.json の title（辞書の選択肢）。本物の辞書では出ない
  await expect(page.locator('option', { hasText: 'E2E辞書' }).first()).toBeAttached();
});

// 対戦サーバーのプロトコル（README「対戦プロトコル」）で2人つなぎ、準備OKで試合が始まるところまで
test('online match starts with words from the dictionary', async () => {
  const created = await fetch(`${WORKER_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPublic: false }),
  });
  expect(created.status).toBe(201);
  const { code } = (await created.json()) as { code: string };

  const sockets: WebSocket[] = [];
  try {
    const players = await Promise.all(
      ['alice', 'bob'].map(async (name) => {
        const ws = new WebSocket(`${WORKER_URL.replace(/^http/, 'ws')}/rooms/${code}/ws?name=${name}`);
        sockets.push(ws);
        const messages: { t: string; [k: string]: unknown }[] = [];
        ws.addEventListener('message', (e) => messages.push(JSON.parse(String(e.data))));
        await new Promise((resolve, reject) => {
          ws.addEventListener('open', resolve, { once: true });
          ws.addEventListener('error', reject, { once: true });
        });
        return { ws, messages };
      }),
    );
    for (const { messages } of players) {
      await expect.poll(() => messages.some((m) => m.t === 'joined')).toBe(true);
    }

    for (const { ws } of players) {
      ws.send(JSON.stringify({ t: 'ready', proposal: { wordListId: 'basic', durationSec: 30 } }));
    }

    for (const { messages } of players) {
      await expect.poll(() => messages.find((m) => m.t === 'start')).toBeTruthy();
      const start = messages.find((m) => m.t === 'start')!;
      expect(start.durationSec).toBe(30);
      // 偽の辞書のお題が配られている（Worker が DICT_BASE_URL から読めている。失敗時は内蔵のお題になる）
      const words = start.words as { reading: string }[];
      expect(words.map((w) => w.reading).sort()).toEqual(['いーつーいー', 'そつうかくにん', 'にせのじしょ']);
    }
  } finally {
    for (const ws of sockets) ws.close();
  }
});
