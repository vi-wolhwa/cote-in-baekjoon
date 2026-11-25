/** Chrome Web Store upload script (scripts/store/webstore.ts, #88, ADR-0013). */
import { describe, expect, it } from 'vitest';
import { accessToken, parseArgs, publish, readConfig, upload } from '../scripts/store/webstore.ts';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const ENV = {
  CWS_CLIENT_ID: 'cid',
  CWS_CLIENT_SECRET: 'secret',
  CWS_REFRESH_TOKEN: 'refresh',
  CWS_PUBLISHER_ID: 'pub-1',
  CWS_EXTENSION_ID: ID,
};
const cfg = readConfig(ENV);

type Call = { url: string; init?: RequestInit };

function fakeFetch(responses: [number, unknown][]) {
  const calls: Call[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const [status, body] = responses.shift() ?? [500, { error: 'unexpected call' }];
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { f, calls };
}

describe('readConfig', () => {
  it('names every missing variable', () => {
    expect(() => readConfig({ CWS_CLIENT_ID: 'x' })).toThrow(
      'CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_PUBLISHER_ID, CWS_EXTENSION_ID',
    );
  });

  it('rejects an extension id that is not 32 letters a–p', () => {
    expect(() => readConfig({ ...ENV, CWS_EXTENSION_ID: 'xyz' })).toThrow('CWS_EXTENSION_ID');
  });
});

describe('parseArgs', () => {
  it('defaults to a draft upload and reads the publish flags', () => {
    expect(parseArgs(['a.zip'])).toEqual({ zip: 'a.zip', mode: 'draft' });
    expect(parseArgs(['--publish', 'a.zip']).mode).toBe('publish');
    expect(parseArgs(['a.zip', '--staged']).mode).toBe('staged');
  });

  it('rejects unknown, conflicting or missing arguments', () => {
    expect(() => parseArgs(['a.zip', '--force'])).toThrow('--force');
    expect(() => parseArgs(['a.zip', '--publish', '--staged'])).toThrow();
    expect(() => parseArgs([])).toThrow('zip');
  });
});

describe('API calls', () => {
  it('exchanges the refresh token for an access token', async () => {
    const { f, calls } = fakeFetch([[200, { access_token: 'tok' }]]);
    expect(await accessToken(cfg, f)).toBe('tok');
    expect(calls[0]?.url).toBe('https://oauth2.googleapis.com/token');
    expect(String(calls[0]?.init?.body)).toContain('grant_type=refresh_token');
  });

  it('uploads to the v2 upload URI and waits while the store processes it', async () => {
    const { f, calls } = fakeFetch([
      [200, { uploadState: 'IN_PROGRESS' }],
      [200, { lastAsyncUploadState: 'IN_PROGRESS' }],
      [200, { lastAsyncUploadState: 'SUCCEEDED' }],
    ]);
    await upload(cfg, 'tok', new Uint8Array([1]), { fetch: f, sleep: async () => {} });
    expect(calls.map((c) => c.url)).toEqual([
      `https://chromewebstore.googleapis.com/upload/v2/publishers/pub-1/items/${ID}:upload`,
      `https://chromewebstore.googleapis.com/v2/publishers/pub-1/items/${ID}:fetchStatus`,
      `https://chromewebstore.googleapis.com/v2/publishers/pub-1/items/${ID}:fetchStatus`,
    ]);
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('fails on a rejected upload or an HTTP error', async () => {
    const failed = fakeFetch([[200, { uploadState: 'FAILED' }]]);
    await expect(upload(cfg, 't', new Uint8Array(), { fetch: failed.f })).rejects.toThrow('FAILED');
    const http = fakeFetch([[403, { error: 'denied' }]]);
    await expect(upload(cfg, 't', new Uint8Array(), { fetch: http.f })).rejects.toThrow('HTTP 403');
  });

  it('returns the crx version of a finished upload', async () => {
    const { f } = fakeFetch([[200, { uploadState: 'SUCCEEDED', crxVersion: '0.22.0' }]]);
    expect(await upload(cfg, 't', new Uint8Array(), { fetch: f })).toBe('0.22.0');
  });

  it('submits a staged or default publish and reports warnings', async () => {
    const { f, calls } = fakeFetch([
      [
        200,
        { state: 'PENDING_REVIEW', warningInfo: { warnings: [{ reason: 'R', description: 'd' }] } },
      ],
    ]);
    expect(await publish(cfg, 't', 'staged', f)).toEqual({
      state: 'PENDING_REVIEW',
      warnings: ['R d'],
    });
    expect(calls[0]?.url).toMatch(/:publish$/);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ publishType: 'STAGED_PUBLISH' });
  });
});
