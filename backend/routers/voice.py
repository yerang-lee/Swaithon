
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import User, Store

from voice.jangboso_voice.api import Merchant, build_router


# 로그인한 사용자가 상인인지 확인하고 본인 가게 조회
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


# 음성 AI API 라우터 생성
def create_voice_router(service_factory, stt=None):
    """
    service_factory: 상인별 VoiceService를 생성하는 함수
    stt: WhisperSTT 인스턴스
    """
    return build_router(
        service_factory=service_factory,
        merchant_dependency=get_current_merchant,
        stt=stt,
    )
