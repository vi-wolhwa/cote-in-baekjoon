# Ruflo — Claude Code Configuration

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

## Ruflo Capability Brain & Implementation Loop

Ruflo is the coordination ledger and policy decision point. Claude Code is the
executor: after a Ruflo coordination call, continue implementing the task.

When it is registered, call
`guidance_brain({ mode: "recommend", task: "..." })` before complex Ruflo
work. Use its live registry instead of guessing tool names. Treat
`registered`, `configured`, `reachable`, `healthy`, and `authorized`
as separate facts. If the brain is unavailable, continue with the compatible
`guidance_recommend` tool, CLI discovery, and repository instructions.

Follow the returned loop:

1. Recall memory and ADR constraints.
2. Inspect source, runtime, dependencies, policy, and health.
3. Route to the smallest capable topology, agents, skills, and tools.
4. Plan acceptance criteria, safety envelope, ownership, and validation.
5. Execute in isolated scopes; the coding agent performs the work.
6. Test focused, regression, and failure paths.
7. Validate types, security, policy, compatibility, and artifacts.
8. Benchmark a source-bound candidate against a source-bound baseline.
9. Optimize measured bottlenecks without weakening safety.
10. Bind claims and evidence to exact source/build receipts.
11. Reconcile concurrent handoffs and disclose limitations.
12. Publish only through a separately authorized release gate.

### Concurrency and authority

- Never allow two writers in one worktree; give each writing agent an isolated
  worktree and explicit file ownership.
- Read-only research may run concurrently and report findings to the owner.
- Only the integration owner edits shared manifests and lockfiles or reconciles
  overlapping changes.
- A child may drop capabilities but cannot add tools, network, secrets, spend,
  concurrency, namespaces, or delegation depth.
- A lease or claim coordinates ownership; it does not authorize a side effect.
- Darwin, Flywheel, MetaHarness, memory, and neural systems may propose or
  evaluate candidates but cannot self-promote or expand their SafetyEnvelope.
- Bind tests, benchmarks, policy decisions, and release evidence to an exact
  commit or immutable dirty-worktree snapshot.

## Agent Comms (SendMessage-First Coordination)

Named agents coordinate via `SendMessage`, not polling or shared state.

```
Lead (you) ←→ architect ←→ developer ←→ tester ←→ reviewer
              (named agents message each other directly)
```

### Spawning a Coordinated Team

```javascript
// ALL agents in ONE message, each knows WHO to message next
Agent({ prompt: "Research the codebase. SendMessage findings to 'architect'.",
  subagent_type: "researcher", name: "researcher", run_in_background: true })
Agent({ prompt: "Wait for 'researcher'. Design solution. SendMessage to 'coder'.",
  subagent_type: "system-architect", name: "architect", run_in_background: true })
Agent({ prompt: "Wait for 'architect'. Implement it. SendMessage to 'tester'.",
  subagent_type: "coder", name: "coder", run_in_background: true })
Agent({ prompt: "Wait for 'coder'. Write tests. SendMessage results to 'reviewer'.",
  subagent_type: "tester", name: "tester", run_in_background: true })
Agent({ prompt: "Wait for 'tester'. Review code quality and security.",
  subagent_type: "reviewer", name: "reviewer", run_in_background: true })

// Kick off the pipeline
SendMessage({ to: "researcher", summary: "Start", message: "[task context]" })
```

### Patterns

| Pattern | Flow | Use When |
|---------|------|----------|
| **Pipeline** | A → B → C → D | Sequential dependencies (feature dev) |
| **Fan-out** | Lead → A, B, C → Lead | Independent parallel work (research) |
| **Supervisor** | Lead ↔ workers | Ongoing coordination (complex refactor) |

### Rules

- ALWAYS name agents — `name: "role"` makes them addressable
- ALWAYS include comms instructions in prompts — who to message, what to send
- Spawn ALL agents in ONE message with `run_in_background: true`
- After spawning, continue independent local work; wait only when a dependency
  genuinely blocks progress
- Do not poll repeatedly — agents message back or complete automatically
- Give every writing agent an isolated worktree and a non-overlapping file scope

## Swarm & Routing

### Config
- **Topology**: hierarchical-mesh (anti-drift)
- **Max Agents**: 15
- **Memory**: hybrid
- **HNSW**: Enabled
- **Neural**: Enabled

```bash
npx @claude-flow/cli@3.80.1 swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

### Agent Routing

| Task | Agents | Topology |
|------|--------|----------|
| Bug Fix | researcher, coder, tester | hierarchical |
| Feature | architect, coder, tester, reviewer | hierarchical |
| Refactor | architect, coder, reviewer | hierarchical |
| Performance | perf-engineer, coder | hierarchical |
| Security | security-architect, auditor | hierarchical |

### When to Swarm
- **YES**: 3+ files, new features, cross-module refactoring, API changes, security, performance
- **NO**: single file edits, 1-2 line fixes, docs updates, config changes, questions

### 3-Tier Model Routing

| Tier | Handler | Use Cases |
|------|---------|-----------|
| 1 | Agent Booster (WASM) | Simple transforms — skip LLM, use Edit directly |
| 2 | Haiku | Simple tasks, low complexity |
| 3 | Sonnet/Opus | Architecture, security, complex reasoning |

## Memory & Learning

### Before Any Task
```bash
npx @claude-flow/cli@3.80.1 memory search --query "[task keywords]" --namespace patterns
npx @claude-flow/cli@3.80.1 hooks route --task "[task description]"
```

### After Success
```bash
npx @claude-flow/cli@3.80.1 memory store --namespace patterns --key "[name]" --value "[what worked]"
npx @claude-flow/cli@3.80.1 hooks post-task --task-id "[id]" --success true --store-results true
```

### MCP Tools (use `ToolSearch("keyword")` to discover)

| Category | Key Tools |
|----------|-----------|
| **Memory** | `memory_store`, `memory_search`, `memory_search_unified` |
| **Bridge** | `memory_import_claude`, `memory_bridge_status` |
| **Swarm** | `swarm_init`, `swarm_status`, `swarm_health` |
| **Agents** | `agent_spawn`, `agent_list`, `agent_status` |
| **Hooks** | `hooks_route`, `hooks_post-task`, `hooks_worker-dispatch` |
| **Security** | `aidefence_scan`, `aidefence_is_safe`, `aidefence_has_pii` |
| **Hive-Mind** | `hive-mind_init`, `hive-mind_consensus`, `hive-mind_spawn` |

### Background Workers

| Worker | When |
|--------|------|
| `audit` | After security changes |
| `optimize` | After performance work |
| `testgaps` | After adding features |
| `map` | Every 5+ file changes |
| `document` | After API changes |

```bash
npx @claude-flow/cli@3.80.1 hooks worker dispatch --trigger audit
```

## Agents

**Core**: `coder`, `reviewer`, `tester`, `planner`, `researcher`
**Architecture**: `system-architect`, `backend-dev`, `mobile-dev`
**Security**: `security-architect`, `security-auditor`
**Performance**: `performance-engineer`, `perf-analyzer`
**Coordination**: `hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`
**GitHub**: `pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`

Any string works as a custom agent type.

## Project: 코딩테스트 in 백준 (Chrome Extension)

Extension that lets users solve Baekjoon (acmicpc.net) problems in a
coding-test style IDE screen. Product scope and decisions: `docs/PRD.md`;
milestones: `docs/roadmap.md`. Repo: `vi-wolhwa/cote-in-baekjoon` (private).

- Never use the Programmers or Baekjoon logo or other brand assets, and never use the Programmers name (PRD §8). Their colors appear only where the product owner decided: the IDE theme and the extension icon
- Docs, issues and PRs are written in Korean
- Only send requests to acmicpc.net on a direct user action; no background crawling.
  The one exception is ADR-0002's judge-result fallback: `/status/ajax` for the user's
  own just-made submission, backed off, until final, at most 10 minutes
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

## CLI Quick Reference

```bash
npx @claude-flow/cli@3.80.1 init --wizard           # Setup
npx @claude-flow/cli@3.80.1 swarm init --v3-mode     # Start swarm
npx @claude-flow/cli@3.80.1 memory search --query "" # Vector search
npx @claude-flow/cli@3.80.1 hooks route --task ""    # Route to agent
npx @claude-flow/cli@3.80.1 doctor --fix             # Diagnostics
npx @claude-flow/cli@3.80.1 security scan            # Security scan
npx @claude-flow/cli@3.80.1 performance benchmark    # Benchmarks
```

26 commands, 140+ subcommands. Use `--help` on any command for details.

## Setup

```bash
claude mcp add claude-flow -- npx -y ruflo@3.80.1 mcp start
npx ruflo@3.80.1 doctor --fix
```

> The background `daemon` is optional. It runs interval workers that each spawn
> a headless `claude` session, so it consumes tokens continuously. Start it only
> if you want those sweeps: `npx ruflo@3.80.1 daemon start` (self-stops after 12h
> by default; `--ttl 0` to disable, `daemon status --all` to audit running daemons).

**Agent tool** handles execution (agents, files, code, git). **MCP tools** handle coordination (swarm, memory, hooks). **CLI** is the same via Bash.
