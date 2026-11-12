from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).parents[1]))
from models import Base, User, Market, Store, Product, Listing, ListingPriceHistory
from demo_price_history import generate_prices
from scripts.seed_demo_price_history import seed


class DemoPriceHistoryTest(unittest.TestCase):
    def test_five_calendar_months_and_current_price_anchor(self):
        as_of = datetime(2026, 11, 12, tzinfo=timezone.utc)
        points = generate_prices(42, 5000, as_of)
        self.assertEqual(points[0][0], datetime(2026, 6, 12, tzinfo=timezone.utc))
        self.assertEqual(points[-1], (as_of, 5000))
        self.assertEqual(points, generate_prices(42, 5000, as_of))
        self.assertGreater(len({price for _, price in points}), 1)
        self.assertTrue(all(price % 500 == 0 for _, price in points))
        odd_price_points = generate_prices(42, 3990, as_of)
        self.assertTrue(all(price % 500 == 0 for _, price in odd_price_points))
        self.assertEqual(odd_price_points[-1][1], 4000)
        self.assertTrue(all(4000 <= price <= 6000 for _, price in points))
        self.assertTrue(all(isinstance(price, int) for _, price in points))
        self.assertEqual(generate_prices(1, 0, as_of)[-1][1], 0)

    def test_apply_preserves_real_rows_and_prices_and_is_idempotent(self):
        engine = create_engine('sqlite://')
        Base.metadata.create_all(engine)
        factory = sessionmaker(bind=engine)
        with factory.begin() as db:
            db.add(User(user_id=1, phone='demo-test', name='demo', password_hash='unused'))
            db.add(Market(market_id=1, market_name='market', address='address'))
            db.add(Store(store_id=1, user_id=1, market_id=1, store_name='store'))
            db.add(Product(product_id=1, product_name='product'))
            db.add(Listing(listing_id=1, product_id=1, store_id=1, price=5000, sale_price=4000))
            db.add(ListingPriceHistory(history_id=1, listing_id=1, price=4500,
                                       recorded_at=datetime(2026, 11, 1, tzinfo=timezone.utc)))
        with tempfile.TemporaryDirectory() as directory:
            registry = Path(directory) / 'registry.json'
            with patch.dict('os.environ', APP_ENV='development'), \
                 patch('scripts.seed_demo_price_history.SessionLocal', factory), \
                 patch('scripts.seed_demo_price_history.REGISTRY_PATH', registry), \
                 patch('demo_price_history.REGISTRY_PATH', registry):
                self.assertEqual(seed()['new_listings'], 1)
                self.assertFalse(registry.exists())
                result = seed(apply=True)
                self.assertGreater(result['new_history_rows'], 50)
                self.assertEqual(seed(apply=True)['new_history_rows'], 0)
                ids = json.loads(registry.read_text())['listings'][0]['history_ids']
                self.assertNotIn(1, ids)
                with factory() as db:
                    self.assertEqual(db.get(ListingPriceHistory, 1).price, 4500)
                    self.assertEqual(db.get(Listing, 1).price, 5000)
                    self.assertEqual(db.get(Listing, 1).sale_price, 4000)
                    last = db.query(ListingPriceHistory).order_by(ListingPriceHistory.recorded_at.desc()).first()
                    self.assertEqual(last.price, 4000)
        engine.dispose()


if __name__ == '__main__':
    unittest.main()
