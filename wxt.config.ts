import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

const BOJ_MATCHES = ['https://acmicpc.net/*', 'https://www.acmicpc.net/*'];

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
        resources: ['ide.html', 'sandbox.html'],
        matches: BOJ_MATCHES,
        use_dynamic_url: true,
      },
    ],
  },
  vite: () => ({
    plugins: [preact()],
  }),
});
