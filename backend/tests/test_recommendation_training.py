import ast
from datetime import datetime, timezone, timedelta
from pathlib import Path
from types import SimpleNamespace as Row
import unittest
import uuid
import sys
sys.path.insert(0, str(Path(__file__).parents[1]))
import models as db_models
from product_display import listing_display_name
from unittest.mock import MagicMock

class TrainingInputTest(unittest.TestCase):
    def build_history_payload(self, views=(), reservations=(), favorites=(), favorite_events=()):
        source = ast.parse((Path(__file__).parents[1] / "routers/recommendations.py").read_text(encoding="utf-8"))
        fn = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == "build_recommendation_payload")
        namespace = {name: getattr(db_models, name) for name in
                     ("ProductViewEvent", "FavoriteEvent", "Reservation", "Product", "Listing", "Favorite")}
        namespace.update(datetime=datetime, timezone=timezone, timedelta=timedelta, uuid=uuid, Session=object,
                         listing_display_name=listing_display_name)
        exec(compile(ast.Module(body=[fn], type_ignores=[]), "recommendations.py", "exec"), namespace)
        now = datetime.now(timezone.utc) - timedelta(hours=1)
        products = [Row(product_id=i, category_id=1 if i < 4 else 2, product_name=f"product-{i}") for i in range(1, 7)]
        listings = [Row(listing_id=i, product_id=i, store_id=3, created_at=now) for i in range(1, 7)]
        candidates = [dict(listing=listing, product=product, store=Row(store_id=3), distance_km=1)
                      for listing, product in zip(listings, products)]
        data = {db_models.ProductViewEvent: views, db_models.Reservation: reservations,
                db_models.Favorite: favorites, db_models.FavoriteEvent: favorite_events, db_models.Product: products}
        queries = {}
        def query(*models):
            q = MagicMock()
            q.join.return_value = q
            q.filter.return_value = q
            q.order_by.return_value = q
            q.all.return_value = data[models[0]]
            queries[models[0]] = q
            return q
        db = MagicMock()
        db.query.side_effect = query
        payload = namespace['build_recommendation_payload'](candidates, 9, 0, 0, db)
        for model in (db_models.ProductViewEvent, db_models.Reservation, db_models.Favorite, db_models.FavoriteEvent):
            conditions = queries[model].filter.call_args.args
            self.assertTrue(any(condition.compile().params.get('user_id_1') == 9 for condition in conditions))
        return payload

    def test_three_states_and_weights_from_database_payload(self):
        from ai.recommendation_rules import recommend_from_payload, WEIGHTS
        import math
        now = datetime.now(timezone.utc) - timedelta(hours=1)
        views = [Row(event_id=f'v{i}', product_id=i, store_id=3, occurred_at=now) for i in range(1, 6)]
        reservations = [Row(reservation_id=i, product_id=i, store_id=3, created_at=now,
                            cancelled_at=None, status='CONFIRMED') for i in range(1, 6)]
        favorites = [(Row(favorite_id=i, listing_id=i, updated_at=now, created_at=now),
                      Row(product_id=i, store_id=3), Row(product_id=i, category_id=1)) for i in (1, 2)]
        scenarios = [('new_no_interest', {}), ('new_with_interest', dict(favorites=favorites)),
                     ('behavior_based', dict(views=views, reservations=reservations))]
        for expected_state, history in scenarios:
            with self.subTest(state=expected_state):
                result = recommend_from_payload(self.build_history_payload(**history))
                self.assertEqual(result['user_state'], expected_state)
                weights = WEIGHTS[expected_state]
                for item in result['items']:
                    snapshot = item['feature_snapshot']
                    expected = sum(weights[key] * snapshot[key] for key in
                                   ('interest_match', 'category_preference', 'store_preference'))
                    expected += weights['distance_score'] / (1 + snapshot['distance_km'])
                    expected += weights['recency_score'] * math.exp(-snapshot['hours_since_created'] / 24)
                    self.assertAlmostEqual(item['score'], expected, places=8)

    def test_legacy_favorites_keep_real_time_and_existing_events_win(self):
        from ai.recommendation_rules import recommend_from_payload
        now = datetime.now(timezone.utc) - timedelta(hours=1)
        old = now - timedelta(days=31)
        favorites = [(Row(favorite_id=i, listing_id=i, updated_at=at, created_at=at),
                      Row(product_id=i, store_id=3), Row(product_id=i, category_id=1))
                     for i, at in ((1, now), (2, old), (3, now))]
        cancellation = Row(event_id=2, listing_id=3, product_id=3, store_id=3,
                           occurred_at=now, event_type='FAVORITE_CANCEL')
        payload = self.build_history_payload(favorites=favorites, favorite_events=[cancellation])
        self.assertEqual([e['event_id'] for e in payload['user']['events']], ['favorite-current:1'])
        self.assertEqual(payload['user']['events'][0]['occurred_at'], now.isoformat())
        self.assertEqual(recommend_from_payload(payload)['user_state'], 'new_no_interest')

    def test_duplicate_actions_do_not_manufacture_behavior_based_user(self):
        from ai.recommendation_rules import recommend_from_payload
        now = datetime.now(timezone.utc) - timedelta(hours=1)
        views = [Row(event_id=f'v{i}', product_id=1, store_id=3, occurred_at=now) for i in range(10)]
        reservations = [Row(reservation_id=i, product_id=1, store_id=3, created_at=now,
                            cancelled_at=None, status='CONFIRMED') for i in range(10)]
        self.assertEqual(recommend_from_payload(self.build_history_payload(
            views=views, reservations=reservations))['user_state'], 'new_no_interest')

    def test_recent_verified_pickup_is_included_even_for_old_reservation(self):
        now = datetime.now(timezone.utc) - timedelta(hours=1)
        reservations = [Row(reservation_id=1, product_id=1, store_id=3,
                            created_at=now-timedelta(days=40), cancelled_at=None,
                            status='COMPLETED', picked_up_at=now),
                        Row(reservation_id=2, product_id=2, store_id=3,
                            created_at=now-timedelta(days=40), cancelled_at=None,
                            status='COMPLETED', picked_up_at=None)]
        events = self.build_history_payload(reservations=reservations)['user']['events']
        self.assertEqual([(e['event_id'], e['event_type']) for e in events], [('pickup:1', 'purchase_confirmed')])

    def test_uses_history_and_excludes_cancelled_favorites_and_reservations(self):
        source = ast.parse((Path(__file__).parents[1] / "routers/recommendations.py").read_text(encoding="utf-8"))
        fn = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == "build_recommendation_payload")
        module = ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0), fn], type_ignores=[])
        models = {n: getattr(db_models, n) for n in ("ProductViewEvent", "FavoriteEvent", "Reservation", "Product", "Listing", "Favorite")}
        ns = dict(models, datetime=datetime, timezone=timezone, timedelta=timedelta, uuid=uuid,
                  listing_display_name=listing_display_name)
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
        def query(*query_models):
            model = query_models[0]
            q = MagicMock()
            q.filter.return_value = q
            q.order_by.return_value = q
            q.join.return_value = q
            q.all.return_value = [] if model is models['Favorite'] else rows[id(model)]
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
