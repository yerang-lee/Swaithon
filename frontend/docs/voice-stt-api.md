# 음성 분석·추가 입력 및 최종 실행 연동 명세

사용자가 제공한 analyze/analyze-audio/answer/answer-audio 명세를 반영한 프론트 기준입니다. 아래 execution_endpoint 추가와 최종 실행 응답은 기존 프론트 실행 계약을 유지하기 위한 **백엔드 구현 요청안**이며, 운영 서버 구현 완료를 의미하지 않습니다.

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
| audio_file | File | Body | O | 음성 파일 |

`Content-Type: multipart/form-data`. 파일 필드는 audio_file이며 boundary는 업로드 라이브러리가 지정합니다.

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
| audio_file | File | Body | O | 추가 답변 음성 |

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
