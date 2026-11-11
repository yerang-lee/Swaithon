"""Run only against an explicitly supplied disposable PostgreSQL database.
Usage: python tests/check_training_postgres.py postgresql+psycopg://.../postgres
Creates a transaction-local schema and rolls all fixtures/DDL back.
"""
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from models import Base, User, Market, Store, Product, Listing, RecommendationRequest, RecommendationItem, RecommendationImpression, ProductViewEvent, FavoriteEvent, Reservation, ReservationEvent

engine = create_engine(sys.argv[1])
with engine.connect() as connection:
    transaction = connection.begin()
    connection.execute(text('CREATE SCHEMA training_check'))
    connection.execute(text('SET LOCAL search_path TO training_check'))
    Base.metadata.create_all(connection)
    migration = (Path(__file__).parents[1] / 'migrations/20261111_recommendation_training.sql').read_text()
    migration = migration.replace('BEGIN;', '').replace('COMMIT;', '')
    connection.exec_driver_sql(migration)
    connection.exec_driver_sql(migration)  # Reapplication must be safe.
    db = Session(bind=connection, join_transaction_mode='create_savepoint')
    t = datetime(2026, 11, 1, tzinfo=timezone.utc)
    db.add(User(user_id=1, phone='test', password_hash='unused', name='test'))
    db.add(Market(market_id=1, market_name='test', address='test'))
    db.flush()
    db.add(Store(store_id=1, market_id=1, user_id=1, store_name='test'))
    db.add(Product(product_id=1, product_name='test', category_id=1))
    db.flush()
    snapshot = dict(interest_match=0, category_preference=0, store_preference=0,
                    distance_km=0, hours_since_created=0)
    for i in range(1, 12):
        db.add(Listing(listing_id=i, product_id=1, store_id=1, price=100))
    db.add(RecommendationRequest(request_id='r', user_id=1, as_of=t,
        generated_at=t, rule_version='rules_v1', user_state='new_no_interest'))
    db.flush()
    for i in range(1, 12):
        db.add(RecommendationItem(request_id='r', listing_id=i, product_id=1,
            store_id=1, rank=i, score=1, feature_snapshot={} if i == 9 else snapshot))
        if i != 8:  # Returned but never actually displayed.
            db.add(RecommendationImpression(event_id=f'i{i}', request_id='r', user_id=1,
                listing_id=i, position=i, occurred_at=t+timedelta(hours=25 if i == 10 else 0)))
    db.flush()
    def favorite(i, kind, hours, request_id='r'):
        db.add(FavoriteEvent(request_id=request_id, user_id=1, listing_id=i,
            product_id=1, store_id=1, event_type=kind, occurred_at=t+timedelta(hours=hours)))
    def view(i):
        db.add(ProductViewEvent(event_id=f'v{i}', request_id='r', user_id=1, listing_id=i,
            product_id=1, store_id=1, occurred_at=t+timedelta(hours=1)))
    view(2)
    favorite(3, 'FAVORITE', 1)
    view(4); favorite(4, 'FAVORITE', 1); favorite(4, 'FAVORITE_CANCEL', 2, None)
    favorite(7, 'FAVORITE', 1); favorite(7, 'FAVORITE_CANCEL', 25, None)
    for i in (5, 6, 11):
        db.add(Reservation(reservation_id=i, request_id='r', user_id=1, listing_id=i,
            product_id=1, store_id=1, quantity=1, unit_price=100, total_price=100,
            pickup_at=t+timedelta(hours=3), created_at=t+timedelta(hours=1),
            status='CANCELLED' if i==11 else 'COMPLETED' if i==6 else 'PENDING',
            picked_up_at=t+timedelta(hours=2) if i==6 else None))
    db.flush()
    for i in (5,6,11):
        db.add(ReservationEvent(request_id='r', user_id=1, reservation_id=i, listing_id=i,
            product_id=1, store_id=1, occurred_at=t+timedelta(hours=1)))
    db.flush()
    # Exercise the real impression route against PostgreSQL, including replay
    # after an earlier exposure replaces a later-arriving event.
    import ast
    from types import SimpleNamespace as Row
    from fastapi import HTTPException
    from sqlalchemy.dialects.postgresql import insert
    source = ast.parse((Path(__file__).parents[1] / 'routers/recommendations.py').read_text(encoding='utf-8'))
    route = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == 'record_recommendation_impressions')
    route.decorator_list = []
    module = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0), route], type_ignores=[])
    ns = dict(Depends=lambda fn: None, get_db=lambda: None, get_current_user=lambda: None,
        HTTPException=HTTPException, insert=insert, RecommendationRequest=RecommendationRequest,
        RecommendationItem=RecommendationItem, RecommendationImpression=RecommendationImpression)
    exec(compile(ast.fix_missing_locations(module), 'recommendations.py', 'exec'), ns)
    def expose(event_id, hours):
        return ns['record_recommendation_impressions'](Row(request_id='r', events=[
            Row(event_id=event_id, listing_id='1', position=1, occurred_at=t+timedelta(hours=hours))]),
            db, Row(user_id=1))
    assert expose('later', 3)['duplicate_count'] == 1
    # First stored time is t; use another listing with an initially later time.
    impression = db.query(RecommendationImpression).filter_by(listing_id=1).one()
    impression.occurred_at = t+timedelta(hours=2)
    db.flush()
    assert expose('earlier', 1)['recorded_count'] == 1
    assert expose('i1', 2)['duplicate_count'] == 1
    assert expose('earlier', 1)['duplicate_count'] == 1
    db.expire_all()
    assert db.query(RecommendationImpression).filter_by(listing_id=1).one().occurred_at == t+timedelta(hours=1)
    def labels(purchase=False):
        return dict(connection.execute(text('SELECT listing_id,label FROM recommendation_training_rows(:at,:purchase)'),
            dict(at=t+timedelta(hours=30), purchase=purchase)).all())
    assert labels() == {1:0,2:1,3:2,4:1,5:3,6:3,7:2}, labels()
    assert labels(True)[6] == 4
    assert connection.execute(text("SELECT count(*) FROM recommendation_training_rows(:at)"),
        dict(at=t+timedelta(hours=23))).scalar() == 0
    connection.execute(text("INSERT INTO recommendation_training_excluded_users VALUES (1,'test')"))
    assert labels() == {}
    queries = (Path(__file__).parents[1] / 'migrations/20261111_recommendation_training_queries.sql').read_text()
    queries = queries.replace('BEGIN ISOLATION LEVEL REPEATABLE READ;', '').replace('COMMIT;', '')
    connection.exec_driver_sql(queries)
    db.close()
    transaction.rollback()
print('PostgreSQL migration/reapply and label/exclusion checks passed')
