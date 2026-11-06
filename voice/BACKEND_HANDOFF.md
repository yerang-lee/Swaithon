# 백엔드 전달 사항 — 연결 계약 제안

## 기존 코드에서 확인한 것

`backend/dependencies.py:get_current_user`는 JWT를 검증하고 User를 반환합니다.
현재 모델에는 User.role/store_name이 있지만 상점 소유권 테이블, 상품/가격 이력 테이블은 없습니다.
store_name을 store_id로 사용하거나 클라이언트 store_id를 신뢰하면 안 됩니다.
기존 파일은 이번 작업에서 변경하지 않았습니다.

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
