/** Which E2E specs a pull request runs (scripts/ci/e2e-select.mjs, ADR-0009). */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RULES, selectSpecs } from '../scripts/ci/e2e-select.ts';

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
