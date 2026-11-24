/**
 * Return values as standard output, and expected output read back as return values
 * (ADR-0006 step 2). The glue code prints exactly what `formatReturn` prints.
 */
import { isOneLineRet, retSep, type RetSpec } from './dsl';
import { elementType, parseToken, type Value } from './values';

/** One case's return value as output text (no trailing newline). */
export function formatReturn(ret: RetSpec, v: Value): string {
  const sep = retSep(ret);
  switch (ret.type) {
    case 'bool':
      return v ? (ret.yes ?? 'true') : (ret.no ?? 'false');
    case 'double':
      return Number(v).toFixed(ret.digits ?? 6);
    case 'int[][]':
    case 'char[][]':
      return (v as Value[])
        .map((row) =>
          typeof row === 'string' ? [...row].join(sep) : (row as Value[]).map(String).join(sep),
        )
        .join('\n');
    case 'int[]':
    case 'long[]':
    case 'string[]':
    case 'line[]':
      return (v as Value[]).map(String).join(sep);
    default:
      return String(v);
  }
}

/** Every case's output, one after another (what the glue prints). */
export function formatOutput(ret: RetSpec, values: Value[]): string {
  return `${values.map((v) => formatReturn(ret, v)).join('\n')}\n`;
}

export type OutputResult = { ok: true; values: Value[] } | { ok: false; error: string };

/**
 * Reads expected output as `cases` return values. With several cases, each case must be
 * one line unless the return value spans lines; then only the tokens are checked.
 */
export function parseOutput(ret: RetSpec, text: string, cases: number): OutputResult {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\s+$/, '')
    .split('\n')
    .map((l) => l.trimEnd());
  const all = lines.length === 1 && lines[0] === '' ? [] : lines;
  try {
    if (isOneLineRet(ret)) {
      if (all.length !== cases) {
        throw new Error(`출력이 ${all.length}줄이에요. 케이스마다 한 줄씩 ${cases}줄이어야 해요`);
      }
      return { ok: true, values: all.map((l) => readOneLine(ret, l)) };
    }
    if (cases === 1) return { ok: true, values: [readBlock(ret, all)] };
    // Several multi-line results cannot be split apart: check the tokens only.
    for (const l of all) readBlock(ret, [l]);
    return { ok: true, values: [] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function tokens(line: string): string[] {
  const t = line.trim();
  return t === '' ? [] : t.split(/\s+/);
}

function scalar(type: 'int' | 'long' | 'double' | 'string', tok: string): Value {
  const r = parseToken(type, tok);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function readOneLine(ret: RetSpec, line: string): Value {
  switch (ret.type) {
    case 'string':
      return line;
    case 'bool':
      if (line.trim() === ret.yes) return true;
      if (line.trim() === ret.no) return false;
      throw new Error(`'${line.trim()}'은(는) '${ret.yes}'도 '${ret.no}'도 아니에요`);
    case 'int[]':
    case 'long[]':
    case 'string[]':
      return tokens(line).map((t) => scalar(elementType(ret.type), t));
    default: {
      const t = tokens(line);
      if (t.length !== 1) throw new Error(`한 줄에 값 하나가 있어야 하는데 '${line.trim()}'이에요`);
      return scalar(elementType(ret.type), t[0] as string);
    }
  }
}

function readBlock(ret: RetSpec, lines: string[]): Value {
  // line[]: each output line as it is (leading spaces kept, trailing ones dropped).
  if (ret.type === 'line[]') return lines;
  if (ret.type === 'char[][]') {
    const sep = retSep(ret);
    return lines.map((l) => (sep === '' ? l.trim() : tokens(l).join('')));
  }
  if (ret.type === 'int[][]') {
    const cells = (l: string) => (retSep(ret) === '' ? [...l.trim()] : tokens(l));
    return lines.map((l) => cells(l).map((t) => scalar('int', t)));
  }
  // 1D array printed one item per line.
  return lines.map((l) => {
    const t = tokens(l);
    if (t.length !== 1) throw new Error(`한 줄에 값 하나씩 있어야 하는데 '${l.trim()}'이에요`);
    return scalar(elementType(ret.type), t[0] as string);
  });
}
