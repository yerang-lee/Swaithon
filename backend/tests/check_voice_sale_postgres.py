"""Explicit integration check: live Gemini and PostgreSQL, with fixture changes rolled back.
Run from backend: .venv/Scripts/python.exe tests/check_voice_sale_postgres.py
No audio transcription is simulated: this checks the already-transcribed utterance onward.
"""
import contextlib
import io
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).parents[1] / '.env')
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from sqlalchemy.orm import sessionmaker
from database import engine, get_db
from models import Store, Product, Listing, ListingPriceHistory, VoiceEvent
from routers.products import router as products_router
from voice.jangboso_voice.api import build_router, Merchant
from voice.jangboso_voice.engine import VoiceService
from voice.jangboso_voice.parser import GeminiParser
from voice.jangboso_voice.storage import PostgreSQLStore

with engine.connect() as connection:
    transaction = connection.begin()
    sessions = sessionmaker(bind=connection, join_transaction_mode='create_savepoint')
    with sessions() as db:
        shop = db.get(Store, 910030)
        assert shop is not None, 'Existing synthetic test store required'
        uid, sid, market = str(shop.user_id), str(shop.store_id), shop.market_id
        product = Product(product_name='\ub538\uae30', category_id=2)
        db.add(product); db.flush()
        listing = Listing(product_id=product.product_id, store_id=int(sid), price=10000,
            sale_quantity=1, sale_unit='\ud329', stock_quantity=10, is_sold_out=False)
        db.add(listing); db.flush()
        lid = listing.listing_id
        db.add(ListingPriceHistory(listing_id=lid, price=10000))
        db.commit()
    actor = Merchant(user_id=uid, store_id=sid)
    parser = GeminiParser()
    def service(merchant):
        return VoiceService(PostgreSQLStore(int(sid), session_factory=sessions), parser)
    def test_db():
        with sessions() as db:
            yield db
    app = FastAPI()
    app.include_router(build_router(service, lambda: actor))
    app.include_router(products_router)
    app.dependency_overrides[get_db] = test_db
    # Existing route debug prints are suppressed; no raw responses or inputs are logged.
    with contextlib.redirect_stdout(io.StringIO()), TestClient(app) as client:
        response = client.post('/voice/analyze', json={'text':'\ub538\uae30 30%. \uc544\ub2c8 20%\ub85c \ud560\uc778\ud574\uc918'})
        assert response.status_code == 200, response.status_code
        analyzed = response.json()
        assert analyzed['parsed']['product_name'] == '\ub538\uae30'
        assert analyzed['parsed']['discount_rate'] == 20
        assert analyzed['parsed']['price'] is None
        if analyzed['status'] == 'NEEDS_SELECTION':
            response = client.post('/voice/commands/'+analyzed['command_id']+'/answer',json={'listing_id':str(lid)})
            assert response.status_code == 200
            analyzed = response.json()
        assert analyzed['status'] == 'NEEDS_CONFIRMATION', analyzed['status']
        cid = analyzed['command_id']
        with sessions() as db:
            assert db.get(Listing,lid).sale_price is None
        denied = client.post('/voice/sale-registration',json={'command_id':cid,'confirmed':False})
        assert denied.status_code == 409
        executed = client.post('/voice/sale-registration',json={'command_id':cid,'confirmed':True})
        assert executed.status_code == 200, executed.status_code
        assert executed.json()['status'] == 'SUCCEEDED'
        with sessions() as db:
            current = db.get(Listing,lid)
            assert (current.price,current.sale_rate,current.sale_price)==(10000,20,8000)
            version = current.version
            histories = db.scalars(select(ListingPriceHistory.price).where(ListingPriceHistory.listing_id==lid).order_by(ListingPriceHistory.history_id)).all()
            assert histories == [10000,8000],histories
            event_count = db.scalar(select(func.count()).select_from(VoiceEvent).where(VoiceEvent.command_id==cid))
            assert event_count == 1
        detail = client.get('/products/'+str(lid))
        assert detail.status_code == 200
        assert detail.json()['sale_price'] == 8000
        listed = client.get('/products',params={'market_id':market,'keyword':'\ub538\uae30','size':100})
        assert listed.status_code == 200
        row = next(p for p in listed.json()['products'] if p['listing_id']==lid)
        assert row['sale_price'] == 8000 and row['is_on_sale'] is True
        replay = client.post('/voice/sale-registration',json={'command_id':cid,'confirmed':True})
        assert replay.status_code == 200 and replay.json()['status']=='SUCCEEDED'
        with sessions() as db:
            assert db.get(Listing,lid).version == version
            assert db.scalar(select(func.count()).select_from(VoiceEvent).where(VoiceEvent.command_id==cid))==1
            assert db.scalar(select(func.count()).select_from(ListingPriceHistory).where(ListingPriceHistory.listing_id==lid))==2
    transaction.rollback()
print('PASS: live Gemini correction, confirmation guard, 20% sale, DB/history, product list/detail, idempotent replay')
print('Fixture changes rolled back; existing products unchanged')
