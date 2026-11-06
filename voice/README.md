# 장보소 음성 AI v1

사용자가 확정한 규칙을 구현한 로컬 프로토타입입니다. Whisper/Gemini를 새로 학습하지 않습니다.
상품 저장소는 **SQLite 데모**이며 실제 PostgreSQL 상품 테이블과 로그인 연결은 아직 하지 않았습니다.
실제 키/녹음이 없어서 Gemini·Whisper 정확도는 아직 측정하지 않았습니다.

## 먼저 읽을 문서

- `COMMAND_CASES.md`: 실제 발화 30개, 기대 결과
- `BACKEND_HANDOFF.md`: 인증·PostgreSQL·API 연결 계약 제안
- `FRONTEND_HANDOFF.md`: 앱 요청·화면 상태·확인 흐름
- `NEXT_STEPS.md`: 직접 설정해야 하는 항목과 실행 순서
- `notebooks/jangboso_voice_v1.ipynb`: 독립 실행 가능한 Colab용 노트북

## 설치 (PowerShell, 이 voice 폴더에서)

Python 3.11을 권장합니다. 서버 규칙 테스트는 이 작업 환경의 Python 3.13에서도 검증합니다.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest tests -q
```

Whisper까지 쓰려면 FFmpeg를 설치하고 `ffmpeg -version`으로 확인한 뒤:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-stt.txt
```

## 키 없이 로컬 데모 시작

```powershell
$env:VOICE_PARSER = 'fixture'
$env:VOICE_DEMO_TOKEN = [guid]::NewGuid().ToString()
.\.venv\Scripts\python.exe -m uvicorn jangboso_voice.demo:create_app --factory --host 127.0.0.1 --port 8010
```

`http://127.0.0.1:8010/docs`에서 우측 상단 **Authorize**를 누르고
`VOICE_DEMO_TOKEN` 값만 입력하세요. `Bearer `는 붙이지 않습니다. Swagger가 자동으로 헤더를 붙입니다.
직접 HTTP 요청을 보내는 경우에만 `Authorization: Bearer <VOICE_DEMO_TOKEN 값>`을 사용합니다. 이 토큰은 로컬 데모 전용이며 실제 로그인 토큰이 아닙니다.
fixture 모드는 cases.json과 **완전히 같은 문장만 재생**합니다. 추가 답변/자유 발화는 Gemini 모드가 필요합니다.
DB는 처음에 비어 있으므로 `배 5개에 만 원 등록해`로 시작하세요.
분석 결과 `command_id`를 등록 API에 `{"command_id":"...","confirmed":true}`로 보내세요.
`GET /products`에서 결과를 확인합니다. 실행을 재요청해도 한 번만 등록됩니다.

## 실제 Gemini 분석

서버를 종료한 뒤 같은 터미널에서 환경변수를 설정하고 다시 실행합니다.

```powershell
$env:VOICE_PARSER = 'gemini'
$env:GEMINI_API_KEY = '<본인 키>'
$env:GEMINI_MODEL = '<계정에서 사용 가능한 구조화 출력 지원 모델 ID>'
.\.venv\Scripts\python.exe -m uvicorn jangboso_voice.demo:create_app --factory --host 127.0.0.1 --port 8010
```

키는 코드·앱·Git·스크린샷에 넣지 마세요. `.env.example`은 안내용이며 자동 로딩하지 않습니다.
Google SDK의 generate_content + response_schema를 사용합니다. 모델 ID를 임의로 고정하지 않았습니다.
`POST /voice/analyze-audio`에 녹음 파일을 보내면 Whisper → Gemini → 검증까지 연결됩니다.
결과를 받은 뒤 확인 버튼에 해당하는 실행 API를 별도로 호출해야 DB가 변경됩니다.

## 구현 규칙

- 한 상품/한 작업. 복수 작업은 재질문. 부정/취소는 변경 없음.
- 상품 등록에 판매 수량·단위가 없으면 질문. 재고는 추측하지 않음.
- 같은 상점·상품명·판매 수량·단위가 일치하면 가격만 수정. 재고가 명시되어 기존과 다르면 재질문.
- 후보가 여러 개면 선택. 다른 상점 상품은 후보에서 제외.
- 할인 종료 시각 누락/과거/모호한 시간은 질문. 가격은 원 단위 정수.
- 모든 변경은 확인 후 실행. 삭제는 deleted_at 표시, 품절은 별도 상태.
- 비율 할인은 새 기본가 기준 반올림(원 단위 사사오입). 고정 할인가 유지가 불가능하면 재질문.
- 실행 직전에 권한 범위·버전·만료 재검증. 명령당 한 번 실행. 변경 이력 함께 저장.
- 할인 종료 후 조회 가격은 기본가. demo의 상품 목록은 상인용이므로 품절도 표시.

## 구조와 제한

`schema.py` 추출 구조 / `parser.py` Gemini / `engine.py` 규칙 / `api.py` 연결용 라우터 /
`storage.py` 데모 저장소 / `stt.py` Whisper / `demo.py` 로컬 앱.

상품명은 공백 제거 후 정확히 비교합니다. 품종/등급/원산지가 다른 상품은 정식 식별 필드 합의가 필요합니다.
삭제/품절한 상품의 재판매, 판매 단위 자체의 수정, 복수 작업은 v1 범위 밖입니다.
음성 후속 답변은 POST /voice/commands/{command_id}/answer-audio에 녹음 파일을 보내세요. 기존 명령에 이어집니다.
스토리지 인터페이스를 운영 DB에 맞게 구현하기 전에는 데모 앱을 운영 서비스로 배포하지 마세요.

참고: https://ai.google.dev/gemini-api/docs/generate-content/structured-output
 / https://github.com/openai/whisper


분석 응답의 `execution_endpoint`는 최종 작업에 맞는 실행 API입니다. NEEDS_CONFIRMATION일 때 이 주소로 command_id와 confirmed를 보내세요. 다른 상태에서는 null입니다. parsed.intent는 최초 추출값이므로 실행 경로 선택에 사용하지 마세요.
