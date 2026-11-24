/**
 * The return value part of a solution-mode format (ADR-0006): its type, how it is printed,
 * and the per-case label and blank line. Re-exported by dsl.ts.
 */

export const RET_TYPES = [
  'int',
  'long',
  'double',
  'string',
  'bool',
  'int[]',
  'long[]',
  'string[]',
  'line[]',
  'int[][]',
  'char[][]',
] as const;
export type RetType = (typeof RET_TYPES)[number];

export interface RetSpec {
  type: RetType;
  /** Arrays: separator between elements (2D: between columns). */
  sep?: ' ' | '\n' | '';
  /** bool: the words printed for true and false. */
  yes?: string;
  no?: string;
  /** double: digits after the decimal point. */
  digits?: number;
  /**
   * The error the judge allows for real numbers (1e-6 for "10^-6까지 허용"). A double still prints
   * with `digits`; samples and run results are compared within it, number by number, so it also
   * fits answers made of several reals (`string`, `line[]`). Not for `bool`.
   */
  tol?: number;
  /**
   * Printed before each case's output, `{i}` being the 1-based case number: "Case #{i}: "
   * (same line as the answer) or "Scenario #{i}:\n" (a line of its own). Only with cases.
   */
  label?: string;
  /** One empty line after each case's output. */
  blank?: true;
}

/** The keys of a return value in DSL order, for formatToJson. */
export const RET_KEYS = ['sep', 'yes', 'no', 'digits', 'tol', 'label', 'blank'] as const;

const MAX_WORD = 40;
export const MAX_LABEL = 40;

/**
 * Checks a return value. `cases`: whether the format has several cases (a label needs them);
 * undefined when the cases could not be read.
 */
export function parseRet(
  raw: unknown,
  cases: boolean | undefined,
  fail: (e: string) => void,
): RetSpec | undefined {
  if (!isRecord(raw) || !RET_TYPES.includes(raw.type as RetType)) {
    fail(`반환 타입 '${isRecord(raw) ? String(raw.type) : ''}'을(를) 알 수 없어요.`);
    return undefined;
  }
  const type = raw.type as RetType;
  const ret: RetSpec = { type };
  const array = type.endsWith('[]');
  if (raw.sep !== undefined) {
    if (!array) fail('구분자(sep)는 배열 반환값에만 써요.');
    else if (type === 'line[]' && raw.sep !== '\n') {
      fail('line[] 반환값은 원소마다 한 줄씩 출력해요.');
    } else if (raw.sep !== ' ' && raw.sep !== '\n' && raw.sep !== '') {
      fail('구분자(sep)는 공백(" "), 줄바꿈("\\n"), 없음("") 중 하나예요.');
    } else if (raw.sep === '\n' && type.endsWith('[][]')) {
      fail('2차원 배열의 구분자는 열 사이 구분자라 공백이나 없음만 쓸 수 있어요.');
    } else if (raw.sep === '' && !type.endsWith('[][]')) {
      fail('1차원 배열의 구분자는 공백이나 줄바꿈이에요.');
    } else ret.sep = raw.sep;
  }
  if (type === 'bool') {
    for (const key of ['yes', 'no'] as const) {
      const word = raw[key];
      if (typeof word !== 'string' || word.trim() === '' || /[\r\n]/.test(word)) {
        fail(
          `참거짓 반환값에는 ${key === 'yes' ? '참' : '거짓'}일 때 출력할 문구(${key})가 필요해요.`,
        );
      } else if (word.length > MAX_WORD) fail(`${key} 문구가 너무 길어요.`);
      else ret[key] = word;
    }
    if (ret.yes !== undefined && ret.yes === ret.no) fail('yes와 no 문구가 같아요.');
  } else if (raw.yes !== undefined || raw.no !== undefined) {
    fail('yes/no 문구는 bool 반환값에만 써요.');
  }
  if (type === 'double') {
    const d = raw.digits;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 15) {
      fail('실수 반환값에는 소수 자리 수(digits, 0~15)가 필요해요.');
    } else ret.digits = d;
  } else if (raw.digits !== undefined) {
    fail('소수 자리 수(digits)는 double 반환값에만 써요.');
  }
  if (raw.tol !== undefined) {
    const t = raw.tol;
    if (type === 'bool') fail('허용 오차(tol)는 참거짓 반환값에는 쓰지 않아요.');
    else if (typeof t !== 'number' || !(t >= 1e-15 && t <= 1)) {
      fail('허용 오차(tol)는 1e-15~1 사이 수여야 해요.');
    } else ret.tol = t;
  }
  if (raw.label !== undefined) {
    const error = labelError(raw.label);
    if (error) fail(error);
    else if (cases === false) fail('케이스 머리말(label)은 입력 반복이 있는 형식에만 써요.');
    else ret.label = raw.label as string;
  }
  if (raw.blank !== undefined) {
    if (raw.blank !== true) fail('케이스 뒤 빈 줄(blank)은 true로만 써요.');
    else ret.blank = true;
  }
  return ret;
}

/** Why a case label cannot be used, or undefined when it can. */
export function labelError(label: unknown): string | undefined {
  if (typeof label !== 'string' || label.split('{i}').length !== 2) {
    return '케이스 머리말(label)에는 케이스 번호 자리 {i}가 한 번 있어야 해요.';
  }
  if (label.length > MAX_LABEL) return `케이스 머리말(label)은 ${MAX_LABEL}자까지 써요.`;
  if (/[{}]/.test(label.replace('{i}', ''))) {
    return '케이스 머리말(label)에는 {i} 말고 중괄호를 쓰지 않아요.';
  }
  if ([...label.replace(/\n$/, '')].some(isControl)) {
    return '케이스 머리말(label)의 줄바꿈은 맨 끝에만 쓸 수 있어요.';
  }
  return undefined;
}

function isControl(ch: string): boolean {
  const c = ch.codePointAt(0) as number;
  return c < 0x20 || c === 0x7f || c === 0x85 || c === 0x2028 || c === 0x2029;
}

/** A case label split around its number: "Case #{i}: " → "Case #", ": ". */
export function labelParts(ret: RetSpec): { pre: string; post: string } | undefined {
  if (ret.label === undefined) return undefined;
  const [pre = '', post = ''] = ret.label.split('{i}');
  return { pre, post };
}

/** Case `i`'s label as printed (with its trailing newline, if any). */
export function caseLabel(ret: RetSpec, i: number): string {
  return ret.label === undefined ? '' : ret.label.replace('{i}', String(i));
}

/** The separator a return value uses when its format leaves it out. */
export function retSep(ret: RetSpec): string {
  if (ret.type === 'line[]') return '\n';
  if (ret.sep !== undefined) return ret.sep;
  return ret.type === 'char[][]' ? '' : ' ';
}

/** True when one case's value prints exactly one line. */
export function isOneLineRet(ret: RetSpec): boolean {
  if (ret.type.endsWith('[][]')) return false;
  if (ret.type.endsWith('[]')) return retSep(ret) !== '\n';
  return true;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
