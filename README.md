# 코딩테스트 in 백준

백준(acmicpc.net) 문제를 기업 코딩테스트와 비슷한 풀이 화면에서 풀 수 있게 해 주는 크롬·엣지 확장 프로그램입니다.

> 백준 온라인 저지(스타트링크)와 관계없는 비공식 프로그램입니다. 최종 채점은 항상 백준에서 이루어집니다.

## 기능

- **한 화면에서 풀기**: 문제 페이지의 "코테 화면으로 풀기"를 누르면 왼쪽에 문제, 오른쪽에 에디터와 실행 결과가 열립니다. sublime·vim·emacs 키맵을 고를 수 있습니다.
- **브라우저에서 바로 실행**: JavaScript, Python 3, C++17, Java 11. 예제와 직접 추가한 테스트 케이스로 실행하고 통과 여부와 차이를 보여 줍니다. 코드는 네트워크가 막힌 격리된 공간에서 실행됩니다.
- **백준으로 제출**: "제출하기"를 누르면 백준 제출 창이 열리고 언어와 코드를 채운 뒤 제출 버튼을 자동으로 누릅니다. 채점 결과는 풀이 화면에 표시됩니다.
- **내 코드는 내 브라우저에**: 문제별 코드와 테스트 케이스를 자동 저장하고, 파일로 백업·복원할 수 있습니다.

> 자동 제출은 백준 이용 규칙에서 금지하는 '자동 제출 도구'에 해당할 수 있습니다. 위험은 사용하는 계정에 있습니다([PRD 8.1](docs/PRD.md)).

## 설치

아직 크롬 웹스토어에는 없습니다. [릴리스](https://github.com/vi-wolhwa/cote-in-baekjoon/releases)에서 내려받아 직접 설치할 수 있습니다.

1. 최신 릴리스의 `cote-in-baekjoon-x.y.z-chrome.zip`(엣지는 `-edge.zip`)을 내려받아 압축을 풉니다.
2. `chrome://extensions`(엣지는 `edge://extensions`)에서 '개발자 모드'를 켭니다.
3. '압축해제된 확장 프로그램을 로드합니다'를 눌러 압축을 푼 폴더를 고릅니다.

## 문제 신고와 제안

[이슈](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/new/choose)에 남겨 주세요. 실행 결과가 백준과 다를 때는 문제 번호와 언어를 함께 알려 주시면 빨리 확인할 수 있습니다.

## 개인정보

개인정보를 수집하지 않고, 운영자 서버로 아무것도 보내지 않습니다. 자세한 내용은 [개인정보처리방침](docs/privacy.md)에 있습니다.

## 개발

Node 24가 필요합니다.

```bash
npm ci
npm run lint && npm run typecheck && npm test   # 린트, 타입, 단위 테스트
npm run build                                   # .output/chrome-mv3
npm run e2e                                     # Playwright (빌드 후)
```

- [기여 안내](.github/CONTRIBUTING.md)
- [제품 요구사항 (PRD)](docs/PRD.md), [로드맵](docs/roadmap.md), [설계 결정 (ADR)](docs/adr/)
- 함께 들어 있는 오픈소스와 라이선스: 도움말 페이지 아래 "오픈소스 라이선스" 또는 `third_party/licenses/`

## 라이선스

[MIT](LICENSE). 확장에 함께 들어 있는 오픈소스(Pyodide, LLVM, TeaVM, OpenJDK javac 등)는 각자의 라이선스를 따릅니다.
