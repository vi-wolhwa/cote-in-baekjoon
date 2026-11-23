/// <reference lib="webworker" />
import { runJs } from './execute';

interface WorkerRequest {
  code: string;
  stdin: string;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { code, stdin } = event.data;
  const result = await runJs(code, stdin);
  self.postMessage(result);
};
