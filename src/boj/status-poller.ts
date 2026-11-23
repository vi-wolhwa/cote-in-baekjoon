/**
 * Follows the user's just-made submissions on the status page until each has a final
 * result (ADR-0002, #35, #39).
 *
 * Two sources feed it:
 * - `scan()`: rows as the page shows them, called on every DOM change. Baekjoon rewrites
 *   the relative submit time ("1분 전") on a timer, so DOM changes alone say nothing; only a
 *   change in a watched row's result counts as "the page is updating by itself".
 * - `/status/ajax` for one submission, used when the watched result has not changed for a
 *   while (Baekjoon's realtime server rejects connections over its quota: Pusher 4004).
 */
import { judgeStatusOf, rowSignature, type StatusRow } from './status';
import { applyAjaxResult, POLL_GRACE_MS, POLL_LIMIT_MS, pollDelay } from './status-ajax';

export interface PollerDeps {
  /** Latest qualifying rows the page currently shows. */
  readRows(): StatusRow[];
  /** `/status/ajax` for one submission. */
  fetchStatus(solutionId: number): Promise<unknown>;
  /** Called with each new state of a watched submission. */
  report(row: StatusRow): void;
  /** Shows a polled state in the page's table. */
  showInPage?(row: StatusRow): void;
  log?(message: string): void;
  now?(): number;
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(id: unknown): void;
}

export class StatusPoller {
  private readonly latest = new Map<number, StatusRow>();
  private readonly signatures = new Map<number, string>();
  private readonly startedAt: number;
  private lastChangeAt: number;
  private attempt = 0;
  private timer: unknown;
  private stopped = false;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;

  constructor(private readonly deps: PollerDeps) {
    this.now = deps.now ?? Date.now;
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer =
      deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
    this.startedAt = this.now();
    this.lastChangeAt = this.startedAt;
  }

  /** True once every watched submission seen so far has a final result. */
  get done(): boolean {
    return (
      this.latest.size > 0 &&
      [...this.latest.values()].every((r) => judgeStatusOf(r.resultCode) === 'done')
    );
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** Lets the next sighting of this problem be reported again (e.g. a report failed). */
  forget(problemId: number) {
    this.signatures.delete(problemId);
  }

  /** Reads the page. Returns true when everything is final. */
  scan(): boolean {
    for (const row of this.deps.readRows()) {
      const known = this.latest.get(row.problemId);
      // Polling may already know a newer, final state than the stale page.
      if (known?.solutionId === row.solutionId && judgeStatusOf(known.resultCode) === 'done') {
        continue;
      }
      if (this.accept(row)) this.lastChangeAt = this.now();
    }
    return this.done;
  }

  start() {
    if (this.scan()) return this.stop();
    this.schedule(POLL_GRACE_MS);
  }

  stop() {
    this.stopped = true;
    this.clearTimer(this.timer);
  }

  /** One polling round; exposed for tests. */
  async tick(): Promise<void> {
    if (this.stopped) return;
    const now = this.now();
    if (now - this.startedAt > POLL_LIMIT_MS) {
      this.deps.log?.('채점 결과 확인 시간(10분)이 지나 확인을 멈춥니다.');
      return this.stop();
    }
    // The page itself changed the result recently: give it a chance first.
    if (now - this.lastChangeAt < POLL_GRACE_MS) {
      return this.schedule(POLL_GRACE_MS - (now - this.lastChangeAt));
    }
    const pending = [...this.latest.values()].filter((r) => judgeStatusOf(r.resultCode) !== 'done');
    for (const row of pending) {
      try {
        const next = applyAjaxResult(row, await this.deps.fetchStatus(row.solutionId));
        if (!next) {
          this.deps.log?.(`제출 ${row.solutionId}: 알 수 없는 응답이라 건너뜁니다.`);
          continue;
        }
        if (this.accept(next)) {
          this.deps.log?.(`제출 ${row.solutionId}: ${next.resultText}`);
          this.deps.showInPage?.(next);
        }
      } catch (error) {
        this.deps.log?.(`제출 ${row.solutionId}: 확인 실패 (${String(error)}), 다시 시도합니다.`);
      }
    }
    if (this.done) return this.stop();
    this.schedule(pollDelay(this.attempt++));
  }

  /** Records a row; returns true when it differs from what was reported before. */
  private accept(row: StatusRow): boolean {
    const signature = rowSignature(row);
    if (this.signatures.get(row.problemId) === signature) return false;
    this.signatures.set(row.problemId, signature);
    this.latest.set(row.problemId, row);
    this.deps.report(row);
    return true;
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    this.clearTimer(this.timer);
    this.timer = this.setTimer(() => void this.tick(), ms);
  }
}
