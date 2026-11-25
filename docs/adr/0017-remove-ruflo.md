# ADR-0017: 개발 도구에서 ruflo 제거

- 상태: 채택
- 날짜: 2026-11-25
- 관련: #175, #176, #216, #217

## 배경

개발 초기에 에이전트 오케스트레이션 도구 ruflo(옛 이름 claude-flow)를 설치했다. 설치한 것은 스웜·메모리 MCP 서버, 라우팅·학습 훅, 에이전트·명령·스킬 정의, `.claude/helpers`의 스크립트 45개, `.claude-flow` 설정이다.

효율 검토(#175, #176)에서 다음이 확인되었다.

- 스웜·메모리 MCP 도구는 협업 상태를 기록할 뿐이고, 실제 작업은 Claude Code의 에이전트가 한다. 한 세션에서 에이전트 176개를 돌리는 동안 ruflo 정의는 한 번도 쓰이지 않았다.
- 라우팅 훅과 정의 목록이 요청마다 약 3.4k 토큰을 더했다. 그래서 pre-bash 안전 검사, 세션 종료 기록, protector 플러그인만 남겼다.
- 그 뒤 한 세션(Bash 857회)에서 pre-bash 검사가 막은 명령은 없었다. protector의 PR-003 경보는 모두 오탐이라 #216에서 껐다.
- 에이전트, worktree 격리, 메모리, 스킬, 훅, 권한 규칙, 여러 에이전트를 순서대로 돌리는 워크플로는 Claude Code에 기본으로 있다. 혼자 개발하는 이 프로젝트에서 ruflo에만 있는 기능(벡터 메모리 검색, 모델 라우팅, 다른 회사 모델 연결)은 쓸 일이 없다.

## 결정

ruflo를 저장소에서 모두 제거한다.

- 지우는 것: `.mcp.json`(claude-flow MCP 서버), `.claude/helpers/`, `.claude-flow/`, `.claude/settings.json`의 ruflo 훅·상태 표시줄·플러그인·마켓플레이스·`claudeFlow` 설정·권한, `.gitignore`·`.prettierignore`·ESLint·E2E 선택 규칙의 ruflo 경로
- pre-bash 검사가 막던 위험 명령(루트 삭제, 드라이브 포맷)은 Claude Code의 `permissions.deny` 규칙으로 막는다. deny 규칙은 권한 확인을 건너뛰는 모드에서도 적용된다.
- 세션 비용은 ruflo 기록 대신 Claude Code의 사용량 정보로 본다.
- 작업 효율 규칙은 CLAUDE.md의 "Working efficiently" 절(#217)에 둔다.

## 결과

- 매 Bash 호출의 훅 실행(node 프로세스 하나)과 세션 종료 훅이 없어진다. 저장소에서 약 50개 파일이 빠진다.
- 상태 표시줄이 ruflo 것에서 Claude Code 기본으로 돌아간다.
- deny 규칙은 명령의 앞부분만 비교하므로, pre-bash 검사보다 잡는 범위가 좁다. 위험 명령은 원래 쓰지 않으므로 이 정도로 충분하다고 본다.
- 나중에 필요해지면 다시 들이기 전에 이득을 측정하고, 새 ADR로 남긴다.
