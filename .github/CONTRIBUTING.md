# 개발 규칙

이 저장소는 제품 책임자(vi-wolhwa)와 Claude가 함께 개발한다. Claude는 기획, 디자인, 개발, QA, DevOps 역할을 나눠 맡고, 제품 책임자는 방향 결정과 사용 테스트를 맡는다.

## 1. 작업 흐름

```
이슈 → 브랜치 → 커밋 → PR → CI 통과 → 리뷰 → Squash 병합 → 브랜치 삭제
```

1. **모든 작업은 이슈에서 시작한다.** 이슈에 목적과 완료 조건을 적고 마일스톤을 단다.
2. `main`에서 작업 브랜치를 만든다.
3. 작업 단위로 커밋한다.
4. PR을 열고 `Closes #이슈번호`로 이슈를 연결한다.
5. CI(린트, 타입 검사, 테스트, 빌드)가 통과해야 한다.
6. 리뷰는 Claude의 리뷰 에이전트가 맡는다. 아래 경우에만 제품 책임자의 승인을 받는다.
   - 큰 구조 변경
   - 화면 디자인 변경
   - 웹스토어 게시, 비용이 드는 결정
7. Squash 병합하고 브랜치를 삭제한다.

## 2. 브랜치 전략: GitHub Flow

- `main`은 항상 빌드되고 동작하는 상태를 유지한다. `main`에 직접 커밋하지 않는다.
- 작업 브랜치는 짧게 유지한다(며칠 이내). 이름은 `종류/이슈번호-요약` 형식이다.

| 종류 | 용도 | 예 |
|---|---|---|
| `feat` | 기능 추가 | `feat/12-js-runner` |
| `fix` | 버그 수정 | `fix/31-sample-parse` |
| `docs` | 문서 | `docs/5-conventions` |
| `refactor` | 동작 변화 없는 구조 개선 | `refactor/40-runner-api` |
| `test` | 테스트 | `test/22-parser-cases` |
| `ci` | CI·자동화 | `ci/8-pr-checks` |
| `chore` | 설정, 의존성, 기타 | `chore/9-deps` |
| `spike` | 기술 검증 (병합하지 않을 수 있음) | `spike/3-boj-submit` |

**선택 이유**
- 릴리스가 웹스토어로 한 줄로만 나간다. 동시에 유지할 버전이 없으므로 Git Flow의 `develop`·`release` 브랜치는 비용만 늘린다.
- Trunk-based는 미완성 기능을 기능 플래그로 숨겨야 하는데, 이 규모에서는 PR 단위 검증이 더 단순하고 안전하다.

**브랜치 보호**
GitHub 무료 요금제의 Private 저장소는 브랜치 보호 규칙(ruleset)을 쓸 수 없다. 그래서 Public 전환 전까지는 위 규칙을 관례로 지킨다. Public으로 전환할 때 다음을 켠다.
- `main` 직접 push 금지
- PR 필수
- CI 통과 필수
- Squash 병합만 허용

## 3. 커밋 메시지: Conventional Commits

```
<종류>(<범위>): <한국어 요약>

<본문: 무엇을, 왜 바꿨는지. 선택>

Closes #이슈번호
```

- **종류**: 브랜치 종류와 같다. `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `chore`. 성능 개선은 `perf`를 쓴다.
- **범위**(선택): `runner`, `editor`, `boj`, `ui`, `storage`, `build`, `deps`
- **요약**: 50자 이내. "~한다"가 아니라 명사형이나 "~ 추가", "~ 수정"으로 끝낸다.
  - 예: `feat(runner): JavaScript 표준 입력 에뮬레이션 추가`
- **호환성을 깨는 변경**: 종류 뒤에 `!`를 붙이고, 본문에 `BREAKING CHANGE:`를 적는다.
- Squash 병합 시 PR 제목이 최종 커밋 제목이 된다. 그래서 PR 제목도 같은 형식으로 쓴다.

## 4. Pull Request

- PR 하나에는 목적 하나만 담는다. 변경이 400줄을 넘으면 나눌 수 있는지 먼저 검토한다.
- 템플릿의 체크리스트를 채운다. 화면이 바뀌면 스크린샷을 첨부한다.
- 확장 권한(`manifest.json`의 `permissions`, `host_permissions`)을 바꾸면 PR 본문에 이유를 적는다.

## 5. 버전과 릴리스

- [SemVer](https://semver.org/lang/ko/)를 따른다. 웹스토어 첫 게시(M3) 전까지는 `0.x.y`이다.
- 커밋 기록으로 CHANGELOG와 버전을 자동으로 만든다. 도구는 CI 설정 때 정한다.
- 릴리스 태그는 `vX.Y.Z`다. 태그가 생기면 CI가 확장 zip을 빌드해 GitHub Release에 첨부한다.

## 6. 이슈와 라벨

| 라벨 그룹 | 값 |
|---|---|
| 종류 | `type:feat`, `type:fix`, `type:docs`, `type:refactor`, `type:test`, `type:ci`, `type:chore`, `type:spike` |
| 영역 | `area:runner`, `area:editor`, `area:boj`, `area:ui`, `area:build` |
| 우선순위 | `priority:p0`(즉시), `priority:p1`(이번 마일스톤), `priority:p2`(여유 있을 때) |
| 상태 | `status:blocked`, `status:needs-decision`(제품 책임자 결정 필요) |

마일스톤은 [로드맵](../docs/roadmap.md)의 M0~M6을 그대로 쓴다.

## 7. 문서

- 언어는 한국어다. 코드 식별자와 코드 주석은 영어로 쓴다.
- 기술 결정은 `docs/adr/NNNN-제목.md`에 ADR로 남긴다. 결정 배경, 검토한 선택지, 결정, 결과를 적는다.
- 제품 결정은 [PRD](../docs/PRD.md) 11장 결정 기록에 추가한다.

## 8. 코드 스타일과 테스트

기술 스택은 [ADR-0003](../docs/adr/0003-tech-stack.md)을 따른다.

**코드 스타일**
- 포맷은 Prettier, 린트는 ESLint(typescript-eslint)로 맞춘다. 커밋 전에 `npm run lint`가 통과해야 한다.
- TypeScript `strict`를 켠다. `any`는 쓰지 않는다. 경계(백준 DOM, 메시지, 저장소)에서 읽은 값은 검증 함수를 거친다.
- 파일 하나는 500줄을 넘기지 않는다.

**폴더 구조**

| 경로 | 내용 |
|---|---|
| `src/entrypoints/` | WXT 진입점: 콘텐츠 스크립트, `ide`, `sandbox`, 백그라운드 |
| `src/boj/` | 백준 DOM 파싱, 제출 페이지 자동 입력, 채점 결과 읽기 |
| `src/runner/` | 코드 실행 엔진(언어별) |
| `src/ide/` | 풀이 화면 UI |
| `src/shared/` | 메시지 타입, 저장소, 공용 유틸 |
| `tests/` | 단위 테스트(Vitest), 백준 HTML 샘플(`tests/fixtures/`) |
| `e2e/` | Playwright E2E 테스트 |

**테스트**
- 파서와 실행 엔진은 단위 테스트가 필수다.
- 백준 HTML 구조 변화를 잡기 위해 실제 문제 페이지 HTML을 `tests/fixtures/`에 저장해 테스트한다.
- 화면 흐름은 Playwright로 확장을 띄워 확인한다.
