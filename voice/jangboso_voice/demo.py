"""Explicit local demo; does not impersonate the real backend login."""
import json
import os
import secrets
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .api import Merchant, build_router
from .engine import VoiceService
from .storage import SQLiteStore
from .parser import FixtureParser, GeminiParser
from .stt import WhisperSTT

def create_app():
    token=os.getenv('VOICE_DEMO_TOKEN','')
    if len(token)<16:
        raise RuntimeError('로컬 데모 전용 VOICE_DEMO_TOKEN을 16자 이상 설정하세요.')
    mode=os.getenv('VOICE_PARSER','gemini')
    if mode not in ('gemini','fixture'):
        raise RuntimeError('VOICE_PARSER는 gemini 또는 fixture여야 합니다.')
    cases=json.loads((Path(__file__).parent.parent/'tests'/'cases.json').read_text(encoding='utf-8'))
    parser=FixtureParser(cases) if mode=='fixture' else GeminiParser()
    service=VoiceService(SQLiteStore(os.getenv('VOICE_DB','voice-demo.db')),parser)
    app=FastAPI(title='장보소 음성 AI — 로컬 데모 (운영 인증 미연결)')

    bearer = HTTPBearer(auto_error=False, scheme_name='DemoBearer',
                        description='로컬 VOICE_DEMO_TOKEN 값만 입력하세요. Bearer 접두사는 자동으로 붙습니다.')

    def demo_merchant(credentials:HTTPAuthorizationCredentials | None=Depends(bearer)):
        if credentials is None or not secrets.compare_digest(credentials.credentials.encode('utf-8'), token.encode('utf-8')):
            raise HTTPException(401,'데모 인증이 필요합니다.', headers={'WWW-Authenticate':'Bearer'})
        return Merchant('demo-user','demo-store')

    app.include_router(build_router(service,demo_merchant,WhisperSTT()))
    @app.get('/products')
    def products(actor:Merchant=Depends(demo_merchant)):
        return service.products(actor.store_id)
    @app.get('/products/{product_id}')
    def detail(product_id:str,actor:Merchant=Depends(demo_merchant)):
        for p in service.products(actor.store_id):
            if p['listing_id']==product_id:
                return p
        raise HTTPException(404,'상품을 찾을 수 없습니다.')
    @app.get('/health')
    def health():
        return {'status':'ok','mode':mode,'storage':'sqlite-demo','production_ready':False}
    return app
