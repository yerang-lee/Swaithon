import ast
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

from fastapi import Depends, HTTPException, Query
from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).parents[1]))
import models
from schemas import FavoriteListResponse, ReservationListResponse
from product_display import listing_display_name


def route(filename, name):
    source = ast.parse((Path(__file__).parents[1] / 'routers' / filename).read_text(encoding='utf-8'))
    function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == name)
    function.decorator_list = []
    namespace = {**vars(models), 'Depends': Depends, 'Query': Query, 'HTTPException': HTTPException,
                 'Session': Session, 'get_db': lambda: None, 'get_current_user': lambda: None,
                 'datetime': datetime, 'timezone': timezone, 'func': func,
                 'listing_display_name': listing_display_name,
                 'category_map': {1: ('VEGETABLE', '채소')}}
    exec(compile(ast.Module(body=[function], type_ignores=[]), filename, 'exec'), namespace)
    return namespace[name]


class CustomerListPhotosTest(unittest.TestCase):
    def test_listing_photo_and_product_fallback_survive_response_serialization(self):
        engine = create_engine('sqlite://')
        models.Base.metadata.create_all(engine)
        with Session(engine) as db:
            user = models.User(user_id=1, phone='test-photo', password_hash='unused', name='test')
            db.add(user)
            db.add(models.Market(market_id=1, market_name='market', address='address'))
            db.add(models.Store(store_id=1, market_id=1, user_id=1, store_name='store'))
            for i in (1, 2):
                db.add(models.Product(product_id=i, product_name=f'product-{i}', category_id=1,
                                      image_url=f'/uploads/images/standard-{i}.png'))
                db.add(models.Listing(listing_id=i, store_id=1, product_id=i, price=1000,
                                      sale_quantity=5., sale_unit='개',
                                      image_url='/uploads/images/listing-1.png' if i == 1 else None))
                db.add(models.Favorite(favorite_id=i, user_id=1, listing_id=i, is_active=True))
                db.add(models.Reservation(reservation_id=i, user_id=1, listing_id=i, product_id=i,
                                          store_id=1, quantity=1, unit_price=1000, total_price=1000,
                                          pickup_at=datetime.now(timezone.utc), status='PENDING'))
            db.commit()
            expected = {1: '/uploads/images/listing-1.png', 2: '/uploads/images/standard-2.png'}
            favorites = route('favorites.py', 'get_my_favorites')(page=1, size=10, current_user=user, db=db)
            favorites = FavoriteListResponse(**favorites)
            self.assertEqual({row.listing_id: row.image_url for row in favorites.favorites}, expected)
            self.assertTrue(all(row.product_name.endswith(' 5개') for row in favorites.favorites))
            reservations = route('users.py', 'get_my_reservations')(
                page=1, size=10, reservation_status=None, current_user=user, db=db)
            reservations = ReservationListResponse(**reservations)
            self.assertEqual({row.listing_id: row.image_url for row in reservations.reservations}, expected)
            self.assertTrue(all(row.product_name.endswith(' 5개') for row in reservations.reservations))
        engine.dispose()


if __name__ == '__main__':
    unittest.main()
