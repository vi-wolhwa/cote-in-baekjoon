# ADR-0013: 크롬 웹스토어 업로드 자동화

- 상태: 채택
- 날짜: 2026-11-25
- 관련: #88, #206(배포 게이트, #44를 대신함), `docs/ops/maintenance.md` 3장

## 배경

릴리스마다 zip을 개발자 대시보드에 손으로 올리면 빠뜨리거나 다른 zip을 올리기 쉽다. #88은 릴리스 zip을 Chrome Web Store API로 올리는 단계를 만든다. 다만 게시는 제품 책임자 승인(#206) 뒤에만 한다.

Chrome Web Store API v1.1은 2026-10-15에 지원이 끝났고, v2(`chromewebstore.googleapis.com/v2/publishers/{게시자}/items/{확장}`)만 쓸 수 있다. API는 새 항목을 만들지 못하므로 첫 버전은 대시보드에서 올린다.

## 결정

1. **손으로만 실행하는 별도 워크플로**(`.github/workflows/webstore.yml`, `workflow_dispatch`). 릴리스 워크플로에 붙이지 않는다. 릴리스는 수정마다 자주 나오지만 웹스토어 게시는 심사 시간이 걸리고 제품 책임자가 정하는 일이기 때문이다.
2. **GitHub 릴리스의 `*-chrome.zip`을 그대로 올린다.** 다시 빌드하지 않으므로 사용자가 GitHub에서 받는 zip과 웹스토어 zip이 같다.
3. **모드 세 가지**: `draft`(초안만, 기본값), `staged`(심사 통과 뒤 대시보드에서 손으로 게시), `publish`(심사 통과 즉시 게시).
4. **인증은 OAuth 클라이언트 + 갱신 토큰**(`chromewebstore` 범위). 비밀값 `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID`를 `chrome-web-store` 환경에 둔다. 서비스 계정도 v2에서 되지만 JWT 서명 코드가 더 들고 대시보드에 계정을 따로 등록해야 해서 쓰지 않는다.
5. **`chrome-web-store` 환경**에 승인자를 지정하면 실행 전에 한 번 더 승인을 받는다(저장소 설정, 제품 책임자).
6. 스크립트(`scripts/store/webstore.ts`)는 업로드 뒤 상태가 `IN_PROGRESS`이면 5초 간격으로 최대 2분 `fetchStatus`를 확인하고, `SUCCEEDED`가 아니면 실패로 끝낸다. 외부 의존성 없이 Node 24의 `fetch`만 쓴다.

## 결과

- 비밀값이 없으면 워크플로는 빠진 변수 이름을 알리고 실패한다. 자격 증명은 제품 책임자가 준비한다(#88).
- 엣지 애드온은 아직 올리지 않는다. 엣지 Partner Center API로 같은 방식을 붙일 수 있지만 게시 여부는 제품 책임자가 정한다.
