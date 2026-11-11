# 음성 분석·추가 입력 및 최종 실행 연동 명세

사용자가 제공한 analyze/analyze-audio/answer/answer-audio 명세를 반영한 프론트 기준입니다. 아래 execution_endpoint 추가와 최종 실행 응답은 기존 프론트 실행 계약을 유지하기 위한 **백엔드 구현 요청안**이며, 운영 서버 구현 완료를 의미하지 않습니다.

업로드 필드 참고: 사용자의 최신 지시에 따라 확인된 백엔드 api.py의 file: UploadFile = File(...)과 일치하도록 analyze-audio/answer-audio 파일 키를 file로 맞췄습니다. 앞서 받은 audio_file 명세와 다른 부분이므로 실제 서버 구현을 우선한 연동 수정입니다.

## 음성 명령 분석(텍스트)

`POST /voice/analyze`

### Request

`Content-Type: application/json`, 상인 Bearer 인증을 사용합니다.

| 필드 | 타입 | 위치 | 필수 | 설명 |
| --- | --- | --- | --- | --- |
| text | String | Body | O | 분석할 명령 텍스트 |

```json
{
  "text": "사과 한 봉지에 만 원으로 등록해 줘."
}
```

### Response — 200 OK

아래 음성 파일 분석과 같은 READY/NEEDS_INPUT·analysis_result·확인·추가 질문 구조를 사용합니다. READY는 분석 완료이며 상품 반영 완료가 아닙니다. SALE_UPDATE를 포함한 각 의도에 따라 analysis_result 필드가 달라질 수 있습니다. 실행 경로 추가 제안은 아래 공통 응답 절을 참고합니다.

오류: 400 요청/필수 입력, 401 인증, 403 상인 권한, 422 의도 분석 실패, 500 서버 오류.

## 음성 파일 분석(STT)

`POST /voice/analyze-audio`

녹음 파일을 STT와 AI로 분석합니다. 실제 상품·할인·재고를 변경하지 않습니다.

### Request

| 필드 | 타입 | 위치 | 필수 | 설명 |
| --- | --- | --- | --- | --- |
| Authorization | Bearer Token | Header | O | 상인 인증 토큰 |
| file | File | Body | O | 음성 파일 |

`Content-Type: multipart/form-data`. 파일 필드는 file이며 boundary는 업로드 라이브러리가 지정합니다.

### Response — 200 OK

```json
{
  "command_id": "command_003",
  "intent": "PRODUCT_CREATE",
  "status": "READY",
  "transcript": "사과 한 봉지에 만 원으로 등록해 줘.",
  "analysis_result": {
    "product_name": "사과",
    "price": 10000,
    "unit": "한 봉지",
    "category": "FRUIT",
    "category_name": "과일"
  },
  "missing_fields": [],
  "needs_confirmation": true,
  "execution_endpoint": "/voice/product-registration",
  "expires_at": "2026-11-10T01:15:00Z",
  "message": "분석이 완료되었습니다. 확인 후 반영해 주세요."
}
```

예시 시각은 형식 설명용입니다. 서버는 실제 발급 시각 기준 유효한 expires_at을 반환합니다.

추가 입력이 필요하면 status=NEEDS_INPUT, needs_confirmation=false, execution_endpoint=null 및 비어 있지 않은 missing_fields·question을 반환합니다. 분석 결과의 미확정 값은 null을 유지합니다. 음성 인식 실패 시 분석을 진행하지 않습니다.

오류: 400 요청/파일 형식, 401 인증, 403 상인 권한, 413 파일 크기, 422 인식/분석 실패, 500 서버 오류.

## 추가 정보 텍스트 입력

`POST /voice/commands/{command_id}/answer`

### Request

| 필드 | 타입 | 위치 | 필수 | 설명 |
| --- | --- | --- | --- | --- |
| Authorization | Bearer Token | Header | O | 상인 인증 토큰 |
| command_id | String | Path | O | 기존 명령 ID |
| answer | String | Body | O | 추가 답변 |

`Content-Type: application/json`

```json
{
  "answer": "한 봉지에 만 원이에요."
}
```

### Response — 200 OK

기존 command_id를 유지합니다. 완료 시 READY·needs_confirmation=true·missing_fields=[]·analysis_result·execution_endpoint를 반환합니다. 미완료 시 NEEDS_INPUT·needs_confirmation=false·missing_fields·question·execution_endpoint=null을 반환합니다. transcript는 응답에 있을 때 표시합니다.

expires_at은 최초 분석에서 필수이며 추가 답변 응답에서는 생략할 수 있습니다. 생략하면 기존 만료 시각을 유지하고, 응답으로 기한을 임의 연장하지 않습니다.

오류: 400 빈 답변/요청, 401 인증, 403 소유권, 404 명령 없음, 409 완료/취소 명령, 410 만료, 422 답변 분석 실패, 500 서버 오류.

## 추가 정보 음성 입력(STT)

`POST /voice/commands/{command_id}/answer-audio`

### Request

| 필드 | 타입 | 위치 | 필수 | 설명 |
| --- | --- | --- | --- | --- |
| Authorization | Bearer Token | Header | O | 상인 인증 토큰 |
| command_id | String | Path | O | 기존 명령 ID |
| file | File | Body | O | 추가 답변 음성 |

`Content-Type: multipart/form-data`

### Response — 200 OK

텍스트 추가 입력과 같은 상태·분석 결과 규칙을 사용합니다. transcript는 이번 음성의 STT 결과이며 기존 command_id를 유지합니다. 분석 단계에서 실제 상품을 변경하지 않습니다.

오류: 400 요청/파일 형식, 401 인증, 403 소유권, 404 명령 없음, 409 완료/취소, 410 만료, 413 파일 크기, 422 인식/분석 실패, 500 서버 오류.

## 공통 응답 추가 필드 — 백엔드 구현 요청

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| execution_endpoint | String / Null | O | READY이면 확인 후 실행할 상대 경로, NEEDS_INPUT이면 null |

SALE_UPDATE의 실행 주소는 별도 명세가 필요하며, 프론트에서 새 주소를 추측하지 않습니다.

서버가 최종 의도와 대상 검증을 마친 뒤 아래 허용 경로 중 실제 실행 경로를 반환합니다. 프론트는 intent로 경로를 추측하지 않습니다.

| intent | execution_endpoint |
| --- | --- |
| PRODUCT_CREATE | /voice/product-registration |
| PRODUCT_UPDATE | /voice/product-update |
| SALE_CREATE | /voice/sale-registration |
| PRODUCT_DELETE | /voice/product-delete |
| SOLD_OUT | /voice/sold-out |
| SALE_DELETE | /voice/sale-delete |

서버가 READY를 반환해도 execution_endpoint가 없으면 분석 결과만 표시하고 최종 실행은 막습니다. 해당 메타데이터가 실제 서버에 추가되기 전에는 완료 화면으로 전환하지 않습니다.

## 사용자 확인 후 최종 실행 — 기존 실행 계약 유지, 서버 구현 확인 필요

`POST {execution_endpoint}`

### Request

| 필드 | 타입 | 위치 | 필수 | 설명 |
| --- | --- | --- | --- | --- |
| Authorization | Bearer Token | Header | O | 상인 인증 토큰 |
| command_id | String | Body | O | 확인한 기존 명령 ID |
| confirmed | Boolean | Body | O | 명시적 확인 true |

`Content-Type: application/json`

```json
{
  "command_id": "command_003",
  "confirmed": true
}
```

### Response — 200 OK

```json
{
  "command_id": "command_003",
  "intent": "PRODUCT_CREATE",
  "status": "SUCCEEDED",
  "execution_endpoint": null,
  "result": {
    "listing_id": 101,
    "product_id": 1,
    "store_id": 1,
    "product_name": "사과",
    "sale_quantity": 1,
    "sale_unit": "한 봉지",
    "price": 10000,
    "effective_price": 10000,
    "sale_active": false
  },
  "message": "상품이 등록되었습니다."
}
```

### 처리 규칙

1. 서버는 명령 소유권·유효시간·확인 상태·대상 가게·최종 의도와 경로 일치를 검증합니다.
2. 상품 변경은 사용자 확인 후 이 실행 요청에서만 수행합니다. STT·분석·추가 답변은 데이터 변경을 하지 않습니다.
3. SUCCEEDED 응답을 받은 후에만 프론트가 완료 화면과 상품 목록 갱신을 수행합니다.
4. 같은 명령 재전송은 중복 상품 생성/중복 할인을 만들지 않도록 서버가 처리해야 합니다.
5. 네트워크 오류·서버 오류로 성공 여부가 불분명하면 프론트는 같은 command_id와 경로만 재확인하며 새 명령을 자동 생성하지 않습니다.
6. 확정 가격·할인 표시는 서버 result의 effective_price·sale_active를 사용합니다. 분석 READY의 기본 가격은 새 명세 analysis_result.price로 표시합니다.
7. 할인 기간을 요구하지 않고 기간·종료 시각·카운트다운을 표시하지 않으며 서버 시간 데이터는 보존합니다.
8. 할인 종료에 따른 가격 이력 저장은 최종 반영 단계의 서버 책임입니다.

최종 실행 오류/멱등성의 세부 서버 구현과 라우트는 백엔드 확인 대상입니다. 위 문서는 프론트가 기존 허용 경로·요청 본문을 유지하기 위한 연동 요청안입니다.


## 최신 실행 서버 연동 변경

사용자 확인에 따라 최초 녹음 분석은 `POST /voice/product-registration`으로 전송하며 multipart 파일 키는 `audio_file`을 사용합니다. 앞선 최초 `/voice/analyze-audio`·`file` 설명을 대체합니다. m4a 녹음은 `audio/mp4` MIME을 유지합니다. 추가 음성 답변은 기존 `/voice/commands/{command_id}/answer-audio`와 `file` 필드를 유지합니다.

최초 multipart 요청은 분석 전용이며 `SUCCEEDED`를 성공 분석으로 수용하지 않습니다. 사용자 확인 후 JSON `{command_id, confirmed:true}`를 보내는 최종 실행은 기존 서버 `execution_endpoint` 계약을 유지합니다. 동일 주소라도 multipart 분석과 JSON 최종 실행은 구분합니다. 응답 형식은 현재 command_id 기반 검증을 유지하며 analysis_id 응답을 임의 변환하지 않습니다.


## command_id 기반 통일

메인 음성 화면은 `command_id`만 사용합니다. `/voice/product-registration`의 최초 녹음은 `audio_file` multipart로 보내며 `analysis_id` 응답은 더 이상 등록/취소/실행 분기로 처리하지 않습니다. 서버에 저장된 command_id를 그대로 반환해야 하며 ID 이름만 변경하여 호환시키지 않습니다.

확인된 엔진 응답의 `parsed`를 화면용 `analysis_result`로 읽습니다. `NEEDS_INPUT`에서는 `question`이 없으면 `message`를 질문으로 표시하고, `transcript`가 없으면 `messages`의 텍스트를 표시합니다. 명시적인 `needs_confirmation`이 없으면 READY/NEEDS_CONFIRMATION에서만 확인 대상으로 표시합니다. 서버 만료 시각과 할인 시간 데이터는 보존합니다. 기존 analysis_result 기반 응답도 같은 command_id 계약으로 지원합니다.

추가 답변은 기존 command_id의 answer/answer-audio로 보내고, 취소는 command_id의 cancel을 사용합니다. 최종 확인은 서버 execution_endpoint에 `{command_id, confirmed:true}`를 보내며 SUCCEEDED 이후에만 완료를 표시합니다. 실행 주소는 추측하지 않습니다. 메인 화면에서 `/voice/analysis/{analysis_id}/apply` 및 analysis_id 취소 API를 호출하지 않습니다.


## 상품 등록 확정 주소 수정

백엔드 확인에 따라 상품 등록 확정은 `POST /voice/product-registration/confirm`을 사용합니다. 요청 본문은 기존 command_id 기반 `{command_id, confirmed:true}`를 유지합니다. 상품 등록 의도의 과거 실행 주소 `/voice/product-registration` 또는 미전달 주소는 이 확인된 등록 확정 주소로 연결하며, 다른 외부/불일치 주소는 허용하지 않습니다.

NEEDS_INPUT은 추가 질문, NEEDS_SELECTION은 후보 선택, NEEDS_CONFIRMATION은 미리보기 후 사용자 확정으로 처리합니다. 이 세 단계의 분석/추가 입력만으로 확정 요청을 전송하지 않습니다. READY 호환 응답도 사용자 확인을 기다립니다. 미완성 필드가 남거나 needs_confirmation=false이면 확정하지 않습니다. SUCCEEDED 이후에만 완료를 표시합니다.

사용하지 않는 analysis_id 호환 서비스에서도 실제 서버 `/voice/analysis/{id}/apply` 호출은 제거했습니다. 오래된 분석 결과는 다시 녹음하도록 안내하며 analysis_id를 command_id로 바꿔 전송하지 않습니다. 테스트 모드의 상품 등록 실행도 새 confirm 경로를 사용합니다.


## 현재 백엔드 registration_response 형식에 맞춘 경계 변환

사용자 요청에 따라 현재 실행 백엔드의 응답 변환 방식에 프론트를 맞춥니다. 공유된 `backend/voice/jangboso_voice/api.py`의 `registration_response()`는 `analysis_id = result["command_id"]`로 같은 명령 식별자를 반환하는 것이 확인됐습니다. 최초 `/voice/product-registration` multipart 응답에 한해서 이 검증된 alias를 내부 command_id로 읽으며, 최상위 상품 필드를 화면용 analysis_result로 정리합니다. 이 절이 앞선 analysis_id 응답 일괄 거부 지침을 대체합니다. 두 식별자가 동시에 있고 값이 다르면 거부합니다.

READY는 분석 결과와 사용자 확인 버튼을 표시하고, NEEDS_INPUT은 message를 질문으로 사용합니다. 추가 텍스트/음성은 같은 명령 ID의 기존 answer/answer-audio 경로로 보냅니다. 실행 서버 OpenAPI와 AnswerRequest 확인 결과 텍스트 본문은 `{text: "답변"}`이며 2,000자 이내입니다. 후보 선택의 listing_id는 문자열로 전송합니다. 파일 키는 최초 audio_file, 추가 음성 file입니다.

확정은 POST /voice/product-registration/confirm에 `{command_id: 최초 analysis_id와 같은 값, confirmed:true}`를 보내고 SUCCEEDED 후에만 완료를 표시합니다. /voice/analysis/{id}/apply를 재도입하지 않습니다. 카테고리·판매 단위·가격·만료 데이터는 서버 값 그대로 사용합니다.

현재 백엔드 wrapper는 후보 목록을 반환하지 않습니다. NEEDS_SELECTION에 candidates가 없으면 실제 상품 후보를 복원할 수 없으므로 명확한 오류로 처리하고 상품을 추측하거나 자동 확정하지 않습니다. 후보가 제공되는 command_id 응답은 기존 선택 화면을 사용합니다.
