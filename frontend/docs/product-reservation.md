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
