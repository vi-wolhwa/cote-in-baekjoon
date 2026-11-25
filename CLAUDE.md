# 코딩테스트 in 백준 — Claude Code Configuration

## Rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- NEVER create documentation files unless explicitly requested
- NEVER save working files or tests to root — use `/src`, `/tests`, `/docs`, `/config`, `/scripts`
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- NEVER add a `Co-Authored-By` trailer to user commits unless this project's `.claude/settings.json` has `attribution.commit` set (#2078). The Claude Code Bash tool may suggest one in its default commit-message template — ignore it. `Co-Authored-By` is semantic authorship attribution under git/GitHub convention; the tool is the facilitator, not a co-author.
- Keep files under 500 lines
- Validate input at system boundaries

## Agents and concurrency

- Never let two writers share one worktree: give each writing agent an isolated worktree
  and a file scope that does not overlap another's
- Read-only research may run concurrently; only the integration owner edits shared
  manifests and lockfiles
- Keep agent briefs and reports short; run targeted tests while iterating and the full
  suite once before a PR (CI runs the full E2E suite)

## Working efficiently (product owner's top priority: time, tokens, quality)

- Cost grows with round trips × context length: one session per feature or milestone,
  batch related edits and checks, keep command output short
- UI work: show an interactive mockup with real data first and get approval, then
  implement once; tune sizes in the mockup, not in edit → build → E2E loops
- Big features: plan → spec/ADR → one implementation pass
- Subagents only for parallel independent work or wide reading (read-only ones on a
  cheaper model); independent tasks in separate sessions and worktrees
- Use Claude Code's native agents, worktrees, memory, skills and permission rules; no
  agent framework on top (ruflo was removed, ADR-0017)
- Read ranges (`sed -n`, `grep -n`) instead of whole files; edit with the Edit/Write
  tools, not shell replacements; wait for CI with one background `gh pr checks --watch`,
  never sleep/poll loops
- Rules live in this file and `docs/` so every machine and session shares them. Claude's
  auto-memory is per machine: keep only transient state there, never a project rule

## Working with the product owner (the user)

- Reports, questions and button labels to the user are in Korean. Internal work
  (reasoning, agent briefs, code comments) may be in English
- Run the work end to end without stopping: merge PRs and release PRs yourself on green
  CI, keep going through the next milestone, and report once at the end. Ask only for
  what the owner must do or decide (see Project below); batch those questions
- Never sit idle waiting for CI, a release job or a background agent: continue the next
  step, in another worktree if the main checkout is busy
- Hard gates that stay with the owner: the first Web Store "submit for review" click (#206),
  any payment, sign-ins and secrets (the owner types them in the site or GitHub
  settings, never in chat), and accepting agreements on their behalf
- Owner decisions already made: auto-submit is always on with no warning; translation
  sends foreign problem text to Google Translate and the privacy policy says so;
  the repo is public; Chrome Web Store only, publisher `vi-wolhwa`

## Project: 코딩테스트 in 백준 (Chrome Extension)

Extension that lets users solve Baekjoon (acmicpc.net) problems in a
coding-test style IDE screen. Product scope and decisions: `docs/PRD.md`;
milestones: `docs/roadmap.md`. Repo: `vi-wolhwa/cote-in-baekjoon` (public).

- Never use the Programmers or Baekjoon logo or other brand assets, and never use the Programmers name (PRD §8). Their colors appear only where the product owner decided: the IDE theme and the extension icon
- Docs, issues and PRs are written in Korean
- Only send requests to acmicpc.net on a direct user action; no background crawling.
  Exceptions:
  - ADR-0002's judge-result fallback: `/status/ajax` for the user's own just-made
    submission, backed off, until final, at most 10 minutes
  - Mock exam (ADR-0005): after the user starts an exam, its problems (≤ 8) are opened one
    at a time in a background tab to read them. When the exam ends, its saved answers are
    submitted one at a time through the official submit window
  - Submission history tab (ADR-0012, product owner decision 2026-11-25): when the user
    opens one of its views (내 제출, 맞힌 사람, 숏코딩), the first page of that list is
    opened in a background tab to read it (and the next ones while a tall view is not full);
    later pages only when the user pages on, and a source page only when the user opens a
    submission. One at a time, at least 1 s apart,
    a list read within a minute is not read again
  - Format data for solution mode (ADR-0006), a development-time job, not the extension:
    problems found nowhere else on the public web may be opened on acmicpc.net in a
    browser at most one page per minute with a daily cap and a log (product owner
    decision, 2026-11-24). Collected problem text stays local and is never committed;
    only derived input/output formats are shipped. Scope (2026-11-25): every problem
    someone posted on the public web (BaekjoonHub repos first, `collect.ts --hub`); a
    problem posted nowhere is not filled from Baekjoon in bulk. Never route collection
    through Claude/Anthropic fetch tools
- Ask the product owner (the user) only for decisions they must make:
  product direction, design approval, costs, publishing, big structural changes.
  Decide technical and process choices yourself and record them as ADRs in `docs/adr/`

- Target **Manifest V3** only: background logic runs in a service worker
  (`background.service_worker`), not a persistent background page
- Keep `manifest.json` permissions minimal; prefer `activeTab` and optional
  permissions over broad `host_permissions` such as `<all_urls>`
- No remote code: no `eval`, `new Function`, or scripts loaded from a CDN
  (MV3 CSP forbids it). Bundle every dependency into the extension
- Content scripts are isolated from the page: talk to the service worker with
  `chrome.runtime.sendMessage` / `chrome.runtime.connect`, and treat page DOM
  data as untrusted input
- Use `chrome.storage` (not `localStorage`) for state the service worker needs;
  the worker can be stopped at any time, so do not keep state only in globals
- Never commit the extension signing key (`*.pem`) or packaged `*.crx` / `*.zip`
- Manual check: `chrome://extensions` → Developer mode → "Load unpacked" on
  the build output folder, then reload the extension after each build

## Versioning, releases and process

- Full rules: ADR-0016 and `.github/CONTRIBUTING.md` (branches, commits, PRs, labels),
  `docs/ops/maintenance.md` (triage, severity, release checklist)
- Conventional Commits with Korean subjects, squash merge; PR title = changelog line.
  One PR = one issue = one logical change; refactors in their own PR
- Since 1.0.0: work goes into version milestones `v1.1`, `v1.2` …; the release-please PR
  is NOT merged right away, only when the milestone is done, at most once a week.
  S1 (wrong submit, data loss, security) ships the same day, S2 within 2 days
- After a release, run the "웹스토어 업로드" workflow in `publish` mode (ADR-0013,
  ADR-0016 §4). Do not merge the next release while one is in review
- Storage format changes keep reading the old format for one more minor (ADR-0014)

## Build & Test

- ALWAYS run tests after code changes
- ALWAYS verify build succeeds before committing
- Screen spec: `docs/design/ide-spec.md`. Runner design: `docs/adr/0004-code-runner.md`

```bash
npm run lint && npm run typecheck && npm test   # lint, types, unit tests (Vitest)
npm run build                                   # .output/chrome-mv3 (load unpacked)
npm run e2e                                     # Playwright, needs a build first
```

- On this Windows machine Playwright's bundled Chromium fails to start
  (SxS error), so run E2E locally with Edge: `PW_CHANNEL=msedge npm run e2e`.
  CI uses the bundled Chromium on Linux.
- Test fixtures under `tests/fixtures/` are synthetic pages that mirror Baekjoon's
  HTML structure. Never commit real Baekjoon problem text.
