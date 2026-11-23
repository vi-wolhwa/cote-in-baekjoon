/**
 * Third-party license notices (#65).
 *
 * `buildNotices()` makes THIRD_PARTY_NOTICES.txt, which the build puts into the extension.
 * `node scripts/third-party-notices.ts --check` fails when a production dependency has a
 * license outside ALLOWED_LICENSES, or when a notice has no license text.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LICENSE_DIR = path.join(ROOT, 'third_party', 'licenses');

/** Licenses that allow bundling into a free extension with a notice. */
export const ALLOWED_LICENSES = [
  'MIT',
  'ISC',
  'Apache-2.0',
  'Apache-2.0 WITH LLVM-exception',
  'MPL-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Python-2.0',
];

/**
 * Packages whose npm tarball has no license file: the text comes from the source repository.
 * `license` replaces the package.json field when the repository states a different one.
 */
const LICENSE_FILES: Record<string, { file: string; license?: string }> = {
  pyodide: { file: 'Pyodide.txt' },
  // package.json says ISC, but the repository and README say Apache-2.0 (same as LLVM).
  '@yowasp/clang': { file: 'Apache-2.0.txt', license: 'Apache-2.0' },
  'mj-context-menu': { file: 'Apache-2.0.txt' },
};

/** Software inside bundled binaries that npm metadata does not list. */
const EMBEDDED: Notice[] = [
  {
    name: 'CPython 3.14 (Pyodide에 포함)',
    license: 'Python-2.0',
    source: 'https://github.com/python/cpython',
    text: licenseFile('CPython.txt'),
  },
  {
    name: 'LLVM: Clang, LLD, libc++ (@yowasp/clang에 포함)',
    license: 'Apache-2.0 WITH LLVM-exception',
    source: 'https://github.com/llvm/llvm-project',
    text: licenseFile('LLVM.txt'),
  },
];

/** Packages that are only types or Node-only tooling, never shipped in the extension. */
const SKIP = (name: string) => name.startsWith('@types/');

export interface Notice {
  name: string;
  version?: string;
  license: string;
  source?: string;
  /** Full license text, or undefined when none was found. */
  text?: string;
}

interface LockPackage {
  version?: string;
  license?: string;
  dev?: boolean;
  devOptional?: boolean;
}

/** Production dependencies from package-lock.json, plus the embedded components. */
export function collectNotices(): Notice[] {
  const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, LockPackage>;
  };
  const notices: Notice[] = [];
  for (const [key, pkg] of Object.entries(lock.packages)) {
    if (!key || pkg.dev || pkg.devOptional) continue;
    const name = key.replace(/^.*node_modules\//, '');
    if (SKIP(name)) continue;
    const dir = path.join(ROOT, key);
    const override = LICENSE_FILES[name];
    notices.push({
      name,
      version: pkg.version,
      license: override?.license ?? pkg.license ?? 'UNKNOWN',
      source: repositoryUrl(dir),
      text: override ? licenseFile(override.file) : packageLicenseText(dir),
    });
  }
  notices.sort((a, b) => a.name.localeCompare(b.name));
  return [...notices, ...EMBEDDED];
}

/** True when the SPDX expression can be satisfied with allowed licenses only. */
export function isAllowedLicense(expression: string, allowed = ALLOWED_LICENSES): boolean {
  const expr = expression.trim().replace(/^\((.*)\)$/, '$1');
  return expr.split(/\s+OR\s+/).some((choice) =>
    choice
      .replace(/^\((.*)\)$/, '$1')
      .split(/\s+AND\s+/)
      .every((part) => allowed.includes(part.trim())),
  );
}

/** Problems that should stop a release: disallowed licenses and missing license texts. */
export function findLicenseProblems(notices: Notice[]): string[] {
  const problems: string[] = [];
  for (const n of notices) {
    if (!isAllowedLicense(n.license))
      problems.push(`${n.name}: 허용 목록 밖 라이선스 ${n.license}`);
    if (!n.text) problems.push(`${n.name}: 라이선스 전문을 찾지 못함`);
  }
  return problems;
}

export function buildNotices(notices = collectNotices()): string {
  const rule = '='.repeat(78);
  const parts = [
    '코딩테스트 in 백준 — 오픈소스 라이선스 고지',
    'Third-party software notices',
    '',
    '이 확장 프로그램은 아래 오픈소스 소프트웨어를 포함합니다.',
    'This extension includes the following open-source software.',
    '',
  ];
  for (const n of notices) {
    parts.push(rule, n.version ? `${n.name} ${n.version}` : n.name, `License: ${n.license}`);
    if (n.source) parts.push(`Source: ${n.source}`);
    parts.push(rule, '', (n.text ?? '').trimEnd(), '');
  }
  return parts.join('\n');
}

function licenseFile(name: string): string {
  return readFileSync(path.join(LICENSE_DIR, name), 'utf8');
}

/** LICENSE, LICENSE-MIT, LICENSE.txt, COPYING ... joined when a package has several. */
function packageLicenseText(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir)
    .filter((f) => /^(licen[cs]e|copying)/i.test(f))
    .sort();
  if (files.length === 0) return undefined;
  return files.map((f) => readFileSync(path.join(dir, f), 'utf8').trimEnd()).join('\n\n');
}

function repositoryUrl(dir: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      repository?: string | { url?: string };
      homepage?: string;
    };
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    const url = repo
      ?.replace(/^git\+/, '')
      .replace(/\.git$/, '')
      .replace(/^github:/, 'https://github.com/')
      .replace(/^git:\/\//, 'https://');
    if (url && /^https?:\/\//.test(url)) return url;
    if (url && /^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
    return pkg.homepage;
  } catch {
    return undefined;
  }
}

if (process.argv.includes('--check')) {
  const notices = collectNotices();
  const problems = findLicenseProblems(notices);
  if (problems.length > 0) {
    console.error(`라이선스 검사 실패:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`라이선스 검사 통과: ${notices.length}개`);
}
