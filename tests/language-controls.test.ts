// @vitest-environment happy-dom
import { h, render, type ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageSelect, RunButton, SubmitOnlyNote } from '@/ide/language-controls';
import { runCases } from '@/ide/run-cases';
import type { SandboxRunner } from '@/runner/client';
import { SUBMIT_ONLY_REASON } from '@/shared/languages';

function mount(node: ComponentChild) {
  const root = document.createElement('div');
  document.body.append(root);
  act(() => render(node, root));
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('language select', () => {
  it('groups languages that run in the browser and submit-only ones', () => {
    const onChange = vi.fn();
    const root = mount(h(LanguageSelect, { value: 'kotlin', disabled: false, onChange }));
    const groups = [...root.querySelectorAll('optgroup')];
    expect(groups.map((g) => g.label)).toEqual(['브라우저에서 실행', '제출만']);
    const submitOnly = [...root.querySelectorAll('optgroup[label="제출만"] option')];
    expect(submitOnly.map((o) => o.textContent)).toEqual([
      'Kotlin (JVM)',
      'Rust 2021',
      'Go',
      'Swift',
      'C#',
      'Ruby',
    ]);
    const runs = root.querySelector('optgroup[label="브라우저에서 실행"]');
    expect(runs?.querySelector('option[value="c11"]')?.textContent).toBe('C11');
    const select = root.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('kotlin');
    act(() => {
      select.value = 'cpp20';
      select.dispatchEvent(new Event('change'));
    });
    expect(onChange).toHaveBeenCalledWith('cpp20');
  });
});

describe('run button', () => {
  it('is disabled with the reason for submit-only languages', () => {
    const onRun = vi.fn();
    const root = mount(
      h('div', null, [
        h(RunButton, { language: 'rust', running: false, onRun, onStop: vi.fn() }),
        h(SubmitOnlyNote, { language: 'rust' }),
      ]),
    );
    const button = root.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('코드 실행');
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(SUBMIT_ONLY_REASON);
    button.click();
    expect(onRun).not.toHaveBeenCalled();
    expect(root.querySelector('[data-testid="run-unavailable"]')?.textContent).toBe(
      '이 언어는 브라우저에서 실행할 수 없어요. 제출하면 백준이 채점해요',
    );
  });

  it('runs languages with an engine, and stops while running', () => {
    const onRun = vi.fn();
    const onStop = vi.fn();
    const root = mount(
      h('div', null, [
        h(RunButton, { language: 'typescript', running: false, onRun, onStop }),
        h(SubmitOnlyNote, { language: 'typescript' }),
      ]),
    );
    const button = root.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    expect(onRun).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-testid="run-unavailable"]')).toBeNull();

    const running = mount(h(RunButton, { language: 'c11', running: true, onRun, onStop }));
    (running.querySelector('button') as HTMLButtonElement).click();
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('never sends a submit-only language to the sandbox', async () => {
    const runner = { run: vi.fn() } as unknown as SandboxRunner;
    const result = await runCases({
      runner,
      language: 'go',
      code: 'package main',
      cases: [{ input: '1', output: '1' }],
      warmEngines: new Set(),
      onProgress: vi.fn(),
    });
    expect(result).toEqual({ state: 'message', text: SUBMIT_ONLY_REASON });
    expect(runner.run).not.toHaveBeenCalled();
  });
});
