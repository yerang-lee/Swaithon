# 개발용 5개월 가격 이력

사용자 요청에 따라 그래프 확인을 위해 생성한 합성 데이터다. 실제 과거 거래가격이나 시세가 아니다.
현재 정상 계정 가게의 삭제되지 않은 판매 상품에, 현재 유효 판매가를 기준으로 5개월 전부터
3일 간격의 예시를 추가한다. Listing 가격이나 기존 실제 이력은 변경하지 않는다.
모든 예시 가격은 끝자리가 000 또는 500이 되도록 반올림한다. 마지막 예시 값도 현재 판매가를
500원의 배수로 반올림하므로 실제 현재가와 다를 수 있다. 변동 폭을 500원으로 제한하지 않는다.

```powershell
# 프로젝트 루트, backend/.env의 APP_ENV=development 필수
.\backend\.venv\Scripts\python.exe backend/scripts/seed_demo_price_history.py
.\backend\.venv\Scripts\python.exe backend/scripts/seed_demo_price_history.py --apply
```

첫 명령은 조회만 한다. 두 번째 명령이 DB에 반영한다. 반복 실행 시 이미 생성한 상품은 건너뛴다.
자동 서버 시작·API 조회 시 생성하지 않는다. 운영 DB에 실행하지 않는다.

생성된 행의 PK는 `backend/uploads/demo-price-history.json`에 기록한다. 이 파일은 Git에서 제외된다.
생성 DB와 함께 보존해야 합성 이력 표시와 추후 생성 행만 제거할 때 식별할 수 있다.
가격 이력 API에 선택적 boolean `has_demo_history`를 추가했고 프론트는 true일 때 예시 이력 안내를 표시한다.
기존 price_history 항목 구조는 유지한다. API·문서상 계약 추가는 이 개발 기능 범위다.
서버에서 registry 파일을 읽을 수 없거나 손상되면 고정 진단 코드만 기록한다.
