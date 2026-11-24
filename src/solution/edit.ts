/**
 * Pure helpers for the format editor (#114): a starting format, renaming a parameter with
 * every reference to it, where each parameter is read, and a one-line signature.
 */
import {
  isRepeat,
  parseCount,
  countText,
  type Count,
  type Format,
  type ParamType,
  type RetSpec,
} from './dsl';

/** What '형식 만들기' starts from: one int in, one int out. */
export const TEMPLATE: Format = {
  v: 1,
  params: [{ name: 'n', type: 'int' }],
  lines: [['n']],
  cases: null,
  ret: { type: 'int' },
};

function renameCount(c: Count, from: string, to: string): Count {
  const parsed = parseCount(c);
  if (!parsed || parsed.kind === 'num') return c;
  const swap = (n: string) => (n === from ? to : n);
  return countText(
    parsed.kind === 'ref'
      ? { ...parsed, name: swap(parsed.name) }
      : { kind: 'mul', a: swap(parsed.a), b: swap(parsed.b) },
  );
}

/** Renames a parameter in params, lines and counts. */
export function renameParam(format: Format, from: string, to: string): Format {
  const swap = (n: string) => (n === from ? to : n);
  return {
    ...format,
    params: format.params.map((p) => ({
      ...p,
      name: swap(p.name),
      ...(p.len !== undefined ? { len: renameCount(p.len, from, to) } : {}),
      ...(p.cols !== undefined ? { cols: renameCount(p.cols, from, to) } : {}),
    })),
    lines: format.lines.map((l) =>
      isRepeat(l) ? { repeat: renameCount(l.repeat, from, to), of: swap(l.of) } : l.map(swap),
    ),
  };
}

export function retypeParam(format: Format, name: string, type: ParamType): Format {
  return { ...format, params: format.params.map((p) => (p.name === name ? { ...p, type } : p)) };
}

export function setRet(format: Format, ret: RetSpec): Format {
  return { ...format, ret };
}

/** "1번째 줄", "2번째 줄부터 n줄", then "그다음 줄" once line numbers stop being fixed. */
export function positions(format: Format): Map<string, string> {
  const out = new Map<string, string>();
  let line: number | undefined = format.cases && 'count' in format.cases ? 2 : 1;
  for (const l of format.lines) {
    if (isRepeat(l)) {
      const n = String(l.repeat);
      out.set(l.of, line === undefined ? `그다음 ${n}줄` : `${line}번째 줄부터 ${n}줄`);
      line = undefined;
      continue;
    }
    for (const name of l) out.set(name, line === undefined ? '그다음 줄' : `${line}번째 줄`);
    if (line !== undefined) line++;
  }
  return out;
}

/** "solution(n: int, arr: int[]) → int[]". */
export function signature(format: Format): string {
  const params = format.params.map((p) => `${p.name}: ${p.type}`).join(', ');
  return `solution(${params}) → ${format.ret.type}`;
}

/** Short Korean description of the case loop, or undefined for a single case. */
export function casesText(format: Format): string | undefined {
  const c = format.cases;
  if (c === null) return undefined;
  if ('count' in c) return `첫 줄의 ${c.count}개 케이스`;
  return c.until === 'EOF' ? '입력이 끝날 때까지 반복' : `'${c.until}' 줄이 나올 때까지 반복`;
}
