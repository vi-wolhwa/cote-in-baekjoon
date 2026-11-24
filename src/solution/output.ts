/**
 * Return values as standard output, and expected output read back as return values
 * (ADR-0006 step 2). The glue code prints exactly what `formatReturn` prints.
 */
import { caseLabel, isOneLineRet, retSep, type RetSpec } from './dsl';
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

/** Every case's output, one after another (what the glue prints): label, value, blank line. */
export function formatOutput(ret: RetSpec, values: Value[]): string {
  const blank = ret.blank ? '\n' : '';
  const text = values.map((v, i) => caseLabel(ret, i + 1) + formatReturn(ret, v) + blank);
  return `${text.join('\n')}\n`;
}

export type OutputResult = { ok: true; values: Value[] } | { ok: false; error: string };

/**
 * Reads expected output as `cases` return values. Each case's label and blank line are
 * checked and dropped. With several cases, each case must be one line unless the return
 * value spans lines; those are split by their labels or blank lines, else only the tokens
 * are checked (no values).
 */
export function parseOutput(ret: RetSpec, text: string, cases: number): OutputResult {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\s+$/, '')
    .split('\n')
    .map((l) => l.trimEnd());
  const all = lines.length === 1 && lines[0] === '' ? [] : lines;
  try {
    const blocks = caseBlocks(ret, all, cases);
    if (!blocks) {
      // Several multi-line results that cannot be split apart: check the tokens only.
      for (const l of all) if (!(ret.blank && l === '')) readBlock(ret, [l]);
      return { ok: true, values: [] };
    }
    const one = isOneLineRet(ret);
    return {
      ok: true,
      values: blocks.map((b) => (one ? readOneBlock(ret, b) : readBlock(ret, b))),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Each case's output lines, labels and blank lines dropped; undefined when they cannot be split. */
function caseBlocks(ret: RetSpec, all: string[], cases: number): string[][] | undefined {
  if (ret.label !== undefined) return labelBlocks(ret, all, cases);
  if (isOneLineRet(ret) && !ret.blank) {
    if (all.length !== cases) {
      throw new Error(`출력이 ${all.length}줄이에요. 케이스마다 한 줄씩 ${cases}줄이어야 해요`);
    }
    return all.map((l) => [l]);
  }
  if (cases === 1) return [all];
  if (!ret.blank) return undefined;
  const groups: string[][] = [];
  for (const [k, l] of all.entries()) {
    if (l === '') continue;
    if (k === 0 || all[k - 1] === '') groups.push([]);
    groups[groups.length - 1]?.push(l);
  }
  if (groups.length === cases) return groups;
  if (isOneLineRet(ret)) {
    throw new Error(
      `출력이 빈 줄로 나뉜 ${groups.length}묶음이에요. 케이스마다 한 묶음씩 ${cases}묶음이어야 해요`,
    );
  }
  return undefined;
}

/** Splits output at each case's label ("Case #1: …", or "Scenario #1:" on a line of its own). */
function labelBlocks(ret: RetSpec, all: string[], cases: number): string[][] {
  const own = (ret.label as string).endsWith('\n');
  const head = (i: number) => caseLabel(ret, i).replace(/\n$/, '');
  const starts = (line: string | undefined, i: number) =>
    line !== undefined && (line === head(i).trimEnd() || (!own && line.startsWith(head(i))));
  const blocks: string[][] = [];
  let pos = 0;
  for (let i = 1; i <= cases; i++) {
    if (!starts(all[pos], i)) {
      throw new Error(`${i}번째 케이스 출력이 '${head(i).trim()}'(으)로 시작하지 않아요`);
    }
    let end = pos + 1;
    while (end < all.length && !(i < cases && starts(all[end], i + 1))) end++;
    const block = all.slice(pos, end);
    if (own) block.shift();
    else block[0] = (block[0] as string).slice(head(i).length);
    if (ret.blank && i < cases) {
      if (block[block.length - 1] !== '') {
        throw new Error(`${i}번째 케이스 출력 뒤에 빈 줄이 없어요`);
      }
      block.pop();
    }
    blocks.push(block);
    pos = end;
  }
  if (pos < all.length) throw new Error(`출력이 ${cases}개 케이스보다 길어요`);
  return blocks;
}

function readOneBlock(ret: RetSpec, block: string[]): Value {
  if (block.length !== 1) {
    throw new Error(`케이스마다 한 줄씩 출력해야 하는데 ${block.length}줄인 케이스가 있어요`);
  }
  return readOneLine(ret, block[0] as string);
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
