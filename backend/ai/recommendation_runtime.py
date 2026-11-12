"""Development-only demo model lifecycle and API result adapter."""

import logging
import os
from pathlib import Path

from .recommendation_rules import RULE_VERSION

logger = logging.getLogger(__name__)
MODEL_VERSION = "demo_ranker_data2_v1"
MODEL_DIR = Path(__file__).resolve().parents[2] / "recommendation" / MODEL_VERSION


def log_model_error(stage):
    # Python server equivalent of appDiagnostics: fixed codes only, no payload,
    # exception text, paths, credentials or raw model outputs.
    logger.error("recommendation.%s: DEMO_MODEL_FAILED; using rule recommendation", stage)


def load_demo_recommender():
    if os.getenv("APP_ENV", "").lower() != "development":
        return None
    try:
        # Lazy import keeps model dependencies optional outside development.
        from .recommendation_ai import AIRecommender

        recommender = AIRecommender(MODEL_DIR / "recommendation_model.joblib")
        if recommender.model_version != MODEL_VERSION:
            raise ValueError("Unexpected demo model version")
        return recommender
    except Exception:
        log_model_error("load")
        return None


def predict_demo(payload, recommender, top_n=20):
    if recommender is None:
        return None
    try:
        output = recommender.recommend(payload, top_n=top_n)
        result = dict(output["response"])
        if result["recommendation_type"] != "ai" or result["model_version"] != MODEL_VERSION:
            raise ValueError("Unexpected demo response")
        snapshots = {str(row["listing_id"]): row for row in output["feature_snapshot"]}
        listings = {str(row["listing_id"]): row for row in payload["listings"]}
        result["items"] = [
            {**item, "feature_snapshot": {
                **snapshots[str(item["listing_id"])],
                "feature_definition_version": recommender.metadata["feature_definition_version"],
                "category_id": listings[str(item["listing_id"])]["category_id"],
            }}
            for item in result["items"]
        ]
        result["as_of"] = payload["as_of"]
        # Existing DB schema stores the feature-generating rule version here.
        # The model version remains in each item's snapshot and API response.
        result["rule_version"] = RULE_VERSION
        return result
    except Exception:
        log_model_error("predict")
        return None
