# ADR-0004: 코드 실행 엔진

- 상태: 승인 (JavaScript), 제안 (Python·C++·Java)
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

## 제안: 다른 언어

| 언어 | 후보 | 크기·속도 | 위험 |
|---|---|---|---|
| Python (M2) | Pyodide 314.0.x (MPL-2.0) | 약 14MB, 첫 실행 4~5초 | 샌드박스 워커에서 wasm 로드 가능 여부. 안 되면 일반 확장 페이지 워커로 실행 (Python은 JS eval이 필요 없음) |
| C++ (M2) | YoWASP clang (LLVM, Apache-2.0) | 약 100MB, 컴파일 수 초 | 용량, `bits/stdc++.h` 미포함(직접 제공), 예외 처리, 스택 크기 |
| Java (M3) | TeaVM 0.13 (Apache-2.0) | 미측정 | 표준 라이브러리 일부만 지원(`Scanner`, `BufferedReader` 확인 필요) |

**제외: CheerpJ** — 무료 등급은 CDN 제공(원격 코드)이다. 패키지에 포함하려면 유료 라이선스가 필요하다.

**용량 전략**: 무거운 런타임은 언어별 선택 다운로드로 나누는 방안을 M2 전에 검토한다. 다운로드 대상은 웹스토어 정책상 확장 패키지 안에 있어야 한다.

## 결과

- 실행 결과는 백준 채점과 다를 수 있다(속도, 메모리, 런타임 버전). 실행 결과 패널에 '브라우저에서 실행한 결과'임을 표시한다.
- 시간 제한은 문제의 시간 제한을 기준으로 여유를 둔다. 기본은 문제 제한의 3배이고, 최대 10초다.
