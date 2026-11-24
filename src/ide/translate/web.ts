/**
 * Web translation (ADR-0010): the public Google Translate endpoint the translate widgets use.
 * It works in every Chromium browser (Chrome, Edge, Whale) without a key or a host permission
 * (it answers any origin). Only the statement of a foreign-language problem is sent, never
 * code; Korean problems are not sent at all.
 */

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
/** Keeps one request well under the endpoint's size limit. */
const MAX_CHARS = 4000;

export interface WebResult {
  texts: string[];
  /** The source language the service detected (e.g. 'en'). */
  detected?: string;
}

async function request(text: string, target: string): Promise<{ text: string; detected?: string }> {
  const params = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target, dt: 't' });
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: text }).toString(),
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data = (await res.json()) as [[string, string][] | null, unknown, string?];
  const segments = data[0] ?? [];
  const out: { text: string; detected?: string } = { text: segments.map((s) => s[0]).join('') };
  if (typeof data[2] === 'string') out.detected = data[2];
  return out;
}

/** Groups texts into requests of at most MAX_CHARS, one text per line. */
function batches(texts: string[]): number[][] {
  const out: number[][] = [];
  let current: number[] = [];
  let size = 0;
  texts.forEach((t, i) => {
    if (current.length > 0 && size + t.length + 1 > MAX_CHARS) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(i);
    size += t.length + 1;
  });
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Translates texts (each a single line) in as few requests as possible: the texts of a batch
 * go as lines of one request; when the lines do not come back one for one, each text of that
 * batch is sent on its own.
 */
export async function webTranslate(texts: string[], target = 'ko'): Promise<WebResult> {
  const result: string[] = new Array<string>(texts.length);
  let detected: string | undefined;
  for (const batch of batches(texts)) {
    const joined = await request(batch.map((i) => texts[i]).join('\n'), target);
    detected ??= joined.detected;
    const lines = joined.text.split('\n');
    if (lines.length === batch.length) {
      batch.forEach((i, k) => (result[i] = (lines[k] as string).trim()));
      continue;
    }
    for (const i of batch) result[i] = (await request(texts[i] as string, target)).text.trim();
  }
  return detected === undefined ? { texts: result } : { texts: result, detected };
}
