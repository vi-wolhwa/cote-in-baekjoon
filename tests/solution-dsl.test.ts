import { describe, expect, it } from 'vitest';
import { checkFormat, formatToJson, parseCount, type Format } from '@/solution/dsl';
import { formatOutput, parseOutput } from '@/solution/output';
import { readInput, sameInput, writeInput } from '@/solution/reader';
import { validateFormat } from '@/solution/validate';
import { coerce, formatLiteral, parseLiteral } from '@/solution/values';

const f = (x: unknown) => {
  const r = checkFormat(x);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.format;
};

const AB: Format = f({
  v: 1,
  params: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'int' },
  ],
  lines: [['a', 'b']],
  cases: null,
  ret: { type: 'int' },
});

const ARRAY: Format = f({
  v: 1,
  params: [
    { name: 'n', type: 'int' },
    { name: 'arr', type: 'int[]', len: 'n' },
  ],
  lines: [['n'], ['arr']],
  cases: null,
  ret: { type: 'int[]', sep: '\n' },
});

describe('checkFormat', () => {
  it('accepts the ADR example', () => {
    expect(ARRAY.params[1]).toEqual({ name: 'arr', type: 'int[]', len: 'n' });
  });

  it.each([
    [
      {
        v: 2,
        params: [{ name: 'a', type: 'int' }],
        lines: [['a']],
        cases: null,
        ret: { type: 'int' },
      },
      '"v"는 1',
    ],
    [{ v: 1, params: [], lines: [['a']], cases: null, ret: { type: 'int' } }, '하나 이상'],
    [
      {
        v: 1,
        params: [{ name: 'class', type: 'int' }],
        lines: [['class']],
        cases: null,
        ret: { type: 'int' },
      },
      '쓸 수 없는 이름',
    ],
    [
      {
        v: 1,
        params: [{ name: 'Ab', type: 'int' }],
        lines: [['Ab']],
        cases: null,
        ret: { type: 'int' },
      },
      '쓸 수 없는 이름',
    ],
    [
      {
        v: 1,
        params: [{ name: '__cib_x', type: 'int' }],
        lines: [['__cib_x']],
        cases: null,
        ret: { type: 'int' },
      },
      '쓸 수 없는 이름',
    ],
    [
      {
        v: 1,
        params: [{ name: 'a', type: 'float' }],
        lines: [['a']],
        cases: null,
        ret: { type: 'int' },
      },
      "타입 'float'",
    ],
    [
      {
        v: 1,
        params: [{ name: 'a', type: 'int' }],
        lines: [['a', 'a']],
        cases: null,
        ret: { type: 'int' },
      },
      '두 번',
    ],
    [
      {
        v: 1,
        params: [
          { name: 'a', type: 'int' },
          { name: 'b', type: 'int' },
        ],
        lines: [['a']],
        cases: null,
        ret: { type: 'int' },
      },
      "'b'을(를) 읽는 줄이 없어요",
    ],
    [
      {
        v: 1,
        params: [
          { name: 'arr', type: 'int[]', len: 'n' },
          { name: 'n', type: 'int' },
        ],
        lines: [['arr'], ['n']],
        cases: null,
        ret: { type: 'int' },
      },
      '먼저 읽어야',
    ],
    [
      {
        v: 1,
        params: [
          { name: 's', type: 'string' },
          { name: 'arr', type: 'int[]', len: 's' },
        ],
        lines: [['s'], ['arr']],
        cases: null,
        ret: { type: 'int' },
      },
      '정수여야',
    ],
    [
      {
        v: 1,
        params: [{ name: 'g', type: 'int[][]' }],
        lines: [['g']],
        cases: null,
        ret: { type: 'int' },
      },
      'repeat 줄로만',
    ],
    [
      {
        v: 1,
        params: [
          { name: 's', type: 'line' },
          { name: 'a', type: 'int' },
        ],
        lines: [['s', 'a']],
        cases: null,
        ret: { type: 'int' },
      },
      '혼자 있어야',
    ],
    [
      {
        v: 1,
        params: [
          { name: 'arr', type: 'int[]' },
          { name: 'a', type: 'int' },
        ],
        lines: [['arr', 'a']],
        cases: null,
        ret: { type: 'int' },
      },
      '마지막에만',
    ],
    [
      {
        v: 1,
        params: [{ name: 'a', type: 'int' }],
        lines: [{ repeat: 3, of: 'a' }],
        cases: null,
        ret: { type: 'int' },
      },
      '배열만',
    ],
    [
      {
        v: 1,
        params: [{ name: 'a', type: 'int' }],
        lines: [['a']],
        cases: { count: 'a' },
        ret: { type: 'int' },
      },
      '다른 이름',
    ],
    [
      {
        v: 1,
        params: [{ name: 'a', type: 'int' }],
        lines: [['a']],
        cases: { until: '' },
        ret: { type: 'int' },
      },
      '"until"',
    ],
    [
      {
        v: 1,
        params: [{ name: 'a', type: 'int' }],
        lines: [['a']],
        cases: null,
        ret: { type: 'bool' },
      },
      '문구(yes)',
    ],
    [
      {
        v: 1,
        params: [{ name: 'a', type: 'int' }],
        lines: [['a']],
        cases: null,
        ret: { type: 'double' },
      },
      'digits',
    ],
    [
      {
        v: 1,
        params: [{ name: 'a', type: 'int' }],
        lines: [['a']],
        cases: null,
        ret: { type: 'int', sep: ' ' },
      },
      '배열 반환값에만',
    ],
    [
      {
        v: 1,
        params: [{ name: 'a', type: 'int' }],
        lines: [['a']],
        cases: null,
        ret: { type: 'int[][]', sep: '\n' },
      },
      '열 사이',
    ],
    [
      {
        v: 1,
        params: [{ name: 'a', type: 'int', len: 'n' }],
        lines: [['a']],
        cases: null,
        ret: { type: 'int' },
      },
      'len을 쓸 수 없어요',
    ],
    ['{}', 'JSON 객체'],
  ])('rejects %j', (value, message) => {
    const r = checkFormat(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain(message);
  });

  it('parses counts', () => {
    expect(parseCount('n')).toEqual({ kind: 'ref', name: 'n', plus: 0 });
    expect(parseCount('n - 1')).toEqual({ kind: 'ref', name: 'n', plus: -1 });
    expect(parseCount('n*m')).toEqual({ kind: 'mul', a: 'n', b: 'm' });
    expect(parseCount(3)).toEqual({ kind: 'num', value: 3 });
    expect(parseCount('n/2')).toBeUndefined();
    expect(parseCount(-1)).toBeUndefined();
  });

  it('writes JSON in DSL key order, one item per row when pretty', () => {
    expect(formatToJson(AB)).toBe(
      '{"v":1,"params":[{"name":"a","type":"int"},{"name":"b","type":"int"}],"lines":[["a","b"]],"cases":null,"ret":{"type":"int"}}',
    );
    const pretty = formatToJson(ARRAY, true);
    expect(JSON.parse(pretty)).toEqual(JSON.parse(formatToJson(ARRAY)));
    expect(pretty).toContain('    {"name":"arr","type":"int[]","len":"n"}');
  });
});

describe('readInput / writeInput', () => {
  it('reads a count then an array, and writes it back', () => {
    const r = readInput(ARRAY, '3\n5 1 4\n');
    expect(r).toEqual({
      ok: true,
      cases: [
        new Map<string, unknown>([
          ['n', 3],
          ['arr', [5, 1, 4]],
        ]),
      ],
    });
    if (r.ok) expect(writeInput(ARRAY, r.cases)).toEqual({ ok: true, text: '3\n5 1 4\n' });
  });

  it('says what is wrong, with the line number', () => {
    expect(readInput(ARRAY, '3\n5 1\n')).toEqual({
      ok: false,
      error: "2번째 줄에 'arr' 값이 부족해요",
    });
    expect(readInput(ARRAY, '3\n5 1 4 2\n')).toEqual({
      ok: false,
      error: "2번째 줄에 남는 값 '2'이(가) 있어요",
    });
    expect(readInput(ARRAY, '3\n5 x 4\n')).toMatchObject({
      ok: false,
      error: expect.stringContaining("정수(int) 자리에 'x'"),
    });
    expect(readInput(AB, '1 2\n3\n')).toEqual({
      ok: false,
      error: '2번째 줄부터 읽지 않은 입력이 남아요',
    });
    expect(readInput(ARRAY, '3\n')).toMatchObject({
      ok: false,
      error: expect.stringContaining('입력이 끝났어요'),
    });
  });

  it('checks the int range and keeps long values exact', () => {
    expect(readInput(AB, '2147483648 1\n')).toMatchObject({
      ok: false,
      error: expect.stringContaining('long을 쓰세요'),
    });
    const big = f({
      ...JSON.parse(formatToJson(AB)),
      params: [
        { name: 'a', type: 'long' },
        { name: 'b', type: 'long' },
      ],
    });
    const r = readInput(big, '9223372036854775807 -9223372036854775808\n');
    expect(r.ok && r.cases[0]?.get('a')).toBe(9223372036854775807n);
    expect(readInput(big, '9223372036854775808 1\n')).toMatchObject({ ok: false });
  });

  it('reads grids, edges, lines and strings', () => {
    const grid = f({
      v: 1,
      params: [
        { name: 'n', type: 'int' },
        { name: 'm', type: 'int' },
        { name: 'board', type: 'char[][]', cols: 'm' },
        { name: 'edges', type: 'int[][]', cols: 2 },
        { name: 'title', type: 'line' },
      ],
      lines: [['n', 'm'], { repeat: 'n', of: 'board' }, { repeat: 'n-1', of: 'edges' }, ['title']],
      cases: null,
      ret: { type: 'string' },
    });
    const input = '3 4\n#..#\n....\n##.#\n1 2\n2 3\nhello  big world\n';
    const r = readInput(grid, input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cases[0]?.get('board')).toEqual(['#..#', '....', '##.#']);
    expect(r.cases[0]?.get('edges')).toEqual([
      [1, 2],
      [2, 3],
    ]);
    expect(r.cases[0]?.get('title')).toBe('hello  big world');
    const w = writeInput(grid, r.cases);
    expect(w.ok && sameInput(w.text, input)).toBe(true);
    expect(readInput(grid, '3 4\n#..#\n...\n##.#\n1 2\n2 3\nx\n')).toMatchObject({
      error: expect.stringContaining('행 길이가 3'),
    });
  });

  it('reads test cases by count, until EOF and until an end line', () => {
    const base = JSON.parse(formatToJson(AB));
    const counted = f({ ...base, cases: { count: 'T' } });
    expect(readInput(counted, '2\n1 2\n3 4\n')).toMatchObject({
      ok: true,
      cases: [expect.any(Map), expect.any(Map)],
    });
    expect(readInput(counted, '3\n1 2\n3 4\n')).toMatchObject({ ok: false });
    // A case that reads no line must not repeat a big first number's worth of times (1019).
    const none = { v: 1, params: [], lines: [], ret: { type: 'int' } } as const;
    const emptyCount = { ...none, cases: { count: 'T' } } as unknown as Format;
    const emptyEof = { ...none, cases: { until: 'EOF' } } as unknown as Format;
    expect(readInput(emptyCount, '543212345\n')).toMatchObject({ ok: false });
    expect(readInput(emptyEof, '1\n')).toMatchObject({ ok: false });
    expect(
      writeInput(counted, [
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
      ]),
    ).toEqual({ ok: true, text: '1\n1 2\n' });

    const eof = f({ ...base, cases: { until: 'EOF' } });
    const r = readInput(eof, '1 2\n\n3 4\n');
    expect(r.ok && r.cases.length).toBe(2);

    const zero = f({ ...base, cases: { until: '0 0' } });
    const z = readInput(zero, '1 2\n3 4\n0 0\n');
    expect(z.ok && z.cases.length).toBe(2);
    expect(readInput(zero, '1 2\n')).toMatchObject({
      ok: false,
      error: "입력을 끝내는 줄 '0 0'이(가) 없어요",
    });
    if (z.ok) expect(writeInput(zero, z.cases)).toEqual({ ok: true, text: '1 2\n3 4\n0 0\n' });
  });

  it('refuses to write values that do not match their counts', () => {
    expect(
      writeInput(ARRAY, [
        new Map<string, never>([
          ['n', 2 as never],
          ['arr', [1, 2, 3] as never],
        ]),
      ]),
    ).toEqual({
      ok: false,
      error: "'arr'의 길이가 3이에요. n = 2과(와) 같아야 해요",
    });
  });

  it('compares inputs token by token, numbers by value', () => {
    expect(sameInput('1  2\r\n3.10\n', '1 2\n3.1')).toBe(true);
    expect(sameInput('1 2\n', '1\n2\n')).toBe(false);
  });
});

describe('output', () => {
  it('formats and parses each return type', () => {
    expect(formatOutput({ type: 'int[]', sep: '\n' }, [[1, 2, 3]])).toBe('1\n2\n3\n');
    expect(formatOutput({ type: 'int[]' }, [[1, 2], [3]])).toBe('1 2\n3\n');
    expect(formatOutput({ type: 'bool', yes: 'YES', no: 'NO' }, [true, false])).toBe('YES\nNO\n');
    expect(formatOutput({ type: 'double', digits: 2 }, [3.14159])).toBe('3.14\n');
    expect(formatOutput({ type: 'char[][]' }, [['#.', '.#']])).toBe('#.\n.#\n');
    expect(
      formatOutput({ type: 'int[][]' }, [
        [
          [1, 2],
          [3, 4],
        ],
      ]),
    ).toBe('1 2\n3 4\n');
    expect(formatOutput({ type: 'long' }, [12345678901234567n])).toBe('12345678901234567\n');

    expect(parseOutput({ type: 'int' }, '3\n7\n', 2)).toEqual({ ok: true, values: [3, 7] });
    expect(parseOutput({ type: 'int' }, '3\n', 2)).toMatchObject({
      ok: false,
      error: expect.stringContaining('2줄'),
    });
    expect(parseOutput({ type: 'bool', yes: 'YES', no: 'NO' }, 'Yes\n', 1)).toMatchObject({
      ok: false,
    });
    expect(parseOutput({ type: 'int[]', sep: '\n' }, '1\n2\n', 1)).toEqual({
      ok: true,
      values: [[1, 2]],
    });
    expect(parseOutput({ type: 'int[][]', sep: '' }, '01\n10\n', 1)).toEqual({
      ok: true,
      values: [
        [
          [0, 1],
          [1, 0],
        ],
      ],
    });
  });
});

describe('validateFormat', () => {
  it('passes a format that reads, prints and round-trips every sample', () => {
    const r = validateFormat(JSON.parse(formatToJson(AB)), [
      { input: '1 2\n', output: '3\n' },
      { input: '5 4\n', output: '9\n' },
    ]);
    expect(r.ok).toBe(true);
  });

  it('gives Korean reasons for each failing step', () => {
    const r = validateFormat(ARRAY, [
      { input: '3\n1 2\n', output: '1\n' },
      { input: '2\n1 2\n', output: 'x\n' },
      { input: '1\n1\n', output: '1.0\n' },
    ]);
    expect(r).toEqual({
      ok: false,
      reasons: [
        "예제 1 입력: 2번째 줄에 'arr' 값이 부족해요",
        "예제 2 출력: 정수(int) 자리에 'x'이(가) 있어요",
        "예제 3 출력: 정수(int) 자리에 '1.0'이(가) 있어요",
      ],
    });
  });

  it('fails when printing the parsed output changes it', () => {
    const r = validateFormat(
      { ...JSON.parse(formatToJson(AB)), ret: { type: 'double', digits: 1 } },
      [{ input: '1 2\n', output: '3.25\n' }],
    );
    expect(r).toEqual({
      ok: false,
      reasons: ['예제 1 출력: 반환값을 이 형식으로 출력하면 예제 출력과 달라져요'],
    });
  });

  it('keeps a string token with leading zeros as written', () => {
    const r = validateFormat(
      {
        ...JSON.parse(formatToJson(AB)),
        params: [
          { name: 'a', type: 'int' },
          { name: 'b', type: 'string' },
        ],
      },
      [{ input: '1 007\n', output: '8\n' }],
    );
    expect(r.ok).toBe(true);
  });
});

describe('literals', () => {
  it('parses JSON-like literals, keeping big integers exact', () => {
    expect(parseLiteral('[3, 1, 2]')).toEqual({ ok: true, value: [3, 1, 2] });
    expect(parseLiteral("'abc'")).toEqual({ ok: true, value: 'abc' });
    expect(parseLiteral('12345678901234567890')).toEqual({
      ok: true,
      value: 12345678901234567890n,
    });
    expect(parseLiteral('[1, 2')).toMatchObject({ ok: false });
    expect(parseLiteral('')).toEqual({ ok: false, error: '값이 비어 있어요' });
  });

  it('checks a literal against a type with a Korean error', () => {
    const lit = (s: string) => (parseLiteral(s) as unknown as { value: never }).value;
    expect(coerce('int[]', lit('[1, 2]'))).toEqual({ ok: true, value: [1, 2] });
    expect(coerce('int', lit('"a"'))).toEqual({ ok: false, error: '정수가 필요해요' });
    expect(coerce('int', lit('3000000000'))).toMatchObject({
      ok: false,
      error: expect.stringContaining('int 범위'),
    });
    expect(coerce('long', lit('3000000000'))).toEqual({ ok: true, value: 3000000000n });
    expect(coerce('char[][]', lit('[["#", "."], ".."]'))).toEqual({
      ok: true,
      value: ['#.', '..'],
    });
    expect(coerce('line', lit('"a\\nb"'))).toMatchObject({ ok: false });
    expect(formatLiteral([1n, 'a', [true]])).toBe('[1, "a", [true]]');
  });
});
