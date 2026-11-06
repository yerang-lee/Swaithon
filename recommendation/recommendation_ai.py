import joblib
import numpy as np
import pandas as pd

from recommendation_rules import (
    build_recommendation_inputs,
    recommend,
    normalize_id,
)


class AIRecommender:
    def __init__(self, model_path):
        # 서버가 시작할 때 한 번 실행
        bundle = joblib.load(model_path)

        self.model = bundle["model"]
        self.features = list(bundle["features"])
        self.model_version = bundle["version"]
        self.best_iteration = bundle.get("best_iteration")

    def recommend(self, payload, top_n=20):
        if (
            isinstance(top_n, bool)
            or not isinstance(top_n, int)
            or top_n < 1
        ):
            raise ValueError("top_n은 1 이상의 정수여야 합니다.")

        # 1. 최신 payload를 추천 함수용 데이터로 변환
        user, candidates, as_of = (
            build_recommendation_inputs(payload)
        )

        # 2. 최신 행동으로 선호도·관심 상품·사용자 상태 계산
        #
        # top_n=None:
        # 규칙 점수로 후보를 미리 잘라내지 않습니다.
        rule_result = recommend(
            user,
            candidates,
            top_n=None,
            now=as_of,
        )

        df = rule_result["items"].copy()

        # 기존 규칙 점수를 비교·학습 기록용으로 보존
        df["rule_score"] = df["score"]

        # 기존 규칙 순위는 AI 순위로 교체할 예정
        df = df.drop(columns=["rank", "score"])

        state = rule_result["state"]

        # 3. 학습 코드와 동일한 상태 입력값 생성
        df["is_interest_user"] = int(
            state == "new_with_interest"
        )

        df["is_behavior_user"] = int(
            state == "behavior_based"
        )

        # 4. 저장된 모델이 요구하는 입력 컬럼 검사
        missing = sorted(
            set(self.features) - set(df.columns)
        )

        if missing:
            raise ValueError(
                f"모델 입력 컬럼이 없습니다: {missing}"
            )

        numeric_features = df[self.features].apply(
            pd.to_numeric,
            errors="raise",
        )

        if not np.isfinite(
            numeric_features.to_numpy(dtype=float)
        ).all():
            raise ValueError(
                "모델 입력에 결측값 또는 무한대가 있습니다."
            )

        # 5. 기존 모델에 최신 입력값 전달
        if df.empty:
            df["score"] = pd.Series(dtype=float)
        else:
            predict_options = {}

            if self.best_iteration:
                predict_options["num_iteration"] = (
                    self.best_iteration
                )

            df["score"] = self.model.predict(
                numeric_features,
                **predict_options,
            )

        # 6. AI 점수순으로 정렬
        df = df.sort_values(
            ["score", "listing_id"],
            ascending=[False, True],
        ).reset_index(drop=True)

        df["rank"] = np.arange(1, len(df) + 1)

        # 7. 백엔드 내부 저장용 입력값 스냅샷
        #
        # 실제 노출 여부·이후 label은 나중에 연결합니다.
        snapshot_columns = list(dict.fromkeys([
            "listing_id",
            *self.features,
            "rule_score",
            "score",
            "rank",
        ]))

        feature_snapshot = []

        for row in df[snapshot_columns].to_dict(
            orient="records"
        ):
            feature_snapshot.append({
                **row,
                "request_id": normalize_id(
                    payload["request_id"]
                ),
                "user_id": user["user_id"],
                "requested_at": as_of.isoformat(),
                "user_state": state,
                "model_version": self.model_version,
            })

        # 8. 앱에 반환할 추천 결과
        selected = df.head(top_n)

        response = {
            "request_id": normalize_id(
                payload["request_id"]
            ),
            "generated_at": as_of.isoformat(),
            "recommendation_type": "ai",
            "model_version": self.model_version,
            "user_state": state,
            "items": [
                {
                    "listing_id": row["listing_id"],
                    "rank": int(row["rank"]),
                    "score": float(row["score"]),
                }
                for row in selected.to_dict(
                    orient="records"
                )
            ],
        }

        return {
            "response": response,
            "feature_snapshot": feature_snapshot,
        }