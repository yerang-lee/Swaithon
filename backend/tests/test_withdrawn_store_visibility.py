"""Exercise real ORM queries against an isolated database, without deleting stores."""
import ast
from datetime import datetime, timezone
import math
from pathlib import Path
import sys
import unittest

from fastapi import Depends, HTTPException, Query
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).parents[1]))
import models
import schemas
from product_display import listing_display_name


def load_functions(filename, names):
    source = ast.parse((Path(__file__).parents[1] / 'routers' / filename).read_text(encoding='utf-8'))
    functions = [node for node in source.body if isinstance(node, ast.FunctionDef) and node.name in names]
    for function in functions:
        function.decorator_list = []
    namespace = {**vars(models), **vars(schemas), 'Depends': Depends, 'Query': Query,
                 'HTTPException': HTTPException, 'Session': Session, 'get_db': lambda: None, 'math': math,
                 'get_current_user': lambda: None, 'listing_display_name': listing_display_name}
    exec(compile(ast.Module(body=functions, type_ignores=[]), filename, 'exec'), namespace)
    return namespace


class WithdrawnStoreVisibilityTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        models.Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add(models.Market(market_id=1, market_name='market', address='address', latitude=37, longitude=127))
        for i in (1, 2):
            self.db.add(models.User(user_id=i, phone=f'test-{i}', password_hash='unused', name=f'user-{i}', role='MERCHANT'))
            self.db.add(models.Store(store_id=i, user_id=i, market_id=1, store_name=f'store-{i}'))
            self.db.add(models.Product(product_id=i, product_name=f'product-{i}', category_id=1))
            self.db.add(models.Listing(listing_id=i, product_id=i, store_id=i, price=1000,
                                       sale_quantity=5., sale_unit='개'))
        self.db.commit()
        self.market_routes = load_functions('markets.py', {'get_market_stores'})
        self.store_routes = load_functions('stores.py', {'get_store', 'get_store_products', 'get_my_listings'})
        self.product_routes = load_functions('products.py', {'get_products', 'get_product_detail'})
        self.recommendations = load_functions('recommendations.py', {'calculate_distance_km', 'get_recommendation_candidates'})

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def withdraw(self):
        self.db.get(models.User, 1).deleted_at = datetime.now(timezone.utc)
        self.db.commit()

    def market_stores(self, page=1, size=10, keyword=None):
        return self.market_routes['get_market_stores'](1, page=page, size=size, db=self.db, keyword=keyword)

    def test_home_list_count_pagination_and_search_exclude_withdrawn_owner(self):
        self.assertEqual(self.market_stores()['total_count'], 2)
        self.withdraw()
        result = self.market_stores(size=1)
        self.assertEqual(result['total_count'], 1)
        self.assertEqual([s.store_id for s in result['stores']], [2])
        self.assertEqual(self.market_stores(page=2, size=1)['stores'], [])
        self.assertEqual(self.market_stores(keyword='store-1')['total_count'], 0)
        self.assertIsNotNone(self.db.get(models.Store, 1))

    def test_details_and_store_products_hide_withdrawn_owner(self):
        self.assertEqual(self.store_routes['get_store'](1, db=self.db).store_id, 1)
        self.withdraw()
        for function, kwargs in (
            (self.store_routes['get_store'], dict(store_id=1)),
            (self.store_routes['get_store_products'], dict(store_id=1, page=1, size=10)),
            (self.product_routes['get_product_detail'], dict(listing_id=1)),
        ):
            with self.subTest(function=function.__name__):
                with self.assertRaises(HTTPException) as error:
                    function(db=self.db, **kwargs)
                self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(self.store_routes['get_store'](2, db=self.db).store_id, 2)
        self.assertEqual(self.store_routes['get_store_products'](2, db=self.db, page=1, size=10).total_count, 1)

    def test_product_lists_and_recommendation_candidates_hide_withdrawn_owner(self):
        self.withdraw()
        products = self.product_routes['get_products'](market_id=1, page=1, size=10, db=self.db)
        self.assertEqual(products.total_count, 1)
        self.assertEqual([item.store_id for item in products.products], [2])
        self.assertEqual(products.products[0].product_name, 'product-2 5개')
        self.assertEqual(self.product_routes['get_product_detail'](2, db=self.db).product_name, 'product-2 5개')
        self.assertEqual(self.store_routes['get_store_products'](2, page=1, size=10, db=self.db).products[0].product_name,
                         'product-2 5개')
        self.assertEqual(self.store_routes['get_my_listings'](page=1, size=10, is_sold_out=None,
                         current_user=self.db.get(models.User, 2), db=self.db).listings[0].product_name, 'product-2 5개')
        for market_id in (None, 1):
            candidates = self.recommendations['get_recommendation_candidates'](self.db, 37, 127, market_id)
            self.assertEqual([row['store'].store_id for row in candidates], [2])


if __name__ == '__main__':
    unittest.main()
