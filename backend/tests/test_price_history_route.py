"""Exercise the actual route function without a configured PostgreSQL server."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock
import sys
sys.path.insert(0, str(Path(__file__).parents[1]))
from product_display import listing_display_name


class PriceHistoryRouteTest(unittest.TestCase):
    def setUp(self):
        source = ast.parse((Path(__file__).parents[1] / "routers/products.py").read_text(encoding="utf-8"))
        route = next(node for node in source.body
                     if isinstance(node, ast.FunctionDef) and node.name == "get_price_history")
        route.decorator_list = []
        module = ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0), route], type_ignores=[])
        self.models = {name: MagicMock(name=name) for name in
                       ("Listing", "Product", "Store", "ListingPriceHistory")}
        namespace = {**self.models, "Depends": lambda fn: None, "get_db": lambda: None,
                     "get_demo_history_ids": lambda: set(), "listing_display_name": listing_display_name}
        from fastapi import HTTPException
        namespace["HTTPException"] = HTTPException
        exec(compile(ast.fix_missing_locations(module), "products.py", "exec"), namespace)
        self.route = namespace["get_price_history"]
        self.db = MagicMock()
        self.listing = SimpleNamespace(listing_id=42, price=5000, sale_price=4000,
                                       image_url="/uploads/images/apple.png")
        self.product = SimpleNamespace(product_id=7, product_name="사과")
        self.store = SimpleNamespace(store_id=3, store_name="가게")
        self.product_query = MagicMock()
        self.product_query.join.return_value = self.product_query
        self.product_query.filter.return_value = self.product_query
        self.product_query.first.return_value = (self.listing, self.product, self.store)
        self.history_query = MagicMock()
        self.history_query.filter.return_value = self.history_query
        self.history_query.order_by.return_value = self.history_query
        self.history_query.all.return_value = [
            SimpleNamespace(history_id=1, price=5000, recorded_at="2026-11-11T00:00:00+00:00"),
            SimpleNamespace(history_id=2, price=4000, recorded_at="2026-11-11T01:00:00+00:00"),
        ]
        def query(*models):
            if len(models) == 1:
                self.assertIs(models[0], self.models["ListingPriceHistory"])
                return self.history_query
            return self.product_query
        self.db.query.side_effect = query

    def test_reads_voice_storage_table_and_preserves_wire_contract(self):
        data = self.route(42, self.db)
        self.assertEqual(data["listing_id"], 42)
        self.assertEqual(data["product_id"], 7)
        self.assertEqual(data["current_price"], 4000)
        self.assertEqual([point["price"] for point in data["price_history"]], [5000, 4000])
        self.models["ListingPriceHistory"].listing_id.__eq__.assert_called_with(42)
        self.history_query.order_by.assert_called_once_with(
            self.models["ListingPriceHistory"].recorded_at.asc(),
            self.models["ListingPriceHistory"].history_id.asc())

    def test_empty_history_stays_empty_without_fabricated_prices(self):
        self.history_query.all.return_value = []
        self.listing.sale_price = None
        data = self.route(42, self.db)
        self.assertEqual(data["current_price"], 5000)
        self.assertEqual(data["price_history"], [])

    def test_missing_listing_remains_404(self):
        from fastapi import HTTPException
        self.product_query.first.return_value = None
        with self.assertRaises(HTTPException) as caught:
            self.route(42, self.db)
        self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(self.db.query.call_count, 1)


if __name__ == "__main__":
    unittest.main()
