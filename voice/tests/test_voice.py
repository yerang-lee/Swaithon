import json
from copy import deepcopy
from datetime import datetime, timedelta
from pathlib import Path
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jangboso_voice.schema import Command
from jangboso_voice.parser import FixtureParser
from jangboso_voice.storage import SQLiteStore
from jangboso_voice.engine import VoiceService, VoiceError, effective_price
from jangboso_voice.api import build_router, Merchant

CASES=json.loads((Path(__file__).parent/'cases.json').read_text(encoding='utf-8'))
NOW=datetime.fromisoformat('2026-11-06T12:00:00+09:00')

def product(id,name,quantity,unit,price,shop='s'):
    return dict(listing_id=id,store_id=shop,product_name=name,price=price,sale_quantity=quantity,
        sale_unit=unit,stock_quantity=10,status='ACTIVE',sale=None,deleted_at=None,version=1)

@pytest.fixture
def svc(tmp_path):
    store=SQLiteStore(tmp_path/'test.db')
    with store.transaction() as state:
        state['products']={p['listing_id']:p for p in [product('apple','사과',10,'개',5000),
            product('berry','딸기',1,'팩',10000),product('c1','오이',1,'개',1000),
            product('c5','오이',5,'개',4500),product('other','사과',10,'개',2000,'other-shop')]}
        state['products']['berry']['sale']={'rate':20,'price':None,
            'starts_at':NOW.isoformat(),'ends_at':'2026-11-06T21:00:00+09:00'}
    return VoiceService(store,FixtureParser(CASES),clock=lambda:NOW)

@pytest.mark.parametrize('case',CASES,ids=lambda c:str(c['id']))
def test_thirty_contract_cases(svc,case):
    before=svc.products('s')
    result=svc.analyze(case['text'],'u','s')
    assert result['status']==case['expected_status']
    assert result['intent']==case['expected_intent']
    assert svc.products('s')==before
    if result['status']=='NEEDS_CONFIRMATION':
        done=svc.execute(result['command_id'],'u','s',True,{result['intent']})
        assert done['status']=='SUCCEEDED'
        assert svc.execute(result['command_id'],'u','s',True,{result['intent']})==done
        with svc.store.transaction() as state:
            assert len(state['events'])==1
            assert state['products']['other']['price']==2000
            actual=done['result']
            if result['intent']=='PRODUCT_UPDATE':
                if case['parsed'].get('price'):
                    assert actual['price']==case['parsed']['price']
                if case['parsed'].get('stock_quantity') is not None:
                    assert actual['stock_quantity']==case['parsed']['stock_quantity']
            if result['intent']=='PRODUCT_DELETE':
                assert state['products']['apple']['deleted_at'] is not None
                assert state['products']['apple']['price']==5000
            if result['intent']=='SOLD_OUT':
                assert actual['status']=='SOLD_OUT'
            if result['intent']=='SALE_DELETE':
                assert actual['sale'] is None
            if case['id']==27:
                assert actual['effective_price']==16000

def draft(svc):
    return svc.analyze('사과 가격 6천 원으로 바꿔','u','s')['command_id']

def test_no_confirmation_no_write(svc):
    cid=draft(svc)
    with pytest.raises(VoiceError,match='확인'):
        svc.execute(cid,'u','s',False,{'PRODUCT_UPDATE'})
    assert svc.products('s')[0]['price']==5000

def test_cross_user_and_store(svc):
    cid=draft(svc)
    for user,shop in [('x','s'),('u','other-shop')]:
        with pytest.raises(VoiceError) as e:
            svc.execute(cid,user,shop,True,{'PRODUCT_UPDATE'})
        assert e.value.status==404

def test_cancel_blocks_execution(svc):
    cid=draft(svc)
    svc.cancel(cid,'u','s')
    with pytest.raises(VoiceError):
        svc.execute(cid,'u','s',True,{'PRODUCT_UPDATE'})

def test_wrong_endpoint(svc):
    with pytest.raises(VoiceError):
        svc.execute(draft(svc),'u','s',True,{'PRODUCT_DELETE'})

def test_stale_product(svc):
    cid=draft(svc)
    with svc.store.transaction() as state:
        state['products']['apple']['version']+=1
    with pytest.raises(VoiceError) as e:
        svc.execute(cid,'u','s',True,{'PRODUCT_UPDATE'})
    assert e.value.code=='STALE_PRODUCT'

def test_expiration(svc):
    cid=draft(svc)
    svc.clock=lambda:NOW+timedelta(minutes=11)
    with pytest.raises(VoiceError) as e:
        svc.execute(cid,'u','s',True,{'PRODUCT_UPDATE'})
    assert e.value.code=='EXPIRED'

def test_selection(svc):
    c=svc.analyze('오이 가격 2천 원으로 바꿔','u','s')
    with pytest.raises(VoiceError):
        svc.answer(c['command_id'],'u','s',listing_id='other')
    chosen=svc.answer(c['command_id'],'u','s',listing_id='c5')
    assert chosen['listing_id']=='c5'
    assert chosen['preview']['after']['price']==2000

def test_followup(svc):
    c=svc.analyze('사과 가격 바꿉니다','u','s')
    class ReplyParser:
        def parse(self,messages):
            assert messages==['사과 가격 바꿉니다','6천 원']
            return Command(intent='PRODUCT_UPDATE',product_name='사과',price=6000)
    svc.parser=ReplyParser()
    answer=svc.answer(c['command_id'],'u','s','6천 원')
    assert answer['status']=='NEEDS_CONFIRMATION'
    assert answer['preview']['after']['price']==6000

def test_expired_discount_and_fixed_price(svc):
    p=svc.products('s')[1]
    assert effective_price(p,NOW+timedelta(days=1))==10000
    with svc.store.transaction() as state:
        state['products']['apple']['sale']={'rate':None,'price':4000,'ends_at':'2026-11-06T21:00:00+09:00'}
    c=svc.analyze('사과 10개 3천 원','u','s')
    assert c['status']=='NEEDS_INPUT'
    c=svc.analyze('사과 가격 6천 원으로 바꿔','u','s')
    assert c['preview']['after']['effective_price']==4000

def test_duplicate_create_race(svc):
    a=svc.analyze(CASES[1]['text'],'u','s')
    b=svc.analyze(CASES[1]['text'],'u','s')
    svc.execute(a['command_id'],'u','s',True,{'PRODUCT_CREATE'})
    with pytest.raises(VoiceError) as e:
        svc.execute(b['command_id'],'u','s',True,{'PRODUCT_CREATE'})
    assert e.value.code=='RECONFIRM_REQUIRED'

def test_persistence(svc):
    cid=draft(svc)
    new_service=VoiceService(SQLiteStore(svc.store.path),svc.parser,lambda:NOW)
    assert new_service.execute(cid,'u','s',True,{'PRODUCT_UPDATE'})['status']=='SUCCEEDED'

@pytest.mark.parametrize('fields',[{'price':-1},{'price':3.5},{'price':True},
    {'discount_rate':100},{'sale_quantity':float('nan')},{'stock_quantity':-1},{'listing_id':'invented'}])
def test_bad_model_output(fields):
    with pytest.raises(ValueError):
        Command(intent='PRODUCT_CREATE',**fields)

def test_http_contract(svc):
    app=FastAPI()
    app.include_router(build_router(svc,lambda:Merchant('u','s')))
    client=TestClient(app)
    c=client.post('/voice/analyze',json={'text':'사과 가격 6천 원으로 바꿔'}).json()
    assert client.post('/voice/product-delete',json={'command_id':c['command_id'],'confirmed':True}).status_code==422
    assert client.post('/voice/product-update',json={'command_id':c['command_id'],'confirmed':True}).json()['status']=='SUCCEEDED'
    assert client.post('/voice/analyze',json={'text':'x','store_id':'other'}).status_code==422
    assert client.post('/voice/analyze-audio',files={'file':('test.wav',b'bad','audio/wav')}).status_code==503

def test_demo_requires_auth(tmp_path,monkeypatch):
    from jangboso_voice.demo import create_app
    monkeypatch.setenv('VOICE_DEMO_TOKEN','test-token-local-only')
    monkeypatch.setenv('VOICE_PARSER','fixture')
    monkeypatch.setenv('VOICE_DB',str(tmp_path/'demo.db'))
    client=TestClient(create_app())
    assert client.get('/products').status_code==401
    headers={'Authorization':'Bearer test-token-local-only'}
    c=client.post('/voice/analyze',json={'text':CASES[1]['text']},headers=headers).json()
    assert client.post('/voice/product-registration',json={'command_id':c['command_id'],'confirmed':True},headers=headers).status_code==200
    assert len(client.get('/products',headers=headers).json())==1


def test_api_explains_create_to_update_routing(svc):
    app=FastAPI()
    app.include_router(build_router(svc,lambda:Merchant('u','s')))
    client=TestClient(app)
    c=client.post('/voice/analyze',json={'text':'사과 10개 3천 원'}).json()
    assert c['parsed']['intent']=='PRODUCT_CREATE'
    assert c['intent']=='PRODUCT_UPDATE'
    assert c['execution_endpoint']=='/voice/product-update'
    assert '가격만 수정' in c['message']
    body={'command_id':c['command_id'],'confirmed':True}
    wrong=client.post('/voice/product-registration',json=body)
    assert wrong.status_code==422
    assert '/voice/product-update' in wrong.json()['detail']['message']
    done=client.post(c['execution_endpoint'],json=body).json()
    assert done['status']=='SUCCEEDED'
    assert done['execution_endpoint'] is None


def test_audio_followup_uses_existing_command(svc):
    from unittest.mock import Mock
    c=svc.analyze('사과 가격 바꿉니다','u','s')
    svc.parser=Mock()
    svc.parser.parse.return_value=Command(intent='PRODUCT_UPDATE',product_name='사과',price=6000)
    stt=Mock()
    stt.transcribe.return_value='6천 원'
    app=FastAPI()
    app.include_router(build_router(svc,lambda:Merchant('u','s'),stt))
    client=TestClient(app)
    response=client.post('/voice/commands/'+c['command_id']+'/answer-audio',
        files={'file':('answer.m4a',b'fake-audio','audio/mp4')})
    assert response.status_code==200
    reply=response.json()
    assert reply['command_id']==c['command_id']
    assert reply['transcript']=='6천 원'
    assert reply['status']=='NEEDS_CONFIRMATION'
    assert reply['preview']['after']['price']==6000
    assert reply['execution_endpoint']=='/voice/product-update'
    svc.parser.parse.assert_called_once_with(['사과 가격 바꿉니다','6천 원'])
    assert svc.products('s')[0]['price']==5000
    with svc.store.transaction() as state:
        assert len(state['commands'])==1
    assert client.post(reply['execution_endpoint'],json={'command_id':c['command_id'],
        'confirmed':True}).json()['status']=='SUCCEEDED'

@pytest.mark.parametrize('scenario',['foreign','expired','cancelled','confirmed','invalid_audio','stt_failure','changed'])
def test_audio_followup_rejects_invalid_requests(svc,scenario):
    from unittest.mock import Mock
    c=svc.analyze('사과 가격 바꿉니다','u','s')
    actor=Merchant('u','s')
    stt=Mock()
    stt.transcribe.return_value='6천 원'
    expected=409
    if scenario=='foreign':
        actor=Merchant('other','s')
        expected=404
    elif scenario=='expired':
        svc.clock=lambda:NOW+timedelta(minutes=11)
    elif scenario=='cancelled':
        svc.cancel(c['command_id'],'u','s')
    elif scenario=='confirmed':
        c=svc.analyze('사과 가격 6천 원으로 바꿔','u','s')
    elif scenario=='invalid_audio':
        stt.transcribe.side_effect=ValueError('음성을 확인하지 못했습니다.')
        expected=422
    elif scenario=='stt_failure':
        stt.transcribe.side_effect=RuntimeError('private-error')
        expected=503
    elif scenario=='changed':
        def changed(*args):
            with svc.store.transaction() as state:
                state['commands'][c['command_id']]['revision']+=1
            return '6천 원'
        stt.transcribe.side_effect=changed
    app=FastAPI()
    app.include_router(build_router(svc,lambda:actor,stt))
    client=TestClient(app)
    result=client.post('/voice/commands/'+c['command_id']+'/answer-audio',
        files={'file':('answer.wav',b'fake','audio/wav')})
    assert result.status_code==expected
    assert 'private-error' not in result.text
    if scenario in ('foreign','expired','cancelled','confirmed'):
        stt.transcribe.assert_not_called()
    assert svc.products('s')[0]['price']==5000
