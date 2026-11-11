import ast
from datetime import datetime, timezone, timedelta
from pathlib import Path
from types import SimpleNamespace as Row
import unittest
import uuid
import sys
sys.path.insert(0, str(Path(__file__).parents[1]))
import models as db_models
from unittest.mock import MagicMock

class TrainingInputTest(unittest.TestCase):
    def test_uses_history_and_excludes_cancelled_favorites_and_reservations(self):
        source = ast.parse((Path(__file__).parents[1] / "routers/recommendations.py").read_text(encoding="utf-8"))
        fn = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == "build_recommendation_payload")
        module = ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0), fn], type_ignores=[])
        models = {n: getattr(db_models, n) for n in ("ProductViewEvent", "FavoriteEvent", "Reservation", "Product")}
        ns = dict(models, datetime=datetime, timezone=timezone, timedelta=timedelta, uuid=uuid)
        exec(compile(ast.fix_missing_locations(module), "recommendations.py", "exec"), ns)
        now = datetime.now(timezone.utc) - timedelta(hours=1)
        common = dict(product_id=7, store_id=3, occurred_at=now)
        views = [Row(event_id="v", **common)]
        favorites = [Row(event_id=1, listing_id=1, event_type="FAVORITE", **common),
                     Row(event_id=2, listing_id=1, event_type="FAVORITE_CANCEL", **common)]
        reservations = [Row(reservation_id=1, created_at=now, cancelled_at=now,
                            status="CANCELLED", product_id=7, store_id=3)]
        rows = {id(models["ProductViewEvent"]): views, id(models["FavoriteEvent"]): favorites,
                id(models["Reservation"]): reservations,
                id(models["Product"]): [Row(product_id=7, category_id=2)]}
        db = MagicMock()
        def query(model):
            q = MagicMock()
            q.filter.return_value = q
            q.order_by.return_value = q
            q.all.return_value = rows[id(model)]
            return q
        db.query.side_effect = query
        payload = ns["build_recommendation_payload"]([], 1, 0, 0, db)
        self.assertEqual([e["event_type"] for e in payload["user"]["events"]], ["detail_view"])
        self.assertEqual(payload["products"], [{"product_id": "7", "category_id": "2"}])

    def test_snapshot_reproduces_score_and_shared_preferences(self):
        import math
        from ai.recommendation_rules import recommend_from_payload, WEIGHTS
        t = datetime.now(timezone.utc) - timedelta(hours=2)
        payload = dict(request_id="snapshot-test", as_of=t.isoformat(),
            user=dict(user_id="1", interest_product_ids=[], events=[
                dict(event_id="f1", product_id="7", store_id="3", event_type="favorite", occurred_at=t.isoformat()),
                dict(event_id="f2", product_id="8", store_id="3", event_type="favorite", occurred_at=t.isoformat())]),
            products=[dict(product_id="7", category_id="2"),dict(product_id="8",category_id="2")],
            listings=[dict(listing_id=str(i), product_id="7", store_id="3", name="test", category_id="2",
                           distance_km=float(i), created_at=(t-timedelta(hours=i)).isoformat()) for i in (1,2)])
        result = recommend_from_payload(payload)
        snapshots = [item["feature_snapshot"] for item in result["items"]]
        self.assertEqual(result["user_state"], "new_with_interest")
        self.assertEqual(len({s["category_preference"] for s in snapshots}), 1)
        self.assertEqual(len({s["store_preference"] for s in snapshots}), 1)
        weights = WEIGHTS[result["user_state"]]
        for item in result["items"]:
            s = item["feature_snapshot"]
            expected = sum(weights[k]*s[k] for k in ("interest_match","category_preference","store_preference"))
            expected += weights["distance_score"]/(1+s["distance_km"])
            expected += weights["recency_score"]*math.exp(-s["hours_since_created"]/24)
            self.assertAlmostEqual(item["score"], expected, places=8)

if __name__ == "__main__":
    unittest.main()
