/**
 * The browser's built-in, on-device Translator and LanguageDetector APIs (ADR-0010). Nothing is
 * sent to a server and there is no cost; browsers without them (or without the language pair)
 * keep the original text.
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
interface DetectorInstance {
  detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]>;
}
interface DetectorStatic {
  availability(): Promise<string>;
  create(): Promise<DetectorInstance>;
}

const api = () =>
  globalThis as unknown as { Translator?: TranslatorStatic; LanguageDetector?: DetectorStatic };

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

/** The language of a text by the browser's detector, when it is ready without a download. */
export async function detectLanguage(text: string): Promise<string | undefined> {
  const D = api().LanguageDetector;
  if (!D) return undefined;
  try {
    if ((await D.availability()) !== 'available') return undefined;
    const detector = await D.create();
    const [best] = await detector.detect(text);
    return best && best.confidence >= 0.6 ? best.detectedLanguage : undefined;
  } catch {
    return undefined;
  }
}
