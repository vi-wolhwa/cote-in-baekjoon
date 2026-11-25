/** Extension updates (ADR-0014): the '새 버전' notice and content scripts left behind. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ensureExtension, extensionAlive, watchExtension } from '../src/boj/extension-alive';
import {
  compareVersions,
  isUpdateNotice,
  noticeFor,
  releaseUrl,
} from '../src/shared/update-notice';

describe('update notice', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.22.0', '0.22.1')).toBe(-1);
  });

  it('is made only for an upgrade', () => {
    expect(noticeFor({ reason: 'update', previousVersion: '0.22.0' }, '0.23.0')).toEqual({
      from: '0.22.0',
      to: '0.23.0',
    });
    expect(noticeFor({ reason: 'install' }, '0.23.0')).toBeUndefined();
    // Reloading an unpacked build of the same version, or going back.
    expect(noticeFor({ reason: 'update', previousVersion: '0.23.0' }, '0.23.0')).toBeUndefined();
    expect(noticeFor({ reason: 'update', previousVersion: '0.24.0' }, '0.23.0')).toBeUndefined();
    expect(
      noticeFor({ reason: 'chrome_update', previousVersion: '0.1.0' }, '0.23.0'),
    ).toBeUndefined();
  });

  it('validates stored notices and links the release', () => {
    expect(isUpdateNotice({ from: '1', to: '2' })).toBe(true);
    expect(isUpdateNotice({ to: '2' })).toBe(false);
    expect(isUpdateNotice('x')).toBe(false);
    expect(releaseUrl('0.23.0')).toMatch(/\/releases\/tag\/v0\.23\.0$/);
  });
});

describe('content script after an update', () => {
  const realId = fakeBrowser.runtime.id;
  const lose = () =>
    Object.defineProperty(browser.runtime, 'id', { value: undefined, configurable: true });

  afterEach(() => {
    Object.defineProperty(browser.runtime, 'id', { value: realId, configurable: true });
    vi.useRealTimers();
  });

  it('goes on while the extension is there', () => {
    const win = { confirm: vi.fn(), location: { reload: vi.fn() } };
    expect(extensionAlive()).toBe(true);
    expect(ensureExtension(win as never)).toBe(true);
    expect(win.confirm).not.toHaveBeenCalled();
  });

  it('offers a reload once the extension is gone', () => {
    lose();
    const yes = { confirm: vi.fn(() => true), location: { reload: vi.fn() } };
    expect(ensureExtension(yes as never)).toBe(false);
    expect(yes.location.reload).toHaveBeenCalledOnce();
    const no = { confirm: vi.fn(() => false), location: { reload: vi.fn() } };
    expect(ensureExtension(no as never)).toBe(false);
    expect(no.location.reload).not.toHaveBeenCalled();
  });

  it('notices the loss once while watching, and stops when asked', () => {
    vi.useFakeTimers();
    const onLost = vi.fn();
    watchExtension(onLost, 1000);
    vi.advanceTimersByTime(3000);
    expect(onLost).not.toHaveBeenCalled();
    lose();
    vi.advanceTimersByTime(5000);
    expect(onLost).toHaveBeenCalledOnce();

    const other = vi.fn();
    const stop = watchExtension(other, 1000);
    stop();
    vi.advanceTimersByTime(5000);
    expect(other).not.toHaveBeenCalled();
  });
});
