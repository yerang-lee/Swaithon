
"""Mount build_router in the existing FastAPI app with a verified merchant dependency."""

from dataclasses import dataclass
from pathlib import Path
import traceback

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
)

from .schema import AnalyzeRequest, AnswerRequest, ExecuteRequest
from .engine import VoiceError, EXECUTION_ENDPOINTS


@dataclass(frozen=True)
class Merchant:
    user_id: str
    store_id: str


def build_router(service_factory, merchant_dependency, stt=None):

    router = APIRouter(tags=["voice"])

    CATEGORY_NAMES = {
        "VEGETABLE": "채소",
        "FRUIT": "과일",
        "MEAT_EGGS": "정육·계란",
        "SEAFOOD": "수산물",
        "SIDE_DISH": "반찬",
        "PROCESSED_FOOD": "가공식품",
        "GRAINS_NUTS": "곡물·견과",
        "RICE_CAKE_BAKERY": "떡·베이커리",
        "OTHER": "기타",
    }

    # 요청한 상인의 VoiceService 생성
    def get_service(actor):
        return service_factory(actor)

    # 공통 예외 처리
    def invoke(fn, *args, **kwargs):
        try:
            result = fn(*args, **kwargs)

            if isinstance(result, dict) and "command_id" in result:

                if result.get("status") == "NEEDS_INPUT":
                    prompt = result.get("question") or result.get("message")
                    if not isinstance(prompt, str) or not prompt.strip():
                        prompt = "상품명과 가격을 다시 알려주세요."
                    result["question"] = prompt
                    result["needs_confirmation"] = False
                    result["missing_fields"] = list(result.get("missing_fields") or [])

                result["execution_endpoint"] = (
                    EXECUTION_ENDPOINTS.get(result["intent"])
                    if result["status"] == "NEEDS_CONFIRMATION"
                    else None
                )

                parsed = result.get("parsed") or {}

                if not isinstance(parsed, dict):
                    parsed = parsed.model_dump()

                if (
                    result["status"] == "NEEDS_CONFIRMATION"
                    and parsed.get("intent") == "PRODUCT_CREATE"
                    and result["intent"] == "PRODUCT_UPDATE"
                ):
                    result["message"] = (
                        "같은 상품과 판매 단위의 게시물이 있어 "
                        "가격만 수정합니다. 변경 내용을 확인해 주세요."
                    )

            print("FINAL RESPONSE:", result)
            print("FINAL RESPONSE TYPE:", type(result))

            return result

        except VoiceError as e:
            raise HTTPException(
                status_code=e.status,
                detail={
                    "code": e.code,
                    "message": e.message,
                },
            ) from None

        except Exception:
            traceback.print_exc()

            raise HTTPException(
                status_code=503,
                detail={
                    "code": "PROCESSING_UNAVAILABLE",
                    "message": "분석하지 못했습니다. 잠시 후 다시 시도해 주세요.",
                },
            ) from None

    # 상품 등록 분석 결과 응답 형식
    def registration_response(result, transcript):

        parsed = result.get("parsed") or {}

        if not isinstance(parsed, dict):
            parsed = parsed.model_dump()

        category = parsed.get("category")

        missing_fields = list(result.get("missing_fields") or [])

        if not category and "category" not in missing_fields:
            missing_fields.append("category")

        quantity = parsed.get("sale_quantity")
        sale_unit = parsed.get("sale_unit")

        unit = None

        if quantity is not None and sale_unit:

            if quantity == 1:
                quantity_text = "한"
            elif quantity == 2:
                quantity_text = "두"
            elif quantity == 3:
                quantity_text = "세"
            elif quantity == 4:
                quantity_text = "네"
            else:
                quantity_text = str(quantity).removesuffix(".0")

            unit = f"{quantity_text} {sale_unit}"

        ready = (
            result.get("status") == "NEEDS_CONFIRMATION"
            and len(missing_fields) == 0
        )

        if ready:
            response_status = "READY"
            message = "상품 등록 정보를 분석했습니다. 확인 후 등록해 주세요."

        elif result.get("status") == "NEEDS_CONFIRMATION":
            response_status = "NEEDS_INPUT"
            message = "상품 정보를 추가로 확인해 주세요."

        else:
            response_status = result.get("status")
            message = result.get(
                "message",
                "상품 정보를 추가로 확인해 주세요."
            )

        return {
            "analysis_id": result["command_id"],
            "intent": "PRODUCT_CREATE",
            "status": response_status,
            "transcript": transcript,
            "product_name": parsed.get("product_name"),
            "price": parsed.get("price"),
            "unit": unit,
            "category": category,
            "category_name": CATEGORY_NAMES.get(category),
            "missing_fields": missing_fields,
            "needs_confirmation": ready,
            "expires_at": result.get("expires_at"),
            "message": message,
        }

    # 음성 파일 STT 변환
    def transcribe_upload(file: UploadFile):

        try:
            data = file.file.read(10 * 1024 * 1024 + 1)

        finally:
            file.file.close()

        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="녹음은 10MB 이하로 보내주세요."
            )

        if stt is None:
            raise HTTPException(
                status_code=503,
                detail="음성 인식 모듈이 연결되지 않았습니다."
            )

        try:
            text = stt.transcribe(
                data,
                Path(file.filename or "").suffix
            )

        except ValueError as e:
            raise HTTPException(
                status_code=422,
                detail=str(e)
            ) from None

        except Exception:
            traceback.print_exc()

            raise HTTPException(
                status_code=503,
                detail="음성 인식에 실패했습니다. 콘솔 오류를 확인하세요."
            ) from None

        return text

    # 텍스트 음성 명령 분석
    @router.post("/voice/analyze")
    def analyze(
        body: AnalyzeRequest,
        actor: Merchant = Depends(merchant_dependency)
    ):

        service = get_service(actor)

        return invoke(
            service.analyze,
            body.text,
            actor.user_id,
            actor.store_id
        )

    # 상품 등록 음성 분석
    # 이 단계에서는 실제 상품을 DB에 등록하지 않음
    
# 음성 파일 분석(STT)
# 이 단계에서는 실제 상품 정보를 변경하지 않음
    @router.post("/voice/product-registration")
    @router.post("/voice/analyze-audio")
    def analyze_audio(
        audio_file: UploadFile = File(...),
        actor: Merchant = Depends(merchant_dependency)
    ):
        # 1. 음성 파일을 텍스트로 변환
        text = transcribe_upload(audio_file)

        print("AUDIO TRANSCRIPT:", repr(text))

        # 2. 변환된 텍스트를 기존 분석 로직에 전달
        service = get_service(actor)

        result = invoke(
            service.analyze,
            text,
            actor.user_id,
            actor.store_id
        )

        print("ANALYZE RESULT:", repr(result))

        # 3. 분석 결과 정리
        parsed = result.get("parsed") or {}

        if not isinstance(parsed, dict):
            parsed = parsed.model_dump()

        intent = result.get("intent")
        status = result.get("status")

        missing_fields = list(result.get("missing_fields") or [])

        ready = (
            status == "NEEDS_CONFIRMATION"
            and len(missing_fields) == 0
        )

        response_status = "READY" if ready else (
            "NEEDS_INPUT" if status == "NEEDS_CONFIRMATION"
            else status
        )

        # The engine stores follow-up prompts in message, not question.
        question = None
        if response_status == "NEEDS_INPUT":
            question = result.get("question")
            if not isinstance(question, str) or not question.strip():
                question = result.get("message")
            if not isinstance(question, str) or not question.strip():
                question = "상품 정보를 추가로 알려주세요."

        return {
            "command_id": result["command_id"],
            "intent": intent,
            "status": response_status,
            "transcript": text,
            "analysis_result": parsed,
            "missing_fields": missing_fields,
            "needs_confirmation": ready,
            "candidates": result.get("candidates") or [],
            "preview": result.get("preview"),
            "execution_endpoint": (
                EXECUTION_ENDPOINTS.get(intent) if ready else None
            ),
            "expires_at": result.get("expires_at"),
            "question": question,
            "message": (
                "음성 인식 및 명령 분석이 완료되었습니다."
                if ready
                else question
                if response_status == "NEEDS_INPUT"
                else result.get("message", "명령 분석에 실패했습니다.")
            ),
        }


    # 추가 정보 음성 답변
    @router.post("/voice/commands/{command_id}/answer-audio")
    def answer_audio(
        command_id: str,
        file: UploadFile = File(...),
        actor: Merchant = Depends(merchant_dependency)
    ):

        service = get_service(actor)

        # STT 실행 전 명령 소유권 및 상태 확인
        try:
            revision = invoke(
                service.check_answerable,
                command_id,
                actor.user_id,
                actor.store_id
            )

        except Exception:
            file.file.close()
            raise

        text = transcribe_upload(file)

        result = invoke(
            service.answer,
            command_id,
            actor.user_id,
            actor.store_id,
            text=text,
            expected_revision=revision
        )

        print("ANSWER RESULT:", repr(result))

        return {
            "transcript": text,
            **result
        }

    # 추가 정보 텍스트 답변
    @router.post("/voice/commands/{command_id}/answer")
    def answer(
        command_id: str,
        body: AnswerRequest,
        actor: Merchant = Depends(merchant_dependency)
    ):

        service = get_service(actor)

        return invoke(
            service.answer,
            command_id,
            actor.user_id,
            actor.store_id,
            body.text,
            body.listing_id
        )

    # 음성 명령 취소
    @router.post("/voice/commands/{command_id}/cancel")
    def cancel(
        command_id: str,
        actor: Merchant = Depends(merchant_dependency)
    ):

        service = get_service(actor)

        return invoke(
            service.cancel,
            command_id,
            actor.user_id,
            actor.store_id
        )

    # 최종 확인 후 실행할 API
    routes = {
        "/voice/product-registration/confirm": ({"PRODUCT_CREATE"}, None),
        "/voice/product-update": ({"PRODUCT_UPDATE", "SALE_CREATE"}, None),
        "/voice/product-delete": ({"PRODUCT_DELETE"}, None),
        "/voice/sold-out": ({"SOLD_OUT"}, None),
        "/voice/sale-registration": ({"SALE_CREATE"}, "create"),
        "/voice/sale-update": ({"SALE_CREATE"}, "update"),
        "/voice/sale-delete": ({"SALE_DELETE"}, None),
    }

    def execution_endpoint(allowed, sale_action=None):

        def execute(
            body: ExecuteRequest,
            actor: Merchant = Depends(merchant_dependency)
        ):

            service = get_service(actor)

            return invoke(
                service.execute,
                body.command_id,
                actor.user_id,
                actor.store_id,
                body.confirmed,
                allowed,
                sale_action=sale_action,
            )

        return execute

    for path, (allowed, sale_action) in routes.items():

        router.add_api_route(
            path,
            execution_endpoint(allowed, sale_action),
            methods=["POST"],
            name=path.rsplit("/", 1)[-1]
        )

    return router
