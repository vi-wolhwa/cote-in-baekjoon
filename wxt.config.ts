import preact from '@preact/preset-vite';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'wxt';
import { buildNotices } from './scripts/third-party-notices';

const BOJ_MATCHES = ['https://acmicpc.net/*', 'https://www.acmicpc.net/*'];

/**
 * Language runtimes copied into the extension at `runtime/` (M2). The Web Store forbids
 * remotely hosted code, so everything the sandbox runs is bundled (ADR-0004).
 */
const RUNTIMES: { dest: string; from: string; include: (name: string) => boolean }[] = [
  {
    dest: 'pyodide',
    from: 'node_modules/pyodide',
    include: (n) =>
      [
        'pyodide.mjs',
        'pyodide.asm.mjs',
        'pyodide.asm.wasm',
        'python_stdlib.zip',
        'pyodide-lock.json',
      ].includes(n),
  },
  {
    dest: 'clang',
    from: 'node_modules/@yowasp/clang/gen',
    include: (n) => n === 'bundle.js' || n.endsWith('.wasm') || n.endsWith('.tar'),
  },
  {
    dest: 'wasi',
    from: 'node_modules/@bjorn3/browser_wasi_shim/dist',
    include: (n) => n.endsWith('.js'),
  },
  {
    // javac + TeaVM (Java, #63). Not on npm: vendored, see vendor/teavm-javac/README.md.
    dest: 'teavm',
    from: 'vendor/teavm-javac',
    include: (n) => /\.(wasm|js|bin)$/.test(n),
  },
];

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: '코딩테스트 in 백준',
    description:
      '백준 문제를 기업 코딩테스트와 같은 풀이 화면에서 풀 수 있게 해 주는 확장 프로그램',
    // unlimitedStorage lifts the 10 MB storage.local quota so code for thousands of problems fits.
    permissions: ['storage', 'unlimitedStorage'],
    content_security_policy: {
      // The sandbox page runs user-written code. It has no extension APIs and no network access.
      sandbox:
        "sandbox allow-scripts; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src blob: 'self'; child-src blob: 'self'; connect-src 'none'",
    },
    web_accessible_resources: [
      {
        // runtime/* is loaded by the sandbox, which sits inside the overlay on Baekjoon pages.
        resources: ['ide.html', 'sandbox.html', 'runtime/*'],
        matches: BOJ_MATCHES,
        use_dynamic_url: true,
      },
    ],
  },
  hooks: {
    'build:publicAssets': (wxt, files) => {
      // Open-source license notices, linked from the IDE (#65).
      const notices = path.join(wxt.config.wxtDir, 'THIRD_PARTY_NOTICES.txt');
      mkdirSync(wxt.config.wxtDir, { recursive: true });
      // The BOM makes browsers read the plain-text file as UTF-8 (it has Korean text).
      writeFileSync(notices, `\uFEFF${buildNotices()}`);
      files.push({ absoluteSrc: notices, relativeDest: 'THIRD_PARTY_NOTICES.txt' });
      for (const runtime of RUNTIMES) {
        for (const name of readdirSync(runtime.from).filter(runtime.include)) {
          files.push({
            absoluteSrc: path.resolve(runtime.from, name),
            relativeDest: `runtime/${runtime.dest}/${name}`,
          });
        }
      }
    },
  },
  vite: () => ({
    plugins: [preact()],
  }),
});
