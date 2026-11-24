/**
 * The browser's built-in, on-device Translator API (ADR-0010): the fallback when web translation
 * fails. Nothing is sent to a server; browsers without it (or without the language pair) cannot
 * use this fallback.
 */

export type Availability =
  'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface TranslatorInstance {
  translate(text: string): Promise<string>;
}
interface DownloadMonitor {
  addEventListener(type: 'downloadprogress', listener: (e: { loaded: number }) => void): void;
}
interface TranslatorStatic {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: DownloadMonitor) => void;
  }): Promise<TranslatorInstance>;
}

const api = () => globalThis as unknown as { Translator?: TranslatorStatic };

export const TARGET = 'ko';

function asAvailability(v: string): Availability {
  return v === 'available' || v === 'downloadable' || v === 'downloading' ? v : 'unavailable';
}

export async function translatorAvailability(source: string): Promise<Availability> {
  const T = api().Translator;
  if (!T) return 'unsupported';
  try {
    return asAvailability(await T.availability({ sourceLanguage: source, targetLanguage: TARGET }));
  } catch {
    return 'unavailable';
  }
}

/** Creates a translator; downloading its model needs a user click (transient activation). */
export async function createTranslator(
  source: string,
  onProgress?: (fraction: number) => void,
): Promise<(text: string) => Promise<string>> {
  const T = api().Translator;
  if (!T) throw new Error('unsupported');
  const t = await T.create({
    sourceLanguage: source,
    targetLanguage: TARGET,
    monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded)),
  });
  return (text) => t.translate(text);
}
