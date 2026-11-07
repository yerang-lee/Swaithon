# 주변 시장 API

사용자 상세 명세: GET `/markets/nearby`.
Query: latitude, longitude (필수 Float), radius (Integer, 미터, 기본 5000), limit (Integer, 기본 10).
응답 200: `{ markets: [{ market_id, market_name, address, latitude, longitude, distance, image_url }] }`. distance는 미터(숫자)입니다. market_id는 Integer | null, image_url은 String | null이며 두 필드는 생략하지 않습니다. 미등록 시장은 market_id=null, 대표 이미지가 없으면 image_url=null을 반환합니다.
400은 위치/반경 오류, 404는 결과 없음, 500은 서버 오류로 처리합니다.

선택 반경을 km에서 m로 변환합니다. 명세 응답을 검증하고 반경 밖 항목과 등록 시장의 중복 ID를 제거한 뒤 거리순으로 표시합니다. market_id=null인 미등록 시장은 같은 ID로 합치지 않고 각 항목을 유지합니다. 위치 변경 시 이전 응답은 무시합니다.
기본 10개로 잘리지 않도록 limit 20부터 시작하고 결과 수가 limit에 도달하면 두 배로 재조회합니다. 10240개까지 도달하면 반경 축소를 요청합니다.
명세에 페이지네이션과 limit 최대값이 없습니다. 서버에 숨은 최대값이 있다면 전체 조회를 보장할 수 없으므로 백엔드와 허용 범위/페이지 규칙을 확인해야 합니다.

서버 주소는 실행 환경별로 설정합니다. `frontend/.env`의 EXPO_PUBLIC_API_URL 설정 후 재시작해야 실제 목록을 확인할 수 있습니다. 예시 시장 목록은 제거했습니다.

주변 시장 선택 시 등록 시장은 내부 market_id로 가게 목록에 이동합니다. 미등록 시장은 등록 안내를 표시하며 null을 경로 ID로 보내거나 이름·카카오 ID로 내부 ID를 추정하지 않습니다. 선택으로 사용자 위치를 변경하지 않습니다. 현재 주변 시장 화면은 이미지를 표시하지 않으므로 image_url=null도 목록 표시와 선택에 영향을 주지 않습니다.

검증: node tests/nearby-markets-api.test.cjs, node tests/market-selection.test.cjs, node tests/market-search-api.test.cjs, npm run typecheck.

## 카카오 시장 이름 검색

사용자 제공 GET /markets/search/kakao?query=... 명세를 적용했습니다. query는 필수 시장 이름/키워드이며 위도·경도·반경 매개변수는 없습니다. 따라서 기존 GET /markets/nearby를 대체하는 현재 위치 기반 조회로 간주하지 않습니다.

시장 찾기 검색창에서 350ms 입력 대기 후 호출하고 입력 변경 시 이전 응답을 무시합니다. 검색어를 지우면 기존 주변 시장 목록으로 돌아갑니다. 400/500/502 및 잘못된 응답을 처리하며, 위치 권한이 없어도 키워드 검색 결과는 볼 수 있습니다. 카카오 REST 키는 백엔드에서 관리하고 프론트에 추가하지 않습니다.

응답 total_count는 카카오 API 원본 전체 개수이며 필터링된 documents 길이와 같다고 가정하지 않습니다. is_end=false라도 다음 페이지 요청 필드가 제공되지 않아 임의의 page를 보내지 않으며 검색어 구체화 안내를 표시합니다.

검색 응답 documents의 필수 필드: place_id(String), market_id(Integer | null), market_name(String), address(String), latitude(Float), longitude(Float), category_name(String), place_url(String). market_id 누락과 잘못된 ID는 응답 오류로 처리합니다.

서버는 카카오 place_id와 DB Market.kakao_place_id를 비교해 등록된 시장의 내부 market_id를 반환하고, 일치하는 시장이 없으면 null을 반환합니다. 시장 이름은 매핑 기준으로 사용하지 않습니다. 프론트는 place_id를 숫자로 변환하거나 이름으로 내부 ID를 추정하지 않습니다. 이 저장소에는 백엔드 코드가 없어 DB 매핑은 서버에서 별도 구현해야 합니다.

검색 결과 선택 시 현재 위치/탐색 위치를 저장하거나 변경하지 않습니다. market_id가 있으면 해당 ID로 시장 가게 목록 화면에 바로 이동하고 GET /markets/{market_id}/stores를 호출합니다. market_id=null이면 미등록 시장임을 알리고 기존 상인 회원가입의 소속 시장 선택·가게 정보 등록 절차를 안내합니다. 시장 생성/재사용은 PATCH /users/me/onboarding에서 kakao_place_id를 기준으로 서버가 처리합니다. 이미 로그인한 사용자를 회원가입 화면으로 강제 이동시키거나 미등록 시장의 가게 API를 호출하지 않습니다.

개발 테스트 모드도 동일 경로의 이름/주소 검색과 등록/미등록 응답을 지원합니다. 검증 명령: node tests/market-search-api.test.cjs.
