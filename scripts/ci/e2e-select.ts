/**
 * Picks the E2E specs a pull request needs from the files it changes (CI speed, ADR-0009).
 *
 * Each changed file takes the first rule that matches it: no E2E (docs, unit tests,
 * development scripts), some specs (an area of the extension), or all of them. A file no rule
 * names runs everything, so a new area is never skipped by mistake. Pushes to main always
 * run everything (the workflow does not call this then).
 *
 *   node scripts/ci/e2e-select.ts origin/main   →  `e2e=all|none|<spec files>` and `unit=true|false`
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NONE = 'none' as const;
const ALL = 'all' as const;

type Target = string[] | typeof NONE | typeof ALL | ((m: RegExpExecArray) => string[]);

/** [pattern, specs] — specs are e2e file names without `.spec.ts`, or NONE / ALL. */
export const RULES: [RegExp, Target][] = [
  // Not part of the built extension.
  [/^docs\//, NONE],
  [/^[^/]+\.md$/, NONE],
  [/^\.github\/ISSUE_TEMPLATE\//, NONE],
  [/^\.github\/workflows\/(native-glue|release|build-teavm-javac)\.yml$/, NONE],
  [/^tests\//, NONE],
  [/^scripts\/(formats|help-md)/, NONE],
  [/^\.claude\//, NONE],
  [/^LICENSE|^THIRD_PARTY/, NONE],
  [/^third_party\/licenses\//, NONE],
  [/^\.github\/(CONTRIBUTING\.md|pull_request_template\.md|dependabot\.yml)$/, NONE],
  [/^\.claude-flow\//, NONE],
  [/^scripts\/(store|teavm-classlib|render-icons)/, NONE],
  // Icons and release config: the check job builds and lists licenses; no E2E behavior.
  [/^(public\/icon|assets)\//, NONE],
  [/^(\.release-please-manifest|release-please-config)\.json$/, NONE],
  // One spec changes only itself; shared E2E helpers change their users.
  [/^e2e\/([\w-]+)\.spec\.ts$/, (m) => [m[1] as string]],
  [/^e2e\/exam-helpers\.ts$/, ['exam', 'exam-batch', 'solution', 'submit-tab']],
  // Areas of the extension.
  [/^src\/runner\/cpp\//, ['cpp', 'languages', 'solution']],
  [/^src\/runner\/java\//, ['java', 'languages', 'solution']],
  [/^src\/runner\/python\//, ['python', 'solution']],
  [/^src\/runner\/js\//, ['ide', 'languages', 'solution']],
  [/^src\/(solution|ide\/solution|data)\//, ['solution', 'exam', 'languages']],
  // Bundled format data (ADR-0011): which problems open in solution mode.
  [/^public\/formats\//, ['solution', 'exam']],
  [/^vendor\/teavm-javac\//, ['java']],
  // Submission history tab (ADR-0012).
  [
    /^src\/(ide\/history\/|boj\/(history-service|status-page|status-capture|capture-answer)\.ts|shared\/(status-page|submission-history)\.ts|entrypoints\/(ide\/history\.css|boj-capture\.content\.ts))/,
    ['history'],
  ],
  [/^src\/ide\/useSolution\.ts$/, ['solution', 'exam', 'languages']],
  [/^src\/exam\//, ['exam', 'exam-batch', 'exam-setup']],
  [/^src\/entrypoints\/exam\//, ['exam', 'exam-batch', 'exam-setup']],
  [/^src\/boj\/exam-capture\.ts$/, ['exam', 'exam-setup']],
  [/^src\/(popup|entrypoints\/popup)\//, ['popup', 'backup']],
  [/^src\/shared\/backup(-download)?\.ts$/, ['backup', 'popup']],
  [/^src\/entrypoints\/help\//, ['help']],
  [/^src\/shared\/help-(content|search)\.ts$/, ['help']],
  [/^src\/ide\/(Timer\w*\.tsx|timer\.ts|useTimer\.ts)$/, ['timer']],
  [/^src\/entrypoints\/ide\/timer\.css$/, ['timer']],
  [/^src\/ide\/Sidebar\.tsx$/, ['sidebar']],
  [/^src\/boj\/diagnosis(-notice)?\.ts$/, ['diagnosis']],
  [
    /^src\/(boj\/(submit-\w+|submission-service|submit-tab-service|status[\w-]*|sender)\.ts|ide\/submit\.tsx|shared\/(submission|submit-tab|judge-wait)\.ts|entrypoints\/boj-(submit|submit-main|status)\.content\.ts)$/,
    ['submit', 'submit-tab', 'exam-batch'],
  ],
  [/^src\/entrypoints\/ide\/solution\.css$/, ['solution']],
  [/^src\/ide\/translate\//, ['translate']],
];

/** The specs to run for these changed files: ALL, NONE, or a sorted list. */
export function selectSpecs(files: string[]): string[] | typeof NONE | typeof ALL {
  const specs = new Set<string>();
  for (const file of files) {
    const rule = RULES.find(([pattern]) => pattern.test(file));
    if (!rule) return ALL;
    const [pattern, target] = rule;
    const picked =
      typeof target === 'function' ? target(pattern.exec(file) as RegExpExecArray) : target;
    if (picked === ALL) return ALL;
    if (picked === NONE) continue;
    for (const s of picked) specs.add(s);
  }
  return specs.size === 0 ? NONE : [...specs].sort();
}

function changedFiles(base: string): string[] {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

/** Unit tests are needed unless only documentation changed. */
export function needsUnit(files: string[]): boolean {
  return files.some((f) => !/^docs\/|^[^/]+\.md$|^\.github\/ISSUE_TEMPLATE\//.test(f));
}

/**
 * How many E2E shards to start: each shard installs, builds and starts a browser on its own, so
 * a few specs run in one or two shards instead of leaving the others with nothing to do.
 */
export function shardCount(picked: string[] | typeof NONE | typeof ALL): number {
  if (picked === ALL) return 3;
  if (picked === NONE) return 1;
  return picked.length <= 2 ? 1 : picked.length <= 5 ? 2 : 3;
}

/** `e2e=…`, `unit=…` and `shards=[…]` lines for $GITHUB_OUTPUT. */
export function outputs(files: string[]): string {
  const picked = selectSpecs(files);
  const e2e = Array.isArray(picked) ? picked.map((s) => `e2e/${s}.spec.ts`).join(' ') : picked;
  const shards = JSON.stringify(Array.from({ length: shardCount(picked) }, (_, i) => i + 1));
  return `e2e=${e2e}\nunit=${needsUnit(files)}\nshards=${shards}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(outputs(changedFiles(process.argv[2] ?? 'origin/main')));
}
