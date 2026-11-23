// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { diagnoseProblemPage } from '@/boj/diagnosis';
import { insertOpenButton, OPEN_BUTTON_ID, OPEN_ITEM_ID, OPEN_LABEL } from '@/boj/open-button';

const problemHtml = readFileSync('tests/fixtures/problem-sample.html', 'utf8');
const PROBLEM_URL = 'https://www.acmicpc.net/problem/1000';

function page(remove: string[] = []): Document {
  const doc = new DOMParser().parseFromString(problemHtml, 'text/html');
  for (const selector of remove) doc.querySelector(selector)?.remove();
  return doc;
}

const menuTexts = (doc: Document) =>
  [...doc.querySelectorAll('ul.problem-menu > li')].map((li) => li.textContent?.trim());

describe('"코딩테스트" button', () => {
  it('goes into the problem menu between "N번" and "제출"', () => {
    const doc = page();
    expect(insertOpenButton(doc, () => undefined)).toBe('menu');
    expect(menuTexts(doc).slice(0, 3)).toEqual(['1000번', OPEN_LABEL, '제출']);
    const item = doc.getElementById(OPEN_ITEM_ID);
    expect(item?.tagName).toBe('LI');
    const link = doc.getElementById(OPEN_BUTTON_ID);
    expect(link?.parentElement).toBe(item);
    expect(link?.tagName).toBe('A');
    expect(link?.getAttribute('role')).toBe('button');
    expect(link?.getAttribute('href')).toBe('#');
    expect(link?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('goes after the first item when no item links to /submit/', () => {
    const doc = page();
    doc.querySelector('a[href^="/submit/"]')?.closest('li')?.remove();
    expect(insertOpenButton(doc, () => undefined)).toBe('menu');
    expect(menuTexts(doc).slice(0, 3)).toEqual(['1000번', OPEN_LABEL, '맞힌 사람']);
  });

  it('falls back to the end of the title line when the menu is missing', () => {
    const doc = page(['ul.problem-menu']);
    expect(insertOpenButton(doc, () => undefined)).toBe('title');
    const link = doc.getElementById(OPEN_BUTTON_ID);
    expect(link?.parentElement?.tagName).toBe('H1');
    expect(link?.dataset.place).toBe('title');
    expect(doc.getElementById(OPEN_ITEM_ID)).toBeNull();
    // A missing menu alone is not a layout problem: the fallback works.
    expect(diagnoseProblemPage(doc, PROBLEM_URL)).toBeUndefined();
  });

  it('adds nothing without a problem title', () => {
    const doc = page(['#problem_title']);
    expect(insertOpenButton(doc, () => undefined)).toBeUndefined();
    expect(doc.getElementById(OPEN_BUTTON_ID)).toBeNull();
  });

  it('never adds a second button', () => {
    const doc = page();
    insertOpenButton(doc, () => undefined);
    expect(insertOpenButton(doc, () => undefined)).toBeUndefined();
    expect(doc.querySelectorAll(`#${OPEN_BUTTON_ID}`)).toHaveLength(1);
    expect(doc.querySelectorAll(`#${OPEN_ITEM_ID}`)).toHaveLength(1);
  });

  it('opens the IDE on click and Space without following the link', () => {
    const doc = page();
    const onOpen = vi.fn();
    insertOpenButton(doc, onOpen);
    const link = doc.getElementById(OPEN_BUTTON_ID) as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    link.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
