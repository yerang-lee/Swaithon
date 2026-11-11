# 상품 이미지 API

- `POST /images`: 인증된 상인이 `multipart/form-data`로 `image_file`을 전송함. `listing_id`는 선택 정수이며 미전달 시 FormData에서 생략함. Content-Type boundary는 전송 구현에서 생성함.
- `uploadProductImage(photo, listingId?)`는 HTTP 200 또는 201의 `image_id`, `listing_id`, `image_url`, `file_name`, `uploaded_at`, `message`를 검증하여 반환함.
- 상품 연결 전 업로드 응답의 `listing_id`는 null이어야 함. 연결 업로드는 요청과 응답의 정수 listing_id가 일치해야 함.
- 기존 음성 등록/수정 화면은 최종 실행 성공 후 반환된 `listing_id`로 사진을 업로드함. 음성 명령 result.listing_id의 숫자 문자열은 양의 안전한 정수로 변환함. 이전 분석 화면은 listing_id 제공 여부가 미확정이므로 ID가 없으면 업로드를 중단하고 안내함. 분석 단계에서는 실제 상품을 생성하거나 사진을 연결하지 않음.
- `DELETE /images/{image_id}`: 인증 토큰과 정수 이미지 ID로 삭제하며 본문을 보내지 않음. HTTP 200의 `image_id`, `message`를 확인함. 409는 대표 이미지 등 삭제 불가로 안내함.
- 상품 상세 응답에서 기존 이미지 ID를 조회하는 계약이 없으므로 기존 이미지 삭제 UI는 추가하지 않음. 업로드 반환 ID를 보관한 호출부에서 삭제 함수를 사용할 수 있음.
- 테스트 모드에서는 업로드 결과와 이미지 ID를 메모리에 보관하고 삭제 시 해당 기록을 제거함. 실제 서버 파일은 변경하지 않음.

## 변경된 업로드 명세

- 전달받은 Swagger 명세의 HTTP 200과 현재 백엔드 구현의 HTTP 201을 모두 허용함. listing_id는 listings의 판매 상품 ID이며 products의 product_id를 대신 보내지 않음.
- 상대 image_url은 API 서버 origin과 결합하여 반환함. 예: https://host/api + /uploads/images/a.png → https://host/uploads/images/a.png. 절대 URL은 유지함.
- 업로드 오류: 400 요청, 401 인증, 403 권한, 404 판매 상품 없음, 413 용량, 415 형식, 500 서버 오류. 형식과 용량 기준은 서버 검증을 따름.
- 인증은 기존 상인 세션 처리를 유지함. 이번 명세가 새 인증 방식을 확정하는 것은 아님. 삭제 API는 변경하지 않음.
- 응답 검증 실패 시 IMAGE_RESPONSE 진단에 고정 필드명과 실패 유형만 기록함. 예: listing_id/invalid(누락·null·잘못된 타입), listing_id/mismatch(요청 ID와 불일치), uploaded_at/invalid. 원본 응답·파일명·URL·토큰·ID 값은 기록하지 않음.
