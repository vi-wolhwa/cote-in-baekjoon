# ADR-0007: 언어 확장 2 (M6)

- 상태: 승인 (2026-11-24, 제품 책임자가 선택을 위임)
- 관련: M6, #121, #122, ADR-0004, ADR-0006

## 배경

M2·M3에서 JavaScript, Python 3, PyPy3, C++17, Java 11을 지원했다. 백준에서 많이 쓰는 나머지 언어를 더한다. 조건은 ADR-0004와 같다(무료, 원격 코드 금지, 확장 크기). 새 실행 엔진을 넣으면 확장이 크게 커지므로, 이미 넣은 엔진으로 돌릴 수 있는 언어만 브라우저에서 실행하고 나머지는 제출만 지원한다.

## 결정

**백준 언어 ID** (공개 채점 현황 페이지의 언어 필터에서 확인, 2026-11-24)

| 언어 | ID | 언어 | ID |
|---|---|---|---|
| C99 | 0 | Java 8 | 3 |
| C11 | 75 | TypeScript | 106 |
| C++14 | 88 | Kotlin (JVM) | 69 |
| C++20 | 95 | Rust 2021 | 113 |
| Go | 12 | Swift | 74 |
| C# | 86 | Ruby | 68 |

- C99의 ID가 0이므로 ID를 참거짓으로 검사하지 않는다.

**1. 실행 + 제출 (기존 엔진 재사용)**

| 언어 | 엔진 | 방식 | 코드 묶음 |
|---|---|---|---|
| C99, C11 | clang (C++과 같은 워커) | `clang -std=gnu99`/`gnu11 -O2 -DONLINE_JUDGE -DBOJ -lm`, 파일 `solution.c` | `c` |
| C++14, C++20 | clang | `clang++ -std=gnu++14`/`gnu++20`, 나머지는 C++17과 같다 | `cpp` (C++17과 공유) |
| Java 8 | TeaVM javac | Java 11과 같은 파이프라인 | `java` (Java 11과 공유) |
| TypeScript | JavaScript | sucrase(MIT)로 타입을 지운 뒤 실행, 파일 `solution.ts` | `typescript` |

- **엔진과 언어 분리**: 엔진 종류(`EngineId`: js, python, cpp, java)는 워커·데워 두기 같은 공통 동작에만 쓴다. 컴파일러 모드와 표준은 언어(`LanguageInfo.build`)가 정하고 샌드박스가 엔진에 넘긴다(`EngineInput.build`).
- C++ 워커는 같은 코드라도 표준이 다르면 다시 컴파일한다(캐시 키에 표준 포함).
- WASI libc에는 수학 함수가 이미 들어 있다. `-lm`은 백준 명령과 맞추려고 둔다.
- C++14에서도 `bits/stdc++.h`가 컴파일된다. `std::optional` 같은 C++17 라이브러리는 없고, `if constexpr` 같은 문법은 g++처럼 경고만 낸다.
- Java 8: TeaVM javac에는 `-source` 옵션이 없어 Java 11과 똑같이 컴파일한다. Java 8에서 안 되는 문법(`var` 등)이 브라우저에서는 될 수 있다(도움말에 적음).
- TypeScript
  - sucrase는 `typescript` 변환만 쓴다(`import`/`export`가 있으면 `imports` 변환도 써서 `require`로 바꾼다). 줄 번호를 그대로 두어 런타임 오류 줄이 맞는다.
  - 타입 검사는 하지 않는다. 문법 오류는 `solution.ts:줄:칸: error: …` 형식의 컴파일 에러로 보인다.
  - 후보: TypeScript 컴파일러(약 9MB), esbuild-wasm(약 10MB)은 너무 크다. sucrase는 약 200KB이고 샌드박스 페이지에만 들어간다.
  - 에디터는 `javascript({ typescript: true })`.

**2. 제출만: Kotlin (JVM), Rust 2021, Go, Swift, C#, Ruby**

- 브라우저 실행 엔진이 없다(넣으면 언어마다 수십 MB). 에디터 강조는 `@codemirror/legacy-modes`(MIT)의 StreamLanguage(clike의 kotlin·csharp, rust, go, swift, ruby)로 한다.
- '코드 실행'은 꺼져 있고 이유를 보인다: "이 언어는 브라우저에서 실행할 수 없어요. 제출하면 백준이 채점해요". 실행 결과 탭에도 같은 문장을 둔다. 샌드박스도 엔진이 없는 언어의 요청은 실행하지 않는다.
- 제출은 다른 언어와 같다(연습 화면 제출, 모의 시험 답안 저장과 일괄 제출).
- 시작 코드는 표준 입력을 읽는 관용구만 둔다(Kotlin `BufferedReader`, Rust `std::io`, Go `bufio`, Swift `readLine()`, C# `Console.ReadLine`, Ruby `gets`). Go는 쓰지 않는 변수·import가 컴파일 에러라서 값 하나를 읽고 출력한다.

**3. 언어 선택**

- 목록을 `<optgroup>`으로 '브라우저에서 실행'과 '제출만'으로 나눈다. 모양은 기존 선택 상자와 같다.
- 순서: C99, C11, C++14, C++17, C++20, Python 3, PyPy3, Java 8, Java 11, JavaScript, TypeScript / Kotlin (JVM), Rust 2021, Go, Swift, C#, Ruby.

**4. solution 함수 모드**

- 연결 코드 템플릿(ADR-0006)이 있는 언어만 쓴다: JavaScript, Python 3·PyPy3, C++14·17·20, Java 8·11. (2026-11-24 ADR-0008로 모든 언어에 넓혔다.)
- C++ 연결 코드는 C++11 문법만 써서 C++14로 컴파일된다(테스트로 확인). Java 연결 코드도 Java 8 문법이다.
- C, TypeScript, 제출만 되는 언어는 스위치가 꺼지고 이유를 보인다: "{언어}에서는 solution 함수를 쓸 수 없어 표준 입출력으로 풀어요". 이때 '형식 만들기'는 보이지 않는다. 켜고 끈 선택(`ui:solution`)은 그대로 두어, 지원 언어로 돌아오면 다시 켜진다.

**5. 저장과 그 밖의 연결**

- 코드 저장 키는 `code:{문제}:{코드 묶음}`(solution 모드는 `:fn`)이다. 새 묶음 `c`, `typescript`, `kotlin`, `rust`, `go`, `swift`, `csharp`, `ruby`도 백업 키 규칙에 맞는다.
- 제출 채우기(`isKnownLanguageId`), 신고 링크, 팝업·모의 시험 결과의 언어 이름, 도움말, 실행 차이 신고 양식이 새 언어를 포함한다.
- 방화벽 검사는 언어와 관계없이 코드 문자열을 본다. 새 시작 코드가 걸리지 않는지 테스트한다.

## 결과

- 브라우저에서 실행하는 언어가 5개에서 11개로, 제출할 수 있는 언어가 17개로 는다. 새 런타임은 넣지 않았다.
- 확장 크기는 sucrase와 legacy-modes만큼 는다: 설치 크기 약 +290KB(샌드박스 +204KB, 에디터 +45KB, 라이선스 고지 등), zip 약 +70KB (38.35MB → 38.42MB, 2026-11-24 측정).
- 제출만 되는 언어는 예제를 미리 돌려 볼 수 없다. 사용자 요청이 많으면 언어별 엔진(예: Ruby의 ruby.wasm, Go의 TinyGo)을 따로 검토한다.
- C++14·C++20, C99·C11은 저장 코드를 공유하므로 표준만 바꿔 다시 실행할 수 있다.
