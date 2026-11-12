# 관심상품·예약 사진

GET /users/me/favorites의 기존 image_url은 판매 게시물 사진(Listing.image_url)을 우선 사용하고,
없을 때 표준 상품 사진(Product.image_url)을 사용한다.

사용자 요청에 따라 GET /users/me/reservations에 선택적 image_url(String | null)을 추가했다.
기존 listing_id와 함께 상품 사진을 연결한다. 이전 서버의 image_url 생략 응답도 허용한다.
예약 상세 API 계약은 변경하지 않고 목록 사진을 재사용하거나 상품 상세에서 보충한다.

두 화면은 공통 ListingImage로 상대 주소를 API 서버 주소로 해석하고,
사진 주소 누락·로드 실패 시 해당 listing_id의 기존 상품 상세 API로 사진을 보충한다.
사진이 등록되지 않은 상품에 다른 상품·가게의 사진을 대신 표시하지 않는다.
헤더·SafeAreaView·키보드·예약 버튼·확인 모달 구조는 유지한다.
