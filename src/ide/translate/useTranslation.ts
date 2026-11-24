/**
 * Automatic translation of a foreign-language statement into Korean (ADR-0010). The language is
 * detected from the statement text; when the browser's translator is ready the statement is
 * translated right away, when its model must be downloaded first the user starts it with a
 * click. The user can switch between the translation and the original; that choice is kept.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ProblemSections } from '@/boj/problem';
import {
  createTranslator,
  detectLanguage,
  translatorAvailability,
  type Availability,
} from './browser';
import { guessLanguage, statementText, translateHtml } from './html';

export type TranslationStatus =
  | { kind: 'native' }
  | { kind: 'unsupported'; source: string }
  | { kind: 'ready'; source: string }
  | { kind: 'working'; source: string; progress?: number }
  | { kind: 'done'; source: string }
  | { kind: 'error'; source: string };

const PREF_KEY = 'ui:translate';
const cache = new Map<number, ProblemSections>();

async function loadShowOriginal(): Promise<boolean> {
  try {
    const v = (await browser.storage.local.get(PREF_KEY))[PREF_KEY];
    return v === 'original';
  } catch {
    return false;
  }
}

async function translateSections(
  sections: ProblemSections,
  translate: (text: string) => Promise<string>,
): Promise<ProblemSections> {
  const out: ProblemSections = {
    description: await translateHtml(sections.description, translate),
    input: await translateHtml(sections.input, translate),
    output: await translateHtml(sections.output, translate),
  };
  if (sections.limit !== undefined) out.limit = await translateHtml(sections.limit, translate);
  if (sections.hint !== undefined) out.hint = await translateHtml(sections.hint, translate);
  return out;
}

export function useTranslation(problemId: number, sections: ProblemSections) {
  const [status, setStatus] = useState<TranslationStatus>({ kind: 'native' });
  const [translated, setTranslated] = useState<ProblemSections | undefined>(undefined);
  const [showOriginal, setShowOriginal] = useState(false);
  const current = useRef(0);

  const run = async (source: string, token: number) => {
    setStatus({ kind: 'working', source });
    try {
      const translate = await createTranslator(source, (progress) => {
        if (current.current === token) setStatus({ kind: 'working', source, progress });
      });
      const result = await translateSections(sections, translate);
      if (problemId > 0) cache.set(problemId, result);
      if (current.current !== token) return;
      setTranslated(result);
      setStatus({ kind: 'done', source });
    } catch {
      if (current.current === token) setStatus({ kind: 'error', source });
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
      const source = (await detectLanguage(text)) ?? guessLanguage(text);
      if (current.current !== token || !source || source.startsWith('ko')) return;
      const cached = cache.get(problemId);
      if (cached) {
        setTranslated(cached);
        setStatus({ kind: 'done', source });
        return;
      }
      const availability: Availability = await translatorAvailability(source);
      if (current.current !== token) return;
      if (availability === 'unsupported' || availability === 'unavailable') {
        setStatus({ kind: 'unsupported', source });
      } else if (availability === 'available' && !original) {
        await run(source, token);
      } else {
        setStatus({ kind: 'ready', source });
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
    /** Starts translating (a click: the model may need to be downloaded). */
    translate: () => {
      if (status.kind !== 'ready' && status.kind !== 'error') return;
      choose(false);
      void run(status.source, current.current);
    },
    choose,
  };
}
