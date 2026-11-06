# 백엔드 전달 사항 — 연결 계약 제안

## 기존 코드에서 확인한 것

`backend/dependencies.py:get_current_user`는 JWT를 검증하고 User를 반환합니다.
현재 모델에는 User.role/store_name이 있지만 상점 소유권 테이블, 상품/가격 이력 테이블은 없습니다.
store_name을 store_id로 사용하거나 클라이언트 store_id를 신뢰하면 안 됩니다.
음성 모듈은 실제 백엔드 인증·상품 모델과 아직 연결되지 않았습니다. 아래 모델 상태는 인수인계 작성 시점의 확인 결과이므로 연결 전에 최신 코드를 확인하세요.

## 엔드포인트

frontend/docs/api-spec.csv를 기준으로 기존 경로·메서드를 유지합니다.
- GET /products, /products/{product_id}: 기존 상품 담당자가 구현. product_id와 내부 listing_id 매핑 합의 필요.
- POST /voice/product-registration: PRODUCT_CREATE
- POST /voice/product-update: PRODUCT_UPDATE 또는 SALE_CREATE (사용자 요청 호환)
- POST /voice/product-delete: PRODUCT_DELETE
- POST /voice/sold-out: SOLD_OUT
- POST /voice/sale-registration, /voice/sale-update: SALE_CREATE (기존 CSV 호환)
- POST /voice/sale-delete: SALE_DELETE

아래 경로와 **모든 요청·응답 필드는 아직 팀 합의가 필요한 추가 제안**입니다.
- POST /voice/analyze: JSON `{text}`
- POST /voice/analyze-audio: multipart `file`
- POST /voice/commands/{command_id}/answer: JSON `{text?, listing_id?}`
- POST /voice/commands/{command_id}/answer-audio: multipart `file` (기존 명령에 후속 녹음 연결)
- POST /voice/commands/{command_id}/cancel
- 실행 경로 공통 JSON `{command_id, confirmed:true}`

## 실제 FastAPI 연결

프로젝트 루트가 Python import 경로에 있으면 `voice.jangboso_voice.api`로 import 가능합니다.
voice 폴더를 import 경로로 추가하면 `jangboso_voice.api`를 사용합니다.

```python
from fastapi import Depends, HTTPException
from dependencies import get_current_user
from voice.jangboso_voice.api import Merchant, build_router

def verified_merchant(user=Depends(get_current_user)):
    # TODO: 실제 role 문자열을 확인하고, 활성 상점 소유권을 DB에서 조회.
    # TODO: 여러 상점이면 사용자가 선택한 상점의 소유권을 매 요청 검증.
    # return Merchant(str(user.user_id), str(verified_store.store_id))
    raise HTTPException(503, '상점 소유권 연동 전입니다.')

# TODO: PostgreSQL 저장소 어댑터를 연결한 VoiceService 생성.
# app.include_router(build_router(service, verified_merchant, WhisperSTT()))
```

보안상 미연동 상태에서 통과시키는 임시 인증은 제공하지 않습니다.
DB 접근 실패·권한 상실 시 실행을 거부해야 합니다.

## PostgreSQL 어댑터 구현 조건

현재 SQLiteStore의 transaction()은 `{products, commands, events}` 상태를 잠그고 함께 저장하는 데모입니다.
운영 DB는 이 JSON 한 덩어리 저장 방식을 그대로 쓰지 말고 아래 테이블을 기존 모델과 매핑하세요.

|테이블|필수 정보|
|---|---|
|stores / store_members|상점 ID, 사용자 소유권, 활성 상태|
|listings|ID, 상점 ID, 상품명, 판매 수량(NUMERIC), 단위, 기본가(INTEGER), 재고, 상태, version, deleted_at|
|sales|대상 ID, 할인 방식(rate/fixed), 값, 시작/종료 TIMESTAMPTZ|
|voice_commands|명령 ID, 사용자/상점, 추출값, 확정 상품 ID, 상태, 만료, 버전|
|product_events / price_history|명령 ID, 변경 전후, 실행자, 시각, 판매 단위|

필수 보장:
1. 상품 변경 + 가격 이력 + 명령 성공 저장은 한 트랜잭션.
2. command_id 실행 중복은 유니크 키/행 잠금으로 방지. 상품은 SELECT FOR UPDATE 또는 version 조건 갱신.
3. 신규 상품 중복 판단과 생성도 같은 잠금 범위. 다른 상품 API도 version 증가.
4. 삭제·품절·상점 권한은 실행 시 재검증.
5. 숫자/단위/상품명을 정규화하고 단위가 다른 상품을 동일 묶음으로 오인하지 않음.
6. 일반 상품 API와 음성 API가 동일 상품 서비스/트랜잭션 정책을 사용.
7. 사용자 원음/대화 보관 기간 합의. 현재 데모는 텍스트 이력을 DB에 보관, 업로드 파일은 처리 후 삭제.

## 소비자 화면·예약 연결

- 소비자 목록: deleted_at IS NULL AND status = ACTIVE 필터.
- 품절·삭제 직전에 예약 생성이 경합해도 신규 예약이 생기지 않도록 동일 상태 잠금.
- 기존 예약을 자동 취소할지는 미합의. 이 모듈은 예약을 변경하지 않음.
- 할인 활성 여부는 ends_at > 현재 시각으로 판단. 만료 작업 지연 중에도 정상 가격 반환.
- 할인 변경과 기본가 변경 이력을 구분. 단위 환산이 확인되지 않은 상품은 가격 평균에서 혼합하지 않음.
- 업로드 크기/속도 제한을 프록시에도 설정. STT 동시 실행 제한, 사용자별 요청 제한 필요.

## 합의가 필요한 사항

상점 소유권 모델, role 값, listing_id/product_id 매핑, 가격 상한(현재 1억 원),
허용 단위(현재 kg/g/개/봉지/상자/팩/단/마리/근), 10분 명령 만료, 고정 할인 가격 충돌 정책,
같은 상품이지만 품종·등급이 다른 경우의 식별, 기존 예약 처리, PostgreSQL 마이그레이션.


## 추가 음성 답변 API (팀 명세 반영 필요)
POST /voice/commands/{command_id}/answer-audio, multipart file. 최초 분석과 같은 로그인 인증·30초/10MB 제한. 기존 명령 소유권/만료/답변 가능 상태를 STT 전에 확인하고 완료 후 revision을 재확인합니다. 응답 transcript는 이번 답변 전사이며 command_id는 그대로입니다. NEEDS_CONFIRMATION까지 도달해도 DB 변경은 별도 확인 요청으로만 실행합니다.


## 담당자 실행 순서와 완료 기준

이 문서와 `FRONTEND_HANDOFF.md`를 기준으로 연결 작업을 진행할 수 있습니다.
현재 구현 위치는 `voice/jangboso_voice`이며 실제 상품 저장·인증을 포함한 운영 배포 완료 상태는 아닙니다.
기존 CSV의 경로/메서드는 유지하고 추가 음성 API·필드·인증 상세는 팀이 합의하여 명세에 반영하세요.

### 1. 실제 로그인과 상점 권한 연결

1. 기존 `get_current_user`로 로그인 access_token을 검증합니다.
2. 실제 DB의 상인 role 값과 상점 소유권/관리자 관계를 확정합니다.
3. 활성 사용자이며 상인인지 확인하고, 관리 가능한 활성 상점을 DB에서 조회합니다.
4. `verified_merchant`에서 검증된 ID로 `Merchant(str(user.user_id), str(store.store_id))`를 반환합니다.
5. 여러 상점을 관리한다면 선택 상점 전달 방식을 별도로 합의하고, 선택값의 소유권을 서버에서 검증합니다.
6. 분석·추가 답변·취소·최종 실행 모든 요청에 이 인증 의존성을 적용합니다.

요청 헤더는 `Authorization: Bearer <실제 로그인 access_token>`입니다.
VOICE_DEMO_TOKEN, demo-user, demo-store는 실제 서비스 인증으로 사용하지 않습니다.
상점명으로 소유권을 판별하거나 클라이언트의 user_id/store_id를 그대로 신뢰하지 않습니다.
미로그인은 401, 로그인했지만 상점 권한이 없는 경우는 403으로 처리하는 계약을 권장합니다.
명령 ID 접근은 명령을 만든 사용자·상점과 일치해야 합니다.

완료 기준: 상인 A가 본인 상점 작업은 가능하고, 상인 B의 상품/명령에는 접근할 수 없습니다.
분석 이후 권한이 회수되어도 최종 실행이 거절되어야 합니다.

### 2. PostgreSQL 상품 서비스와 저장소 구현

**SQLite 연결 문자열만 PostgreSQL 주소로 바꾸면 전환되는 구조가 아닙니다.**
현재 engine은 products/commands/events 딕셔너리와 SQLiteStore.transaction()을 사용합니다.
백엔드는 위 테이블 설계에 맞춰 상품 조회/명령 저장/변경 적용 인터페이스를 분리하거나
실제 상품 서비스에 engine 규칙을 이식해야 합니다. 현재 상태 전체를 JSON 한 행으로 저장하는 데모 방식은
운영 저장소 구현 예제로 간주하지 마세요.

1. listing_id/product_id 대응, 판매 수량과 재고 단위, 할인 방식, soft delete 필드를 확정합니다.
2. 기존 데이터를 보존하는 스키마 마이그레이션을 작성하고 개발 DB에 적용합니다.
3. 상품 후보 조회는 본인 상점과 삭제되지 않은 상품으로 제한합니다.
4. 음성/일반 상품 수정이 동일한 상품 서비스와 version 증가 규칙을 사용하게 합니다.
5. 명령 초안과 대화 이력, 확정 상품, revision, 만료 시각을 저장합니다.
6. 실행 시 상품 잠금/버전을 확인하고 상품·가격 이력·명령 성공을 한 트랜잭션으로 저장합니다.
7. 같은 command_id를 재실행하면 저장된 결과를 반환하고 변경을 반복하지 않습니다.
8. 실패 중간 저장, 중복 생성 경합, 서버 재시작을 실제 PostgreSQL에서 검증합니다.

완료 기준: 음성 수정 결과가 PostgreSQL과 기존 GET 상품 API에서 같고, 실패하면 전체 변경이 취소됩니다.
sale_quantity는 판매 묶음 수량이고 stock_quantity는 남은 묶음 수입니다.
가격만 말한 기존 동일 상품·판매 단위는 신규 생성 대신 수정하되 동명 후보가 여러 개면 선택을 요청합니다.

### 3. 기존 FastAPI에 라우터 장착

1. 실제 서버의 의존성에 voice/requirements.txt와 requirements-stt.txt에서 필요한 패키지를 통합합니다.
2. 서버 환경변수에 GEMINI_API_KEY, GEMINI_MODEL, WHISPER_MODEL을 설정합니다. 키는 Git/앱에 넣지 않습니다.
3. FFmpeg 실행과 Whisper 모델 로딩을 서버 계정으로 확인합니다. 모델은 서버에서 재사용합니다.
4. 기존 앱 초기화 위치에서 실제 상품 서비스, GeminiParser, WhisperSTT를 연결합니다.
5. `app.include_router(build_router(service, verified_merchant, stt))`를 등록합니다.
6. 기존 서버와 경로가 중복되면 음성 라우트를 합치고, 일반 상품 GET API는 기존 백엔드를 유지합니다.
7. API 문서에서 실제 Bearer 인증과 텍스트 분석부터 확인한 뒤 녹음 업로드를 시험합니다.

`demo.py:create_app` 전체를 운영 서버에 붙이지 않습니다. 해당 앱은 테스트 토큰과 SQLite를 사용합니다.
기존 backend의 실행 위치와 Python import 경로를 확인해 패키지 import를 통일하세요.
위 예제의 미연결 503 코드는 실제 소유권 조회를 작성한 뒤 교체해야 합니다.

완료 기준: 실제 로그인 토큰으로 기존 백엔드 주소의 음성 API를 호출하고 기존 상품 목록에서 결과를 조회합니다.

### 4. 후속 녹음 처리와 프론트 계약

최초: POST /voice/analyze-audio → 새 command_id.
후속: POST /voice/commands/{동일 command_id}/answer-audio → 기존 대화에 STT 텍스트 추가.
텍스트 답변/후보 선택: POST /voice/commands/{동일 command_id}/answer.

answer-audio는 NEEDS_INPUT 또는 NEEDS_SELECTION인 초안에만 허용됩니다.
만료는 최초 생성 후 10분이며 후속 답변이 만료 시간을 늘리지는 않습니다.
STT 전에 소유권/상태를 검사하고 STT 이후 revision 변경 및 만료를 다시 검사합니다.
확인 단계에서 말한 '네'로 바로 실행하지 않습니다. 삭제를 포함한 모든 변경은 확인 버튼의 실행 API가 담당합니다.

`parsed.intent`는 최초 해석, 최상위 `intent`는 상품 조회 후 최종 작업입니다.
`execution_endpoint`는 NEEDS_CONFIRMATION일 때만 실행 경로를 제공하며 다른 상태에서는 null입니다.
기존 상품으로 판별된 등록 발화는 PRODUCT_UPDATE로 바뀔 수 있습니다.
프론트가 parsed.intent로 경로를 고르지 않도록 execution_endpoint를 반환하세요.

### 5. 프론트 담당자에게 넘길 결과물

- 휴대폰에서 접속 가능한 개발 서버 기본 URL과 최신 OpenAPI/요청·응답 명세.
- 개발용 상인 A/B 계정과 각 상점·상품 준비 방법 (실제 사용자 비밀번호 공유 금지).
- 상품 ID 대응, 실제 role 값, 로그인 토큰 사용/만료 처리 계약.
- NEEDS_INPUT, NEEDS_SELECTION, NEEDS_CONFIRMATION, SUCCEEDED, CANCELLED 예시 응답.
- 추가 경로/필드에 대한 팀 합의 내용과 오류 응답 형식.

### 6. 통합 테스트 완료 조건

상인 A/B 권한 격리, 신규 등록, 동일 상품 가격 수정, 후속 음성 답변, 동명 상품 선택,
취소 시 무변경, 삭제 표시, 품절 노출 제외, 할인 유지/만료, 중복 클릭,
상품 동시 수정, 통신 재시도, 서버 재시작, 실패 트랜잭션 복구를 실제 DB와 앱에서 확인합니다.
실제 로그인·PostgreSQL·앱 연결 테스트와 로컬 데모 자동 테스트 결과를 구분해서 기록하세요.
