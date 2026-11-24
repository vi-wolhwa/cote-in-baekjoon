/**
 * Return value candidates for format inference (#115, #124): what each case prints, read
 * from the expected outputs and the output description. Also spots outputs a `solution`
 * cannot print on its own (case numbers, a count followed by the list it counts).
 */
import type { Sample } from '@/boj/problem';
import type { RetSpec } from './dsl';
import { kind, numeric } from './infer-layout';
import { BOOL_PAIRS, errorTolerance, INT_LIMIT, type TextHints } from './infer-text';

export interface RetCandidate {
  ret: RetSpec;
  score: number;
}

const outputRows = (out: string) => out.replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n');

/** Past 64 bits: only text holds it. */
const huge = (tok: string) => /^[+-]?\d{19,}$/.test(tok);

/** Return value candidates from the expected outputs, given each sample's case count. */
export function retCandidates(
  samples: readonly Sample[],
  caseCounts: number[],
  hints: TextHints,
): RetCandidate[] {
  const outs = samples.map((s) => outputRows(s.output));
  const lines = outs.flat();
  const toks = lines.map((l) => l.trim().split(/\s+/).filter(Boolean));
  const flat = toks.flat();
  const kinds = flat.map(kind);
  const allNumeric = kinds.every(numeric);
  const big =
    kinds.includes('long') || (!hints.intAnswer && (hints.outputBound > INT_LIMIT || hints.wide));
  const out: RetCandidate[] = [];
  const oneLinePerCase = outs.every((o, i) => o.length === caseCounts[i]);
  const single = toks.every((t) => t.length === 1);
  // Words, not cells: "acis", "SciComLove" (a grid row has symbols or digits: "#..#", "0110").
  const wordy = flat.every((x) => /^[A-Za-z]{2,}$/.test(x));
  if (oneLinePerCase) {
    if (single) {
      if (allNumeric && !flat.some(huge)) {
        out.push({ ret: { type: big ? 'long' : 'int' }, score: 3 });
      }
      if (kinds.every((k) => k === 'double' || numeric(k))) {
        const digits = flat.map((x) => (x.split('.')[1] ?? '').length);
        if (hints.tol !== undefined && kinds.includes('double')) {
          // Printed with a digit more than the error needs; compared within the error.
          const need = Math.round(-Math.log10(hints.tol)) + 1;
          const d = Math.min(15, Math.max(need, ...digits));
          out.push({ ret: { type: 'double', digits: d, tol: hints.tol }, score: 3 });
        } else if (new Set(digits).size === 1 && kinds.includes('double')) {
          out.push({ ret: { type: 'double', digits: digits[0] as number }, score: 2 });
        }
      }
    }
    const bool = boolRet(lines, hints);
    if (bool) out.push(bool);
    if (allNumeric && toks.some((t) => t.length > 1)) {
      out.push({
        ret: { type: kinds.every((k) => k === 'int') ? 'int[]' : 'long[]', sep: ' ' },
        score: 2,
      });
    }
    if (!single && kinds.some((k) => k === 'string') && toks.length === 1) {
      out.push({ ret: { type: 'string[]', sep: ' ' }, score: -1 });
    }
    // Text answers ("Scalene", "Before", a sentence), or numbers past 64 bits.
    const text = kinds.every((k) => k === 'string') && single;
    out.push({
      ret: { type: 'string' },
      score: text || flat.some(huge) ? 1 : kinds.some((k) => k === 'string') ? 0 : -2,
    });
  }
  if (caseCounts.every((c) => c === 1) && outs.some((o) => o.length > 1)) {
    if (single && allNumeric && !flat.some(huge)) {
      out.push({
        ret: { type: kinds.every((k) => k === 'int') ? 'int[]' : 'long[]', sep: '\n' },
        score: 2,
      });
    }
    const lens = new Set(lines.map((l) => l.trim().length));
    if (single && lens.size === 1) {
      out.push({ ret: { type: 'char[][]' }, score: allNumeric || wordy ? 0 : 2 });
    }
    // One answer per line, some or all of them text ("INF", "Pikachu").
    if (single && !allNumeric) {
      out.push({ ret: { type: 'string[]', sep: '\n' }, score: wordy || lens.size > 1 ? 2 : 1 });
    }
    if (!single && kinds.every((k) => k === 'int'))
      out.push({ ret: { type: 'int[][]' }, score: 2 });
    if (!single && flat.every((x) => x.length === 1) && kinds.every((k) => k === 'string')) {
      out.push({ ret: { type: 'char[][]', sep: ' ' }, score: 1 });
    }
  }
  return out;
}

/** A condition and its negation in the output description. */
const NEGATION = /않|없|아니|못|불가능|그렇지|외에는|이외|거짓|가짜/;
/** Negative answers, to tell which of two words means false. */
const NEGATIVE = /\bnot?\b|\bNO\b|impossible|불가능|아니|fail|wrong|sad/i;

/**
 * True/false answers: a known pair (YES/NO, 가능/불가능), or two phrases the output
 * description names ("Nice", "Sad"; gosu, hasu) of which every case prints one.
 */
function boolRet(lines: string[], hints: TextHints): RetCandidate | undefined {
  const answers = [...new Set(lines.map((l) => l.trim()))];
  if (answers.length === 0 || answers.length > 2) return undefined;
  for (const [yes, no] of BOOL_PAIRS) {
    if (!answers.every((w) => w === yes || w === no)) continue;
    const named = hints.quoted.includes(yes) && hints.quoted.includes(no);
    return { ret: { type: 'bool', yes, no }, score: named || answers.length === 2 ? 5 : 3 };
  }
  const phrases = hints.phrases;
  // Two outcomes of one condition ("…할 수 있으면 Nice, 없으면 Sad"), not two winners ("SK", "CY").
  if (!hints.output.some((s) => NEGATION.test(s))) return undefined;
  if (!answers.every((a) => phrases.includes(a))) return undefined;
  let pair: string[];
  if (answers.length === 1) {
    // The other answer is the phrase named next to it ("LUCKY"를, ... "READY"를).
    const at = phrases.indexOf(answers[0] as string);
    const other = phrases[at + 1] ?? phrases[at - 1];
    if (other === undefined || phrases.length !== 2) return undefined;
    pair = at % 2 === 0 ? [answers[0] as string, other] : [other, answers[0] as string];
  } else {
    pair = [...answers].sort((a, b) => phrases.indexOf(a) - phrases.indexOf(b));
  }
  let [yes, no] = pair as [string, string];
  if (NEGATIVE.test(yes) && !NEGATIVE.test(no)) [yes, no] = [no, yes];
  return { ret: { type: 'bool', yes, no }, score: 5 };
}

const LABELED = /^((?:Case|Scenario|Problem|Data|Test) #?)(\d+)(: ?)(\S.*)$/i;

/**
 * A case label every output line starts with, numbered 1, 2, … in each sample ("Case #1: 3",
 * one line per case): the label (`Case #{i}: `) and the samples with it taken off the outputs.
 */
export function labeledOutputs(
  samples: readonly Sample[],
): { label: string; samples: Sample[] } | undefined {
  const labels = new Set<string>();
  const plain = samples.map((s) => {
    const rest = outputRows(s.output).map((row, k) => {
      const m = LABELED.exec(row.trim());
      if (!m || Number(m[2]) !== k + 1) return undefined;
      labels.add(`${m[1]}{i}${m[3]}`);
      return m[4] as string;
    });
    return rest.every((r) => r !== undefined)
      ? { ...s, output: `${rest.join('\n')}\n` }
      : undefined;
  });
  const [label] = labels;
  if (labels.size !== 1 || label === undefined || plain.some((s) => s === undefined)) {
    return undefined;
  }
  return { label, samples: plain as Sample[] };
}

const FORMATTED =
  /형식에\s*맞|형식으로|형태로|형태에|예제\s*출력과\s*같|예제와\s*같은\s*형식|예제를\s*보고|예제\s*출력\s*참고|예제\s*출력을\s*참고|예제를\s*참고/;

/**
 * Outputs a `solution` cannot print by itself: case numbers ("Case #1: 3"), or a count
 * followed by the items it counts ("3" then three lines). The user can still write a format.
 */
export function unprintable(samples: readonly Sample[], outText = ''): boolean {
  const rows = samples.map((s) => outputRows(s.output).map((l) => l.trim().split(/\s+/)));
  const tokens = rows.flat(2);
  // Answers within an error bound ("오차가 10^-9 이하이면 정답") whose bound cannot be read: no
  // fixed digits to print. With a readable bound the return is a double with `tol`.
  if (
    /오차/.test(outText) &&
    errorTolerance(outText) === undefined &&
    tokens.every((t) => kind(t) !== 'string') &&
    tokens.some((t) => t.includes('.'))
  ) {
    return true;
  }
  // Lines in a format the description shows ("예제 출력과 같은 형식"), numbers mixed with words.
  const mixed = rows
    .flat()
    .some((r) => r.some((t) => kind(t) === 'string') && r.some((t) => /\d/.test(t)));
  if (FORMATTED.test(outText) && mixed) return true;
  const numbered = (r: string[][]) =>
    r.length > 0 && r.every((t, i) => new RegExp(`^#?${i + 1}:?$`).test(t[1] ?? ''));
  if (rows.every((r) => numbered(r) && /^(?:Case|Problem|Scenario|Data)$/i.test(r[0]?.[0] ?? ''))) {
    return true;
  }
  const counted = (r: string[][]) => {
    const k = Number(r[0]?.[0]);
    const rest = r.slice(1);
    if (r[0]?.length !== 1 || !Number.isInteger(k) || k < 2) return false;
    return rest.length === k || (rest.length === 1 && rest[0]?.length === k);
  };
  const long = rows.filter((r) => r.length >= 2);
  const firstIn = samples.map((s) => s.input.trim().split(/\s+/)[0]);
  // (Not when the first output number repeats the case count of the input.)
  return (
    long.length > 0 && long.every(counted) && !rows.some((r, i) => r.length === Number(firstIn[i]))
  );
}
