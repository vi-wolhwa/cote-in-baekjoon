/** Which E2E specs a pull request runs (scripts/ci/e2e-select.ts, ADR-0009). */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { needsUnit, outputs, RULES, selectSpecs, shardCount } from '../scripts/ci/e2e-select.ts';

const SPECS = readdirSync('e2e')
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => f.replace(/\.spec\.ts$/, ''));

describe('selectSpecs', () => {
  it('runs nothing for docs, unit tests and development scripts', () => {
    expect(
      selectSpecs([
        'docs/PRD.md',
        'README.md',
        'tests/solution-dsl.test.ts',
        'scripts/formats/build.ts',
      ]),
    ).toBe('none');
  });

  it('runs the specs of the areas that changed', () => {
    expect(selectSpecs(['src/runner/cpp/compile.ts'])).toEqual(['cpp', 'languages', 'solution']);
    expect(selectSpecs(['src/ide/Sidebar.tsx', 'docs/x.md'])).toEqual(['sidebar']);
    expect(selectSpecs(['e2e/timer.spec.ts', 'src/shared/help-content.ts'])).toEqual([
      'help',
      'timer',
    ]);
  });

  it('runs only the solution specs for format data and the history spec for its tab', () => {
    expect(selectSpecs(['public/formats/1.json', 'scripts/formats/formats-reviewed.json'])).toEqual(
      ['exam', 'solution'],
    );
    expect(selectSpecs(['src/ide/history/HistoryPane.tsx', 'src/shared/status-page.ts'])).toEqual([
      'history',
    ]);
    expect(selectSpecs(['public/icon/16.png', 'third_party/licenses/LLVM.txt'])).toBe('none');
  });

  it('runs everything when a file belongs to no area', () => {
    expect(selectSpecs(['src/ide/App.tsx'])).toBe('all');
    expect(selectSpecs(['package.json', 'docs/a.md'])).toBe('all');
    expect(selectSpecs(['e2e/fixtures.ts'])).toBe('all');
    expect(selectSpecs(['.github/workflows/ci.yml'])).toBe('all');
    expect(selectSpecs(['src/new-area/thing.ts'])).toBe('all');
  });

  it('names only specs that exist', () => {
    for (const [, target] of RULES) {
      if (!Array.isArray(target)) continue;
      for (const s of target) expect(SPECS, s).toContain(s);
    }
  });
});

describe('workflow outputs', () => {
  it('skips unit tests only for documentation', () => {
    expect(needsUnit(['docs/a.md', 'README.md'])).toBe(false);
    expect(needsUnit(['docs/a.md', 'tests/x.test.ts'])).toBe(true);
    expect(outputs(['src/ide/Sidebar.tsx'])).toBe(
      'e2e=e2e/sidebar.spec.ts\nunit=true\nshards=[1]\n',
    );
    expect(outputs(['docs/a.md'])).toBe('e2e=none\nunit=false\nshards=[1]\n');
  });

  it('starts as many E2E shards as the selected specs need', () => {
    expect(shardCount('all')).toBe(3);
    expect(shardCount(['solution', 'exam'])).toBe(1);
    expect(shardCount(['a', 'b', 'c'])).toBe(2);
    expect(shardCount(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(3);
    expect(outputs(['src/ide/App.tsx'])).toContain('shards=[1,2,3]');
  });
});
