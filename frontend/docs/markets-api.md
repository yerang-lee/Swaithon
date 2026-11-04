# 주변 시장 API

사용자 상세 명세: GET `/markets/nearby`.
Query: latitude, longitude (필수 Float), radius (Integer, 미터, 기본 5000), limit (Integer, 기본 10).
응답 200: `{ markets: [{ market_id, market_name, address, latitude, longitude, distance, image_url }] }`. distance는 미터.
400은 위치/반경 오류, 404는 결과 없음, 500은 서버 오류로 처리합니다.

선택 반경을 km에서 m로 변환합니다. 명세 응답을 검증하고 반경 밖 항목과 중복 ID를 제거한 뒤 거리순으로 표시합니다. 위치 변경 시 이전 응답은 무시합니다.
기본 10개로 잘리지 않도록 limit 20부터 시작하고 결과 수가 limit에 도달하면 두 배로 재조회합니다. 10240개까지 도달하면 반경 축소를 요청합니다.
명세에 페이지네이션과 limit 최대값이 없습니다. 서버에 숨은 최대값이 있다면 전체 조회를 보장할 수 없으므로 백엔드와 허용 범위/페이지 규칙을 확인해야 합니다.

서버 주소는 미제공입니다. `frontend/.env`의 EXPO_PUBLIC_API_URL 설정 후 재시작해야 실제 목록을 확인할 수 있습니다. 예시 시장 목록은 제거했습니다.