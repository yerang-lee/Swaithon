# 프론트 전달 사항 — 연결 계약 제안

실제 로그인 Bearer 토큰은 기존 인증 흐름 사용. store_id/user_id는 음성 요청으로 보내지 않습니다.
현재 demo 토큰은 개발 PC에서만 사용하며 운영 로그인과 다릅니다.

## 앱 흐름

1. 녹음 시작/중지 (마이크 권한 필요). 최대 30초, 10MB.
2. POST /voice/analyze-audio에 multipart file 업로드.
3. transcript와 명령 상태 표시. 전송 실패 시 성공 표시 금지.
4. NEEDS_INPUT: message를 표시하고 텍스트/숫자는 answer, 녹음은 기존 command_id의 answer-audio API로 전송.
5. NEEDS_SELECTION: candidates에서 상품명·수량·단위·가격 표시 → listing_id로 answer API.
6. NEEDS_CONFIRMATION: preview.before/after 비교 → 취소 / 확인 버튼.
7. 확인 시 응답의 execution_endpoint로 `{command_id, confirmed:true}` 전송.
8. SUCCEEDED 후 상품 목록 재조회. CANCELLED는 변경 없음.

제품 삭제는 '유지하기 / 삭제하기' 버튼. 음성의 '네'를 바로 삭제 실행으로 연결하지 않습니다.
등록처럼 말했어도 기존 상품이 있으면 응답 intent가 PRODUCT_UPDATE일 수 있습니다.
실행 경로는 **서버의 execution_endpoint**를 사용하세요. 아래 표는 최종 intent와 경로의 대응 참고용입니다.

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
추가 음성 답변은 POST /voice/commands/{command_id}/answer-audio에 multipart file로 전송하세요. 새 analyze-audio 요청을 만들지 말고 기존 command_id를 유지합니다.
실기기에서 localhost는 휴대폰 자신이므로 팀 서버 주소가 필요합니다. 데모 서버를 무인증 공개하지 마세요.


분석 응답의 `execution_endpoint`는 최종 작업에 맞는 실행 API입니다. NEEDS_CONFIRMATION일 때 이 주소로 command_id와 confirmed를 보내세요. 다른 상태에서는 null입니다. parsed.intent는 최초 추출값이므로 실행 경로 선택에 사용하지 마세요.


## 담당자 구현 순서와 완료 기준

이 문서와 BACKEND_HANDOFF.md를 기준으로 연결합니다. 코드에 구현된 추가 음성 경로와 필드는
아직 기존 api-spec.csv의 확정 상세 명세가 아니므로 백엔드와 합의 후 앱에 반영하세요.
현재 데모 성공이 실제 로그인·PostgreSQL·휴대폰 연결 완료를 의미하지 않습니다.

### 1. 서버 주소와 실제 로그인 준비

백엔드 담당자에게 개발 서버 URL, 상인 계정, 상점 연결 상태, 상품 ID 필드,
최신 OpenAPI 및 상태별 예시 응답을 받으세요. 실제 로그인 access_token을 모든 음성 요청에 전달합니다.
`Authorization: Bearer <access_token>` 형식이며 VOICE_DEMO_TOKEN은 앱의 운영 인증으로 쓰지 않습니다.
토큰이나 Gemini 키를 소스에 고정하지 말고 기존 로그인 세션 처리를 재사용하세요.
휴대폰의 localhost/127.0.0.1은 휴대폰 자신이므로 개발 PC의 주소로 사용할 수 없습니다.
Expo 웹도 지원한다면 백엔드와 웹 origin의 CORS 설정도 합의하세요.

### 2. 녹음 버튼과 업로드

1. 마이크 권한을 요청하고 거부 시 설정 안내 또는 텍스트 입력을 제공합니다.
2. '녹음 시작 → 녹음 중 → 종료 → 분석 중'을 구분합니다.
3. 30초·10MB 이내로 제한하고 빈 녹음을 보내지 않습니다.
4. 허용 확장자는 wav/mp3/m4a/webm/mp4/ogg입니다. 실제 파일과 일치하는 확장자·MIME을 보냅니다.
5. FormData의 `file` 필드에 녹음 파일을 넣고 access_token을 헤더에 전달합니다.
6. multipart Content-Type의 boundary는 전송 라이브러리가 만들게 하세요.
7. 응답을 받으면 transcript를 표시하고 잘못 인식된 금액·수량을 사용자가 확인할 수 있게 합니다.

React Native의 파일 객체(uri/name/type)와 웹 Blob 방식은 다를 수 있으므로
현재 Expo SDK의 녹음 라이브러리 반환값에 맞춰 구현하고 Android/iOS 실기기로 확인하세요.

완료 기준: 휴대폰 녹음이 서버에 전달되고 transcript가 화면에 표시됩니다.

### 3. 최초 입력과 추가 답변 구분

|상황|요청|ID 처리|
|---|---|---|
|새 작업 음성|POST /voice/analyze-audio, multipart file|응답의 새 command_id 저장|
|새 작업 텍스트|POST /voice/analyze, JSON text|응답의 새 command_id 저장|
|추가 질문에 음성 답변|POST /voice/commands/{command_id}/answer-audio, multipart file|저장한 기존 ID 유지|
|추가 질문에 텍스트 답변|POST /voice/commands/{command_id}/answer, JSON text|기존 ID 유지|
|상품 후보 선택|동일 answer API, JSON listing_id|기존 ID 유지|
|취소|POST /voice/commands/{command_id}/cancel|기존 초안 종료|

추가 질문 화면의 녹음 버튼은 **answer-audio**로 연결하세요.
이 화면에서 analyze-audio를 다시 호출하면 '6천 원'만 포함한 별개 명령이 만들어집니다.
앱 상태에는 현재 command_id/status/preview/execution_endpoint를 보관하고 응답마다 갱신합니다.
한 초안의 녹음·답변·확인 요청을 동시에 보내지 않도록 버튼을 잠그세요.
화면을 떠날 때는 진행 중 명령을 취소하거나, 돌아왔을 때 만료/상태를 처리하는 정책을 정하세요.

### 4. 응답 상태별 화면과 동작

|status|화면|다음 동작|
|---|---|---|
|NEEDS_INPUT|message 질문 + 텍스트/숫자 입력 + 녹음 버튼|answer 또는 answer-audio|
|NEEDS_SELECTION|candidates의 상품명·판매 수량·단위·가격 선택 목록|선택한 listing_id로 answer; 임의 첫 후보 선택 금지|
|NEEDS_CONFIRMATION|preview.before/after 비교 + 확인/취소 버튼|execution_endpoint로 실행 또는 cancel|
|SUCCEEDED|변경 성공 안내 또는 조회 결과|변경 작업이면 상품 목록 재조회, 현재 초안 정리|
|CANCELLED|변경하지 않았다는 안내|현재 초안 정리|

NEEDS_INPUT/NEEDS_SELECTION에서는 실행 버튼을 제공하지 않습니다.
조회 PRODUCT_DETAIL의 SUCCEEDED는 수정 성공이 아니라 조회 완료입니다.
NEEDS_CONFIRMATION 상태가 아닌데 execution_endpoint가 없다고 임의 경로를 만들지 마세요.
execution_endpoint는 합의된 서버 내 음성 실행 경로 목록에 있는지 확인하고 같은 백엔드 주소로 요청합니다.

### 5. 후속 음성 예시 전체 흐름

1. '사과 가격 바꿔' 녹음 → analyze-audio.
2. 응답: command_id=cmd-example, status=NEEDS_INPUT, message='가격을 얼마로 할까요?'.
3. 앱에 질문 표시 → 상인이 '6천 원' 녹음.
4. POST /voice/commands/cmd-example/answer-audio에 두 번째 파일 전송.
5. 응답의 같은 command_id, transcript='6천 원', preview.after.price=6000 확인.
6. NEEDS_CONFIRMATION이면 before/after 비교 화면 표시.
7. 사용자가 확인 버튼을 누르면 execution_endpoint에 아래 JSON 전송.

```json
{"command_id":"cmd-example","confirmed":true}
```

8. SUCCEEDED를 받은 뒤 목록을 새로 조회합니다. 확인 전에는 등록/수정 성공으로 표시하지 않습니다.

텍스트 답변은 `{"text":"6천 원"}`, 후보 선택은 `{"listing_id":"선택한 ID"}`로 answer에 보냅니다.
후속 음성 역시 추가 정보가 부족하면 다시 NEEDS_INPUT이 올 수 있으므로 질문 화면을 반복 지원하세요.
현재 명령 만료는 최초 생성 후 10분이고 추가 답변이 시간을 연장하지 않습니다.
'네'라는 음성은 실행 승인이 아닙니다. 최종 확인은 버튼으로 진행합니다.
숫자만으로 후보 ID를 추측하는 동작은 구현하지 말고 후보 선택 버튼을 우선 사용하세요.

### 6. 실패와 재시도 화면

기존 오류 목록에 더해, 응답 detail은 `{code,message}` 객체 또는 문자열/검증 오류 배열일 수 있으므로
한 가지 형태로만 읽지 말고 공통 오류 안내를 준비하세요. 내부 오류 원문을 그대로 사용자에게 표시하지 않습니다.
401은 로그인 갱신 흐름, 403은 권한 안내이며 모두 재로그인으로 해결되는 것은 아닙니다.
WRONG_ENDPOINT는 최근 execution_endpoint를 확인하고, EXPIRED/STALE_COMMAND/STALE_PRODUCT는
이전 확인을 자동 재사용하지 말고 새로 분석/확인하도록 안내합니다.
실행 결과를 못 받았을 때는 동일 command_id와 동일 실행 API로 재시도합니다.
답변 요청은 revision이 바뀔 수 있으므로 실패 원인 확인 없이 자동 연속 재전송하지 마세요.
서버에 초안 조회 API가 아직 없으므로 앱 재시작/응답 유실 시 복원 방식은 백엔드와 별도 합의가 필요합니다.

### 7. 실기기 완료 기준

실제 로그인, 마이크 권한 거부, 녹음 취소, 업로드 실패, 최초/후속 녹음,
동명 상품 선택, 금액 확인, 삭제 취소, 중복 클릭 방지, 명령 만료,
실행 응답 유실 후 동일 명령 재시도, 상품 목록/소비자 품절 반영을 확인하세요.
기능 구현 후 백엔드·AI 담당자와 COMMAND_CASES.md의 사례를 함께 테스트합니다.


## 변경 정책: 할인 종료 시간 미표시·선택 입력 (2026-11-06)

- 상인이 기간을 말하지 않아도 필수 입력이나 '몇 시까지 할인할까요?' 질문을 만들지 않습니다.
- sale_ends_at=null이 정상입니다. 할인값과 상품이 정해졌다면 NEEDS_CONFIRMATION을 표시합니다.
- 기간을 말한 경우에도 상인 확인 화면·상품 상세·소비자 카드에 종료 시간/기간/카운트다운을 표시하지 않습니다.
- preview의 sale.ends_at, parsed.sale_ends_at, sale_end_expression이 응답에 있어도 기간 UI는 렌더링하지 않습니다. 원문 transcript에는 발화 자체로 시간이 들어 있을 수 있으며 별도 기간 표시는 하지 않습니다.
- 화면에 숨긴다고 응답의 시간 값을 null로 덮어쓰거나 실행 payload를 재구성하지 마세요. 기존대로 command_id, confirmed만 전송합니다.
- 할인가 종료/복원 계산은 백엔드가 담당합니다. 앱은 서버의 effective_price와 sale_active를 사용합니다. 화면 새로고침/재진입 시 재조회하며 켜 둔 화면의 최신화 주기는 백엔드와 합의합니다.
- 기간 미언급과 달리, 말한 시각이 모호하거나 과거인 경우에는 서버의 재확인 안내를 처리합니다. '3시'의 오전/오후를 앱에서 임의로 정하지 않습니다.
- 추가 음성 답변의 answer-audio 연결 및 최종 확인 버튼은 변경 없습니다.


## 할인 가격 필드명 변경: sale_price

- 기존 discount_price를 sale_price로 변경했습니다. 음성 parsed JSON, Gemini 스키마, 백엔드 상품 응답/입력/모델이 해당합니다.
- 할인율 discount_rate는 그대로입니다. 비율 할인은 sale_price=null로 추출하고 계산 규칙을 유지합니다.
- 음성 로컬 데모의 내부 sale.price, 기본가 price, 최종 표시가 effective_price는 기존 구조를 유지합니다.
- 프론트는 API의 sale_price를 사용합니다. 새 요청에 discount_price를 보내지 마세요.
- 백엔드는 기존 listings 열이 discount_price라면 서버 재시작 전에 backend/migrations/20261106_rename_sale_price.sql을 개발 DB부터 검증 후 적용해야 합니다. 실제 DB에는 아직 실행하지 않았습니다.
- 신규 DB는 변경된 모델로 sale_price 열을 생성합니다. create_all만으로 기존 열 이름이 변경되지는 않습니다.
- 이전에 저장된 로컬 명령과 백엔드 분석 JSON은 읽을 때 이전 키를 새 키로 대응하여 금액이 누락되지 않도록 했습니다. 기존 분석 이력 JSON 자체를 일괄 변경한 것은 아닙니다.
