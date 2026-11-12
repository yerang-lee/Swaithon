# 장보소

**전통시장 장보기와 가게 운영을 연결하는 모바일 앱**

장보소는 주변 시장의 상품을 살펴보고 방문 수령을 예약할 수 있는 서비스입니다. 고객은 상품 가격과 할인 정보를 확인하고 QR코드로 상품을 수령합니다. 상인은 음성으로 상품을 등록·수정하고 들어온 예약을 관리할 수 있습니다.

## 주요 기능

### 고객

| 기능 | 설명 |
| --- | --- |
| 주변 시장 탐색 | 현재 위치 또는 지정한 위치를 기준으로 시장과 가게 조회 |
| 상품 검색 | 시장·가게별 상품 탐색, 카테고리와 검색어로 목록 확인 |
| 추천 상품 | 위치와 관심·이용 정보를 활용한 상품 추천 |
| 관심 상품·찜 | 관심 품목 설정 및 개별 판매 상품 저장 |
| 가격 이력 | 상품 상세에서 기간별 판매 가격 변동 확인 |
| 마감 세일 | 주변 시장에서 할인 중인 상품 모아보기 |
| 방문 수령 예약 | 수령 시간과 수량을 선택하고 예약 내역 확인·취소 |
| QR 픽업 | 준비가 완료된 예약의 QR코드를 제시해 상품 수령 |
| 알림·마이페이지 | 알림 조회 및 읽음 처리, 내 정보 수정과 계정 관리 |

### 상인

| 기능 | 설명 |
| --- | --- |
| 가게 등록 | 회원가입 시 소속 시장 검색 및 지도에서 가게 위치 설정 |
| 음성 상품 관리 | 상품 등록·수정, 할인 등록·종료, 품절·삭제 명령 처리 |
| 분석 결과 확인 | 인식한 내용과 변경 내용을 확인하고 최종 반영 |
| 추가 정보 입력 | 정보가 부족하면 음성 또는 텍스트로 답변, 후보 상품 선택 |
| 상품 사진 | 상품 등록·수정 결과에 촬영하거나 선택한 사진 연결 |
| 내 상품 목록 | 등록 상품, 판매 가격, 할인 및 재고 정보 확인 |
| 예약 관리 | 고객 예약 확인 및 픽업 준비 완료 처리 |
| QR 스캔 | 고객의 QR코드를 확인해 픽업 완료 처리 |

## 이용 흐름

**고객**

시장·상품 탐색 → 상품 상세 확인 → 수령 시간·수량 선택 → 예약 → 준비 완료 후 QR 확인 → 방문 수령

**상인**

가게 등록 → 음성으로 상품 관리 → 분석 결과 확인·확정 → 고객 예약 확인 → 픽업 준비 → QR 스캔

음성 분석과 상품 반영은 별도 단계입니다. 분석 결과를 받았다고 상품이 바로 변경되는 것은 아니며, 사용자 확인 후 실행 성공 응답을 받은 시점에 완료로 표시합니다.

## 기술 구성

| 구분 | 사용 기술 |
| --- | --- |
| 앱 | React Native, Expo, React, TypeScript |
| 화면 이동 | Expo Router |
| 지도·장소 검색 | Kakao Maps JavaScript SDK, Kakao Local API |
| 기기 기능 | Expo Audio, Camera, Location, Image Picker |
| 서버 | Python, FastAPI, Pydantic |
| 데이터베이스 | PostgreSQL, SQLAlchemy |
| 인증 | JWT 기반 액세스·리프레시 토큰 |
| 음성 처리 | Whisper 음성 인식, Gemini 명령 분석 |
| 추천 | 규칙 기반 추천, 개발 환경의 LightGBM 데모 모델 |

## 프로젝트 구조

```text
.
├── frontend/
│   ├── src/
│   │   ├── app/              # 화면 경로
│   │   ├── components/       # 화면 구성 요소와 공통 UI
│   │   ├── services/         # API, 세션, 위치 등
│   │   ├── hooks/            # 공통 상태·동작
│   │   └── utils/            # 표시 형식, 검증, 오류 기록
│   └── tests/                # API·화면 회귀 테스트
├── backend/
│   ├── routers/              # 기능별 FastAPI 라우터
│   ├── ai/                   # 추천 로직과 모델 연동
│   ├── voice/jangboso_voice/  # 통합 서버에서 사용하는 음성 처리
│   ├── models.py             # DB 모델
│   ├── schemas.py            # 요청·응답 모델
│   └── tests/                # 서버 테스트
├── voice/                    # 독립 음성 프로토타입·테스트·의존성
└── recommendation/           # 추천 모델과 학습 자료
```

## 실행 방법

명령어는 저장소 루트에서 시작하는 Windows PowerShell 기준입니다. 실제 서비스 연동에는 PostgreSQL과 외부 API 키가 필요합니다.

### 1. 프론트엔드

Node.js와 npm을 설치한 뒤 실행합니다.

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
```

이미 `.env`가 있다면 복사 대신 기존 설정을 확인합니다. `frontend/.env`에는 다음 값을 입력합니다.

```dotenv
EXPO_PUBLIC_API_URL=http://<백엔드 PC의 LAN IP>:8000
EXPO_PUBLIC_MOCK_API=false
EXPO_PUBLIC_KAKAO_MAP_KEY=<카카오 JavaScript 키>
EXPO_PUBLIC_KAKAO_MAP_ORIGIN=https://localhost
```

| 변수 | 용도 |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | 앱에서 접근할 백엔드 주소 |
| `EXPO_PUBLIC_MOCK_API` | 개발용 모의 API 기본 활성화 여부 |
| `EXPO_PUBLIC_KAKAO_MAP_KEY` | 지도 화면에서 사용하는 JavaScript 키 |
| `EXPO_PUBLIC_KAKAO_MAP_ORIGIN` | 네이티브 WebView에서 사용하는 지도 origin |

카카오 개발자 설정에는 지도에서 사용하는 origin을 웹 플랫폼 도메인으로 등록해야 합니다. 웹 미리보기를 사용한다면 브라우저의 실제 origin도 등록합니다.

```powershell
npm start
```

Expo 터미널에서 기기 연결 방법을 확인합니다. 별도 실행 명령은 다음과 같습니다.

```powershell
npm run android
npm run ios
npm run web
```

Android 에뮬레이터는 Android 개발 환경이 필요하고, iOS 시뮬레이터는 macOS와 Xcode가 필요합니다. Windows에서는 iPhone 실기기로 확인할 수 있습니다. 위치·녹음·카메라 기능은 실기기에서도 확인해야 합니다.

휴대폰에서 `localhost`는 휴대폰 자신을 가리킵니다. 실기기 테스트 시 API 주소에는 백엔드 PC의 LAN IP를 사용하고, PC와 휴대폰 사이의 네트워크 연결 및 방화벽 설정을 확인합니다. 환경변수 변경 후에는 Expo를 재시작합니다.

### 2. 백엔드 없이 화면 확인

개발 모드의 로그인 화면에서 **고객으로 테스트** 또는 **상인으로 테스트**를 선택합니다. 기본으로 활성화하려면 `EXPO_PUBLIC_MOCK_API=true`로 설정합니다.

테스트 데이터와 상품 변경은 모의 처리되며 실제 회원·상품으로 저장되지 않습니다. 지도는 별도 외부 서비스 설정이 필요합니다.

### 3. 백엔드

별도 터미널에서 저장소 루트를 기준으로 실행합니다. Python 3.11 이상과 PostgreSQL을 준비하고, 음성 파일 처리에 필요한 FFmpeg가 `PATH`에 등록되어 있는지 확인합니다.

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ../voice/requirements-stt.txt
.\.venv\Scripts\python.exe -m pip install sqlalchemy "psycopg[binary]" python-dotenv "python-jose[cryptography]" "pwdlib[argon2]" numpy pandas
ffmpeg -version
```

현재 백엔드 공통 의존성은 하나의 requirements 파일로 통합되어 있지 않아, 음성 의존성 파일과 서버에서 직접 사용하는 패키지를 함께 설치합니다.

`backend/.env`를 만들고 개발 환경에 맞게 설정합니다.

```dotenv
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=jangboso
DB_USER=<DB 사용자>
DB_PASSWORD=<DB 비밀번호>

JWT_SECRET_KEY=<JWT 서명용 비밀키>
JWT_ALGORITHM=HS256
QR_SECRET_KEY=<픽업 QR 서명용 비밀키>

KAKAO_REST_API_KEY=<카카오 REST API 키>
GEMINI_API_KEY=<Gemini API 키>
GEMINI_MODEL=<사용할 모델 ID>
WHISPER_MODEL=small
```

PostgreSQL 데이터베이스와 접속 계정은 먼저 생성해야 합니다. 서버 시작 시 SQLAlchemy 모델 기준으로 없는 테이블을 생성하지만, 기존 테이블의 구조를 자동으로 마이그레이션하지는 않습니다.

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

- 서버 확인: [http://localhost:8000](http://localhost:8000)
- API 문서: [http://localhost:8000/docs](http://localhost:8000/docs)
- DB 연결 확인: [http://localhost:8000/db-check](http://localhost:8000/db-check)

기본 Whisper 모델은 첫 음성 처리 시 다운로드가 필요할 수 있습니다. 별도로 학습한 모델을 쓰는 경우 `WHISPER_MODEL_DIR`을 설정하고 `torch`, `transformers` 및 로컬 모델 파일을 준비합니다.

LightGBM 데모 추천 모델을 사용하려면 백엔드 가상환경에서 아래 의존성을 추가하고 `APP_ENV=development`로 실행합니다. 데모 모델을 사용하지 않는 경우에는 규칙 기반 추천을 사용합니다.

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-recommendation.txt
$env:APP_ENV = 'development'
```

설정 후 서버를 재시작합니다. 서버용 비밀키는 `EXPO_PUBLIC_*` 변수에 넣지 않습니다. `.env`, 로그인 토큰, 녹음 파일과 실제 사용자 데이터도 저장소에 올리지 않습니다.

## 테스트

### 프론트엔드

`frontend` 폴더에서 실행합니다.

```powershell
npm run typecheck
node tests/products-api.test.cjs
node tests/closing-sale-api.test.cjs
node tests/closing-sale-screen.test.cjs
node tests/voice-command-api.test.cjs
node tests/voice-command-presentation.test.cjs
node tests/voice-command-result.test.cjs
node tests/voice-clarification-screen.test.cjs
```

위 목록은 상품 조회·마감 세일·음성 명령 관련 주요 회귀 테스트입니다. 기능별 추가 테스트는 `frontend/tests`에 있습니다. 화면 테스트는 모의 환경을 사용하므로 실제 기기의 권한, 키보드, 안전 영역과 서버 연결 확인을 대체하지 않습니다.

### 백엔드

`backend` 폴더에서 실행합니다. 아래 명령은 별도 운영 DB 접속 없이 상품 조회 필터와 관련 동작을 검증합니다.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_closing_sale_products.py
```

## 개발 시 참고

- API 경로, 요청·응답 형식과 인증 조건은 실행 중인 백엔드의 Swagger와 라우터 구현을 함께 확인합니다.
- 신규 화면과 전체 화면 Modal은 최초 진입 시 안전 영역, 키보드와 하단 버튼 겹침을 확인합니다.
- 공통 버튼은 `PrimaryButton`과 `theme`의 기본 높이를 사용합니다.
- 오류는 공통 진단 로거로 기록하며 비밀번호, 토큰, 입력값, 파일과 원본 응답은 남기지 않습니다.

## 자주 확인하는 문제

| 증상 | 확인할 내용 |
| --- | --- |
| 로그인 연결 실패·시간 초과 | 백엔드 실행 여부, API 주소·포트, 휴대폰 네트워크와 방화벽 |
| 지도가 표시되지 않음 | JavaScript 키, 카카오 웹 플랫폼 도메인, WebView origin |
| 시장 검색 실패 | 백엔드의 카카오 REST API 키와 외부 API 연결 |
| 음성 인식 실패 | 마이크 권한, FFmpeg, Whisper 모델, Gemini 설정 및 서버 로그 |
| 상품 목록 응답 검증 실패 | 배포 서버 응답과 프론트 계약 일치 여부, 서버 수정 반영 여부 |
| 환경변수 변경이 적용되지 않음 | Expo 또는 백엔드 재시작 여부. Expo 캐시는 `npx expo start -c`로 초기화 |

루트의 `voice/`는 독립 음성 프로토타입이며, 통합 서버는 `backend/voice/`를 사용합니다.
