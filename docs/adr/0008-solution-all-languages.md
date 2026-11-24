# ADR-0008: 모든 언어에서 solution 함수

- 상태: 승인 (2026-11-24)
- 관련: ADR-0006(solution 함수 모드), ADR-0007(언어 확장 2)

## 배경

ADR-0007에서는 연결 코드 템플릿이 있는 JavaScript, Python, C++, Java에서만 solution 함수를 켰다. C, TypeScript와 제출만 되는 언어(Kotlin, Rust, Go, Swift, C#, Ruby)는 표준 입출력으로만 풀었다. 제품 책임자가 이 언어들에서도 solution 함수로 풀 수 있게 하라고 결정했다(2026-11-24).

## 결정

**언어별 등록제**
- 언어마다 파일 하나(`src/solution/glue/<언어>.ts`)가 `GlueLanguage`를 내보낸다: 앞에 붙는 줄(오류 줄 번호 보정), 사용자 코드 손질(Java의 `public class Solution`), 연결 코드, 시작 코드, 파일 이름.
- `src/solution/glue/index.ts`의 `GLUES`에 등록하고 `src/shared/languages.ts`의 언어에 `glue`를 적으면 solution 함수가 켜진다. 연결 코드는 언어와 관계없이 같은 읽기 계획(`plan.ts`)을 따른다.

**TypeScript**
- JavaScript 연결 코드에 타입을 붙인다(화살표 함수 매개변수와 변수는 `any`).
- `require`와 `BigInt`는 실행 때 `eval`로 찾는다. 선언하면 `@types/node`나 ES2020 lib와 겹치고, 그냥 쓰면 그 타입이 없는 설정에서 컴파일 오류가 나기 때문이다. 이 코드는 백준 제출과 브라우저 실행기(샌드박스) 안에서만 돈다. 확장 자체는 여전히 `eval`을 쓰지 않는다.
- strict 여부, `@types/node` 유무, ES2015·ES2020 lib에서 `tsc`로 컴파일되는지 테스트한다.
- 시작 코드는 타입을 적는다: `function solution(a: number, b: number): number`.

**브라우저에서 실행할 수 없는 언어의 검증**
- 같은 케이스 12개(`tests/native/harness.ts`)를 언어마다 자기 solution으로 풀고, 실제 컴파일러·인터프리터로 컴파일·실행해 출력이 정확히 같은지 본다.
- CI 작업 "네이티브 연결 코드"(`.github/workflows/native-glue.yml`, Ubuntu)가 도구를 설치해 돌린다. 이 컴퓨터에는 도구가 없어 로컬에서는 건너뛴다(`NATIVE_GLUE=1`일 때만 실행).

**언어별 시그니처**: 코딩테스트 사이트의 언어별 관례를 따른다(아래 표는 각 언어 연결 코드의 시작 코드가 기준).

## 결과

- 백준의 모든 언어에서 solution 함수로 풀 수 있다. 제출만 되는 언어는 '코드 실행'이 여전히 꺼지고, 제출할 때 연결 코드가 붙는다.
- 브라우저에서 실행할 수 없는 언어의 연결 코드는 CI의 실제 도구로만 확인한다. 백준의 컴파일러 버전과 다를 수 있다.
