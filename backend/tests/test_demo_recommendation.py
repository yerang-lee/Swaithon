import copy
import ast
from datetime import datetime
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from unittest.mock import MagicMock
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parents[1]))
from ai.recommendation_ai import AIRecommender
from ai.recommendation_rules import recommend_from_payload
from ai.recommendation_personalization import personalize_recommendations
from product_display import listing_display_name
from ai.recommendation_runtime import MODEL_DIR, MODEL_VERSION, load_demo_recommender, predict_demo


def payload():
    return {
        "request_id": "demo-test", "as_of": "2026-11-12T00:00:00+00:00",
        "user": {"user_id": "1", "interest_product_ids": ["7"], "events": [
            {"event_id": "f1", "product_id": "7", "store_id": "3", "event_type": "favorite",
             "occurred_at": "2026-11-11T00:00:00+00:00"},
            {"event_id": "v2", "product_id": "8", "store_id": "4", "event_type": "detail_view",
             "occurred_at": "2026-11-11T00:00:00+00:00"},
        ]},
        "products": [{"product_id": "7", "category_id": "2"}, {"product_id": "8", "category_id": "5"}],
        "listings": [
            {"listing_id": str(i), "product_id": "7" if i % 2 else "8",
             "category_id": "2" if i % 2 else "5", "store_id": "3" if i % 2 else "4",
             "name": "test", "distance_km": i / 2, "created_at": "2026-11-11T00:00:00+00:00"}
            for i in range(1, 26)
        ],
    }


class DemoRecommendationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recommender = AIRecommender(MODEL_DIR / "recommendation_model.joblib")

    def test_real_model_top20_and_shared_features(self):
        data = payload()
        result = predict_demo(data, self.recommender)
        self.assertIsNotNone(result)
        self.assertEqual(result["recommendation_type"], "ai")
        self.assertEqual(result["model_version"], MODEL_VERSION)
        self.assertEqual(len(result["items"]), 20)
        self.assertEqual([x["rank"] for x in result["items"]], list(range(1, 21)))
        self.assertEqual([x["score"] for x in result["items"]], sorted((x["score"] for x in result["items"]), reverse=True))
        expected = {x["listing_id"]: x["feature_snapshot"] for x in recommend_from_payload(data, top_n=None)["items"]}
        for item in result["items"]:
            snapshot = item["feature_snapshot"]
            for feature in self.recommender.features[:5]:
                self.assertEqual(snapshot[feature], expected[item["listing_id"]][feature])
            self.assertEqual(snapshot["category_preference"], .75 if int(item["listing_id"]) % 2 else .25)
            self.assertEqual(snapshot["store_preference"], .75 if int(item["listing_id"]) % 2 else .25)

    def test_metadata_order_mismatch_rejected(self):
        metadata = copy.deepcopy(self.recommender.metadata)
        metadata["features"].reverse()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "metadata.json"
            path.write_text(json.dumps(metadata), encoding="utf-8")
            with self.assertRaises(ValueError):
                AIRecommender(MODEL_DIR / "recommendation_model.joblib", path)

    def test_load_failure_and_production_guard(self):
        with patch.dict(os.environ, APP_ENV="production"), patch("ai.recommendation_ai.joblib.load") as load:
            self.assertIsNone(load_demo_recommender())
            load.assert_not_called()
        with patch.dict(os.environ, APP_ENV="development"):
            self.assertEqual(load_demo_recommender().model_version, MODEL_VERSION)
            with patch("ai.recommendation_ai.joblib.load", side_effect=RuntimeError("private payload")):
                with self.assertLogs("ai.recommendation_runtime", level="ERROR") as logs:
                    self.assertIsNone(load_demo_recommender())
                self.assertNotIn("private payload", str(logs.output))

    def test_predict_failure_requests_rule_fallback(self):
        with patch.object(self.recommender.model, "predict", side_effect=RuntimeError("private payload")):
            with self.assertLogs("ai.recommendation_runtime", level="ERROR") as logs:
                self.assertIsNone(predict_demo(payload(), self.recommender))
            self.assertNotIn("private payload", str(logs.output))

    def test_api_preserves_ai_order_and_falls_back_to_rule(self):
        from fastapi import FastAPI, Depends, Query, Request, HTTPException
        from fastapi.testclient import TestClient

        data = payload()
        candidates = [dict(
            listing=SimpleNamespace(listing_id=int(row["listing_id"]), sale_price=100, price=200,
                                    sale_quantity=5.0, sale_unit='개',
                                    created_at=datetime.fromisoformat(row["created_at"])),
            product=SimpleNamespace(product_id=int(row["product_id"]), category_id=int(row["category_id"]), product_name="test"),
            store=SimpleNamespace(store_id=int(row["store_id"]), store_name="store"),
            market=SimpleNamespace(market_id=1), distance_km=row["distance_km"],
        ) for row in data["listings"]]
        source = ast.parse((Path(__file__).parents[1] / "routers/recommendations.py").read_text(encoding="utf-8"))
        functions = [node for node in source.body if isinstance(node, ast.FunctionDef)
                     and node.name in ("get_recommendations", "run_rule_recommendation")]
        for node in functions:
            node.decorator_list = []
        namespace = dict(Request=Request, Query=Query, Depends=Depends, HTTPException=HTTPException,
                         Session=object, User=SimpleNamespace, Market=object,
                         get_db=lambda: None, get_current_user=lambda: SimpleNamespace(user_id=1),
                         get_recommendation_candidates=MagicMock(return_value=candidates),
                         build_recommendation_payload=MagicMock(return_value=data),
                         save_recommendation_result=MagicMock(), predict_demo=predict_demo,
                         recommend_from_payload=recommend_from_payload,
                         personalize_recommendations=personalize_recommendations,
                         listing_display_name=listing_display_name)
        exec(compile(ast.Module(body=functions, type_ignores=[]), "recommendations.py", "exec"), namespace)
        app = FastAPI()
        app.state.recommender = self.recommender
        app.get("/recommendations")(namespace["get_recommendations"])
        with TestClient(app) as client:
            response = client.get("/recommendations?latitude=37&longitude=127")
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["recommendation_type"], "ai")
            self.assertEqual(result["model_version"], MODEL_VERSION)
            self.assertEqual(result['items'][0]['name'], 'test 5개')
            self.assertEqual({i['category_id'] for i in result['items'][:2]}, {'2'})
            self.assertTrue(all('ranking_base_score' in i['feature_snapshot'] for i in result['items']))
            saved = namespace["save_recommendation_result"].call_args.kwargs["result"]
            self.assertEqual(saved["items"][0]["feature_snapshot"]["model_version"], MODEL_VERSION)
            with patch.object(self.recommender.model, "predict", side_effect=RuntimeError("failed")):
                with self.assertLogs("ai.recommendation_runtime", level="ERROR"):
                    response = client.get("/recommendations?latitude=37&longitude=127")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["recommendation_type"], "rule")
                self.assertIsNone(response.json()["model_version"])
            app.state.recommender = None
            self.assertEqual(client.get("/recommendations?latitude=37&longitude=127").json()["recommendation_type"], "rule")


if __name__ == "__main__":
    unittest.main()
