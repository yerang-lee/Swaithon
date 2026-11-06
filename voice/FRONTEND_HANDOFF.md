# 프론트 전달 사항 — 연결 계약 제안

실제 로그인 Bearer 토큰은 기존 인증 흐름 사용. store_id/user_id는 음성 요청으로 보내지 않습니다.
현재 demo 토큰은 개발 PC에서만 사용하며 운영 로그인과 다릅니다.

## 앱 흐름

1. 녹음 시작/중지 (마이크 권한 필요). 최대 30초, 10MB.
2. POST /voice/analyze-audio에 multipart file 업로드.
3. transcript와 명령 상태 표시. 전송 실패 시 성공 표시 금지.
4. NEEDS_INPUT: message를 표시하고 텍스트/숫자 답변 → answer API.
5. NEEDS_SELECTION: candidates에서 상품명·수량·단위·가격 표시 → listing_id로 answer API.
6. NEEDS_CONFIRMATION: preview.before/after 비교 → 취소 / 확인 버튼.
7. 확인 시 intent에 해당하는 실행 API로 `{command_id, confirmed:true}`.
8. SUCCEEDED 후 상품 목록 재조회. CANCELLED는 변경 없음.

제품 삭제는 '유지하기 / 삭제하기' 버튼. 음성의 '네'를 바로 삭제 실행으로 연결하지 않습니다.
등록처럼 말했어도 기존 상품이 있으면 응답 intent가 PRODUCT_UPDATE일 수 있습니다.
항상 **서버의 최종 intent**로 실행 경로를 선택하세요.

|intent|권장 실행 경로|
|---|---|
|PRODUCT_CREATE|/voice/product-registration|
|PRODUCT_UPDATE|/voice/product-update|
|SALE_CREATE|/voice/sale-registration|
|PRODUCT_DELETE|/voice/product-delete|
|SOLD_OUT|/voice/sold-out|
|SALE_DELETE|/voice/sale-delete|

조회 PRODUCT_DETAIL은 분석 단계에서 SUCCEEDED/result를 반환하므로 실행 버튼 불필요.
현재 부정/취소 발화 결과는 CANCELLED. 초안 화면 취소는 cancel API 사용.

## 오류와 재요청

- 401/403: 재로그인/상인 권한 안내.
- 404: 접근할 수 없는 명령/상품.
- 409: 만료·동시 수정·확인 누락. 새 발화로 다시 분석하고 확인.
- 413: 파일 크기 초과. 422: 잘못된 입력/선택/음성.
- 503: Gemini/STT 사용 불가. 다시 시도 또는 텍스트 입력 제공.
- 실행 응답이 끊기면 **동일 command_id**로 재요청. 새 분석으로 중복 등록하지 않음.
- 확인 버튼 중복 클릭을 막고, 처리 중 상태 표시.

## 주의할 데이터 의미

sale_quantity는 판매 묶음 수량. stock_quantity는 남은 묶음 수.
예: 사과 10개 5천 원, 재고 8묶음 → sale_quantity=10, sale_unit=개, stock_quantity=8.
preview/result의 effective_price는 할인 적용가. price는 기본가.
sale_active=false면 만료된 할인 표시를 하지 않음.
API 키와 DB 주소는 앱에 넣지 않습니다. Gemini는 서버에서만 호출합니다.

## 아직 연결되지 않은 부분

실제 녹음 버튼/마이크 권한 UI, 실제 로그인 토큰, 상품 화면 갱신은 프론트 담당자의 연결 작업입니다.
추가 음성 답변용 전용 STT API는 아직 없습니다. v1에서는 answer의 text 입력을 사용하세요.
실기기에서 localhost는 휴대폰 자신이므로 팀 서버 주소가 필요합니다. 데모 서버를 무인증 공개하지 마세요.


분석 응답의 `execution_endpoint`는 최종 작업에 맞는 실행 API입니다. NEEDS_CONFIRMATION일 때 이 주소로 command_id와 confirmed를 보내세요. 다른 상태에서는 null입니다. parsed.intent는 최초 추출값이므로 실행 경로 선택에 사용하지 마세요.
