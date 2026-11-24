/**
 * The format editor's table model (#114): every DSL v1 format round-trips through the table,
 * rows can be added, removed, moved and renamed, and the read options follow the type.
 * Also the '형식 오류 신고' issue link.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { sampleRows } from '@/solution/cases';
import { checkFormat, formatToJson, sameFormat, type Format } from '@/solution/dsl';
import { signature } from '@/solution/edit';
import { refreshStarter } from '@/solution/starter';
import { pickBundled } from '@/solution/bundled';
import {
  addRow,
  casesFor,
  fromTable,
  modeOptions,
  moveRow,
  nameError,
  removeRow,
  renameRow,
  rowPositions,
  setCases,
  setRow,
  tableErrors,
  toTable,
} from '@/solution/table';
import { validateFormat } from '@/solution/validate';
import { issueUrl } from '@/shared/report';

const f = (x: unknown): Format => {
  const r = checkFormat(x);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.format;
};

const ARRAY = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'arr', type: 'int[]', len: 'n' },
  ],
  lines: [['n'], ['arr']],
  cases: { count: 'T' },
  ret: { type: 'int[]', sep: ' ' },
});

const GRID = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'm', type: 'int' },
    { name: 'g', type: 'char[][]', cols: 'm' },
    { name: 'k', type: 'int' },
  ],
  lines: [['n', 'm'], { repeat: 'n', of: 'g' }, ['k']],
  cases: null,
  ret: { type: 'int' },
});

const back = (format: Format) => f(fromTable(toTable(format)));

describe('table model', () => {
  it('round-trips every bundled format', () => {
    const all = readdirSync('public/formats').flatMap((file) => {
      const raw = JSON.parse(readFileSync(`public/formats/${file}`, 'utf8')) as {
        formats: Record<string, unknown>;
      };
      return Object.keys(raw.formats).map((id) => {
        const format = pickBundled(raw, Number(id));
        if (!format) throw new Error(`형식 데이터 ${id}가 검사를 통과하지 못합니다`);
        return format;
      });
    });
    expect(all.length).toBeGreaterThan(800);
    for (const format of all) expect(formatToJson(back(format))).toBe(formatToJson(format));
  });

  it('turns lines into rows read on a new line, the same line or several lines', () => {
    expect(toTable(GRID).rows).toEqual([
      { name: 'n', type: 'int', mode: 'new', count: '', cols: '' },
      { name: 'm', type: 'int', mode: 'same', count: '', cols: '' },
      { name: 'g', type: 'char[][]', mode: 'repeat', count: 'n', cols: 'm' },
      { name: 'k', type: 'int', mode: 'new', count: '', cols: '' },
    ]);
    expect(rowPositions(toTable(GRID))).toEqual([
      '1번째 줄',
      '1번째 줄',
      '2번째 줄부터',
      '그다음 줄',
    ]);
    expect(rowPositions(toTable(ARRAY))).toEqual(['2번째 줄', '3번째 줄']);
  });

  it('adds, removes and moves parameters', () => {
    let t = addRow(toTable(ARRAY));
    expect(t.rows[2]).toEqual({ name: 'm', type: 'int', mode: 'new', count: '', cols: '' });
    t = moveRow(t, 2, -1);
    expect(t.rows.map((r) => r.name)).toEqual(['n', 'm', 'arr']);
    t = removeRow(t, 1);
    expect(sameFormat(f(fromTable(t)), ARRAY)).toBe(true);
    // Every parameter can be removed: a problem without input.
    expect(removeRow(removeRow(t, 1), 0).rows).toHaveLength(0);
  });

  it('renames a parameter with the counts that refer to it', () => {
    const t = renameRow(toTable(ARRAY), 0, 'size');
    expect(signature(f(fromTable(t)))).toBe('solution(size: int, arr: int[]) → int[]');
    expect(t.rows[1]?.count).toBe('size');
    expect(renameRow(toTable(GRID), 0, 'rows').rows[2]).toMatchObject({ count: 'rows', cols: 'm' });
  });

  it('offers only the read options a type allows and fixes the mode on a type change', () => {
    const t = toTable(GRID);
    expect(modeOptions(t, 0)).toEqual(['new']);
    expect(modeOptions(t, 1)).toEqual(['new', 'same']);
    expect(modeOptions(t, 2)).toEqual(['repeat', 'until']);
    // After a repeat row, the next one starts a new line.
    expect(modeOptions(t, 3)).toEqual(['new']);
    const asArray = setRow(t, 1, { type: 'int[]' });
    expect(modeOptions(asArray, 1)).toEqual(['new', 'same', 'repeat', 'until']);
    const scalar = setRow(t, 2, { type: 'int' });
    expect(scalar.rows[2]).toMatchObject({ mode: 'new', count: '', cols: '' });
    const line = setRow(t, 1, { type: 'line' });
    expect(line.rows[1]?.mode).toBe('new');
  });

  it('names missing names and counts before checking the format', () => {
    let t = setRow(toTable(GRID), 2, { count: '' });
    t = renameRow(t, 3, ' ');
    expect(tableErrors(t)).toEqual([
      "'g'을(를) 몇 줄에 걸쳐 읽는지 적어 주세요.",
      '4번째 매개변수의 이름을 적어 주세요.',
    ]);
    expect(tableErrors(toTable(GRID))).toEqual([]);
  });

  it('switches between case loops', () => {
    expect(casesFor('count', null)).toEqual({ count: 'T' });
    expect(casesFor('count', { count: 'Q' })).toEqual({ count: 'Q' });
    expect(casesFor('eof', null)).toEqual({ until: 'EOF' });
    expect(casesFor('until', { until: 'EOF' })).toEqual({ until: '0' });
    expect(casesFor('until', { until: '0 0' })).toEqual({ until: '0 0' });
    expect(casesFor('once', { until: 'EOF' })).toBeNull();
  });
});

describe('format report link', () => {
  it('fills the problem, the format and its source, never a "format" parameter', () => {
    const url = new URL(
      issueUrl('format', {
        version: '0.6.0',
        browser: 'Chrome 131',
        problemId: 1000,
        format: formatToJson(ARRAY, true),
        formatSource: '예제로 추론함',
      }),
    );
    expect(url.pathname).toBe('/vi-wolhwa/cote-in-baekjoon/issues/new');
    expect(url.searchParams.get('template')).toBe('4-format.yml');
    expect(url.searchParams.get('problem')).toBe('1000');
    expect(url.searchParams.get('source')).toBe('예제로 추론함');
    expect(url.searchParams.get('version')).toBe('0.6.0 / Chrome 131');
    expect(f(JSON.parse(url.searchParams.get('io_format') ?? ''))).toEqual(ARRAY);
    // GitHub answers 406 Not Acceptable to a "format" query parameter.
    expect(url.searchParams.has('format')).toBe(false);
  });
});

describe('formats beyond one value per token', () => {
  const ok = (format: unknown, input: string, output: string) =>
    validateFormat(format, [{ input, output }]);

  it('reads a first line with spaces whole', () => {
    const line = {
      v: 1,
      params: [
        { name: 's', type: 'line' },
        { name: 'k', type: 'int' },
      ],
      lines: [['s'], ['k']],
      cases: null,
      ret: { type: 'string' },
    };
    expect(ok(line, 'hello big world\n3\n', 'world').ok).toBe(true);
  });

  it('reads two blocks whose sizes come from the first line', () => {
    const blocks = {
      v: 1,
      params: [
        { name: 'a', type: 'int' },
        { name: 'b', type: 'int' },
        { name: 'edges', type: 'int[][]', cols: 2 },
        { name: 'qs', type: 'int[]' },
      ],
      lines: [['a', 'b'], { repeat: 'a', of: 'edges' }, { repeat: 'b', of: 'qs' }],
      cases: null,
      ret: { type: 'int[]', sep: '\n' },
    };
    expect(ok(blocks, '2 3\n1 2\n2 3\n1\n2\n3\n', '1\n1\n0').ok).toBe(true);
    const shown = toTable(f(blocks));
    expect(rowPositions(shown)).toEqual(['1번째 줄', '1번째 줄', '2번째 줄부터', '그다음 줄부터']);
  });

  it('reads n+m lines, whole lines, rows of words and doubles', () => {
    const stack = {
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'm', type: 'int' },
        { name: 'cmds', type: 'line[]' },
        { name: 'people', type: 'string[][]' },
        { name: 'w', type: 'double[]', len: 2 },
      ],
      lines: [['n', 'm'], { repeat: 'n+m', of: 'cmds' }, { repeat: 'm', of: 'people' }, ['w']],
      cases: null,
      ret: { type: 'line[]' },
    };
    const input = '1 1\npush 1\ntop\nJoe 16 34\n0.5 2\n';
    expect(ok(stack, input, '1\n  1').ok).toBe(true);
    // A command line is one element even with spaces in it.
    expect(
      ok(
        {
          ...stack,
          params: stack.params.map((p) => (p.name === 'cmds' ? { ...p, type: 'string[]' } : p)),
        },
        input,
        '1',
      ).ok,
    ).toBe(false);
  });

  it('handles problems without input and keeps leading spaces of returned lines', () => {
    const art = { v: 1, params: [], lines: [], cases: null, ret: { type: 'line[]' } };
    expect(ok(art, '', '  *\n ***\n*****').ok).toBe(true);
    expect(ok(art, '3\n', '*').ok).toBe(false);
    expect(checkFormat({ ...art, cases: { until: 'EOF' } }).ok).toBe(false);
    expect(signature(f(art))).toBe('solution() → line[]');
    const empty = removeRow(
      toTable(f({ ...art, params: [{ name: 'n', type: 'int' }], lines: [['n']] })),
      0,
    );
    expect(fromTable(empty)).toMatchObject({ params: [], lines: [] });
  });

  it('reads line[] and 2D arrays only over several lines', () => {
    const t = setRow(toTable(ARRAY), 1, { type: 'line[]' });
    expect(modeOptions(t, 1)).toEqual(['repeat', 'until']);
    expect(t.rows[1]).toMatchObject({ mode: 'repeat', count: 'n' });
    const plain = {
      v: 1,
      params: [{ name: 's', type: 'line[]' }],
      lines: [['s']],
      cases: null,
      ret: { type: 'int' },
    };
    expect(checkFormat(plain)).toMatchObject({ ok: false });
  });
});

describe('reading up to an end line or the end of input', () => {
  const ok = (format: unknown, input: string, output: string) =>
    validateFormat(format, [{ input, output }]);
  const pairs = {
    v: 1,
    params: [
      { name: 'n', type: 'int' },
      { name: 'pairs', type: 'int[][]', cols: 2 },
    ],
    lines: [['n'], { until: '-1 -1', of: 'pairs' }],
    cases: null,
    ret: { type: 'int' },
  };

  it('reads rows until the end line, which is not part of the value', () => {
    expect(ok(pairs, '5\n1 2\n2 3\n-1 -1\n', '2').ok).toBe(true);
    // Without the end line the input does not fit.
    expect(ok(pairs, '5\n1 2\n2 3\n', '2')).toMatchObject({ ok: false });
  });

  it('reads to the end of input only in the last line of a single-case format', () => {
    const nums = {
      v: 1,
      params: [{ name: 'nums', type: 'int[]' }],
      lines: [{ until: 'EOF', of: 'nums' }],
      cases: null,
      ret: { type: 'int[]', sep: '\n' },
    };
    expect(ok(nums, '50\n30\n24\n', '24\n30\n50').ok).toBe(true);
    expect(checkFormat({ ...nums, cases: { until: 'EOF' } }).ok).toBe(false);
    const notLast = {
      ...nums,
      params: [...nums.params, { name: 'k', type: 'int' }],
      lines: [{ until: 'EOF', of: 'nums' }, ['k']],
    };
    expect(checkFormat(notLast).ok).toBe(false);
  });

  it('compares the whole line for line[], so " ." is data and "." ends', () => {
    const texts = {
      v: 1,
      params: [{ name: 'texts', type: 'line[]' }],
      lines: [{ until: '.', of: 'texts' }],
      cases: null,
      ret: { type: 'int' },
    };
    expect(ok(texts, 'So when I die.\n .\n.\n', '2').ok).toBe(true);
  });

  it('lets an empty array leave out its line', () => {
    const remote = {
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'm', type: 'int' },
        { name: 'broken', type: 'int[]', len: 'm' },
      ],
      lines: [['n'], ['m'], ['broken']],
      cases: null,
      ret: { type: 'int' },
    };
    expect(ok(remote, '100\n0\n', '0').ok).toBe(true);
    expect(ok(remote, '5457\n3\n6 7 8\n', '6').ok).toBe(true);
  });

  it('shows end lines and the end of input in the table', () => {
    const t = toTable(f(pairs));
    expect(t.rows[1]).toMatchObject({ mode: 'until', count: '-1 -1', cols: '2' });
    expect(modeOptions(t, 1)).toEqual(['repeat', 'until', 'eof']);
    const eof = setRow(t, 1, { mode: 'eof' });
    expect(fromTable(eof)).toMatchObject({ lines: [['n'], { until: 'EOF', of: 'pairs' }] });
    // Several cases rule out reading to the end of input.
    expect(setCases(eof, { count: 'T' }).rows[1]?.mode).toBe('repeat');
    expect(tableErrors(setRow(t, 1, { count: ' ' }))).toEqual([
      "'pairs'을(를) 끝내는 줄을 적어 주세요 (예: 0).",
    ]);
  });
});

describe('parameter name problems', () => {
  it('reports a name used twice once, on both rows', () => {
    const t = renameRow(toTable(ARRAY), 1, 'n');
    const message = "'n' 이름을 다른 매개변수도 써요. 이름을 다르게 해 주세요.";
    expect(nameError(t, 0)).toBe(message);
    expect(nameError(t, 1)).toBe(message);
    expect(tableErrors(t)).toEqual([message]);
  });

  it('reports names that cannot be used', () => {
    const t = renameRow(toTable(ARRAY), 1, 'end');
    expect(nameError(t, 1)).toContain("'end'은(는) 쓸 수 없는 이름이에요");
    expect(nameError(t, 0)).toBeUndefined();
    expect(nameError(renameRow(t, 1, 'Arr'), 1)).toContain('영어 소문자로 시작');
  });
});

describe("samples as '입출력 예' rows", () => {
  it('writes one row per case with literals', () => {
    expect(sampleRows(ARRAY, { input: '2\n3\n3 1 2\n1\n5\n', output: '1 2 3\n5\n' })).toEqual([
      { params: { n: '3', arr: '[3, 1, 2]' }, expected: '[1, 2, 3]' },
      { params: { n: '1', arr: '[5]' }, expected: '[5]' },
    ]);
  });

  it('gives up on samples the format does not read', () => {
    expect(sampleRows(ARRAY, { input: 'x\n', output: '1\n' })).toBeUndefined();
    const art = f({ v: 1, params: [], lines: [], cases: null, ret: { type: 'line[]' } });
    expect(sampleRows(art, { input: '', output: ' *\n***\n' })).toEqual([
      { params: {}, expected: '[" *", "***"]' },
    ]);
  });
});

describe('refreshing an outdated starting code', () => {
  const ruby = 'def solution(n, arr)\n  answer = []\n  return answer\nend\n';
  it('replaces a starter whose header comment changed', () => {
    const old = `# 입력을 읽고 결과를 출력하는 코드는 자동으로 붙습니다.\n\n${ruby}`;
    expect(refreshStarter(old, ruby)).toBe(ruby);
    const cpp = '// 자동 포함: bits/stdc++.h, using namespace std\n\nint solution() {\n}\n';
    expect(
      refreshStarter(
        '// bits/stdc++.h와 using namespace std;는 자동으로 붙습니다.\n\nint solution() {\n}\n',
        cpp,
      ),
    ).toBe(cpp);
  });

  it('keeps code the user changed, including an added #include', () => {
    expect(refreshStarter(`${ruby}# note\n`, ruby)).toBe(`${ruby}# note\n`);
    const c = 'int solution(int n) {\n    return 0;\n}\n';
    expect(refreshStarter(`#include <math.h>\n${c}`, c)).toBe(`#include <math.h>\n${c}`);
  });
});
