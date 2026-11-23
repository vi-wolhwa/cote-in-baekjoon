import { describe, expect, it } from 'vitest';
import { applyAjaxResult, pollDelay } from '@/boj/status-ajax';
import type { StatusRow } from '@/boj/status';

const row: StatusRow = {
  solutionId: 99,
  username: 'tester',
  problemId: 1000,
  resultCode: 'wait',
  resultText: '기다리는 중',
  submittedAt: 1,
};

describe('applyAjaxResult', () => {
  it('maps a final result with memory and time', () => {
    expect(applyAjaxResult(row, { result: 4, memory: 11000, time: 12 })).toEqual({
      ...row,
      resultCode: 'ac',
      resultText: '맞았습니다!!',
      memoryKb: 11000,
      timeMs: 12,
    });
  });

  it('shows judging progress', () => {
    expect(applyAjaxResult(row, { result: 3, progress: 35 })).toMatchObject({
      resultCode: 'judging',
      resultText: '채점 중 (35%)',
    });
  });

  it('adds wrong-answer feedback and runtime error reasons', () => {
    expect(applyAjaxResult(row, { result: 6, feedback: '1%' })?.resultText).toBe('틀렸습니다 [1%]');
    expect(applyAjaxResult(row, { result: 10, rte_reason: 'TypeError' })?.resultText).toBe(
      '런타임 에러 (TypeError)',
    );
  });

  it('fills in the remaining seconds before judging starts', () => {
    expect(applyAjaxResult(row, { result: 14, remain: 3 })).toMatchObject({
      resultCode: 'compile',
      resultText: '3초 후 채점 시작',
    });
  });

  it('reads the shape the live endpoint returns', () => {
    // Observed on 2026-11-24 for a public submission.
    const live = {
      solution_id: '105252998',
      result: '11',
      judge_platform: 'gce',
      result_color: 'ce',
      result_name: '컴파일 에러',
    };
    expect(applyAjaxResult(row, live)).toMatchObject({
      resultCode: 'ce',
      resultText: '컴파일 에러',
    });
  });

  it('rejects errors and unknown shapes', () => {
    expect(applyAjaxResult(row, { error: true })).toBeUndefined();
    expect(applyAjaxResult(row, { result: 99 })).toBeUndefined();
    expect(applyAjaxResult(row, 'nope')).toBeUndefined();
  });
});

describe('pollDelay', () => {
  it('checks quickly at first, then backs off to 5 seconds', () => {
    expect(pollDelay(0)).toBe(700);
    expect(pollDelay(4)).toBe(1000);
    expect(pollDelay(50)).toBe(5000);
  });
});
