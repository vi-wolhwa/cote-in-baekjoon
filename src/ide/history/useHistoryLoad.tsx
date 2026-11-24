/**
 * '편집기로 불러오기' (ADR-0012): puts a submission's code from Baekjoon into the editor, in
 * its language. Baekjoon keeps whole programs, so the code goes in as standard I/O. Asks
 * first when that would replace code the user wrote.
 */
import { useState } from 'preact/hooks';
import type { SubmitLanguage } from '@/boj/languages';
import { languageInfo, type LanguageId } from '@/shared/languages';
import type { EditorHandle } from '../editor';
import { Modal } from '../Modal';
import * as store from '../storage';
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

  /** The code loading would replace: the editor's, or what is saved for that language and mode. */
  const replaced = async ({ entry, fn }: Plan): Promise<string | undefined> => {
    const { sol } = deps;
    if (sol.group(entry.language, fn) === sol.group(deps.language.current)) {
      return deps.editor.current?.getCode();
    }
    return store.loadCode(deps.problemId, sol.group(entry.language, fn), store.DRAFT_TTL_MS);
  };

  const apply = async ({ entry, fn, code }: Plan) => {
    setAsking(undefined);
    if (fn !== deps.sol.fn) await deps.sol.setMode(fn);
    if (entry.language !== deps.language.current) await deps.changeLanguage(entry.language);
    deps.editor.current?.setCode(code);
    deps.editor.current?.focus();
    deps.onLoaded();
  };

  const load = async (entry: LoadableCode) => {
    const plan = planFor(entry);
    const current = await replaced(plan);
    const starter = deps.sol.starter(entry.language, plan.fn);
    const untouched =
      current === undefined ||
      current.trim() === '' ||
      current === starter ||
      current === plan.code;
    if (untouched) await apply(plan);
    else setAsking(plan);
  };

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
        편집기의 {languageInfo(asking.entry.language).label} 코드를 이 제출의 코드로 바꿉니다. 지금
        작성한 코드는 사라집니다. 불러오시겠습니까?
      </p>
    </Modal>
  );

  return { load: (entry: LoadableCode) => void load(entry), dialog };
}
