/**
 * Automatic translation of a foreign-language statement into Korean (ADR-0010). The language is
 * guessed from the statement's scripts, so Korean problems are never sent anywhere. Foreign ones
 * are translated with web translation (works in Chrome, Edge and Whale); when that fails, the
 * browser's on-device translator is used where there is one. The user can switch between the
 * translation and the original, and that choice is kept.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ProblemSections } from '@/boj/problem';
import { createTranslator, translatorAvailability } from './browser';
import { guessLanguage, statementText, translateHtml, type TranslateMany } from './html';
import { webTranslate } from './web';

export type Engine = 'web' | 'device';

export type TranslationStatus =
  | { kind: 'native' }
  /** Waits for a click: the original was chosen, or the on-device model must be downloaded. */
  | { kind: 'ready'; source: string; engine: Engine }
  | { kind: 'working'; source: string; progress?: number }
  | { kind: 'done'; source: string }
  | { kind: 'error'; source: string };

const PREF_KEY = 'ui:translate';
const cache = new Map<number, { sections: ProblemSections; source: string }>();

async function loadShowOriginal(): Promise<boolean> {
  try {
    return (await browser.storage.local.get(PREF_KEY))[PREF_KEY] === 'original';
  } catch {
    return false;
  }
}

async function translateSections(
  sections: ProblemSections,
  many: TranslateMany,
): Promise<ProblemSections> {
  const out: ProblemSections = {
    description: await translateHtml(sections.description, many),
    input: await translateHtml(sections.input, many),
    output: await translateHtml(sections.output, many),
  };
  if (sections.limit !== undefined) out.limit = await translateHtml(sections.limit, many);
  if (sections.hint !== undefined) out.hint = await translateHtml(sections.hint, many);
  return out;
}

export function useTranslation(problemId: number, sections: ProblemSections) {
  const [status, setStatus] = useState<TranslationStatus>({ kind: 'native' });
  const [translated, setTranslated] = useState<ProblemSections | undefined>(undefined);
  const [showOriginal, setShowOriginal] = useState(false);
  const current = useRef(0);

  const finish = (token: number, result: ProblemSections, source: string) => {
    if (problemId > 0) cache.set(problemId, { sections: result, source });
    if (current.current !== token) return;
    setTranslated(result);
    setStatus({ kind: 'done', source });
  };

  /** On-device translation; downloading the model needs a click (`clicked`). */
  const runDevice = async (source: string, token: number, clicked: boolean) => {
    const availability = await translatorAvailability(source);
    if (current.current !== token) return;
    if (availability !== 'available' && !(clicked && availability !== 'unavailable')) {
      setStatus(
        availability === 'unavailable' || availability === 'unsupported'
          ? { kind: 'error', source }
          : { kind: 'ready', source, engine: 'device' },
      );
      return;
    }
    setStatus({ kind: 'working', source });
    try {
      const translate = await createTranslator(source, (progress) => {
        if (current.current === token) setStatus({ kind: 'working', source, progress });
      });
      const many: TranslateMany = async (texts) => {
        const out: string[] = [];
        for (const t of texts) out.push(await translate(t));
        return out;
      };
      finish(token, await translateSections(sections, many), source);
    } catch {
      if (current.current === token) setStatus({ kind: 'error', source });
    }
  };

  const runWeb = async (guess: string, token: number) => {
    setStatus({ kind: 'working', source: guess });
    let detected: string | undefined;
    try {
      const many: TranslateMany = async (texts) => {
        const r = await webTranslate(texts);
        detected ??= r.detected;
        return r.texts;
      };
      const result = await translateSections(sections, many);
      finish(token, result, detected ?? guess);
    } catch {
      // Offline or blocked: the browser's own translator, where there is one.
      if (current.current === token) await runDevice(guess, token, false);
    }
  };

  useEffect(() => {
    const token = ++current.current;
    setTranslated(undefined);
    setStatus({ kind: 'native' });
    void (async () => {
      const original = await loadShowOriginal();
      if (current.current !== token) return;
      setShowOriginal(original);
      const text = statementText(`${sections.description} ${sections.input} ${sections.output}`);
      const guess = guessLanguage(text);
      if (!guess || guess === 'ko') return;
      const cached = cache.get(problemId);
      if (cached) {
        setTranslated(cached.sections);
        setStatus({ kind: 'done', source: cached.source });
      } else if (original) {
        setStatus({ kind: 'ready', source: guess, engine: 'web' });
      } else {
        await runWeb(guess, token);
      }
    })();
  }, [problemId, sections]);

  const choose = (original: boolean) => {
    setShowOriginal(original);
    void browser.storage.local.set({ [PREF_KEY]: original ? 'original' : 'translated' });
  };

  return {
    status,
    /** The sections to show: the translation, unless the original is chosen or not translated yet. */
    shown: translated && !showOriginal ? translated : sections,
    showOriginal,
    /** Starts translating on a click (the on-device model may need to be downloaded). */
    translate: () => {
      if (status.kind !== 'ready' && status.kind !== 'error') return;
      choose(false);
      const token = current.current;
      if (status.kind === 'ready' && status.engine === 'device') {
        void runDevice(status.source, token, true);
      } else void runWeb(status.source, token);
    },
    choose,
  };
}
