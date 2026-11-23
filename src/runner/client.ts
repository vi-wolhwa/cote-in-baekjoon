import {
  isRunResponse,
  type CancelRequest,
  type RunRequest,
  type RunResponse,
} from '@/shared/messages';

/**
 * IDE-side handle to the sandbox page. Creates one hidden sandbox iframe and
 * matches responses to requests by id.
 */
export class SandboxRunner {
  private frame: HTMLIFrameElement;
  private ready: Promise<void>;
  private nextId = 1;
  private pending = new Map<number, (r: RunResponse) => void>();

  constructor(sandboxUrl: string) {
    this.frame = document.createElement('iframe');
    this.frame.src = sandboxUrl;
    this.frame.hidden = true;
    this.frame.title = '코드 실행 샌드박스';
    this.ready = new Promise((resolve) => this.frame.addEventListener('load', () => resolve()));
    document.body.append(this.frame);
    window.addEventListener('message', (event) => {
      if (event.source !== this.frame.contentWindow || !isRunResponse(event.data)) return;
      this.pending.get(event.data.id)?.(event.data);
      this.pending.delete(event.data.id);
    });
  }

  async run(code: string, stdin: string, timeLimitMs: number): Promise<RunResponse> {
    await this.ready;
    const id = this.nextId++;
    const request: RunRequest = {
      type: 'cib:run',
      id,
      language: 'javascript',
      code,
      stdin,
      timeLimitMs,
    };
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      // The sandbox has an opaque origin, so '*' is the only usable target origin.
      // The request carries only user code and sample input.
      this.frame.contentWindow?.postMessage(request, '*');
    });
  }

  /** Stops every running program; their run() calls resolve with status 'cancelled'. */
  cancel() {
    const request: CancelRequest = { type: 'cib:cancel' };
    this.frame.contentWindow?.postMessage(request, '*');
  }
}
