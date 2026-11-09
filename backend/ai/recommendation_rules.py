#규칙기반 가중치를 이용한 방법
#사용자 상태에 따라 표의 가중치를 자동으로 선택

import copy
import json

import numpy as np
import pandas as pd


# ============================================================
# 1. 추천 설정
# ============================================================

# 최근 30일, 서로 다른 표준 상품(product_id) 수 기준
#
# 기본 사용자:
#   상세 조회 상품 >= 5개
#   AND 유효 예약·확인 구매 상품 합집합 >= 5개
#
# 관심 행동 사용자:
#   기본 사용자 조건 미충족
#   AND 찜·유효 예약 상품 합집합 >= 2개
#
# 초기 사용자:
#   나머지
#
# 관심 상품을 직접 선택한 것만으로 사용자 상태가 바뀌지는 않습니다.

RULE_VERSION = "rules_v1"

WEIGHTS = {
    "new_no_interest": {
        "interest_match": 0.00,
        "category_preference": 0.00,
        "store_preference": 0.00,
        "distance_score": 0.75,
        "recency_score": 0.25,
    },
    "new_with_interest": {
        "interest_match": 0.60,
        "category_preference": 0.00,
        "store_preference": 0.00,
        "distance_score": 0.30,
        "recency_score": 0.10,
    },
    "behavior_based": {
        "interest_match": 0.40,
        "category_preference": 0.25,
        "store_preference": 0.15,
        "distance_score": 0.15,
        "recency_score": 0.05,
    },
}

STATE_NAMES = {
    "new_no_interest": "초기 사용자: 행동 조건 미충족",
    "new_with_interest": "관심 행동 사용자: 찜·유효 예약 상품 2개 이상",
    "behavior_based": "기본 사용자: 조회·예약·구매 조건 충족",
}

ACTION_POINTS = {
    "detail_view": 1.0,
    "favorite": 3.0,
    "reserve": 5.0,
    "purchase_confirmed": 8.0,
}

CANDIDATE_COLUMNS = [
    "listing_id",
    "product_id",
    "name",
    "category",
    "store_id",
    "distance_km",
    "hours_since_created",
]


# ============================================================
# 2. 공통 입력값 처리
# ============================================================

def normalize_id(value):
    """ID를 문자열로 통일합니다."""
    if value is None or pd.isna(value):
        raise ValueError("ID가 비어 있습니다.")

    result = str(value).strip()

    if not result:
        raise ValueError("ID가 비어 있습니다.")

    return result


def parse_aware_time(value):
    """시간대가 포함된 시각을 한국 시간으로 변환합니다."""
    if value is None:
        raise ValueError("시각이 비어 있습니다.")

    timestamp = pd.Timestamp(value)

    if pd.isna(timestamp) or timestamp.tzinfo is None:
        raise ValueError(
            "시각에는 시간대가 필요합니다. "
            "예: 2026-11-03T15:00:00+09:00"
        )

    return timestamp.tz_convert("Asia/Seoul")


def resolve_now(now=None):
    if now is None:
        return pd.Timestamp.now(tz="Asia/Seoul")

    return parse_aware_time(now)


# ============================================================
# 3. 최근 30일의 유효한 행동 조회
# ============================================================

def get_recent_valid_events(events, now=None):
    """
    - 최근 30일 기록만 사용
    - 미래 기록 제외
    - 동일 event_id 중복 제거
    - 무효 예약 제외

    구매는 백엔드에서 확인한 purchase_confirmed만 전달합니다.
    """
    now = resolve_now(now)
    cutoff = now - pd.Timedelta(days=30)

    rows = []
    seen_event_ids = set()

    for raw_event in events:
        event_id = normalize_id(raw_event["event_id"])

        if event_id in seen_event_ids:
            continue

        seen_event_ids.add(event_id)

        event_type = raw_event["event_type"]

        if event_type not in ACTION_POINTS:
            raise ValueError(
                f"지원하지 않는 행동 종류: {event_type}"
            )

        occurred_at = parse_aware_time(
            raw_event["occurred_at"]
        )

        if not cutoff <= occurred_at <= now:
            continue

        if event_type == "reserve":
            is_valid = raw_event["is_valid_reservation"]

            if not isinstance(is_valid, bool):
                raise ValueError(
                    "is_valid_reservation은 "
                    "True 또는 False여야 합니다."
                )

            if not is_valid:
                continue

        rows.append({
            "event_id": event_id,
            "product_id": normalize_id(
                raw_event["product_id"]
            ),
            "store_id": normalize_id(
                raw_event["store_id"]
            ),
            "event_type": event_type,
            "occurred_at": occurred_at,
            "is_valid_reservation": event_type == "reserve",
        })

    return pd.DataFrame(
        rows,
        columns=[
            "event_id",
            "product_id",
            "store_id",
            "event_type",
            "occurred_at",
            "is_valid_reservation",
        ],
    )


# ============================================================
# 4. 사용자 상태 및 관심 상품 계산
# ============================================================

def get_user_recommendation_profile(user, now=None):
    recent = get_recent_valid_events(
        user.get("events", []),
        now=now,
    )

    def product_ids_for(event_types):
        return set(
            recent.loc[
                recent["event_type"].isin(event_types),
                "product_id",
            ]
        )

    viewed_ids = product_ids_for(["detail_view"])

    favorite_or_reserved_ids = product_ids_for([
        "favorite",
        "reserve",
    ])

    reserved_or_purchased_ids = product_ids_for([
        "reserve",
        "purchase_confirmed",
    ])

    # 우선순위: 기본 → 관심 행동 → 초기 사용자
    if (
        len(viewed_ids) >= 5
        and len(reserved_or_purchased_ids) >= 5
    ):
        state = "behavior_based"

    elif len(favorite_or_reserved_ids) >= 2:
        state = "new_with_interest"

    else:
        state = "new_no_interest"

    # 명시적 관심 상품 + 최근 행동으로 추정한 관심 상품
    # 상세 조회만 한 상품은 관심 상품 집합에 넣지 않습니다.
    explicit_interest_ids = {
        normalize_id(product_id)
        for product_id in user.get(
            "interest_product_ids", []
        )
    }

    inferred_interest_ids = product_ids_for([
        "favorite",
        "reserve",
        "purchase_confirmed",
    ])

    return {
        "state": state,
        "interest_product_ids": (
            explicit_interest_ids | inferred_interest_ids
        ),
        "viewed_product_count": len(viewed_ids),
        "favorite_or_reserved_product_count": len(
            favorite_or_reserved_ids
        ),
        "reserved_or_purchased_product_count": len(
            reserved_or_purchased_ids
        ),
    }


def get_user_state(user, now=None):
    return get_user_recommendation_profile(
        user,
        now=now,
    )["state"]


# ============================================================
# 5. 카테고리 선호도 자동 계산
# ============================================================

def calculate_category_preferences(user, now=None):
    product_categories = user["product_categories"]

    recent = get_recent_valid_events(
        user.get("events", []),
        now=now,
    )

    # 직접 선택한 관심 상품은 상품당 3점
    product_scores = {
        normalize_id(product_id): 3.0
        for product_id in user.get(
            "interest_product_ids", []
        )
    }

    # 같은 상품은 가장 높은 행동 점수 하나만 반영
    for event in recent.to_dict(orient="records"):
        product_id = event["product_id"]
        points = ACTION_POINTS[event["event_type"]]

        product_scores[product_id] = max(
            product_scores.get(product_id, 0.0),
            points,
        )

    category_scores = {}

    for product_id, points in product_scores.items():
        category = product_categories.get(product_id)

        if category is None:
            raise ValueError(
                f"상품 {product_id}의 카테고리 정보가 없습니다."
            )

        category_scores[category] = (
            category_scores.get(category, 0.0) + points
        )

    total = sum(category_scores.values())

    if total == 0:
        return {}

    # 카테고리 선호도의 합계가 1이 되도록 변환
    return {
        category: score / total
        for category, score in category_scores.items()
    }

# ============================================================
# 5-1. 점포 선호도 자동 계산
# ============================================================

def calculate_store_preferences(user, now=None):
    recent = get_recent_valid_events(
        user.get("events", []),
        now=now,
    )

    if recent.empty:
        return {}

    # 같은 점포·같은 상품에서는 가장 높은 행동 점수만 인정
    product_scores = {}

    for event in recent.to_dict(orient="records"):
        key = (
            event["store_id"],
            event["product_id"],
        )

        points = ACTION_POINTS[event["event_type"]]

        product_scores[key] = max(
            product_scores.get(key, 0.0),
            points,
        )

    # 점포별 합산
    store_scores = {}

    for (store_id, product_id), points in product_scores.items():
        store_scores[store_id] = (
            store_scores.get(store_id, 0.0) + points
        )

    total = sum(store_scores.values())

    if total == 0:
        return {}

    return {
        store_id: score / total
        for store_id, score in store_scores.items()
    }

# ============================================================
# 6. 추천 점수 계산 및 정렬
# ============================================================

def recommend(user, candidates, top_n=None, now=None):
    """
    candidates는 백엔드에서 판매 상태·시장·거리 범위를
    확인한 후보여야 합니다.

    점포 선호도는 최근 30일의 유효 행동으로 자동 계산합니다.
    """
    now = resolve_now(now)

    missing_columns = [
        column
        for column in CANDIDATE_COLUMNS
        if column not in candidates.columns
    ]

    if missing_columns:
        raise ValueError(
            f"상품 데이터에 없는 컬럼: {missing_columns}"
        )

    if top_n is not None and (
        isinstance(top_n, bool)
        or not isinstance(top_n, int)
        or top_n < 1
    ):
        raise ValueError("top_n은 1 이상의 정수여야 합니다.")

    df = candidates[CANDIDATE_COLUMNS].copy()

    # 점수 계산에 사용하는 숫자 검증
    for column in ["distance_km", "hours_since_created"]:
        df[column] = pd.to_numeric(
            df[column],
            errors="raise",
        ).astype(float)

        if (
            not np.isfinite(df[column].to_numpy()).all()
            or (df[column] < 0).any()
        ):
            raise ValueError(
                f"{column}에는 결측값 없이 "
                "0 이상의 숫자를 넣어 주세요."
            )

    profile = get_user_recommendation_profile(
        user,
        now=now,
    )

    state = profile["state"]
    weights = WEIGHTS[state].copy()

    category_preferences = calculate_category_preferences(
        user,
        now=now,
    )

    store_preferences = calculate_store_preferences(
        user,
        now=now,
      )

    for store_id, score in store_preferences.items():
        if not np.isfinite(score) or not 0 <= score <= 1:
            raise ValueError(
                f"점포 {store_id} 선호도는 0~1이어야 합니다."
            )

    # ① 관심 상품 일치
    df["interest_match"] = (
        df["product_id"]
        .isin(profile["interest_product_ids"])
        .astype(float)
    )

    # ② 카테고리 선호도
    df["category_preference"] = (
        df["category"]
        .map(category_preferences)
        .fillna(0.0)
        .astype(float)
    )

    # ③ 점포 선호도
    df["store_preference"] = (
        df["store_id"]
        .map(store_preferences)
        .fillna(0.0)
        .astype(float)
    )

    # ④ 거리: 가까울수록 높은 점수
    df["distance_score"] = (
        1.0 / (1.0 + df["distance_km"])
    )

    # ⑤ 등록 시점: 최근일수록 높은 점수
    # 식품의 실제 신선도를 의미하지 않습니다.
    df["recency_score"] = np.exp(
        -df["hours_since_created"] / 24.0
    )

    # 최종 점수와 각 항목의 기여 점수
    df["score"] = 0.0

    for feature, weight in weights.items():
        contribution_column = f"{feature}_contribution"

        df[contribution_column] = df[feature] * weight
        df["score"] += df[contribution_column]

    # 동점이면 거리 → 최근 등록 → 게시물 ID 순
    df = df.sort_values(
        [
            "score",
            "distance_km",
            "hours_since_created",
            "listing_id",
        ],
        ascending=[False, True, True, True],
    ).reset_index(drop=True)

    if top_n is not None:
        df = df.head(top_n).copy()

    df.insert(0, "rank", range(1, len(df) + 1))

    return {
        "state": state,
        "state_name": STATE_NAMES[state],
        "weights": weights,
        "profile": profile,
        "category_preferences": category_preferences,
        "items": df,
    }


# ============================================================
# 7. 백엔드 입력 → 추천 함수용 데이터 변환
# ============================================================
def build_recommendation_inputs(payload):
    as_of = parse_aware_time(payload["as_of"])
    raw_user = payload["user"]

    # 1. 표준 상품 → 카테고리
    product_categories = {}

    def register_product_category(product_id, category_id):
        product_id = normalize_id(product_id)
        category_id = normalize_id(category_id)

        if (
            product_id in product_categories
            and product_categories[product_id] != category_id
        ):
            raise ValueError(
                f"상품 {product_id}의 카테고리가 서로 다릅니다."
            )

        product_categories[product_id] = category_id

    for product in payload["products"]:
        register_product_category(
            product["product_id"],
            product["category_id"],
        )

    # 2. 최근 30일 행동 검증·중복 제거·무효 예약 제외
    # get_recent_valid_events()가 각 행동의 store_id도
    # 반환하도록 수정되어 있어야 합니다.
    recent = get_recent_valid_events(
        raw_user.get("events", []),
        now=as_of,
    )

    # 기존 store_preferences 입력 처리 블록 삭제
    # 점포 선호도는 recommend()에서 행동 기록으로 자동 계산

    # 3. 추천 후보 상품 변환
    candidate_rows = []
    seen_listing_ids = set()

    for listing in payload["listings"]:
        listing_id = normalize_id(listing["listing_id"])

        if listing_id in seen_listing_ids:
            raise ValueError(
                f"판매 게시물이 중복되었습니다: {listing_id}"
            )

        seen_listing_ids.add(listing_id)

        product_id = normalize_id(listing["product_id"])
        category_id = normalize_id(listing["category_id"])

        register_product_category(
            product_id,
            category_id,
        )

        created_at = parse_aware_time(
            listing["created_at"]
        )

        if created_at > as_of:
            raise ValueError(
                f"상품 {listing_id}의 등록 시각이 "
                "추천 기준 시각보다 미래입니다."
            )

        candidate_rows.append({
            "listing_id": listing_id,
            "product_id": product_id,
            "name": listing["name"],
            "category": category_id,
            "store_id": normalize_id(
                listing["store_id"]
            ),
            "distance_km": listing["distance_km"],
            "hours_since_created": (
                as_of - created_at
            ).total_seconds() / 3600.0,
        })

    # 4. 추천 함수에 전달할 사용자 정보
    # store_preferences 항목 삭제
    user = {
        "user_id": normalize_id(raw_user["user_id"]),
        "interest_product_ids": [
            normalize_id(product_id)
            for product_id in raw_user.get(
                "interest_product_ids", []
            )
        ],
        "product_categories": product_categories,
        "events": recent.to_dict(orient="records"),
    }

    # 5. 관심·행동 상품의 카테고리 누락 확인
    required_product_ids = (
        set(user["interest_product_ids"])
        | set(recent["product_id"])
    )

    missing_product_ids = (
        required_product_ids - set(product_categories)
    )

    if missing_product_ids:
        raise ValueError(
            "다음 관심·행동 상품의 카테고리 정보가 없습니다: "
            f"{sorted(missing_product_ids)}"
        )

    # 6. 후보가 0개여도 동일한 컬럼 유지
    candidates = pd.DataFrame(
        candidate_rows,
        columns=CANDIDATE_COLUMNS,
    )

    return user, candidates, as_of

# ============================================================
# 8. 백엔드가 호출할 최종 함수
# ============================================================

def recommend_from_payload(payload, top_n=20):
    user, candidates, as_of = build_recommendation_inputs(
        payload
    )

    result = recommend(
        user,
        candidates,
        top_n=top_n,
        now=as_of,
    )

    listing_lookup = {
        str(item["listing_id"]): item
        for item in payload["listings"]
    }

    items = []

    for row in result["items"].to_dict(orient="records"):
        listing_id = str(row["listing_id"])
        listing_info = listing_lookup[listing_id]

        items.append({
            "listing_id": listing_id,
            "product_id": listing_info["product_id"],
            "name": listing_info["name"],
            "category_id": listing_info["category_id"],
            "store_id": listing_info["store_id"],
            "distance_km": listing_info["distance_km"],
            "created_at": listing_info["created_at"],
            "rank": int(row["rank"]),
            "score": float(row["score"]),
        })
        return {
            "request_id": normalize_id(payload["request_id"]),
            "generated_at": as_of.isoformat(),
            "rule_version": RULE_VERSION,
            "user_state": result["state"],
            "items": items,
        }