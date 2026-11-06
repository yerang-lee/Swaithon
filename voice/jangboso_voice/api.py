"""Mount build_router in the existing FastAPI app with a verified merchant dependency."""
from dataclasses import dataclass
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from .schema import AnalyzeRequest, AnswerRequest, ExecuteRequest
from .engine import VoiceError, EXECUTION_ENDPOINTS

@dataclass(frozen=True)
class Merchant:
    user_id: str
    store_id: str

def build_router(service, merchant_dependency, stt=None):
    router=APIRouter(tags=['voice'])

    def invoke(fn, *args, **kwargs):
        try:
            result = fn(*args, **kwargs)
            if isinstance(result, dict) and 'command_id' in result:
                result['execution_endpoint'] = (EXECUTION_ENDPOINTS.get(result['intent'])
                    if result['status'] == 'NEEDS_CONFIRMATION' else None)
                if (result['status'] == 'NEEDS_CONFIRMATION'
                        and result['parsed']['intent'] == 'PRODUCT_CREATE'
                        and result['intent'] == 'PRODUCT_UPDATE'):
                    result['message'] = '같은 상품과 판매 단위의 게시물이 있어 가격만 수정합니다. 변경 내용을 확인해 주세요.'
            return result
        except VoiceError as e:
            raise HTTPException(e.status,detail={'code':e.code,'message':e.message}) from None
        except Exception:
            # Never return API credentials, upstream payloads or internal exception strings.
            raise HTTPException(503,detail={'code':'PROCESSING_UNAVAILABLE',
                'message':'분석하지 못했습니다. 잠시 후 다시 시도해 주세요.'}) from None

    @router.post('/voice/analyze')
    def analyze(body:AnalyzeRequest, actor:Merchant=Depends(merchant_dependency)):
        return invoke(service.analyze,body.text,actor.user_id,actor.store_id)

    @router.post('/voice/analyze-audio')
    def audio(file:UploadFile=File(...), actor:Merchant=Depends(merchant_dependency)):
        try:
            data=file.file.read(10*1024*1024+1)
        finally:
            file.file.close()
        if len(data)>10*1024*1024:
            raise HTTPException(413,'녹음은 10MB 이하로 보내주세요.')
        if stt is None:
            raise HTTPException(503,'음성 인식 모듈이 연결되지 않았습니다.')
        try:
            text=stt.transcribe(data,Path(file.filename or '').suffix)
        except ValueError as e:
            raise HTTPException(422,str(e)) from None
        except Exception:
            raise HTTPException(503,'음성 인식에 실패했습니다. FFmpeg와 Whisper 설정을 확인하세요.') from None
        result=invoke(service.analyze,text,actor.user_id,actor.store_id)
        return {'transcript':text,**result}

    @router.post('/voice/commands/{command_id}/answer')
    def answer(command_id:str,body:AnswerRequest,actor:Merchant=Depends(merchant_dependency)):
        return invoke(service.answer,command_id,actor.user_id,actor.store_id,body.text,body.listing_id)

    @router.post('/voice/commands/{command_id}/cancel')
    def cancel(command_id:str,actor:Merchant=Depends(merchant_dependency)):
        return invoke(service.cancel,command_id,actor.user_id,actor.store_id)

    routes={
        '/voice/product-registration':{'PRODUCT_CREATE'},
        '/voice/product-update':{'PRODUCT_UPDATE','SALE_CREATE'},
        '/voice/product-delete':{'PRODUCT_DELETE'},
        '/voice/sold-out':{'SOLD_OUT'},
        '/voice/sale-registration':{'SALE_CREATE'},
        '/voice/sale-update':{'SALE_CREATE'},
        '/voice/sale-delete':{'SALE_DELETE'},
    }
    def execution_endpoint(allowed):
        def execute(body:ExecuteRequest,actor:Merchant=Depends(merchant_dependency)):
            return invoke(service.execute,body.command_id,actor.user_id,actor.store_id,body.confirmed,allowed)
        return execute
    for path,allowed in routes.items():
        router.add_api_route(path,execution_endpoint(allowed),methods=['POST'],
                             name=path.rsplit('/',1)[-1])
    return router
