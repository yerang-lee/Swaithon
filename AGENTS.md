프로젝트 API 작업 시 `frontend/docs/api-spec.csv`를 기준으로 엔드포인트와 HTTP 메서드를 확인한다.
CSV에 없는 요청/응답 필드와 인증 방식은 확정된 명세로 간주하지 않는다. 인증 연동의 미확정 사항은 `frontend/docs/auth-api.md`에 기록되어 있다.

UI 화면을 추가하거나 수정할 때는 최초 진입 시 헤더와 본문이 안전 영역 안에 정상 배치되는지 확인한다. 특히 React Native 전체 화면 Modal은 별도의 SafeAreaProvider를 사용하고, 상태 표시줄·키보드·하단 버튼의 잘림과 겹침을 확인한다. 공통 기본 버튼 높이는 theme 및 PrimaryButton을 기준으로 유지한다.
