// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  describeDiagnosis,
  diagnoseProblemPage,
  diagnoseStatusPage,
  diagnoseSubmitButton,
  diagnoseSubmitFill,
  looksLikeProblemPage,
  type Diagnosis,
} from '@/boj/diagnosis';
import { diagnosisReportUrl, showDiagnosisNotice } from '@/boj/diagnosis-notice';
import { parseStatusRows } from '@/boj/status';

const PROBLEM_URL = 'https://www.acmicpc.net/problem/1000';
const problemHtml = readFileSync('tests/fixtures/problem-sample.html', 'utf8');
const statusHtml = readFileSync('tests/fixtures/status-sample.html', 'utf8');

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

function problemPage(remove: string[] = []): Document {
  const doc = parse(problemHtml);
  for (const selector of remove) doc.querySelector(selector)?.remove();
  return doc;
}

describe('problem page', () => {
  it('finds nothing wrong on the current layout', () => {
    expect(diagnoseProblemPage(problemPage(), PROBLEM_URL)).toBeUndefined();
  });

  it('names each part that is gone', () => {
    const doc = problemPage(['#problem_title', '#problem_description', '#sample-input-1']);
    expect(diagnoseProblemPage(doc, PROBLEM_URL)).toEqual({
      page: 'problem',
      missing: ['문제 제목', '문제 설명', '예제'],
    });
  });

  it('notices an unreadable time limit', () => {
    const doc = problemPage();
    const cell = doc.querySelector('#problem-info tbody td');
    if (cell) cell.textContent = '1 second';
    expect(diagnoseProblemPage(doc, PROBLEM_URL)?.missing).toEqual(['시간 제한']);
  });

  it('stays quiet on pages that are not a problem', () => {
    // A problem that does not exist: no "N번:" tab title.
    const missing = parse('<html><head><title>Baekjoon Online Judge</title></head></html>');
    expect(looksLikeProblemPage(missing, PROBLEM_URL)).toBe(false);
    expect(diagnoseProblemPage(missing, PROBLEM_URL)).toBeUndefined();
    // Other /problem/ pages such as the tag list.
    expect(
      diagnoseProblemPage(problemPage(['#problem_title']), 'https://www.acmicpc.net/problem/tags'),
    ).toBeUndefined();
  });
});

describe('submit page', () => {
  const ok = { nonce: 'n', language: 'ok', code: 'ok' } as const;

  it('reports parts of the form that were not found', () => {
    expect(diagnoseSubmitFill(ok)).toBeUndefined();
    expect(
      diagnoseSubmitFill({ ...ok, language: 'select-missing', code: 'editor-missing' }),
    ).toEqual({ page: 'submit', missing: ['언어 선택', '코드 입력 칸'] });
    expect(diagnoseSubmitFill(undefined)?.missing).toEqual(['제출 양식']);
    expect(diagnoseSubmitButton().missing).toEqual(['제출 버튼']);
  });

  it('does not treat a language missing from the user list as a layout problem', () => {
    expect(diagnoseSubmitFill({ ...ok, language: 'unavailable' })).toBeUndefined();
  });
});

describe('status page', () => {
  it('finds nothing wrong when rows can be read', () => {
    const doc = parse(statusHtml);
    expect(diagnoseStatusPage(doc, parseStatusRows(doc).length)).toBeUndefined();
  });

  it('reports a missing table or rows it cannot read', () => {
    expect(diagnoseStatusPage(parse('<main></main>'), 0)?.missing).toEqual(['채점 현황 표']);
    const doc = parse(statusHtml);
    for (const span of doc.querySelectorAll('span.result-text')) span.remove();
    expect(diagnoseStatusPage(doc, parseStatusRows(doc).length)?.missing).toEqual(['채점 결과 행']);
  });
});

describe('report', () => {
  const diagnosis: Diagnosis = { page: 'submit', missing: ['언어 선택', '제출 버튼'] };

  it('describes the problem in one line', () => {
    expect(describeDiagnosis(diagnosis)).toBe(
      '[자가 진단] 백준 제출 페이지에서 찾지 못함: 언어 선택, 제출 버튼',
    );
  });

  it('pre-fills the bug form without code or page content', () => {
    const url = new URL(
      diagnosisReportUrl(diagnosis, { version: '0.3.0', browser: 'Edge 131', problemId: 1000 }),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: '1-bug.yml',
      version: '0.3.0 / Edge 131',
      problem: '1000',
      what: '[자가 진단] 백준 제출 페이지에서 찾지 못함: 언어 선택, 제출 버튼',
    });
  });

  it('shows one notice with text only and a working close button', () => {
    document.body.innerHTML = '';
    const evil: Diagnosis = { page: 'problem', missing: ['<img src=x onerror=alert(1)>'] };
    showDiagnosisNotice(document, diagnosis, { version: '0.3.0', browser: 'Edge 131' });
    const host = showDiagnosisNotice(document, evil, { version: '0.3.0', browser: 'Edge 131' });
    expect(document.querySelectorAll('#cib-diagnosis-notice')).toHaveLength(1);
    const root = host.shadowRoot;
    expect(root?.querySelector('img')).toBeNull();
    expect(root?.querySelector('.cib-diagnosis-message')?.textContent).toContain('<img');
    expect(root?.querySelector('a')?.getAttribute('target')).toBe('_blank');
    root?.querySelector('button')?.click();
    expect(document.querySelector('#cib-diagnosis-notice')).toBeNull();
  });
});
