# 시장 대표 사진

이 폴더의 JPEG와 출처 문서는 서버 배포에 포함하는 정적 자산이다.
개별 사진의 출처·라이선스는 credits.json 및 credits.html을 참고한다.

기존 `uploads/markets`의 사진을 복사했다. uploads는 Git에서 제외되어 새 서버에
대표 사진이 배포되지 않는 문제를 방지한다. URL은 `/uploads/markets/{filename}`을 유지한다.
backend/main.py에서 일반 `/uploads`보다 먼저 전용 정적 경로를 등록한다.
동일 이름의 실제 업로드 파일이 있으면 우선 제공하고, 없으면 이 폴더의 사진을 제공한다.
DB 이미지 URL, API 응답 형식, 상품 업로드 경로는 변경하지 않는다.

검증: 프로젝트 루트에서
`.\backend\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p test_market_images.py`

빈 업로드 폴더에서도 대표 사진 8개와 출처 문서가 HTTP 200으로 제공되는지,
업로드한 사진이 정적 자산보다 우선하는지 검증한다.
