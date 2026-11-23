import { describe, expect, it } from 'vitest';
import { describeBrowser, issueUrl } from '@/shared/report';

describe('issueUrl', () => {
  it('fills the bug form with what the extension knows', () => {
    const url = new URL(
      issueUrl('bug', {
        version: '0.3.0',
        browser: 'Chrome 131',
        problemId: 1000,
        language: 'Java 11',
      }),
    );
    expect(url.origin + url.pathname).toBe(
      'https://github.com/vi-wolhwa/cote-in-baekjoon/issues/new',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: '1-bug.yml',
      version: '0.3.0 / Chrome 131',
      problem: '1000',
      language: 'Java 11',
    });
  });

  it('leaves out what is unknown', () => {
    const url = new URL(issueUrl('run-diff', { version: '0.3.0' }));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: '2-run-diff.yml',
      version: '0.3.0',
    });
  });

  it('opens the feature form without environment fields', () => {
    const url = new URL(issueUrl('feature', { version: '0.3.0', problemId: 1 }));
    expect(Object.fromEntries(url.searchParams)).toEqual({ template: '3-feature.yml' });
  });
});

describe('describeBrowser', () => {
  it('prefers a specific brand over Chromium', () => {
    expect(
      describeBrowser({
        userAgent: '',
        userAgentData: {
          brands: [
            { brand: 'Chromium', version: '131' },
            { brand: 'Microsoft Edge', version: '131' },
            { brand: 'Not_A Brand', version: '24' },
          ],
        },
      }),
    ).toBe('Edge 131');
    expect(
      describeBrowser({
        userAgent: '',
        userAgentData: { brands: [{ brand: 'Google Chrome', version: '131' }] },
      }),
    ).toBe('Chrome 131');
  });

  it('falls back to the user agent string', () => {
    const base =
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0';
    expect(describeBrowser({ userAgent: `${base} Safari/537.36 Whale/4.29.0.0` })).toBe('Whale 4');
    expect(describeBrowser({ userAgent: `${base} Safari/537.36 Edg/131.0.0.0` })).toBe('Edge 131');
    expect(describeBrowser({ userAgent: `${base} Safari/537.36` })).toBe('Chrome 131');
    expect(describeBrowser({ userAgent: 'curl/8' })).toBe('알 수 없는 브라우저');
  });
});
