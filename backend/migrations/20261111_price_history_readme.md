# 가격 이력 저장·조회 통일

`GET /products/{listing_id}/price-history`는 음성 서비스가 저장하는
`listing_price_histories`를 읽습니다. recorded_at, history_id 순으로 정렬하고
기존 응답 필드와 현재 판매가 계산을 유지합니다. 프론트 API나 그래프 UI는 변경하지 않습니다.

배포 DB의 `price_histories`에 별도로 보존할 기록이 있다면
`20261111_backfill_listing_price_histories.sql`을 먼저 실행한 뒤 백엔드를 배포·재시작합니다.
동일한 listing_id/price/recorded_at 기록은 중복 복사하지 않고 원본 테이블은 유지합니다.
이번 코드 작업에서는 실제 DB 조회·SQL 실행·배포를 하지 않았습니다.

검증:

- 루트: `python -m unittest discover -s backend/tests -p test_price_history_route.py`
- frontend: `node tests/price-history-api.test.cjs`

백엔드 테스트는 실제 라우트 함수를 추출해 가짜 ORM 세션으로 실행합니다.
실제 PostgreSQL·마이그레이션 검증은 배포 환경에서 수행해야 합니다.
