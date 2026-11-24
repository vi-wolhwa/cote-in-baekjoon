import { describe, expect, it } from 'vitest';
import { nextToCapture } from '@/exam/prefetch';

const problems = [{ id: 1 }, { id: 2, body: {} }, { id: 3 }, { id: 4 }];
const none = new Set<number>();

describe('reading the exam problems one after another', () => {
  it('takes them in problem order, skipping ones already read', () => {
    expect(nextToCapture(problems, { skip: none, over: false })).toBe(1);
    expect(nextToCapture(problems, { skip: new Set([1]), over: false })).toBe(3);
    expect(nextToCapture(problems, { skip: new Set([1, 3, 4]), over: false })).toBeUndefined();
  });

  it('reads the problem the user opened first', () => {
    expect(nextToCapture(problems, { priority: 4, skip: none, over: false })).toBe(4);
    // Read already, or failed: the order goes on.
    expect(nextToCapture(problems, { priority: 2, skip: none, over: false })).toBe(1);
    expect(nextToCapture(problems, { priority: 4, skip: new Set([4]), over: false })).toBe(1);
  });

  it('stops when the exam ended', () => {
    expect(nextToCapture(problems, { priority: 4, skip: none, over: true })).toBeUndefined();
  });
});
