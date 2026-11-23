# Changelog

## [0.2.0](https://github.com/vi-wolhwa/cote-in-baekjoon/compare/v0.1.0...v0.2.0) (2026-11-23)


### 기능

* **boj:** 언어가 백준 목록에 없으면 언어 설정으로 안내, 채점 후 팝업 더 빨리 닫기 ([#62](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/62)) ([8948b3e](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/8948b3e8129dec8a10bdf2e549225fde9d9fc339)), closes [#59](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/59)
* **runner:** C++ 실행 엔진 추가 (YoWASP clang + WASI) ([#57](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/57)) ([66cc606](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/66cc6065641437d7dacde4adf6a051c63f48bdc5)), closes [#51](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/51)
* **runner:** Pyodide로 Python 코드 실행 ([#56](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/56)) ([8b93987](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/8b939871546f452626d78dcac3c06b2b5f5f9b52)), closes [#50](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/50)
* **runner:** 다국어 실행 기반 (언어 선택, 실행 엔진 구조, 런타임 패키징) ([#53](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/53)) ([d1584b0](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/d1584b086214fdf626bc242ddaf8d85b0cb8c088)), closes [#49](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/49)

## 0.1.0 (2026-11-23)


### 기능

* **boj:** 공식 제출 페이지 자동 입력과 채점 결과 전달 ([#25](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/25)) ([56d68d2](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/56d68d2287f89053483aebe25964f0a2ef8ef75e))
* **boj:** 자동 제출 (기본 켜짐) ([#43](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/43)) ([10f4ead](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/10f4ead8a4537eabbb0390706652196a74c54a4f)), closes [#41](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/41) [#44](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/44)
* **boj:** 제출 팝업 창과 채점 결과 보완 확인 ([#38](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/38)) ([7ef9025](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/7ef902524c3f29f11faf6abbc76eb371cd26a405)), closes [#35](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/35)
* **boj:** 채점 중 제출 팝업을 닫지 않도록 안내 ([#48](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/48)) ([34594cd](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/34594cd2f9b3463978188c3ad9bfe84d1f551f9e)), closes [#47](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/47)
* **ui:** 코딩테스트 풀이 화면 구현 ([#26](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/26)) ([69b3a15](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/69b3a1556ea1a7f67857dfc1e69fd85a74d49b3d)), closes [#23](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/23)
* 확장 뼈대와 샌드박스 JavaScript 실행 엔진, CI 구성 ([#10](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/10)) ([5a45ce1](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/5a45ce1ab54f0ca05c37ae59b0f102748d043c6e)), closes [#4](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/4) [#6](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/6)


### 버그 수정

* **boj:** reCAPTCHA v3가 있는 실제 제출 페이지에서 자동 제출되도록 수정 ([#46](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/46)) ([a274a48](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/a274a480dad0d80b73a27db2fb9874f99b25f55b)), closes [#45](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/45)
* **boj:** 채점 결과 확인이 시각 갱신 때문에 계속 미뤄지던 문제 수정 ([#40](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/40)) ([c27742f](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/c27742f929c93bed64edbf14b0785209b0ecd30d)), closes [#39](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/39)
* 사용 테스트 피드백 반영 (수식, 시간 안내, 버튼, 기본 코드, 저장 용량) ([#37](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/37)) ([2c8f799](https://github.com/vi-wolhwa/cote-in-baekjoon/commit/2c8f7999b3c01a99b9536f4c32dcb41c84d8a2b6)), closes [#30](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/30) [#31](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/31) [#32](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/32) [#33](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/33) [#34](https://github.com/vi-wolhwa/cote-in-baekjoon/issues/34)
