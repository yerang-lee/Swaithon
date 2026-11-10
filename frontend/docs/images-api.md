# 상품 이미지 API

- `POST /images`: 인증된 상인이 `multipart/form-data`로 `image_file`을 전송함. `product_id`는 선택 정수이며 미전달 시 FormData에서 생략함. Content-Type boundary는 전송 구현에서 생성함.
- `uploadProductImage(photo, productId?)`는 HTTP 201의 `image_id`, `product_id`, `image_url`, `file_name`, `uploaded_at`, `message`를 반환함.
- 상품 연결 전 업로드 응답의 `product_id`는 null 또는 누락을 허용하고 반환값은 null로 정규화함. 해당 값의 정확한 반환 형식은 서버 확인이 필요함.
- 기존 음성 등록/수정 화면은 최종 실행 성공 후 반환된 `product_id`로 사진을 업로드함. 분석 단계에서는 실제 상품을 생성하거나 사진을 연결하지 않음.
- `DELETE /images/{image_id}`: 인증 토큰과 정수 이미지 ID로 삭제하며 본문을 보내지 않음. HTTP 200의 `image_id`, `message`를 확인함. 409는 대표 이미지 등 삭제 불가로 안내함.
- 상품 상세 응답에서 기존 이미지 ID를 조회하는 계약이 없으므로 기존 이미지 삭제 UI는 추가하지 않음. 업로드 반환 ID를 보관한 호출부에서 삭제 함수를 사용할 수 있음.
- 테스트 모드에서는 업로드 결과와 이미지 ID를 메모리에 보관하고 삭제 시 해당 기록을 제거함. 실제 서버 파일은 변경하지 않음.
