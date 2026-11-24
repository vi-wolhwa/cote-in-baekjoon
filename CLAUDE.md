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

## Project: 코딩테스트 in 백준 (Chrome Extension)

Extension that lets users solve Baekjoon (acmicpc.net) problems in a
coding-test style IDE screen. Product scope and decisions: `docs/PRD.md`;
milestones: `docs/roadmap.md`. Repo: `vi-wolhwa/cote-in-baekjoon` (private).

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
    opens one of its views (내 제출, 채점 현황, 숏코딩), the first page of that list is
    opened in a background tab to read it; later pages only when the user pages on, and a
    source page only when the user opens a submission. One at a time, at least 1 s apart,
    a list read within a minute is not read again
  - Format data for solution mode (ADR-0006), a development-time job, not the extension:
    problems found nowhere else on the public web may be opened on acmicpc.net in a
    browser at most one page per minute with a daily cap and a log (product owner
    decision, 2026-11-24). Collected problem text stays local and is never committed;
    only derived input/output formats are shipped
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
