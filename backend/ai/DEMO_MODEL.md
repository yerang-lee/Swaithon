# 개발 환경 데모 추천 모델

모델: `recommendation/demo_ranker_data2_v1/recommendation_model.joblib`와 같은 폴더의 `metadata.json`.
사용자가 제공한 ZIP에서 두 파일만 복사했다. 합성 데이터 학습 모델이며 운영에 사용하지 않는다.

프로젝트 루트의 PowerShell에서:

```powershell
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-recommendation.txt
$env:APP_ENV = "development"
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

기존 DB·인증·음성 서비스 설정은 별도로 필요하다. `APP_ENV`가 정확히 `development`인
경우에만 서버 시작 시 모델을 한 번 로드한다. 미설정·운영 환경에서는 규칙 추천을 사용한다.
개발 서버의 `backend/.env`에 `APP_ENV=development`를 설정하는 방법도 가능하다.

`GET /recommendations`는 기존 로그인 인증과 좌표·시장·top_n 계약을 유지한다.
기본 top_n은 20이다. 매 요청 현재 찜, 최근 30일 행동, 최신 후보 상품으로 payload를 만든다.
모델 결과 순서를 유지하고 `recommendation_type=ai`, `model_version=demo_ranker_data2_v1`을 반환한다.
모델 로드·예측 실패 시 규칙 추천(`rule`, model_version=null)으로 전환한다.

메타데이터·모델 번들·LGBMRanker의 입력 컬럼 순서와 버전·best_iteration을 비교한다.
입력은 interest_match, category_preference, store_preference, distance_km,
hours_since_created, is_interest_user, is_behavior_user 순이다.
규칙 추천과 같은 선호도 계산 함수를 재사용한다. 카테고리는 상품별 최대 행동 점수,
점포는 점포·상품별 최대 행동 점수를 합산 후 각각 정규화한다.
상세 조회=1, 찜=3, 유효 예약=5, 확인 구매=8이며 직접 관심 상품은 3점이다.
현재 백엔드는 확인 구매 이벤트를 payload에 추가하지 않는다. COMPLETED를 구매로 추정하지 않는다.
ZIP에는 학습 전처리 코드나 선호도 정의가 없어 data2 학습 당시 계산식과의 일치 여부는 담당자 확인이 필요하다.
저장소의 `recommendation/jangboso_recommendation_v1.ipynb`에 있는 두 선호도 계산 함수와는 일치한다.

DB 구조는 변경하지 않는다. 기존 rule_version은 입력 계산 규칙 버전을 저장하며,
모델 버전과 AI 입력·점수는 각 추천 상품의 feature_snapshot에 저장한다.
AI의 모든 후보 스냅샷 중 실제 반환하는 상위 상품만 기존 저장 흐름에 연결한다.

Python 백엔드에서는 JS의 appDiagnostics를 실행할 수 없으므로 표준 logging으로
고정 오류 코드 `recommendation.load/predict: DEMO_MODEL_FAILED`만 기록한다.
예외 원문, 입력값, 사용자 정보, 파일, 원본 응답은 기록하지 않는다.

검증:

```powershell
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p test_demo_recommendation.py
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p test_recommendation_training.py
```

실제 모델 예측과 API 핸들러를 검증하되 DB 조회·저장은 대체한다.
실제 PostgreSQL과 로그인 계정을 사용한 배포 환경 검증은 별도로 필요하다.
