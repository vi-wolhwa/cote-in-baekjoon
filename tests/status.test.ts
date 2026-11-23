// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  findLoggedInUser,
  judgeStatusOf,
  latestRowsForWatches,
  parseStatusRows,
  pickLatestRow,
  rowSignature,
} from '@/boj/status';

const html = readFileSync('tests/fixtures/status-sample.html', 'utf8');

function load(): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('parseStatusRows', () => {
  it('reads every solution row', () => {
    const rows = parseStatusRows(load());
    expect(rows.map((r) => r.solutionId)).toEqual([5005, 5004, 5003, 4001]);
    expect(rows[0]).toEqual({
      solutionId: 5005,
      username: 'someone',
      problemId: 1000,
      resultCode: 'ac',
      resultText: '맞았습니다!!',
      memoryKb: 9000,
      timeMs: 40,
      submittedAt: 1_800_000_300_000,
    });
  });

  it('leaves memory and time out while judging', () => {
    const judging = parseStatusRows(load())[1];
    expect(judging).toMatchObject({ username: 'tester', resultCode: 'judging' });
    expect(judging?.resultText).toBe('채점 중 (35%)');
    expect(judging?.memoryKb).toBeUndefined();
    expect(judging?.timeMs).toBeUndefined();
  });

  it('falls back to the result-{code} class and strips -eng', () => {
    const doc = load();
    const span = doc.querySelector('#solution-5004 span.result-text');
    span?.removeAttribute('data-color');
    span?.setAttribute('class', 'result-text result-mle');
    expect(parseStatusRows(doc)[1]?.resultCode).toBe('mle');
    span?.setAttribute('data-color', 'wa-eng');
    expect(parseStatusRows(doc)[1]?.resultCode).toBe('wa');
  });

  it('skips rows with an unknown result code', () => {
    const doc = load();
    doc.querySelector('#solution-5005 span.result-text')?.setAttribute('data-color', 'new-thing');
    doc.querySelector('#solution-5005 span.result-text')?.setAttribute('class', 'result-text');
    expect(parseStatusRows(doc).map((r) => r.solutionId)).toEqual([5004, 5003, 4001]);
  });
});

describe('judgeStatusOf', () => {
  it('maps result codes to pending, judging and done', () => {
    expect(judgeStatusOf('wait')).toBe('pending');
    expect(judgeStatusOf('rejudge-wait')).toBe('pending');
    expect(judgeStatusOf('compile')).toBe('judging');
    expect(judgeStatusOf('judging')).toBe('judging');
    for (const code of [
      'ac',
      'pe',
      'wa',
      'tle',
      'mle',
      'ole',
      'rte',
      'ce',
      'del',
      'pac',
    ] as const) {
      expect(judgeStatusOf(code)).toBe('done');
    }
  });
});

describe('findLoggedInUser', () => {
  it('reads the header username', () => {
    expect(findLoggedInUser(load(), 'https://www.acmicpc.net/status')).toBe('tester');
  });

  it('falls back to user_id of a from_mine status URL', () => {
    const doc = load();
    doc.querySelector('a.username')?.remove();
    expect(
      findLoggedInUser(
        doc,
        'https://www.acmicpc.net/status?from_mine=1&problem_id=1000&user_id=me',
      ),
    ).toBe('me');
    expect(findLoggedInUser(doc, 'https://www.acmicpc.net/status?user_id=me')).toBeUndefined();
  });
});

describe('pickLatestRow', () => {
  const rows = parseStatusRows(load());

  it("picks the user's newest row for the problem after the watch started", () => {
    const row = pickLatestRow(rows, { problemId: 1000, since: 1_800_000_000_000 }, 'TESTER');
    expect(row?.solutionId).toBe(5004);
  });

  it('ignores submissions made before the watch started', () => {
    expect(
      pickLatestRow(rows, { problemId: 1000, since: 1_800_001_000_000 }, 'tester'),
    ).toBeUndefined();
  });

  it('allows for a small clock difference', () => {
    const row = pickLatestRow(rows, { problemId: 1000, since: 1_800_000_260_000 }, 'tester');
    expect(row?.solutionId).toBe(5004);
  });

  it('ignores other users and other problems', () => {
    expect(
      pickLatestRow(rows, { problemId: 1000, since: 1_800_000_000_000 }, 'nobody'),
    ).toBeUndefined();
    const watches = [
      { problemId: 1000, since: 1_800_000_000_000 },
      { problemId: 2000, since: 1_800_000_000_000 },
      { problemId: 3000, since: 1_800_000_000_000 },
    ];
    expect(latestRowsForWatches(rows, watches, 'tester').map((r) => r.solutionId)).toEqual([
      5004, 5003,
    ]);
  });
});

describe('rowSignature', () => {
  it('changes when the result changes', () => {
    const [row] = parseStatusRows(load());
    if (!row) throw new Error('fixture has rows');
    expect(rowSignature(row)).toBe(rowSignature({ ...row }));
    expect(rowSignature(row)).not.toBe(rowSignature({ ...row, resultText: '틀렸습니다' }));
  });
});
