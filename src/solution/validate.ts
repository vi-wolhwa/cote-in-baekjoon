/**
 * Sample validation (ADR-0006): a format is used only when, for every sample,
 * 1. the input reads with the format, using every token (count and type),
 * 2. the expected output reads as return values and prints back the same, and
 * 3. the values read write back as the same input (round trip).
 */
import type { Sample } from '@/boj/problem';
import { outputsMatch } from '@/runner/compare';
import { checkFormat, type Format } from './dsl';
import { formatOutput, parseOutput } from './output';
import { sameInput, sameRawLines, sameTokenStream } from './input-lines';
import { readInput } from './reader';
import { writeInput } from './writer';

export type Validation = { ok: true; format: Format } | { ok: false; reasons: string[] };

export function validateFormat(value: unknown, samples: readonly Sample[]): Validation {
  const checked = checkFormat(value);
  if (!checked.ok) return { ok: false, reasons: checked.errors };
  const format = checked.format;
  const reasons: string[] = [];
  for (const [i, sample] of samples.entries()) {
    const tag = `예제 ${i + 1}`;
    const read = readInput(format, sample.input);
    if (!read.ok) {
      reasons.push(`${tag} 입력: ${read.error}`);
      continue;
    }
    const out = parseOutput(format.ret, sample.output, read.cases.length);
    if (!out.ok) {
      reasons.push(`${tag} 출력: ${out.error}`);
    } else if (
      out.values.length > 0 &&
      !outputsMatch(formatOutput(format.ret, out.values), sample.output, format.ret.tol)
    ) {
      reasons.push(`${tag} 출력: 반환값을 이 형식으로 출력하면 예제 출력과 달라져요`);
    }
    const written = writeInput(format, read.cases, read.ends);
    if (!written.ok || !sameLayout(format, written.text, sample.input)) {
      reasons.push(`${tag} 입력: 읽은 값을 다시 입력으로 쓰면 예제와 달라져요`);
    }
  }
  return reasons.length ? { ok: false, reasons } : { ok: true, format };
}

/**
 * Whether written input looks like the sample: the same tokens on the same lines; for flow
 * arrays (written on one line) the same tokens in order; for raw lines the same lines with
 * blank lines counted.
 */
function sameLayout(format: Format, written: string, sample: string): boolean {
  if (format.params.some((p) => p.flow)) return sameTokenStream(written, sample);
  if (format.params.some((p) => p.raw)) return sameRawLines(written, sample);
  return sameInput(written, sample);
}
