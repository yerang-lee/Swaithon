# 관심상품 API 및 목록 화면

## 추가·취소

사용자 제공 상세 명세와 api-spec.csv의 POST /favorites를 사용합니다. 일반 목록은 JSON {listing_id:String}, 추천 요청 ID가 실제로 있는 경우에만 request_id를 추가합니다. Bearer 토큰은 현재 로그인 세션에서 가져오고 201 응답의 문자열 favorite_id/user_id/listing_id/product_id/store_id와 상품명·가게명·등록 시각·메시지를 검증합니다. 응답 listing_id는 요청과 일치해야 합니다.

DELETE /favorites/{favorite_id}는 저장된 favorite_id를 URL 인코딩하고 Bearer 헤더만 보내며 요청 본문은 보내지 않습니다. 200 응답의 favorite_id/listing_id가 대상과 일치해야 하며 message는 문자열입니다. 성공 후 공유 하트 상태를 갱신하고 실패 시 유지합니다. 상품별 요청 잠금과 계정 전환·오래된 응답 차단을 적용합니다. 401/403/404/500 오류를 안내합니다. FAVORITE/FAVORITE_CANCEL 이벤트 및 request_id 연결은 서버 책임이며 클라이언트가 별도 이벤트를 보내지 않습니다.

## GET /users/me/favorites

Bearer 인증과 page/size(기본 1/10)로 조회합니다. 문자열 favorite_id/listing_id/product_id/store_id/market_id, 상품·가게·시장명, 양의 정수 category_id, category/category_name, 정수 price, 정수 또는 null sale_price, Boolean is_sold_out/is_on_sale, 문자열 또는 null image_url, DateTime created_at 및 total_count/page/size를 사용자 명세대로 검증합니다. 400/401/500 오류를 안내합니다. 목록에는 POST 응답의 user_id/message가 없으므로 별도 FavoriteListing 타입을 사용합니다.

검색 파라미터가 없는 명세에 맞춰 모든 페이지를 조회한 뒤 상품명으로 검색합니다. page/size만 전송하며 임의 keyword를 보내지 않습니다. listing_id 중복 제거와 다음 페이지 무진행 검사를 적용하고 화면 이탈 시 추가 조회를 중단합니다.

## 화면과 재진입

홈의 관심상품 탭은 FavoritesScreen을 사용합니다. 예약 화면과 같은 PageHeader(관심상품)/BottomNavigation/SafeAreaView, 시장 상품 검색과 같은 검색창 스타일을 사용합니다. 상품 이미지, 상품명, 가게명 · 시장명 · 거리, 가격, 하트를 표시합니다. 할인일 때 원가와 sale_price를 가로로 표시하며 null/이미지 실패는 기본 이미지 영역을 표시합니다.

찜 목록 API에는 거리가 없어 저장 탐색 위치로 주변 시장을 한 번 조회해 내부 market_id를 정확히 비교합니다. 앞선 합의대로 가게·상품에 소속 시장 거리를 표시하며 접두사는 쓰지 않습니다. ID 접두사 제거·이름 비교로 매핑하지 않습니다. 일치하는 시장 거리가 없으면 해당 거리만 생략하고 가게명 · 시장명은 유지합니다. 상세 이동은 listing_id와 확인된 거리만 전달합니다.

취소 성공 시 공유 하트를 비우지만 현재 방문의 행 데이터는 유지합니다. 빈 하트를 다시 누르면 새 favorite_id로 재등록 가능합니다. 다른 탭·상세 화면에 갔다 돌아오면 서버 목록을 다시 조회하므로 취소한 항목이 제외됩니다. 재진입 시 진행 중 추가·취소가 끝나기를 기다려 오래된 서버 목록으로 하트를 되돌리지 않으며, 계정/변경 버전이 다른 조회 결과도 동기화하지 않습니다.

홈 추천 상품은 실제 추천 응답의 listing_id와 request_id로 서버 찜 API를 호출합니다. 새 관심상품 화면에는 서버 GET 목록만 표시합니다. 테스트 모드도 GET 페이지 조회와 취소 제외를 모의 처리하며 실제 저장·추천 이벤트 기록은 서버 연결 환경에서 확인해야 합니다. 오류 로깅에는 입력값·토큰·파일·원본 응답을 넣지 않습니다.

검증: node tests/favorites-list-api.test.cjs, node tests/favorites-screen.test.cjs, node tests/favorites-api.test.cjs, node tests/favorites-state.test.cjs, node tests/favorites-cancel-client.test.cjs, npm run typecheck.
