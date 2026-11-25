/**
 * '편집기로 불러오기' (ADR-0012): puts a submission's code from Baekjoon into the editor, in
 * its language. Baekjoon keeps whole programs, so the code goes in as standard I/O. Always
 * asks first, since the editor's code is replaced.
 */
import { useState } from 'preact/hooks';
import type { SubmitLanguage } from '@/boj/languages';
import { languageInfo, type LanguageId } from '@/shared/languages';
import type { EditorHandle } from '../editor';
import { Modal } from '../Modal';
import type { Solution } from '../useSolution';

interface Deps {
  problemId: number;
  editor: { current: EditorHandle | undefined };
  sol: Solution;
  language: { current: LanguageId };
  changeLanguage: (next: LanguageId) => Promise<void>;
  onLoaded: () => void;
}

/** Code to put in the editor and the language it is written in. */
export interface LoadableCode {
  language: SubmitLanguage;
  code: string;
}

interface Plan {
  entry: LoadableCode;
  fn: boolean;
  code: string;
}

export function useHistoryLoad(deps: Deps) {
  const [asking, setAsking] = useState<Plan>();

  const planFor = (entry: LoadableCode): Plan => ({ entry, fn: false, code: entry.code });

  const apply = async ({ entry, fn, code }: Plan) => {
    setAsking(undefined);
    if (fn !== deps.sol.fn) await deps.sol.setMode(fn);
    if (entry.language !== deps.language.current) await deps.changeLanguage(entry.language);
    deps.editor.current?.setCode(code);
    deps.editor.current?.focus();
    deps.onLoaded();
  };

  // Always asks first: the editor's code is replaced (product owner, 2026-11-25).
  const load = (entry: LoadableCode) => setAsking(planFor(entry));

  const dialog = asking && (
    <Modal
      title="코드 불러오기"
      onClose={() => setAsking(undefined)}
      footer={
        <>
          <button type="button" class="btn btn-light" onClick={() => setAsking(undefined)}>
            취소
          </button>
          <button type="button" class="btn btn-primary" onClick={() => void apply(asking)}>
            불러오기
          </button>
        </>
      }
    >
      <p>
        {asking.entry.language === deps.language.current
          ? '편집기의 코드를 이 제출의 코드로 바꿉니다.'
          : `편집기 언어를 ${languageInfo(asking.entry.language).label}(으)로 바꾸고 이 제출의 코드를 넣습니다.`}{' '}
        작성 중인 내용은 사라집니다. 불러오시겠습니까?
      </p>
    </Modal>
  );

  return { load, dialog };
}
