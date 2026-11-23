# teavm-javac (Java 실행 엔진 런타임)

Java '코드 실행'(#63, ADR-0004)에 쓰는 브라우저용 Java 컴파일러다. OpenJDK javac와 TeaVM을 Wasm GC로 묶은 [konsoletyper/teavm-javac](https://github.com/konsoletyper/teavm-javac)의 빌드 결과물이다. npm이나 Maven으로 배포되지 않아 저장소에 넣었다. 빌드할 때 `runtime/teavm/`으로 복사된다(`wxt.config.ts`).

## 출처

- 2026-11-24에 TeaVM 플레이그라운드의 빌드(`https://teavm.org/playground/4/`)에서 받았다. 빌드에 버전 표시가 없다. 당시 teavm-javac는 TeaVM 0.17.0을 쓴다.
- 소스로 직접 빌드하는 작업은 GitHub Actions 워크플로(`build-teavm-javac.yml`)로 따로 진행한다.

| 파일 | 내용 | 수정 |
|---|---|---|
| `compiler.wasm` | javac + TeaVM 컴파일러 | 없음 |
| `compiler.wasm-runtime.js` | TeaVM Wasm GC 런타임(컴파일러와 컴파일된 풀이 모두 이것으로 로드) | 없음 |
| `compile-classlib-teavm.bin` | javac가 보는 표준 라이브러리 | `java.util.Scanner`, `java.util.InputMismatchException` 추가 |
| `runtime-classlib-teavm.bin` | TeaVM 클래스 라이브러리 | 위와 같음 |

받은 원본의 SHA-256:

```
f266a67498ca3ac190be2c447e509ca132494feac5061c4c7e8ddc8fc12c6cbd  compiler.wasm
82975b5e1ee8b97e563974b7906578892a12b1d6c9d7666b93e808884c7ecf91  compiler.wasm-runtime.js
b97852e0294463ad1ab4854391b92d74bed421e8af34e024c9ee803d385a73c9  compile-classlib-teavm.bin
9527cbab986c4f87cd64eb9eeaa73b44aa035484548103a4df18cea172e8138b  runtime-classlib-teavm.bin
```

수정 후의 값은 `SHA256SUMS`에 있다.

## 클래스 라이브러리 수정 다시 하기

TeaVM의 클래스 라이브러리에는 `java.util.Scanner`가 없다. `scripts/teavm-classlib/java/util/`의 소스를 번들 컴파일러로 컴파일해 두 아카이브에 넣는다.

```
node scripts/teavm-classlib/build.ts
```

- 이미 수정한 아카이브에 다시 돌려도 같은 결과가 나온다(같은 이름의 항목을 바꾼다).
- 끝나면 `SHA256SUMS`를 다시 쓴다.
- 새 teavm-javac 빌드로 바꿀 때는 네 파일을 덮어쓰고 이 스크립트를 돌린다.

## 라이선스

- TeaVM, teavm-javac, TeaVM 클래스 라이브러리: Apache-2.0
- `compiler.wasm` 안의 OpenJDK javac: GPL-2.0-only WITH Classpath-exception-2.0
- 고지문은 `scripts/third-party-notices.ts`와 `third_party/licenses/`에 있다.
