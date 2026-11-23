# ADR-0002: 제출은 공식 제출 페이지에서 사용자가 직접 한다

- 상태: 승인
- 날짜: 2026-11-23
- 관련: PRD 8.1, R1, 이슈 #2

## 배경

백준 [이용 규칙](https://help.acmicpc.net/rule)은 공식 `/submit` 경로에서 사용자가 직접 제출 버튼을 누르지 않는 모든 수단을 '자동 제출 도구'로 정의한다. 외부 프로그램, 스크립트, 대리 웹사이트가 예로 나온다. 적발 시 제재는 다음과 같다.

- 제출한 모든 소스 삭제
- 1회: 30일 제출 금지
- 2회: 사실상 영구 제출 금지

기술적으로는 다음이 모두 가능하다.
- `POST /submit/{id}` 요청을 직접 보내기 (CSRF 키를 읽어 폼 전송)
- 제출 버튼 자동 클릭

하지만 둘 다 규칙 위반이다. 사용자 계정이 제재를 받는다.

## 결정

1. 풀이 화면의 **제출하기**를 누르면 `https://acmicpc.net/submit/{id}`를 풀이 화면 탭 바로 옆의 새 탭으로 연다.
   - `www.acmicpc.net`은 `acmicpc.net`으로 리디렉션되므로 `www` 없는 주소를 쓴다.
   - 로그인하지 않았으면 백준이 로그인 페이지를 거쳐 같은 탭의 제출 페이지로 돌려보낸다. 10분 안이면 그대로 채운다.
2. 그 페이지의 콘텐츠 스크립트가 언어와 코드를 채운다.
   - 코드는 백그라운드가 `chrome.storage.session`에 보관하고, 제출 페이지 콘텐츠 스크립트에 **메시지로** 넘긴다. 콘텐츠 스크립트에 session 저장소 접근 권한(`setAccessLevel`)을 열지 않는다.
   - 백그라운드는 보낸 쪽이 확장이 연 그 탭의 `/submit/{id}` 페이지인지 확인하고, 코드를 **한 번만** 넘긴 뒤 지운다. 새로고침이나 제출 실패로 페이지가 다시 열려도 사용자가 고친 코드를 덮어쓰지 않는다. 10분이 지나면 버린다.
   - 언어: `<select id="language">`의 값을 백준 언어 번호(node.js = 17)로 바꾸고 `change`, `chosen:updated` 이벤트를 보낸다. 이 select는 chosen.js(`#language_chosen`)로 꾸며져 있다.
   - 코드: 제출 페이지 에디터는 CodeMirror 5이고, 인스턴스는 페이지 자바스크립트 세계의 `.CodeMirror` 요소 속성(`el.CodeMirror`)에만 있다. 그래서 채우기는 `world: 'MAIN'` 콘텐츠 스크립트가 맡는다. 격리된 콘텐츠 스크립트와는 `CustomEvent`(JSON 문자열)로만 주고받고, MAIN 스크립트는 확장 API 없이 받은 언어와 코드를 검증해 채우기만 한다.
   - DOM에 기대는 코드는 `src/boj/submit-fill.ts` 한 곳에 모아 구조가 바뀌면 그 파일만 고친다.
3. 제출 버튼은 **사용자가 직접** 누른다. 확장은 클릭하지 않고, 폼을 제출하지 않고, 요청도 보내지 않는다.
   - 채운 뒤 배너로 안내한다: "언어와 코드를 채웠습니다. 내용을 확인하고 백준의 제출 버튼을 직접 눌러 주세요."
   - 채우기에 실패하면 코드를 클립보드에 복사한다. 사용자 동작 없이 복사가 막히면 배너의 **코드 복사** 버튼으로 복사하게 한다.
4. 제출 뒤 백준이 보여 주는 채점 현황 페이지에서 콘텐츠 스크립트가 결과를 읽는다.
   - 행: `#status-table tr[id^="solution-"]`. 결과는 `td.result span.result-text`의 글자와 `data-color`(없으면 `result-{코드}` 클래스), 메모리·시간은 `td.memory`, `td.time`, 제출 시각은 `[data-timestamp]`(유닉스 초)에서 읽는다.
   - 결과 코드는 백준 `App.result_colors()`와 같다. `wait`, `rejudge-wait`는 대기, `compile`, `judging`은 채점 중, 나머지(`ac`, `pe`, `wa`, `tle`, `mle`, `ole`, `rte`, `ce`, `del`, `pac`)는 최종 결과다.
   - 실시간 갱신: 백준 페이지가 스스로 받는 갱신(Pusher)이 행을 고치는 것을 `MutationObserver`로 관찰한다. 최종 결과가 나오거나 15분이 지나면 관찰을 멈춘다. 확장은 요청도 폴링도 하지 않는다.
   - 대상: 로그인한 사용자(머리글의 `a.username`, 없으면 `from_mine=1` 주소의 `user_id`)가 **제출하기를 누른 뒤**(시계 오차 2분 허용) 그 문제에 낸 가장 최근 제출만 보고한다. 제출하기를 누른 뒤 1시간이 지나면 보고하지 않는다.
   - 읽은 결과는 `chrome.storage.local`의 `judge:{문제 번호}`에 저장하고, 풀이 화면은 저장소 변경을 구독해 표시한다.
5. 백준 방화벽이 막는 문자열이 코드에 있으면 제출 페이지 배너에 경고한다.
   - 목록은 백준허브(BaekjoonHub, MIT) `scripts/baekjoon/submitfilter.js`를 따른다. `document.cookie`, `document.write`, `.parentnode`, `.innerhtml`, `window.location`, `-moz-binding`, `<!--`, `-->`, `<![cdata[`와 `<script`, `<style`, `<svg`, `<iframe`, `<form`, `<set<` 같은 HTML 태그 모양 글자(OWASP CRS 941160)다. 백준허브가 '확인되지 않음'으로 표시한 항목은 뺐다.

## 남은 위험

- **자동 입력**은 규칙에 명시되지 않은 회색 영역이다. 웹스토어 공개(M3) 전에 백준 운영사(데이원컴퍼니)에 문의한다.
  - 문의 초안은 Claude가 쓰고, 발송은 제품 책임자가 한다.
  - 허용되지 않으면 '코드를 클립보드에 복사하고 제출 페이지 열기'로 바꾼다. 이 동작은 설정 하나로 바꿀 수 있게 만든다.
- 백준 제출 페이지의 에디터 구조가 바뀌면 자동 입력이 깨진다. 실패하면 클립보드 복사로 자동 전환한다.

## 검증 상태 (2026-11-23, 이슈 #23)

로그인한 상태의 제출 페이지는 직접 볼 수 없어서 공개 자료로 구조를 확인했다. 제품 책임자가 실제 계정으로 수동 확인해야 한다.

| 항목 | 상태 | 근거 |
|---|---|---|
| 언어 번호(node.js 17, Python 3 28, PyPy3 73, C++17 84, Java 11 93) | 확인 | 공개 채점 현황 페이지의 언어 필터 `<option>` 값 |
| 채점 현황 표 구조, 결과 코드, 실시간 갱신 방식 | 확인 | 공개 채점 현황 페이지 HTML과 백준 공개 스크립트(`status.js`, `app.min.js`) |
| `www.acmicpc.net` → `acmicpc.net` 리디렉션, 비로그인 시 `/login?next=/submit/{id}` | 확인 | 공개 페이지 응답 |
| 제출 페이지 에디터가 CodeMirror 5(`.CodeMirror` → `el.CodeMirror`) | 미확인(공개 자료) | 백준허브 `submitfilter.js`와 여러 공개 사용자 스크립트가 같은 방식을 쓴다 |
| 언어 select `#language`와 chosen.js(`#language_chosen`), `chosen:updated`로 표시 갱신 | 미확인(공개 자료) | 공개 자동화 코드가 `#language_chosen`을 다룬다. chosen.js는 컨테이너 id를 `{select id}_chosen`으로 만들므로 select id는 `language`로 본다 |
| 제출 뒤 `/status?from_mine=1&problem_id={id}&user_id={아이디}`로 이동, 머리글 `a.username` | 미확인(공개 자료) | 백준허브 파싱 코드 |
| 채우기·배너·결과 보고 전체 흐름 | 합성 페이지로 확인 | Playwright E2E(`e2e/submit.spec.ts`)가 백준 구조를 본뜬 페이지에서 언어·코드 채우기, 제출 미발생, 한 번만 채우기, 결과 저장을 확인한다 |

## 결과

- PRD의 '제출 후 채점하기' 한 번 클릭 흐름은 '제출하기 → 백준에서 제출 버튼 클릭' 두 단계가 된다.
- 확장은 백준에 어떤 요청도 직접 보내지 않는다. 필요한 권한은 `acmicpc.net`의 콘텐츠 스크립트뿐이다.
