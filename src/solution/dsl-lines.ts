/**
 * Checks the `lines` of a format (dsl.ts): which parameters each line reads, repeat lines,
 * blocks of several lines, and the counts that refer to integers read before. Errors are in
 * Korean, like the rest of checkFormat.
 */
import { countRefs, parseCount, type Count } from './count';
import {
  isArrayType,
  isGridType,
  isIntegerType,
  isRecord,
  isRepeatOnly,
  normalizeEnd,
  type InnerLine,
  type LineSpec,
  type Param,
} from './dsl';

type Fail = (e: string) => void;

/** What has been read so far, for counts and "read twice" checks. */
interface Scope {
  read: Set<string>;
  /** Parameters read in a block: arrays in `solution`, so not counts outside their block. */
  inBlock: Set<string>;
  /** Inside a block: the integers read earlier in the same block. */
  local: Set<string> | null;
}

export function parseLines(
  raw: unknown,
  byName: Map<string, Param>,
  fail: Fail,
): LineSpec[] | undefined {
  if (!Array.isArray(raw) || (raw.length === 0 && byName.size > 0)) {
    fail('"lines"에 읽을 줄이 하나 이상 있어야 해요.');
    return undefined;
  }
  const scope: Scope = { read: new Set(), inBlock: new Set(), local: null };
  const out: LineSpec[] = [];
  for (const [i, line] of raw.entries()) {
    const where = `${i + 1}번째 줄`;
    const last = i === raw.length - 1;
    if (isRecord(line) && Array.isArray(line.of)) {
      const block = parseBlock(line, where, last, byName, scope, fail);
      if (block) out.push(block);
      continue;
    }
    const spec = parseLine(line, where, last, byName, scope, fail);
    if (spec) out.push(spec);
  }
  for (const name of byName.keys()) {
    if (!scope.read.has(name)) fail(`'${name}'을(를) 읽는 줄이 없어요.`);
  }
  return out;
}

/** Checks a count's references: integers read before it (in the same block, or outside any). */
function checkCount(c: Count, what: string, byName: Map<string, Param>, scope: Scope, fail: Fail) {
  const parsed = parseCount(c);
  if (!parsed) return fail(`${what}의 개수 '${String(c)}'을(를) 읽을 수 없어요.`);
  for (const ref of countRefs(parsed)) {
    const p = byName.get(ref);
    if (!p) fail(`${what}의 개수에 나온 '${ref}'은(는) 없는 파라미터예요.`);
    else if (!isIntegerType(p.type)) fail(`${what}의 개수 '${ref}'은(는) 정수여야 해요.`);
    else if (!scope.read.has(ref)) fail(`${what}의 개수 '${ref}'은(는) 그보다 먼저 읽어야 해요.`);
    else if (scope.inBlock.has(ref) && !scope.local?.has(ref)) {
      fail(`${what}의 개수 '${ref}'은(는) 블록 안에서 읽은 값이라 그 블록 밖에서는 쓸 수 없어요.`);
    }
  }
}

/** A line of parameter names, or a repeat line of one parameter. */
function parseLine(
  line: unknown,
  where: string,
  last: boolean,
  byName: Map<string, Param>,
  scope: Scope,
  fail: Fail,
): InnerLine | undefined {
  const markRead = (p: Param) => {
    if (scope.read.has(p.name)) fail(`'${p.name}'을(를) 두 번 읽어요.`);
    if (scope.local && isGridType(p.type)) {
      fail(`블록 안에서는 2차원 배열 '${p.name}'을(를) 읽을 수 없어요.`);
    }
    scope.read.add(p.name);
    if (scope.local) {
      scope.inBlock.add(p.name);
      if (isIntegerType(p.type)) scope.local.add(p.name);
    }
  };
  if (Array.isArray(line)) {
    if (line.length === 0) fail(`${where}에 읽을 파라미터가 없어요.`);
    for (const [j, name] of line.entries()) {
      const p = typeof name === 'string' ? byName.get(name) : undefined;
      if (!p) {
        fail(`${where}의 '${String(name)}'은(는) 없는 파라미터예요.`);
        continue;
      }
      if (isRepeatOnly(p.type)) {
        fail(`'${p.name}'(${p.type})은(는) 여러 줄로만 읽을 수 있어요.`);
      }
      if (p.type === 'line' && line.length > 1) {
        fail(`'${p.name}'(line)은 한 줄을 통째로 읽어서 혼자 있어야 해요.`);
      }
      if (isArrayType(p.type) && p.len === undefined && j < line.length - 1) {
        fail(`개수가 없는 배열 '${p.name}'은(는) 줄의 마지막에만 둘 수 있어요.`);
      }
      if (p.flow && j < line.length - 1) {
        fail(`여러 줄에 걸친 배열(flow) '${p.name}'은(는) 줄의 마지막에만 둘 수 있어요.`);
      }
      if (isArrayType(p.type) && p.len !== undefined) {
        checkCount(p.len, `'${p.name}'`, byName, scope, fail);
      }
      markRead(p);
    }
    return line as string[];
  }
  const hasUntil = isRecord(line) && typeof line.until === 'string';
  if (!isRecord(line) || typeof line.of !== 'string' || (line.repeat === undefined && !hasUntil)) {
    fail(`${where}은(는) 파라미터 이름 배열이나 { "repeat", "of" }, { "until", "of" }여야 해요.`);
    return undefined;
  }
  const p = byName.get(line.of);
  if (!p) {
    fail(`${where}의 '${line.of}'은(는) 없는 파라미터예요.`);
    return undefined;
  }
  if (!isArrayType(p.type) && !isRepeatOnly(p.type)) {
    fail(`여러 줄로는 배열만 읽을 수 있어요. '${p.name}'은(는) ${p.type}이에요.`);
  }
  if (p.len !== undefined) fail(`여러 줄로 읽는 '${p.name}'에는 len을 쓰지 않아요.`);
  if (p.cols !== undefined) checkCount(p.cols, `'${p.name}'의 열`, byName, scope, fail);
  if (hasUntil) {
    const until = normalizeEnd(line.until as string);
    if (until === undefined) {
      fail(`'${p.name}'의 끝내는 줄은 "EOF"이거나 입력을 끝내는 줄(예: "0")이어야 해요.`);
    } else if (until === 'EOF' && scope.local) {
      fail(`블록 안의 '${p.name}'은(는) 입력 끝까지 읽을 수 없어요.`);
    } else if (until === 'EOF' && !last) {
      fail(`입력 끝까지 읽는 '${p.name}'은(는) 마지막 줄이어야 해요.`);
    }
    markRead(p);
    return { until: until ?? (line.until as string), of: p.name };
  }
  const repeat = line.repeat;
  if (typeof repeat !== 'string' && typeof repeat !== 'number') {
    fail(`${where}의 repeat 값을 읽을 수 없어요.`);
    return undefined;
  }
  checkCount(repeat, `'${p.name}'`, byName, scope, fail);
  markRead(p);
  return { repeat, of: p.name };
}

/** A block: lines read `repeat` times, until an end line or to the end of input. */
function parseBlock(
  line: Record<string, unknown>,
  where: string,
  last: boolean,
  byName: Map<string, Param>,
  scope: Scope,
  fail: Fail,
): LineSpec | undefined {
  const inner = line.of as unknown[];
  const hasUntil = typeof line.until === 'string';
  if (scope.local) {
    fail(`${where}: 블록 안에 블록을 둘 수 없어요.`);
    return undefined;
  }
  if (inner.length === 0) {
    fail(`${where}의 블록에 읽을 줄이 없어요.`);
    return undefined;
  }
  if (line.repeat === undefined && !hasUntil) {
    fail(`${where}의 블록은 { "repeat", "of" }나 { "until", "of" }여야 해요.`);
    return undefined;
  }
  let until: string | undefined;
  if (hasUntil) {
    until = normalizeEnd(line.until as string);
    if (until === undefined) {
      fail(`${where}의 블록을 끝내는 줄은 "EOF"이거나 입력을 끝내는 줄(예: "0")이어야 해요.`);
    } else if (until === 'EOF' && !last) {
      fail(`${where}: 입력 끝까지 읽는 블록은 마지막 줄이어야 해요.`);
    }
    // Every block reads a line, so an end line or the end of input is always reached.
    const first = inner[0];
    const p = Array.isArray(first) ? byName.get(first[0] as string) : undefined;
    if (p && (isArrayType(p.type) || isRepeatOnly(p.type))) {
      fail(`${where}: 끝내는 줄로 반복하는 블록의 첫 줄은 배열이 아닌 값으로 시작해야 해요.`);
    } else if (!Array.isArray(first)) {
      fail(`${where}: 끝내는 줄로 반복하는 블록의 첫 줄은 여러 줄 읽기가 아니어야 해요.`);
    }
  } else {
    const repeat = line.repeat;
    if (typeof repeat !== 'string' && typeof repeat !== 'number') {
      fail(`${where}의 블록 repeat 값을 읽을 수 없어요.`);
      return undefined;
    }
    checkCount(repeat, `${where}의 블록`, byName, scope, fail);
  }
  scope.local = new Set();
  const of: InnerLine[] = [];
  for (const [j, l] of inner.entries()) {
    if (isRecord(l) && Array.isArray(l.of)) {
      fail(`${where}: 블록 안에 블록을 둘 수 없어요.`);
      continue;
    }
    const spec = parseLine(l, `${where} 블록의 ${j + 1}번째 줄`, false, byName, scope, fail);
    if (spec) of.push(spec);
  }
  scope.local = null;
  if (hasUntil) return { until: until ?? (line.until as string), of };
  return { repeat: line.repeat as Count, of };
}
