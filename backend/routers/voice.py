
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import User, Store

from voice.jangboso_voice.api import Merchant, build_router


# 1. 로그인한 사용자가 상인인지 확인하고 본인 가게 조회
def get_current_merchant(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Merchant:

    if current_user.role != "MERCHANT":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="상인만 이용할 수 있는 기능입니다.",
        )

    store = (
        db.query(Store)
        .filter(Store.user_id == current_user.user_id)
        .first()
    )

    if not store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="등록된 가게가 없습니다.",
        )

    return Merchant(
        user_id=str(current_user.user_id),
        store_id=str(store.store_id),
    )


# 2. AI 음성 라우터 생성
def create_voice_router(service, stt=None):
    """
    service: PostgreSQL 저장소가 연결된 VoiceService
    stt: WhisperSTT 인스턴스 (미연결 시 None)
    """
    return build_router(
        service=service,
        merchant_dependency=get_current_merchant,
        stt=stt,
    )


"""from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from security import get_current_user
from database import get_db
from models import VoiceAnalysis, User, Store, Product, Listing
from schemas import VoiceAnalysisCreate, VoiceAnalysisResponse
from voice.jangboso_voice.api import Merchant

# 기존 인증 함수에 맞게 import 필요
# from auth import get_current_user

router = APIRouter(
    prefix="/voice",
    tags=["음성 상품 관리"],
)


# 상품 등록 음성 분석 결과 저장
@router.post(
    "/product-registration",
    response_model=VoiceAnalysisResponse,
)
def create_voice_analysis(
    request: VoiceAnalysisCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if request.intent != "PRODUCT_CREATE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="상품 등록 요청만 가능합니다.",
        )

    analysis = VoiceAnalysis(
        user_id=current_user.user_id,
        intent=request.intent,
        analysis_result=request.model_dump(),
        status="PENDING",
    )

    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    return analysis

# 음성 분석 결과 최종 반영
@router.post(
    "/analysis/{analysis_id}/apply",
    response_model=VoiceAnalysisResponse,
)
def apply_voice_analysis(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. 본인의 분석 결과 조회
    analysis = (
        db.query(VoiceAnalysis)
        .filter(
            VoiceAnalysis.analysis_id == analysis_id,
            VoiceAnalysis.user_id == current_user.user_id,
        )
        .first()
    )

    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="분석 결과를 찾을 수 없습니다.",
        )

    # 2. 이미 처리된 분석 결과인지 확인
    if analysis.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 처리된 분석 결과입니다.",
        )

    # 3. 상인의 가게 조회
    store = (
        db.query(Store)
        .filter(Store.user_id == current_user.user_id)
        .first()
    )

    if not store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="등록된 가게가 없습니다.",
        )

    # 4. 분석 결과 가져오기
    result = analysis.analysis_result
    intent = analysis.intent
    product_name = result.get("product_name")

    # 5. 해당 가게의 상품 판매 정보 조회
    listing = (
        db.query(Listing)
        .join(Product, Listing.product_id == Product.product_id)
        .filter(
            Listing.store_id == store.store_id,
            Product.product_name == product_name,
        )
        .first()
    )

    try:
        # 상품 등록
        if intent == "PRODUCT_CREATE":
            if listing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="이미 등록된 상품입니다.",
                )

            # 표준 상품 조회
            product = (
                db.query(Product)
                .filter(Product.product_name == product_name)
                .first()
            )

            # 표준 상품이 없으면 생성
            if not product:
                product = Product(
                    product_name=product_name,
                )

                db.add(product)
                db.flush()

            # 판매 정보 등록
            new_listing = Listing(
                product_id=product.product_id,
                store_id=store.store_id,
                price=result.get("price"),
                sale_price=result.get("sale_price"),
                is_sold_out=False,
            )

            db.add(new_listing)

        # 상품 정보 수정
        elif intent == "PRODUCT_UPDATE":
            if not listing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="수정할 상품이 없습니다.",
                )

            if result.get("price") is not None:
                listing.price = result["price"]

            if result.get("sale_price") is not None:
                listing.sale_price = result["sale_price"]

            elif result.get("discount_rate") is not None:
                discount_rate = result["discount_rate"]

                listing.sale_price = int(
                    listing.price * (1 - discount_rate / 100)
                )

        # 상품 삭제
        elif intent == "PRODUCT_DELETE":
            if not listing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="삭제할 상품이 없습니다.",
                )

            db.delete(listing)

        # 품절 처리
        elif intent == "PRODUCT_SOLD_OUT":
            if not listing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="품절 처리할 상품이 없습니다.",
                )

            listing.is_sold_out = True

        # 할인 등록 취소
        elif intent == "SALE_DELETE":
            if not listing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="할인 취소할 상품이 없습니다.",
                )

            listing.sale_price = None

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="지원하지 않는 음성 분석 유형입니다.",
            )

        # 6. 분석 결과 최종 반영 상태 변경
        analysis.status = "APPLIED"
        analysis.applied_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(analysis)

        return analysis

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="분석 결과 반영 중 오류가 발생했습니다.",
        )

# 음성 분석 결과 취소 및 삭제
@router.delete(
    "/analysis/{analysis_id}",
    status_code=status.HTTP_200_OK,
)
def cancel_voice_analysis(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis = (
        db.query(VoiceAnalysis)
        .filter(
            VoiceAnalysis.analysis_id == analysis_id,
            VoiceAnalysis.user_id == current_user.user_id,
        )
        .first()
    )

    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="분석 결과를 찾을 수 없습니다.",
        )

    if analysis.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="대기 상태의 분석 결과만 삭제할 수 있습니다.",
        )

    try:
        db.delete(analysis)
        db.commit()

        return {
            "analysis_id": analysis_id,
            "message": "음성 분석 결과가 삭제되었습니다.",
        }

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="분석 결과 삭제 중 오류가 발생했습니다.",
        )

# 상품 수정 음성 분석 결과 저장
@router.post(
    "/product-update",
    response_model=VoiceAnalysisResponse,
)
def update_voice_analysis(
    request: VoiceAnalysisCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if request.intent != "PRODUCT_UPDATE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="상품 수정 요청만 가능합니다.",
        )

    analysis = VoiceAnalysis(
        user_id=current_user.user_id,
        intent=request.intent,
        analysis_result=request.model_dump(),
        status="PENDING",
    )

    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    return analysis

# 상품 삭제 음성 분석 결과 저장
@router.post(
    "/product-delete",
    response_model=VoiceAnalysisResponse,
)
def delete_voice_analysis(
    request: VoiceAnalysisCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if request.intent != "PRODUCT_DELETE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="상품 삭제 요청만 가능합니다.",
        )

    analysis = VoiceAnalysis(
        user_id=current_user.user_id,
        intent=request.intent,
        analysis_result=request.model_dump(),
        status="PENDING",
    )

    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    return analysis

def get_current_merchant(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Merchant:

    if current_user.role != "MERCHANT":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="상인만 이용할 수 있는 기능입니다.",
        )

    store = (
        db.query(Store)
        .filter(Store.user_id == current_user.user_id)
        .first()
    )

    if not store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="등록된 가게가 없습니다.",
        )

    return Merchant(
        user_id=str(current_user.user_id),
        store_id=str(store.store_id),
    )"""

