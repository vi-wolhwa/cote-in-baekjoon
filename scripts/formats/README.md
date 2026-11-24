# 형식 데이터 자료 모으기 (#116)

solution 함수 모드(ADR-0006)의 형식 데이터를 만들기 위해, 많이 푼 백준 문제의 **입력·출력 설명과 예제**를 공개 웹 자료에서 모아 **로컬 캐시**에 둔다. 이 폴더의 코드는 개발용이며 확장에 들어가지 않는다.

## 커밋하는 것과 로컬에만 두는 것

| 커밋 | 로컬에만(`data/boj-cache/`, gitignore) |
| --- | --- |
| 이 폴더의 코드, `tests/formats-*.test.ts`(직접 만든 가짜 예시만) | 문제 목록, 저장소 색인, 문제별 설명·예제, 접근 기록, 통계 |

문제 본문(설명·예제)은 어떤 커밋에도 넣지 않는다. 확장에는 나중에 문제 번호와 형식(DSL)만 넣는다.

## 출처와 규칙

1. **문제 목록**: solved.ac 공개 API `GET /api/v3/search/problem?query=&sort=solved&direction=desc&page=N`(쪽당 50개). 요청 간격 1.5초. solved.ac는 Cloudflare 뒤에 있어 Node의 fetch는 챌린지(403)를 받는다. 그러면 화면이 보이는 Edge(Playwright)로 같은 주소를 사용자처럼 연다. Edge에서도 챌린지가 나오면 우회하지 않고 멈춘다. (headless Edge는 챌린지를 받는다.)
2. **공개 GitHub 풀이 저장소**(먼저 쓴다)
   - 찾기: 저장소 검색 4개, 코드 검색 2개(쪽 수 제한)로 후보를 정한다(`github.ts`의 `REPO_QUERIES`, `CODE_QUERIES`). 코드 검색은 7초 간격(분당 10회 제한).
   - 색인: 저장소마다 API 3번(저장소 정보, 기본 브랜치 커밋, 트리 목록). 0.75초 간격. 커밋 SHA로 고정한다.
   - 읽기: `raw.githubusercontent.com`에서 README를 0.3초 간격으로 읽는다. 입력·출력 설명과 예제가 모두 모일 때까지 문제마다 최대 6개(`--max-tries`).
   - README 형식: BaekjoonHub(`### 입력`, `### 출력`, HTML 본문, 예제 없음)와 예제를 담는 README(`## 예제 입력 1` + 코드 블록). 제목 줄마다 따로 판단하므로 섞여 있어도 읽는다.
   - 처음에는 어느 저장소에 예제가 있는지 모르므로 첫 실행 뒤 `--max-tries 30`으로 한 번 더 돌리면 저장소별 적중률(`github/state.json`)을 보고 예제가 있는 저장소부터 읽는다.
   - `--search-missing`: 그래도 덜 모인 문제마다 코드 검색 1번(`"acmicpc.net/problem/{id}" "예제 입력 1" extension:md`, 7초 간격)으로 Markdown 파일을 더 찾는다. 결과는 `github/hits.json`에 남는다.
   - BaekjoonHub는 비어 있는 절을 `Empty`로 적으므로 빈 문자열로 읽는다(입력이 없는 문제, 함수 구현 문제).
   - 풀이 코드 파일은 지금 읽지 않는다. 나중에 읽더라도 `solution` 파라미터 추론의 참고로만 쓰고, 코드를 캐시 밖으로 내보내거나 확장·커밋에 넣지 않는다(ADR-0006).
   - README가 그 문제의 것인지 확인한다: `acmicpc.net/problem/{id}` 링크나 첫 제목의 번호가 맞아야 쓴다.
   - 입력·출력 설명은 한 파일에서 함께, 예제는 한 파일에서 묶음으로 가져온다. 서로 다른 파일일 수 있어 `source`와 `sampleSource`를 따로 적는다.
   - 인증된 `gh` 토큰(`GITHUB_TOKEN`이 있으면 그것)을 쓰고, 속도 제한에 걸리면 초기화 시각까지 기다린다.
3. **블로그**(GitHub로 덜 모인 문제만)
   - Velog(`--velog`): 공개 GraphQL(`v2.velog.io/graphql`, 키 없음)로 "백준 {번호} {제목}"을 찾고, 제목에 문제 번호가 있는 글을 문제마다 최대 5개 읽는다. 1초 간격.
   - Tistory·네이버 블로그 등(`--blog`): 카카오(다음) 블로그 검색 API(무료, 하루 3만 건)로 찾고, 제목에 번호가 있는 글을 문제마다 최대 8개 읽는다. 네이버 블로그는 본문 프레임(PostView)을 읽는다. 1초 간격.
     - 키는 `KAKAO_REST_API_KEY` 환경 변수로만 준다(`data/boj-cache/kakao.env`처럼 커밋하지 않는 곳에 둔다). 유료 API는 켜지 않는다. 한도를 넘으면 요청이 거절될 뿐 요금은 없다.
   - 글 본문에서 입력·출력 절과 "예제 입력/출력" 블록만 읽는다. 풀이 코드는 읽지 않는다. 문제를 그림으로 붙인 글이 많아 예제를 얻는 비율은 낮다(시험: Velog 약 5%, 블로그 약 13%).
4. **acmicpc.net 직접 열기**(공개 자료로 못 구한 문제만, `--boj N`)
   - Edge(Playwright)로 문제 쪽을 실제로 연다. **1분에 1쪽 이하, 하루 100쪽 상한**, 실행마다 `--boj`로 정한 수 이하.
   - 연 쪽은 모두 `data/boj-cache/access-log.jsonl`에 `{ time, id, result }`로 남긴다. 간격과 하루 상한도 이 기록으로 계산하므로 실행을 나눠도 지켜진다.
   - 챌린지·403·429가 나오면 우회하지 않고 멈춘다.
   - 백준 이용 규칙은 스크래핑을 금지한다. 제품 책임자가 위험을 알고 결정했다(ADR-0006, 2026-11-24).
   - 문제 쪽 해석은 확장의 `src/boj/problem.ts`(`parseProblem`)를 그대로 쓴다.

## 실행

```bash
node scripts/formats/collect.ts --top 1000                                    # 목록 + GitHub
node scripts/formats/collect.ts --top 1000 --max-tries 30 --search-missing    # 빈 곳 채우기
node scripts/formats/collect.ts --top 1000 --skip-github --velog --blog      # + 블로그(카카오 키 필요)
node scripts/formats/collect.ts --top 1000 --boj 20 --headed                  # + 백준 직접 최대 20쪽(1분 간격)
node scripts/formats/collect.ts --top 1000 --stats                            # 통계만 다시 계산
```

시범(2026-11-24) 기준 첫 실행은 약 18분(GitHub API 243번, 검색 24번, README 2,237개), 빈 곳 채우기는 코드 검색 120번(약 15분)이 걸렸다.

| 옵션 | 기본값 | 뜻 |
| --- | --- | --- |
| `--top` | 1000 | 많이 푼 순 상위 몇 문제 |
| `--cache` | `data/boj-cache` | 캐시 폴더 |
| `--boj` | 0 | 이번 실행에서 백준을 직접 열 쪽 수(하루 100 상한) |
| `--headed` | 꺼짐 | 백준을 열 때 브라우저 창을 보인다 |
| `--max-tries` | 6 | 문제마다 읽을 README 수 상한 |
| `--skip-github` | 꺼짐 | GitHub 단계를 건너뛴다 |
| `--search-missing` | 꺼짐 | 덜 모인 문제를 문제마다 코드 검색한다 |
| `--velog` | 꺼짐 | 덜 모인 문제를 Velog에서 찾는다 |
| `--blog` | 꺼짐 | 덜 모인 문제를 블로그 검색(카카오)으로 찾는다 |
| `--stats` | 꺼짐 | 아무것도 받지 않고 통계만 다시 계산한다 |

모든 단계는 이어서 실행할 수 있다. 받은 목록 쪽, 저장소 색인, 완성된 문제는 다시 받지 않고, 덜 모인 문제는 아직 읽지 않은 README만 읽는다. 처음부터 다시 하려면 `data/boj-cache/`의 해당 파일을 지운다.

## 캐시 구조

```
data/boj-cache/
  top.json                 solved.ac 목록(번호, 제목, 레벨, 태그, 맞힌 사람 수)
  github/candidates.json   검색으로 찾은 저장소
  github/trees/*.json      저장소 커밋별 문제 번호 → README 경로
  github/state.json        문제별로 읽은 README, 저장소별 적중률
  github/hits.json         --search-missing 코드 검색 결과(문제별 파일 경로)
  problems/{id}.json       { id, title, source, sampleSource?, input, output, samples, constraints?, labels?, fetchedAt }
  access-log.jsonl         백준 접근 기록
  stats.json               마지막 실행의 출처별 통계
```

`input`·`output`은 HTML을 걷어 낸 일반 텍스트다(`<sup>`은 `^`, `<sub>`은 `_`, 목록은 `- `). 예제는 줄 끝 공백과 앞뒤 빈 줄만 지운다.

## 형식 데이터 만들기

캐시가 모이면 확장의 추론기와 검증기로 형식을 만든다. 문제 본문은 읽기만 하고, 결과에는 문제 번호와 형식만 남는다.

```bash
npm run formats:build                                      # src/data/formats.json, 캐시에 build-report.json
npm run formats:build -- --review data/boj-cache/review    # 검토용 시트(문제 100개씩, 로컬)
npm run formats:check -- data/boj-cache/review/out-01.json # 검토한 형식을 예제로 검증(아무것도 쓰지 않음)
```

- `formats-reviewed.json`(커밋): Claude가 검토한 형식. 추론이 맞으면 그대로, 틀리면 고친 형식, DSL로 표현할 수 없으면 `null`. 문제 번호와 형식만 담는다.
- 한 문제의 형식은 검토한 형식 → 추론 순으로 정하고, 확장의 예제 검증을 통과한 것만 넣는다. `null`인 문제는 넣지 않는다(확장에서 표준 입출력).
- 확장 코드(`@/` 경로)를 쓰므로 `run-ts.mjs`(jiti)로 실행한다.
- `build-report.json`에는 결과별 수와 추론·검토 일치율이 남는다.

## 테스트

`tests/formats-readme.test.ts`, `tests/formats-collect.test.ts`가 README·HTML 해석, 경로 → 번호, 병합, 통계, 백준 접근 규칙을 확인한다. 예시는 모두 직접 지어낸 것이다.
