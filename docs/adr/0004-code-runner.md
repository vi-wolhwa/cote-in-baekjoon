# ADR-0004: 코드 실행 엔진

- 상태: 승인 (JavaScript, Python, C++), 제안 (Java)
- 날짜: 2026-11-23
- 관련: PRD R3·R4, 이슈 #4

## 배경

'코드 실행'은 사용자가 쓴 코드를 예제 입력으로 브라우저 안에서 돌려야 한다. 조건은 다음과 같다.

- 무료여야 한다.
- 웹스토어 정책상 원격 코드를 쓸 수 없다. 모든 런타임을 확장 패키지에 넣어야 한다.
- MV3 확장 페이지는 `eval`과 `new Function`을 금지한다.

## 결정: JavaScript (M1)

```
ide.html ──postMessage──▶ sandbox.html (manifest sandbox, iframe)
                              └─ Blob URL Worker ─ 사용자 코드 실행
```

**실행 위치**
- 매니페스트 `sandbox` 페이지는 확장 API가 없는 별도 출처라서 `eval`을 쓸 수 있다.
- 웹스토어 정책도 확장 API와 격리된 샌드박스 iframe 안의 코드 실행은 예외로 둔다.

**워커**
- 샌드박스 안에서 Blob URL 워커를 띄운다.
- 사용자 코드는 `new Function`으로 감싸 실행한다.

**Node 흉내 (백준 JavaScript 코드가 그대로 돌게)**
- `require('fs').readFileSync('/dev/stdin' | 0)`
- `require('readline')`: `line`·`close` 이벤트와 `for await`
- `process.stdin.on('data' | 'end')`
- `process.stdout.write`, `console.log`, `process.exit`

**제한**
- 시간: 제한을 넘으면 `worker.terminate()`로 끊는다. `while(true)`를 멈추는 유일한 방법이다.
- 출력: 1MB를 넘으면 중단하고 '출력 초과'로 표시한다.
- 실행마다 새 워커를 쓴다.

**CSP (샌드박스)**: `script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src blob: 'self'; connect-src 'none'`
- 사용자 코드가 네트워크에 접근하지 못하게 막는다.
- 이 조합이 Chrome, Edge, 웨일에서 동작하는지는 뼈대 작업(#6)에서 검증한다.

## 결정: Python·C++ (M2, 2026-11-24 기술 검증)

**공통 구조** (`src/runner/engine.ts`)
- 샌드박스가 언어별 엔진에 실행을 넘긴다.
- 엔진은 런타임 로딩이나 컴파일을 끝내고 사용자 프로그램을 시작할 때 `onRunStart`를 알린다. 샌드박스는 그때부터 시간 제한을 잰다. 준비 단계는 최대 60초다.
- 엔진은 실행 사이에 데워 둔다. 시간 초과나 중지 때는 엔진을 버리고 다음 실행에서 새로 만든다.
- 런타임은 빌드 때 확장의 `runtime/`에 복사한다(`wxt.config.ts`). 원격 코드는 없다.

**샌드박스 안에서 확장 내부 파일 불러오기**
- 샌드박스 페이지가 만든 **클래식 Blob 워커**에서 `import(runtimeBase + '...')`로 확장 내부 파일을 불러올 수 있다. 모듈 워커는 실패했다.
- 같은 워커에서 외부 네트워크(`https://example.com`)는 막힌다.
- 오버레이(백준 페이지 안) 경로에서도 불러올 수 있도록 `runtime/*`를 `web_accessible_resources`에 넣었다.

| 언어 | 런타임 | 측정 (Edge, 2026-11-24) | 한계 |
|---|---|---|---|
| Python 3, PyPy3 | Pyodide 314.0.7 (MPL-2.0) | 로드 약 1.5초, 실행은 즉시 | 실행은 CPython 기준. PyPy3 제출은 백준에서 PyPy로 채점된다 |
| C++17 | @yowasp/clang 21.1.4-3 (LLVM Apache-2.0 with LLVM exception, 패키지 ISC) + browser_wasi_shim 0.4.2 (MIT/Apache-2.0) | 첫 컴파일 약 3.0초, 이후 약 1.9초(`-O2`, `bits/stdc++.h`) | 예외(`throw`/`try`)는 링크 실패라 지원하지 않는다. `bits/stdc++.h`는 직접 제공한다 |
| Java (M3) | TeaVM 0.13 (Apache-2.0) 후보 | 미측정 | 표준 라이브러리 일부만 지원 |

**제외: CheerpJ** — 무료 등급은 CDN 제공(원격 코드)이다. 패키지에 포함하려면 유료 라이선스가 필요하다.

**용량**
- C++ 컴파일러를 넣으면 확장이 크게 커진다.

  | 구성 | zip | 설치 |
  |---|---|---|
  | JS + Python | 6.9MB | 약 17MB |
  | JS + Python + C++ | 32MB | 약 119MB |

- 웹스토어 정책상 나중에 내려받을 수 없어 확장에 포함해야 한다.
- 제품 책임자가 포함하기로 결정했다(2026-11-24).

## 결과

- 실행 결과는 백준 채점과 다를 수 있다(속도, 메모리, 런타임 버전). 실행 결과 패널에 '브라우저에서 실행한 결과'임을 표시한다.
- 시간 제한은 문제의 시간 제한을 기준으로 여유를 둔다. 기본은 문제 제한의 3배이고, 최대 10초다.
