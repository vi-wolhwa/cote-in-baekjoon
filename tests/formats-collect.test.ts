// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { partFromProblemHtml } from '../scripts/formats/boj.ts';
import {
  accessesOn,
  isStopResult,
  localDay,
  remainingToday,
  waitBeforeNext,
  type AccessEntry,
} from '../scripts/formats/lib/boj-policy.ts';
import { refFromContentsUrl } from '../scripts/formats/github.ts';
import { hubPaths } from '../scripts/formats/hub.ts';
import { indexTree, problemIdFromPath, rawUrl } from '../scripts/formats/lib/paths.ts';
import {
  emptyRecord,
  hasDescription,
  isComplete,
  mergePartial,
} from '../scripts/formats/lib/record.ts';
import { coverage } from '../scripts/formats/lib/stats.ts';
import { parseSearchPage } from '../scripts/formats/solvedac.ts';

describe('problemIdFromPath', () => {
  it.each([
    ['백준/Silver/9001. 테스트/README.md', 9001],
    ['boj/9002/README.md', 9002],
    ['BOJ_9003_테스트/readme.md', 9003],
    ['p9004/README.md', 9004],
    ['2024/README.md', 2024],
  ])('%s → %s', (path, id) => {
    expect(problemIdFromPath(path)).toBe(id);
  });

  it.each([
    'README.md',
    '백준/Silver/9001. 테스트/Main.java',
    'week123/README.md',
    'a/123/README.md',
  ])('ignores %s', (path) => {
    expect(problemIdFromPath(path)).toBeNull();
  });
});

describe('indexTree', () => {
  it('groups README blobs by id and filters wanted ids', () => {
    const entries = [
      { path: 'x/9001. a/README.md', type: 'blob' },
      { path: 'y/9001. a/README.md', type: 'blob' },
      { path: 'x/9002. b/README.md', type: 'blob' },
      { path: 'x/9003. c', type: 'tree' },
    ];
    expect([...indexTree(entries)]).toEqual([
      [9001, ['x/9001. a/README.md', 'y/9001. a/README.md']],
      [9002, ['x/9002. b/README.md']],
    ]);
    expect([...indexTree(entries, new Set([9002])).keys()]).toEqual([9002]);
  });

  it('encodes each path segment in raw URLs', () => {
    expect(rawUrl('o/r', 'abc', '백준/9001. a+b/README.md')).toBe(
      'https://raw.githubusercontent.com/o/r/abc/%EB%B0%B1%EC%A4%80/9001.%20a%2Bb/README.md',
    );
  });
});

describe('mergePartial', () => {
  const a = { kind: 'github' as const, repo: 'o/a', url: 'https://github.com/o/a/blob/1/x' };
  const b = { kind: 'github' as const, repo: 'o/b', url: 'https://github.com/o/b/blob/1/y' };

  it('takes input/output from one source and samples from another', () => {
    const r = emptyRecord(9001, '테스트', 't0');
    expect(mergePartial(r, { input: 'N', output: 'M', samples: [] }, a, 't1')).toBe(true);
    expect(isComplete(r)).toBe(false);
    expect(
      mergePartial(r, { input: 'X', output: 'Y', samples: [{ input: '1', output: '2' }] }, b, 't2'),
    ).toBe(true);
    expect(r).toMatchObject({
      input: 'N',
      output: 'M',
      source: a,
      sampleSource: b,
      fetchedAt: 't2',
    });
    expect(isComplete(r)).toBe(true);
  });

  it('does not take input without output', () => {
    const r = emptyRecord(9001, '테스트', 't0');
    expect(mergePartial(r, { input: 'N', output: null, samples: [] }, a, 't1')).toBe(false);
    expect(r.source).toBeNull();
  });

  it('omits sampleSource when both parts come from the same file', () => {
    const r = emptyRecord(9001, '테스트', 't0');
    mergePartial(r, { input: 'N', output: 'M', samples: [{ input: '1', output: '1' }] }, a, 't1');
    expect(r.sampleSource).toBeUndefined();
  });
});

describe('coverage', () => {
  it('counts sources and what still needs Baekjoon', () => {
    const src = { kind: 'github' as const, repo: 'o/a', url: 'u' };
    const full = {
      ...emptyRecord(1, 'a', 't'),
      source: src,
      input: 'i',
      output: 'o',
      samples: [{ input: '1', output: '1' }],
    };
    const ioOnly = { ...emptyRecord(2, 'b', 't'), source: src, input: 'i', output: 'o' };
    const c = coverage(
      [1, 2, 3],
      new Map([
        [1, full],
        [2, ioOnly],
      ]),
    );
    expect(c).toMatchObject({
      total: 3,
      withIo: 2,
      withSamples: 1,
      complete: 1,
      missing: 1,
      needBoj: 2,
      needBojSamplesOnly: 1,
      ioByRepo: { 'o/a': 2 },
    });
  });
});

describe('boj policy', () => {
  const at = (iso: string, id = 1): AccessEntry => ({ time: iso, id, result: 'ok' });

  it('waits a full minute after the last access', () => {
    const log = [at('2026-01-01T00:00:00.000Z')];
    expect(waitBeforeNext([], 0)).toBe(0);
    expect(waitBeforeNext(log, Date.parse('2026-01-01T00:00:20.000Z'))).toBe(40_000);
    expect(waitBeforeNext(log, Date.parse('2026-01-01T00:02:00.000Z'))).toBe(0);
  });

  it('applies the daily cap and the per-run limit', () => {
    const now = new Date(2026, 0, 2, 12).toISOString();
    const today = Array.from({ length: 95 }, () => at(now));
    expect(accessesOn(today, localDay(now))).toBe(95);
    expect(remainingToday(today, now, 20)).toBe(5);
    expect(remainingToday([], now, 20)).toBe(20);
    expect(remainingToday([...today, ...today], now, 20)).toBe(0);
  });

  it('stops on challenge and block responses', () => {
    expect(isStopResult('challenge')).toBe(true);
    expect(isStopResult('http-429')).toBe(true);
    expect(isStopResult('ok')).toBe(false);
  });
});

describe('partFromProblemHtml', () => {
  /* Synthetic page shaped like a Baekjoon problem page; the text is made up. */
  const html = `<html><body>
    <span id="problem_title">테스트 문제</span>
    <span class="problem-label problem-label-spj">스페셜 저지</span>
    <div id="problem_description"><p>설명</p></div>
    <div id="problem_input"><p>첫째 줄에 N (1 &le; N &le; 10)</p></div>
    <div id="problem_output"><p>답을 출력한다.</p></div>
    <pre class="sampledata" id="sample-input-1">3
1 2 3
</pre>
    <pre class="sampledata" id="sample-output-1">6
</pre>
  </body></html>`;

  it('reads sections, samples and labels', () => {
    const part = partFromProblemHtml(html, 'https://www.acmicpc.net/problem/9001');
    expect(part).toEqual({
      input: '첫째 줄에 N (1 ≤ N ≤ 10)',
      output: '답을 출력한다.',
      constraints: null,
      samples: [{ input: '3\n1 2 3', output: '6' }],
      labels: ['spj'],
    });
  });

  it('returns null for a page without a problem', () => {
    expect(
      partFromProblemHtml(
        '<html><title>Just a moment</title></html>',
        'https://www.acmicpc.net/problem/9001',
      ),
    ).toBeNull();
  });
});

describe('refFromContentsUrl', () => {
  it('reads the commit SHA of a code search hit', () => {
    const sha = 'a'.repeat(40);
    expect(
      refFromContentsUrl(`https://api.github.com/repositories/1/contents/x.md?ref=${sha}`),
    ).toBe(sha);
    expect(
      refFromContentsUrl('https://api.github.com/repositories/1/contents/x.md?ref=main'),
    ).toBeNull();
  });
});

describe('parseSearchPage', () => {
  it('maps solved.ac items', () => {
    expect(
      parseSearchPage({
        items: [
          {
            problemId: 9001,
            titleKo: '테스트',
            level: 3,
            acceptedUserCount: 7,
            tags: [{ key: 'math' }],
          },
        ],
      }),
    ).toEqual([{ id: 9001, title: '테스트', level: 3, acceptedUserCount: 7, tags: ['math'] }]);
  });

  it('rejects other bodies', () => {
    expect(() => parseSearchPage('<html>')).toThrow();
  });
});

describe('hasDescription', () => {
  const rec = (input: string | null, output: string | null, sampleInput = '1') => ({
    ...emptyRecord(1, 't', 'now'),
    input,
    output,
    samples: [{ input: sampleInput, output: '2' }],
  });
  it('needs an output and an input, which may be empty only when the samples read nothing', () => {
    expect(hasDescription(rec('N이 주어진다.', 'N을 출력한다.'))).toBe(true);
    expect(hasDescription(rec('N이 주어진다.', ' '))).toBe(false);
    expect(hasDescription(rec(null, '출력'))).toBe(false);
    expect(hasDescription(rec('', '출력'))).toBe(false);
    expect(hasDescription(rec('', '출력', ''))).toBe(true);
  });
});

describe('hubPaths', () => {
  it('turns BaekjoonHub tier folders into README paths by problem id', () => {
    const tiers = [
      { name: 'Bronze', object: { entries: [{ name: '1000. A＋B' }, { name: 'notes' }] } },
      { name: 'Gold', object: { entries: [{ name: '12865. 평범한 배낭' }] } },
      { name: 'README.md', object: null },
    ];
    expect(hubPaths(tiers)).toEqual({
      '1000': ['백준/Bronze/1000. A＋B/README.md'],
      '12865': ['백준/Gold/12865. 평범한 배낭/README.md'],
    });
  });
});
