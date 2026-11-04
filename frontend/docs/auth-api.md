# 인증 API

원본 명세: `api-spec.csv` (사용자 제공). 로그인 POST `/auth/login`, 회원가입 POST `/auth/signup`.

사용자가 제공한 상세 명세를 적용했습니다. 서버 주소는 아직 미정입니다.

- 회원가입: POST `/auth/signup`, JSON `{ phone, password, name }`. 화면의 닉네임을 `name`으로 전송합니다.
- 성공: 201, `{ user_id: number, phone: string, name: string, created_at: string }`.
- 오류: 400 입력값 형식, 409 가입된 전화번호, 500 서버 오류.
- 로그인: POST `/auth/login`, JSON `{ phone, password }`.
- 성공: 200, `{ access_token: string, refresh_token: string, token_type: "bearer", expires_in: number }` (만료 시간 단위: 초).
- 오류: 400 입력값 형식, 401 전화번호/비밀번호 불일치, 500 서버 오류.

비밀번호 확인은 클라이언트에서만 검사하고 전송하지 않습니다.
로그인 응답은 런타임 검증 후 메모리 세션으로 보관합니다. 앱 재시작 시 유지되지 않습니다. 보안 저장소, 토큰 재발급(명세 미제공), 홈 화면 이동은 추후 연결합니다. 비밀번호/토큰은 로그에 출력하지 않습니다.

`frontend/.env`에 `EXPO_PUBLIC_API_URL`을 지정하고 Expo를 재시작하세요. 휴대폰에서 접속 가능한 서버 주소여야 합니다. `.env.example`을 참고하세요.

## 로그아웃 (사용자 제공 상세 명세)

- POST `/auth/logout`, Authorization: Bearer Access Token, JSON `{ refresh_token: string }`.
- 200: `{ message: "로그아웃되었습니다." }`. 성공 응답 확인 후 메모리 토큰과 관심 상품 상태를 지우고 화면 기록을 정리해 로그인으로 이동합니다.
- 401: 인증 만료/유효하지 않은 토큰 안내 후 로컬 세션을 지우고 로그인으로 이동합니다. 서버 토큰 폐기 성공으로 표시하지 않습니다.
- 500/네트워크/비정상 응답: 세션을 유지하고 오류를 표시해 재시도할 수 있게 합니다.
- 개발 미리보기 등 로그인 세션이 없는 경우 서버에 빈 토큰을 보내지 않고 로그인으로 돌아갑니다.
- 중복 클릭을 막고 토큰은 로그에 출력하지 않습니다. 실제 서버 검증은 서버 주소 제공 후 가능합니다.
