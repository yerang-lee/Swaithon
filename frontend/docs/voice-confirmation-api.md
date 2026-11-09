# 음성 분석 → 확인 → 최종 반영

사용자가 제공한 최신 상세 명세를 적용했습니다. 각 기능은 api-spec.csv의 경로/메서드를 사용합니다.

| 작업 | 분석 API | intent | 추가 파일 필드 |
| --- | --- | --- | --- |
| 신규 등록 | POST /voice/product-registration | PRODUCT_CREATE | 없음 |
| 수정·할인 | POST /voice/product-update | PRODUCT_UPDATE | product_id (Integer) |
| 품절 | POST /voice/sold-out | SOLD_OUT | product_id (Integer) |
| 삭제 | POST /voice/product-delete | PRODUCT_DELETE | product_id (Integer) |
| 할인 종료 | POST /voice/sale-delete | SALE_DELETE | sale_id (Integer) |

모든 분석 요청은 multipart/form-data의 audio_file을 보냅니다. 명세의 00 OK는 200 OK 오기로 해석했습니다. 수정의 기본 가격 변경 예시는 transcript가 없으므로 선택값으로 처리합니다. 등록/수정은 category/category_name 및 missing_fields를 검증하고 null 분류를 허용합니다. 삭제/할인 종료는 이 필드가 없어도 처리합니다. 수정 분석의 price는 기본 가격이며 discount_rate/discount_price는 null 또는 할인 값입니다. 할인 종료의 is_on_sale=false는 적용 예정 상태이며 현재 상품 상태로 간주하지 않습니다.

## 결과 화면

분석 결과는 READY로 보관하고 상품이 바뀌었다고 표시하지 않습니다. 상품명/기본 가격/단위, 할인 정보와 분류를 확인합니다. 등록/수정은 분석 정보 수정하기로 상품명/가격/단위/카테고리 및 할인 값을 수정할 수 있습니다. 카테고리는 사용자 제공 9개 코드 목록(productCategories.ts)으로 선택합니다. 삭제/할인 종료에서는 대상 ID를 수정하거나 다른 상품으로 바꾸지 않습니다.

누락 정보, 유효하지 않은 값과 expires_at 만료를 검증하며, 필요한 정보를 보완하지 않으면 확정 요청을 보내지 않습니다. 화면 타이머와 요청 직전 서버 호출 코드 양쪽에서 만료를 검사합니다. 수정 시 기본 가격과 할인 가격을 따로 보내며 할인 없음은 null을 유지합니다. confirmed_fields Object에 분석 응답과 동일한 할인 필드를 담는 방식이며 서버 지원 여부를 실제 연결로 확인해야 합니다. 분석·반영·취소의 Bearer 인증 사용은 기존 임시 연동 가정으로 명시적 확인이 필요합니다.

## 최종 반영

POST /voice/analysis/{analysis_id}/apply를 사용하며 등록/수정은 JSON { confirmed_fields: { product_name, price, unit?, category, category_name, discount_rate?, discount_price? } }를 보냅니다. 삭제/할인 종료는 수정 필드 없이 빈 JSON Object를 보냅니다. 식별자를 URL 인코딩하고 APPLIED 응답의 analysis_id/intent/product_id/product_name/message를 검증합니다. 기존 상품 작업의 응답 product_id는 분석 대상과 같아야 합니다.

성공 시에만 처리 완료를 표시합니다. 사진을 선택했다면 적용 성공 후 product_id로 POST /images에 연결합니다. 사진 실패 시 적용 성공 결과를 유지하며 사진만 재시도할 수 있고 apply를 재호출하지 않습니다. 400/401/403/404/409/422/500을 안내하며 통신 실패, 잘못된 성공 응답, 409/500 등 처리 여부가 불확실하면 확정 재요청을 잠그고 상품 상태 확인을 안내합니다. 서버가 지원하지 않는 멱등성 헤더나 상태 조회 API를 임의로 추가하지 않습니다.

## 분석 취소

결과 화면의 취소/다시 녹음/뒤로가기는 DELETE /voice/analysis/{analysis_id}를 본문 없이 호출합니다. CANCELLED 응답의 ID/상태/메시지를 확인한 다음 이동하거나 다시 녹음합니다. 취소 실패 시 결과를 유지하고 오류를 표시합니다. 이미 적용된 결과에는 취소 API를 보내지 않습니다. 처리 여부가 불확실한 결과는 나가기를 허용하되 추가 반영/취소를 자동 호출하지 않습니다. Android 뒤로가기도 같은 흐름이며 iOS 결과 화면의 스와이프 닫기는 비활성화해 취소 처리를 건너뛰지 않게 합니다.

## 품절 및 테스트 모드

POST /voice/sold-out도 사용자 제공 새 명세를 적용했습니다. intent=SOLD_OUT, is_sold_out=true는 최종 반영 예정 상태이며 분석 시 실제 품절로 처리하지 않습니다. 대상 product_id 일치를 검증하고 공통 확정/취소/만료 처리로 연결합니다. 응답에 가격/카테고리가 없어도 분석 결과를 표시하며 상품을 삭제하지 않고 유지한다는 안내를 제공합니다. 명세의 00 OK는 200 OK로 해석했습니다.

서버 없는 테스트 모드에서도 분석 ID와 소유 세션을 보관하고 READY/APPLIED/CANCELLED 상태를 구분합니다. 중복 적용/취소, 적용한 분석 취소, 취소한 분석 적용, 다른 세션 접근을 차단합니다. 상품 DB 변경 자체는 모의 처리이며 실제 서버 테스트와 실기기 레이아웃 확인은 별도 필요합니다.

검증: npm run typecheck 및 node tests/voice-api.test.cjs.

## 할인 종료 분석 최신 명세

POST /voice/sale-delete는 multipart/form-data의 sale_id(정수)·audio_file을 전송하고 200 분석 응답을 받습니다. sale_id와 product_id는 서로 다른 식별자로 검증하며 요청 sale_id와 응답 sale_id가 일치해야 합니다. analysis_id, intent=SALE_DELETE, status=READY, transcript, product_name, is_on_sale=false, needs_confirmation=true, expires_at, message를 확인합니다. 가격·카테고리·missing_fields는 이 응답의 필수 필드가 아닙니다. is_on_sale=false는 적용 예정 상태이며 분석만으로 상품 상태를 갱신하지 않습니다. 400/401/403/404/409/422/500 안내를 할인 종료 분석에 맞게 구분합니다. 테스트 분석 응답도 가격을 임의로 채우지 않습니다.

가격 이력은 프론트가 추가하지 않습니다. 최종 반영 시 실제 판매 가격이 바뀐 경우에만 서버가 정상 가격(price)을 기록하고, 동일 가격이면 이력을 생략해야 합니다. 이력 조회는 기존 GET /products/{listing_id}/price-history를 사용합니다.

메인 /voice 화면은 기존 통합 명령(command_id·confirmed JSON) 방식을 유지합니다. 사용자 답변에 따라 서버가 동일 /voice/sale-delete에서 두 요청 방식을 함께 지원하는 전제로 구현합니다. 첨부 명세는 sale_id·audio_file multipart 분석 요청에 적용하며, 통합 명령은 서버가 반환한 execution_endpoint에 JSON 최종 실행 요청을 보냅니다. 둘을 서로 대체하거나 분석 결과를 완료 응답으로 해석하지 않습니다. 실제 서버의 두 Content-Type 지원은 연동 시 확인해야 합니다.
