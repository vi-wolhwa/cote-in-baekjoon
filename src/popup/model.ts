/**
 * What the toolbar popup (#79) shows, computed from `storage.local` without extension APIs
 * so it can be unit tested. Only existing data is used: judge results (`judge:{id}`) and
 * problem meta (`meta:{id}`).
 */
import { languageInfo } from '@/shared/languages';
import { isProblemMeta, isProblemId, type ProblemMeta } from '@/shared/problem-meta';
import { issueUrl, type ReportContext } from '@/shared/report';
import { isJudgeResult, type JudgeResult } from '@/shared/submission';

export const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
export const RECENT_LIMIT = 5;

const PROBLEM_URL = /^https:\/\/(?:www\.)?acmicpc\.net\/problem\/(\d{1,7})(?:[/?#]|$)/;

/** The problem number of a Baekjoon problem page URL, or undefined. */
export function parseProblemUrl(url: string | undefined): number | undefined {
  const match = url ? PROBLEM_URL.exec(url) : null;
  const id = match ? Number(match[1]) : NaN;
  return isProblemId(id) && String(id) === match?.[1] ? id : undefined;
}

export type ProblemInput = { ok: true; id: number } | { ok: false; reason: string };

/** Reads the 문제 번호 the user typed. */
export function parseProblemInput(text: string): ProblemInput {
  const value = text.trim();
  if (!value) return { ok: false, reason: '문제 번호를 입력해 주세요.' };
  const id = Number(value);
  if (!/^\d+$/.test(value) || !isProblemId(id) || String(id) !== value) {
    return { ok: false, reason: '1부터 9999999까지의 숫자로 입력해 주세요.' };
  }
  return { ok: true, id };
}

export const problemUrl = (id: number) => `https://www.acmicpc.net/problem/${id}`;

/** "방금", "3분 전", "2시간 전", "어제", "3일 전", then a date. */
export function relativeTime(at: number, now: number): string {
  const diff = now - at;
  if (diff < MINUTE_MS) return '방금';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}분 전`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}시간 전`;
  const days = Math.floor(diff / DAY_MS);
  if (days === 1) return '어제';
  if (days < 30) return `${days}일 전`;
  const date = new Date(at);
  const md = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return date.getFullYear() === new Date(now).getFullYear() ? md : `${date.getFullYear()}년 ${md}`;
}

interface ProblemData {
  judges: Map<number, JudgeResult>;
  metas: Map<number, ProblemMeta>;
}

/** Valid judge results and meta by problem number; anything else is ignored. */
export function readProblems(items: Record<string, unknown>): ProblemData {
  const judges = new Map<number, JudgeResult>();
  const metas = new Map<number, ProblemMeta>();
  for (const [key, value] of Object.entries(items)) {
    const match = /^(judge|meta):(\d{1,7})$/.exec(key);
    const id = Number(match?.[2]);
    if (!match || !isProblemId(id)) continue;
    if (match[1] === 'judge' && isJudgeResult(value) && value.problemId === id) {
      judges.set(id, value);
    } else if (match[1] === 'meta' && isProblemMeta(value)) {
      metas.set(id, value);
    }
  }
  return { judges, metas };
}

export interface Stats {
  /** Problems with any judge result. */
  submitted: number;
  /** Problems whose latest result is 맞았습니다. */
  accepted: number;
  /** Problems whose result changed in the last 7 days. */
  lastWeek: number;
}

export function computeStats({ judges }: ProblemData, now: number): Stats {
  let accepted = 0;
  let lastWeek = 0;
  for (const judge of judges.values()) {
    if (judge.resultCode === 'ac') accepted++;
    if (now - judge.updatedAt < 7 * DAY_MS) lastWeek++;
  }
  return { submitted: judges.size, accepted, lastWeek };
}

/** Circle colour in the recent list. */
export type StatusKind = 'accepted' | 'wrong' | 'other' | 'judging' | 'opened';

export function statusKind(judge: JudgeResult | undefined): StatusKind {
  if (!judge) return 'opened';
  if (judge.status !== 'done') return 'judging';
  if (judge.resultCode === 'ac') return 'accepted';
  if (judge.resultCode === 'wa' || judge.resultCode === 'pe') return 'wrong';
  return 'other';
}

export interface RecentProblem {
  id: number;
  /** Untrusted page text: render as text only. */
  title?: string;
  language?: string;
  status: StatusKind;
  /** Judge result text, e.g. "맞았습니다!!", for the circle's label. */
  resultText?: string;
  at: number;
}

/** Newest first by the judge result time, or by when the IDE opened a problem not judged. */
export function recentProblems(data: ProblemData, limit = RECENT_LIMIT): RecentProblem[] {
  const ids = new Set([...data.judges.keys(), ...data.metas.keys()]);
  const list: RecentProblem[] = [];
  for (const id of ids) {
    const judge = data.judges.get(id);
    const meta = data.metas.get(id);
    const at = judge?.updatedAt ?? meta?.openedAt ?? 0;
    list.push({
      id,
      ...(meta?.title ? { title: meta.title } : {}),
      ...(meta ? { language: languageInfo(meta.language).label } : {}),
      status: statusKind(judge),
      ...(judge ? { resultText: judge.resultText } : {}),
      at,
    });
  }
  return list.sort((a, b) => b.at - a.at || b.id - a.id).slice(0, limit);
}

/** The "문제 신고하기" link: the problem open in the active tab and its language, if known. */
export function bugReportUrl(
  context: Pick<ReportContext, 'version' | 'browser'>,
  problemId: number | undefined,
  data: ProblemData,
): string {
  const meta = problemId ? data.metas.get(problemId) : undefined;
  return issueUrl('bug', {
    ...context,
    ...(problemId ? { problemId } : {}),
    ...(meta ? { language: languageInfo(meta.language).label } : {}),
  });
}
