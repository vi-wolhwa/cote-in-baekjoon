import { describe, expect, it } from 'vitest';
import { buildCaseReport, runTimeLimit, summarize } from '@/ide/run-report';
import type { RunResponse } from '@/shared/messages';

const sample = { input: '1 2\n', output: '3\n' };
const ok = (stdout: string, stderr = ''): RunResponse => ({
  type: 'cib:run-result',
  id: 1,
  status: 'ok',
  elapsedMs: 5,
  result: { stdout, stderr, exitCode: 0, outputLimitExceeded: false },
});

describe('buildCaseReport', () => {
  it('passes when output matches', () => {
    const r = buildCaseReport(1, sample, ok('3\n'), 2000);
    expect(r).toMatchObject({ status: 'pass', message: '테스트를 통과하였습니다.' });
  });

  it('describes a one-line mismatch inline', () => {
    const r = buildCaseReport(1, sample, ok('4\n'), 2000);
    expect(r.status).toBe('fail');
    expect(r.message).toBe('실행한 결괏값 4이(가) 기댓값 3와(과) 다릅니다.');
    expect(r.output).toBeUndefined();
  });

  it('shows the full output for a multi-line mismatch', () => {
    const r = buildCaseReport(1, { input: '', output: '1\n2\n' }, ok('1\n3\n'), 2000);
    expect(r.message).toBe('실행한 결괏값이 기댓값과 다릅니다.');
    expect(r.output).toBe('1\n3\n');
  });

  it('reports runtime errors with details', () => {
    const r = buildCaseReport(
      1,
      sample,
      {
        type: 'cib:run-result',
        id: 1,
        status: 'error',
        elapsedMs: 1,
        result: {
          stdout: '',
          stderr: '',
          exitCode: 1,
          error: 'TypeError: x',
          outputLimitExceeded: false,
        },
      },
      2000,
    );
    expect(r).toMatchObject({ status: 'error', message: '런타임 에러', error: 'TypeError: x' });
  });

  it('reports timeouts in seconds', () => {
    const r = buildCaseReport(
      1,
      sample,
      { type: 'cib:run-result', id: 1, status: 'timeout', elapsedMs: 6000 },
      6000,
    );
    expect(r.message).toContain('6초를 초과');
  });

  it('explains the browser margin when the problem limit is known', () => {
    const r = buildCaseReport(
      1,
      sample,
      { type: 'cib:run-result', id: 1, status: 'timeout', elapsedMs: 6000 },
      6000,
      2000,
    );
    expect(r.message).toContain('문제의 시간 제한은 2초');
    expect(r.message).toContain('6초까지 기다렸습니다');
  });

  it('warns when a passing run is slower than the problem limit', () => {
    const slow = { ...ok('3\n'), elapsedMs: 2500 };
    const r = buildCaseReport(1, sample, slow, 6000, 2000);
    expect(r.status).toBe('pass');
    expect(r.warning).toContain('2.5초가 문제의 시간 제한 2초를 넘었습니다');
    expect(buildCaseReport(1, sample, ok('3\n'), 6000, 2000).warning).toBeUndefined();
  });

  it('reports cancelled runs', () => {
    const r = buildCaseReport(
      1,
      sample,
      { type: 'cib:run-result', id: 1, status: 'cancelled', elapsedMs: 1 },
      1000,
    );
    expect(r.message).toBe('실행 중단');
  });
});

describe('summarize and limits', () => {
  it('counts passed cases', () => {
    const a = buildCaseReport(1, sample, ok('3'), 2000);
    const b = buildCaseReport(2, sample, ok('5'), 2000);
    expect(summarize([a, b])).toMatchObject({ passed: 1, total: 2, allPassed: false });
    expect(summarize([a]).allPassed).toBe(true);
  });

  it('caps the browser time limit', () => {
    expect(runTimeLimit(1000)).toBe(3000);
    expect(runTimeLimit(5000)).toBe(10_000);
    expect(runTimeLimit(undefined)).toBe(6000);
  });
});
