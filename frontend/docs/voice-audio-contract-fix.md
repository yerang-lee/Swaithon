# 음성 분석 응답 호환 수정 전달 사항

## 적용 대상

- 백엔드: `backend/voice/jangboso_voice/api.py`의 `build_router()` → `analyze_audio()`.
- 프론트: `frontend/src/services/api/voiceCommands.ts`의 `parseCommand()`.
- `POST /voice/product-registration`, `POST /voice/analyze-audio`는 같은 백엔드 핸들러를 사용하므로 둘 다 적용됩니다.
- 엔드포인트/HTTP 메서드는 `api-spec.csv`를 유지합니다. 아래 내용은 이번 구현에서 맞춘 응답 규칙이며, CSV가 응답 스키마를 확정한다는 뜻은 아닙니다.

## 원인과 변경

1. 백엔드는 READY에서 `question: null`을 반환하지만 프론트가 문자열만 허용해 분석 결과를 거부했습니다. 프론트는 질문이 필수가 아닌 상태에서 null/생략을 허용합니다. NEEDS_INPUT에서는 기존처럼 공백이 아닌 문자열을 필수로 검사합니다. 숫자/객체 질문은 계속 거부합니다.
2. 엔진은 추가 질문을 `message`에 저장하지만 음성 핸들러는 `question`만 조회해 null을 반환했습니다. NEEDS_INPUT에서는 공백이 아닌 `result.question` → `result.message` → 기본 질문 순으로 사용하며, 응답 `message`에도 같은 질문을 넣습니다. 기존 구체적인 질문이 일반 안내로 덮이지 않습니다.
3. 엔진이 만든 상품 선택 후보를 핸들러가 누락했습니다. `candidates`를 응답에 보존하고 없을 때 빈 배열을 반환합니다. 프론트의 NEEDS_SELECTION 비어 있지 않은 후보 검증은 유지합니다.
4. 엔진이 만든 변경 전후 정보를 핸들러가 누락했습니다. `preview.before/after`를 가공하지 않고 보존합니다. 엔진에 preview가 없으면 null이며 프론트의 기존 fallback을 사용합니다.

## 상태별 규칙

| 상태 | question | 기타 |
| --- | --- | --- |
| READY | null/생략 허용 | missing_fields=[], needs_confirmation=true, 실행 주소와 preview 보존 |
| NEEDS_INPUT | 공백이 아닌 문자열 필수 | missing_fields에 부족 필드, needs_confirmation=false, 실행 주소 null |
| NEEDS_SELECTION | null/생략/문자열 허용 | 비어 있지 않은 candidates, 실행 주소 null |

식별자(command_id), 추가 답변 요청, 확정 요청, 인증 방식, DB 반영 로직은 변경하지 않았습니다. 분석만으로 자동 확정하지 않습니다.

## 회귀 검증

- `backend/tests/test_voice_audio_contract.py`: 라우터의 실제 분석 핸들러를 가짜 STT/서비스로 호출합니다. 두 URL의 READY, 질문 전달·fallback, 후보 및 preview 보존을 검증합니다. 실제 HTTP 인증/업로드/DB 통합 테스트는 아닙니다.
- `frontend/tests/voice-command-api.test.cjs`: READY/null 질문 수용, NEEDS_INPUT 질문 필수, 잘못된 질문 타입 거부, 후보 필수 검증, preview 보존을 추가했습니다.
- 루트: `python -m unittest discover -s backend/tests -p test_voice_audio_contract.py`
- frontend: `node tests/voice-command-api.test.cjs`, `npm run typecheck`

## 배포 시 확인

백엔드의 `backend/voice/jangboso_voice/api.py`와 프론트 변경을 함께 반영해야 합니다. 루트 `voice/jangboso_voice/api.py`는 이번 실제 백엔드 연결 경로가 아니므로 수정하지 않았습니다. 운영 서버가 backend 모듈을 사용하는지 확인하고 재시작한 뒤, 정보가 충분한 녹음/가격이 빠진 녹음/동명 상품 후보가 여러 개인 녹음을 실제 기기에서 확인합니다.
