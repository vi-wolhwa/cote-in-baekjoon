/**
 * Uploads a release zip to the Chrome Web Store and optionally submits it for review
 * (Chrome Web Store API v2, #88, ADR-0013). Run by the 웹스토어 업로드 workflow, which only
 * starts by hand after the product owner approves the release (#206).
 *
 *   node scripts/store/webstore.ts <zip> [--publish | --staged]
 *
 * Without a flag the package only becomes the item's draft. `--publish` submits it for review
 * and publishes it when approved; `--staged` submits it and waits for a manual publish in the
 * dashboard after approval. The API cannot create items, so the first version is uploaded in
 * the developer dashboard.
 *
 * Environment: CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN (OAuth client with the
 * chromewebstore scope), CWS_PUBLISHER_ID, CWS_EXTENSION_ID.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://chromewebstore.googleapis.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const ENV_KEYS = [
  'CWS_CLIENT_ID',
  'CWS_CLIENT_SECRET',
  'CWS_REFRESH_TOKEN',
  'CWS_PUBLISHER_ID',
  'CWS_EXTENSION_ID',
] as const;

export interface StoreConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  publisherId: string;
  extensionId: string;
}

export type PublishMode = 'draft' | 'publish' | 'staged';

type Fetch = typeof fetch;

/** Reads the credentials; throws naming every missing variable. */
export function readConfig(env: Record<string, string | undefined>): StoreConfig {
  const missing = ENV_KEYS.filter((k) => !env[k]?.trim());
  if (missing.length > 0) throw new Error(`환경 변수가 없습니다: ${missing.join(', ')}`);
  const get = (k: (typeof ENV_KEYS)[number]) => (env[k] as string).trim();
  const extensionId = get('CWS_EXTENSION_ID');
  if (!/^[a-p]{32}$/.test(extensionId))
    throw new Error('CWS_EXTENSION_ID 형식이 아닙니다 (a–p 32자)');
  return {
    clientId: get('CWS_CLIENT_ID'),
    clientSecret: get('CWS_CLIENT_SECRET'),
    refreshToken: get('CWS_REFRESH_TOKEN'),
    publisherId: get('CWS_PUBLISHER_ID'),
    extensionId,
  };
}

export function parseArgs(argv: string[]): { zip: string; mode: PublishMode } {
  const flags = argv.filter((a) => a.startsWith('--'));
  const files = argv.filter((a) => !a.startsWith('--'));
  const unknown = flags.filter((f) => f !== '--publish' && f !== '--staged');
  if (unknown.length > 0) throw new Error(`알 수 없는 옵션: ${unknown.join(' ')}`);
  if (flags.length > 1) throw new Error('--publish와 --staged 중 하나만 씁니다');
  if (files.length !== 1 || !files[0]?.endsWith('.zip'))
    throw new Error('zip 파일 하나를 넘겨야 합니다');
  const mode: PublishMode =
    flags[0] === '--publish' ? 'publish' : flags[0] === '--staged' ? 'staged' : 'draft';
  return { zip: files[0], mode };
}

export function itemPath(cfg: StoreConfig): string {
  return `publishers/${encodeURIComponent(cfg.publisherId)}/items/${cfg.extensionId}`;
}

async function json(res: Response, what: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!res.ok) throw new Error(`${what} 실패 (HTTP ${res.status}): ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

export async function accessToken(cfg: StoreConfig, f: Fetch = fetch): Promise<string> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await f(TOKEN_URL, { method: 'POST', body });
  const data = await json(res, '액세스 토큰 발급');
  if (typeof data.access_token !== 'string')
    throw new Error('액세스 토큰 응답에 access_token이 없습니다');
  return data.access_token;
}

export interface UploadDeps {
  fetch?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Status checks while the store processes the package (5 s apart). */
  maxPolls?: number;
}

/** Uploads the package; waits while the store reports IN_PROGRESS. Returns the crx version. */
export async function upload(
  cfg: StoreConfig,
  token: string,
  zip: Uint8Array,
  deps: UploadDeps = {},
): Promise<string> {
  const f = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const auth = { Authorization: `Bearer ${token}` };
  const res = await f(`${API}/upload/v2/${itemPath(cfg)}:upload`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/zip' },
    body: new Blob([zip as Uint8Array<ArrayBuffer>]),
  });
  let data = await json(res, '업로드');
  let state = data.uploadState;
  const version = data.crxVersion;
  for (let i = 0; state === 'IN_PROGRESS' && i < (deps.maxPolls ?? 24); i++) {
    await sleep(5000);
    data = await json(
      await f(`${API}/v2/${itemPath(cfg)}:fetchStatus`, { headers: auth }),
      '상태 확인',
    );
    state = data.lastAsyncUploadState;
  }
  if (state !== 'SUCCEEDED') throw new Error(`업로드가 끝나지 않았습니다 (상태: ${String(state)})`);
  return typeof version === 'string' ? version : '';
}

/** Submits the uploaded draft for review. Returns the item state and any warnings. */
export async function publish(
  cfg: StoreConfig,
  token: string,
  mode: Exclude<PublishMode, 'draft'>,
  f: Fetch = fetch,
): Promise<{ state: string; warnings: string[] }> {
  const res = await f(`${API}/v2/${itemPath(cfg)}:publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: mode === 'staged' ? 'STAGED_PUBLISH' : 'DEFAULT_PUBLISH' }),
  });
  const data = await json(res, '게시 요청');
  const info = data.warningInfo as
    { warnings?: { reason?: string; description?: string }[] } | undefined;
  const warnings = (info?.warnings ?? []).map((w) =>
    `${w.reason ?? ''} ${w.description ?? ''}`.trim(),
  );
  return { state: String(data.state ?? ''), warnings };
}

async function main(): Promise<void> {
  const { zip, mode } = parseArgs(process.argv.slice(2));
  const cfg = readConfig(process.env);
  const token = await accessToken(cfg);
  const version = await upload(cfg, token, await readFile(zip));
  console.log(`업로드 완료: ${path.basename(zip)}${version ? ` (버전 ${version})` : ''}`);
  if (mode === 'draft') {
    console.log('초안으로만 올렸습니다. 대시보드에서 확인한 뒤 심사를 요청하세요.');
    return;
  }
  const result = await publish(cfg, token, mode);
  console.log(
    `심사 요청 완료 (${mode === 'staged' ? '승인 후 수동 게시' : '승인 후 바로 게시'}): ${result.state}`,
  );
  for (const w of result.warnings) console.log(`::warning::${w}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
