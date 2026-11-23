import { describe, expect, it } from 'vitest';
import {
  buildNotices,
  collectNotices,
  findLicenseProblems,
  isAllowedLicense,
} from '../scripts/third-party-notices';

describe('isAllowedLicense', () => {
  it('accepts single allowed licenses', () => {
    expect(isAllowedLicense('MIT')).toBe(true);
    expect(isAllowedLicense('Apache-2.0 WITH LLVM-exception')).toBe(true);
  });

  it('needs one allowed choice for OR', () => {
    expect(isAllowedLicense('(MPL-2.0 OR Apache-2.0)')).toBe(true);
    expect(isAllowedLicense('GPL-3.0 OR MIT')).toBe(true);
    expect(isAllowedLicense('GPL-3.0 OR AGPL-3.0')).toBe(false);
  });

  it('needs every part of AND to be allowed', () => {
    expect(isAllowedLicense('MIT AND ISC')).toBe(true);
    expect(isAllowedLicense('MIT AND GPL-2.0')).toBe(false);
  });

  it('rejects unknown and copyleft licenses', () => {
    expect(isAllowedLicense('UNKNOWN')).toBe(false);
    expect(isAllowedLicense('GPL-3.0-only')).toBe(false);
  });
});

describe('findLicenseProblems', () => {
  it('reports disallowed licenses and missing texts', () => {
    expect(
      findLicenseProblems([
        { name: 'a', license: 'MIT', text: 'MIT License' },
        { name: 'b', license: 'GPL-3.0', text: 'GPL' },
        { name: 'c', license: 'MIT' },
      ]),
    ).toEqual(['b: 허용 목록 밖 라이선스 GPL-3.0', 'c: 라이선스 전문을 찾지 못함']);
  });
});

describe('notices for this project', () => {
  const notices = collectNotices();

  it('passes the license check', () => {
    expect(findLicenseProblems(notices)).toEqual([]);
  });

  it('lists the bundled runtimes and their embedded parts', () => {
    const names = notices.map((n) => n.name);
    expect(names).toEqual(expect.arrayContaining(['pyodide', '@yowasp/clang', 'preact']));
    expect(names.some((n) => n.startsWith('CPython'))).toBe(true);
    expect(names.some((n) => n.startsWith('LLVM'))).toBe(true);
    expect(names.some((n) => n.startsWith('TeaVM'))).toBe(true);
    expect(notices.find((n) => n.name.startsWith('OpenJDK javac'))?.license).toBe(
      'GPL-2.0-only WITH Classpath-exception-2.0',
    );
    expect(names.some((n) => n.startsWith('@types/'))).toBe(false);
  });

  it('includes each license text in the notice file', () => {
    const text = buildNotices(notices);
    expect(text).toContain('Mozilla Public License Version 2.0');
    expect(text).toContain('LLVM Exceptions');
    expect(text).toContain('PYTHON SOFTWARE FOUNDATION LICENSE');
    expect(text).toContain('"CLASSPATH" EXCEPTION TO THE GPL');
    expect(text).toContain('developed by Alexey Andreev');
  });
});
