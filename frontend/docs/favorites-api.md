# 상품 찜 추가·취소

사용자 제공 상세 명세와 api-spec.csv의 POST /favorites를 사용합니다. 일반 목록은 JSON {listing_id:String}, 추천 요청 ID가 실제로 있는 상세/추천 경로에서만 request_id를 추가합니다. Bearer 토큰은 현재 로그인 세션에서 가져오고 201 응답의 문자열 favorite_id/user_id/listing_id/product_id/store_id와 상품명·가게명·등록 시각·메시지를 검증합니다. listing_id는 응답과 요청의 일치를 확인하며 숫자 ID는 화면에서 문자열로 변환해 전달합니다.

서버 성공 응답 후에만 공유 하트를 선택 상태로 바꿉니다. 같은 상품의 진행 중 요청을 잠그고 실패 시 이전 상태를 유지합니다. 로그아웃/계정 전환 중 도착한 응답은 반영하지 않습니다. 400/401/404/409/500 오류를 안내하며 입력값·토큰·서버 원본 응답을 새 로깅 코드에 넣지 않습니다. 추천 행동 이벤트는 서버 책임이며 클라이언트에서 별도 이벤트를 만들어 전송하지 않습니다.

홈 예시 상품과 명시적인 미리보기 상품은 실제 서버에 보내지 않고 기존 미리보기 하트만 변경합니다. 실제 추가 응답은 관심상품 탭에 상품명·가게명으로 표시합니다. POST 응답에 없는 가격·사진은 추정하지 않습니다. 이번 범위에는 GET /users/me/favorites 연동이 없으므로 앱 재실행 후 기존 서버 찜 목록 복원은 상세 조회 계약 확인 후 구현해야 합니다.

사용자 제공 DELETE /favorites/{favorite_id} 명세를 연결했습니다. POST 응답에 저장된 favorite_id를 URL 인코딩해 경로로 사용하고 Bearer 헤더만 보내며 요청 본문은 보내지 않습니다. 200 응답의 favorite_id/listing_id가 취소 대상과 일치하고 message가 문자열인지 확인한 뒤에만 하트와 관심상품 탭 항목을 제거합니다. 실패 또는 응답 불일치는 기존 선택 상태를 유지합니다. 중복 클릭 방지와 계정 전환 응답 무시는 추가·취소에 공통 적용합니다. 401/403/404/500은 구분해서 안내합니다.

상품 목록·상품 상세·픽업 시간 선택 화면·관심상품 탭에서 같은 상태와 취소 함수를 사용합니다. recommendation FAVORITE_CANCEL 이벤트와 기존 request_id 연결은 서버가 처리하며 클라이언트는 이벤트·request_id·user_id를 DELETE 요청에 추가하지 않습니다. GET /users/me/favorites의 상세 명세가 아직 없어 이전 세션에서 저장한 찜 목록 복원은 이번 범위에 포함하지 않습니다.

테스트 모드는 서버 없이 로그인 세션별 추가/중복을 모의 처리합니다. 정상 추가·오류·추천 요청 ID·중복 클릭·계정 전환은 테스트로 확인하며 실제 서버 저장과 추천 이벤트 기록은 연결 환경에서 확인해야 합니다.

검증: node tests/favorites-api.test.cjs, node tests/favorites-state.test.cjs, node tests/auth-mode.test.cjs, npm run typecheck.
