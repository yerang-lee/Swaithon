# 상품 상세 및 예약 API

사용자 제공 상세 명세를 적용했습니다.
상품 상세: GET /products/{listing_id}, 문자열 판매 게시물 ID. 기본/세일 가격, 설명, 이미지, 품절 상태를 표시합니다. 400/404/500 오류를 처리합니다.
홈은 아직 예시 상품 목록이라 문자열 ID를 유지합니다. 해당 상품 상세는 미리보기로 표시하고 서버 예약은 보내지 않습니다. 실제 가게 상품 목록의 listing_id로 이동합니다. 상세 요청에서 숫자로 변환하지 않고 URL 인코딩합니다. 관심 상태도 listing_id로 구분합니다.

예약: POST /reservations, Bearer JWT, JSON { product_id, quantity, pickup_at, request_note? }.
수량은 양의 정수, 수령 시간은 미래의 30분 단위입니다. POST 중 중복 제출을 막습니다. 400/401/404/409/422/500 오류를 처리하며 성공 응답을 받은 후에만 예약 완료를 표시합니다. 네트워크 오류/잘못된 성공 응답은 예약 처리 여부가 불명확하므로 재시도 전 내역 확인을 안내합니다. 자동 재시도하지 않습니다.
201 응답: reservation_id, user_id, product_id, product_name, store_id, store_name, quantity, unit_price, total_price, pickup_at, request_note, status, created_at, message.

pickup_at 예시에 시간대가 없으므로 현재는 한국 시간(Asia/Seoul)으로 변환한 YYYY-MM-DDTHH:mm:ss 문자열을 전송합니다. 백엔드에서 KST로 해석하는지 반드시 확인해야 합니다. 서버는 영업시간/재고/마감 시각을 최종 검증해야 합니다.
로그인 토큰은 현재 실행 중 메모리 세션에만 있습니다. 만료/앱 재시작 시 다시 로그인해야 합니다. 토큰 재발급 경로는 미제공입니다.
서버 주소가 아직 없어 실제 서버 테스트는 미실시입니다.

가격 이력 API 제안은 price-history-api-proposal.md를 참고하세요. 아직 존재하는 API로 간주하지 않습니다.
수령 시간 UI: 오늘만 선택하며, 현재 시각 이후의 다음 정각/30분부터 당일 23:30까지 표시합니다. 휠은 3줄, 가운데 글자 22입니다. 수량 입력은 제거하고 quantity=1, 요청사항은 생략합니다. 바텀 시트에는 날짜·시간 휠·관심·예약 버튼만 표시합니다.
상품 상세 최신 응답 본문은 미제공이므로 listing_id 일치와 기존 표시 필드를 검증하는 임시 호환 방식입니다. product_id/store_id/market_id는 문자열 또는 양의 정수를 허용하며 서버 상세 명세 확인이 필요합니다. 기존 예약 API의 정수 product_id 명세는 변경하지 않았습니다. 문자열 product_id 응답의 상품은 예약 명세 확인 안내를 표시하고 잘못된 예약 요청을 보내지 않습니다.

## 예약 목록·취소 (사용자 제공 상세 명세)

예약 탭은 GET /users/me/reservations?page=1&size=10에 Bearer 토큰을 보내 날짜별 카드로 표시합니다. 전체/예정/완료/취소 필터를 제공합니다. 완료는 status=COMPLETED, 취소는 status=CANCELLED로 서버 필터링합니다. 예정은 여러 상태(PENDING/CONFIRMED/READY)의 OR 필터가 명세에 없어 전체 조회한 페이지에서 해당 상태를 표시하며 더 보기로 다음 페이지를 조회합니다. 날짜는 KST로 표시하며 시간대 없는 pickup_at은 기존 예약 생성 규칙과 동일하게 KST로 해석합니다.

상세 조회 API는 별도 제공되지 않아 사용자가 누른 목록 항목을 상세 화면에 표시합니다. 제품 수량은 quantity개, 가격은 total_price를 사용합니다. 단위 문자열 필드는 없어 봉/묶음 등은 추정하지 않습니다. 가게 위치 보기는 해당 store_id의 가게 상세로 이동합니다.

취소 확인 후 PATCH /reservations/{reservation_id}/cancel을 Bearer 인증으로 본문 없이 전송합니다. 성공 응답의 reservation_id/status/cancelled_at/message를 확인한 후에만 로컬 예약 상태를 CANCELLED로 갱신합니다. 완료·취소 항목은 취소 버튼을 숨깁니다. 취소 가능한 예정 세부 상태는 서버가 최종 판단하며 401/403/404/409/500 오류를 안내합니다. 네트워크/응답 오류는 성공으로 처리하거나 자동 재전송하지 않습니다. 상세는 현재 목록 스냅샷이며 409 발생 시 목록 재조회로 상태를 확인할 수 있습니다.

개발 테스트 모드에는 14개 예시 예약과 상태별 조회·페이지 처리·사용자별 취소 결과가 있습니다. 첨부 달력 SVG는 예약 상세의 픽업 시간 행에 적용했습니다. UI는 SafeAreaView 안에서 헤더/스크롤/하단 버튼/공통 내비게이션을 분리하고 본문과 버튼에 동일한 최대 폭 및 좌우 여백을 사용합니다. 실제 기기와 서버 검증은 별도 필요합니다.

## 상품 목록 ID 최신 호환

GET /products의 사용자 제공 최신 응답은 listing_id=Integer입니다. 라우트/관심 상태는 String으로 변환하며 상세 응답의 listing_id는 양의 정수 또는 기존 문자열을 허용하고 String으로 비교합니다. 기존 문자열 판매 게시물 ID를 Number로 바꾸지 않습니다. 상품 상세의 나머지 필드는 최신 상세 명세가 없어 기존 검증을 유지합니다. 예시 시장에서 조회한 상품은 상세에서도 preview 플래그를 유지해 실제 상품 요청/예약과 혼동하지 않습니다.

## 예약 생성 최신 명세 (이 절이 기존 생성 설명을 대체함)

POST /reservations는 문자열 listing_id/product_id, 양의 정수 quantity, 시간대가 있는 pickup_at 및 선택 request_note/request_id를 보냅니다. 숫자 ID를 받은 경우 String으로 변환하되 listing_/product_ 접두사를 임의로 붙이지 않습니다. pickup_at은 YYYY-MM-DDTHH:mm:ss+09:00으로 전송합니다. user_id/store_id는 보내지 않습니다.

상품 상세의 추천 출처 requestId가 있을 때만 request_id를 전달하며 일반 예약은 생략합니다. 현재 추천 목록 API는 미연결이므로 추천 화면 연결 시 원본 request_id를 상품 상세 라우트의 requestId로 전달해야 합니다. 서버가 예약 성공 후 RESERVATION 행동 이벤트를 기록하므로 프론트는 추가 이벤트 요청을 보내지 않습니다.

201 응답의 문자열 reservation_id/user_id/listing_id/product_id/store_id와 상품명/가게명/가격/픽업 시간/상태/메시지를 검증합니다. 요청 대상과 수량, 픽업 시간이 일치해야 하며 상태는 PENDING입니다. 오류/잘못된 응답/네트워크 실패를 성공으로 처리하거나 자동 재전송하지 않고 내역 확인을 안내합니다. 기존 UI의 수량=1 및 오늘 30분 단위 픽업 선택은 유지합니다.

예약 목록·취소는 기존 상세 명세가 정수 ID였으므로 이번 생성 명세만으로 임의 변경하지 않았습니다. 서버가 목록/취소에도 reservation_501 등의 문자열 ID를 반환/요구한다면 해당 최신 명세 확인이 필요합니다. 개발 예시 상품은 기존처럼 서버 예약을 전송하지 않습니다.
