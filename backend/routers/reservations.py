import uuid
import traceback
import os
import hmac
import hashlib

from datetime import timedelta
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func

from database import get_db
from security import get_current_user
from models import (
    User,
    Listing,
    Product,
    Store,
    Reservation,
    ReservationEvent,
    RecommendationRequest,
    RecommendationItem,
    Notification,
)
from schemas import (
    ReservationCreateRequest,
    ReservationCreateResponse,
    ReservationDetailResponse,
    PickupVerifyRequest,
    PickupVerifyResponse,
    ReservationStatusUpdateRequest,
    ReservationStatusUpdateResponse,
    MerchantReservationListItem,
    MerchantReservationListResponse,
)

load_dotenv()

QR_SECRET_KEY = os.getenv("QR_SECRET_KEY")

router = APIRouter(
    prefix="/reservations",
    tags=["Reservations"]
)

category_map = {
    1: "채소",
    2: "과일",
    3: "정육·계란",
    4: "수산물",
    5: "반찬",
    6: "가공식품",
    7: "곡물·견과",
    8: "떡·베이커리",
    9: "기타",
}

if not QR_SECRET_KEY:
    raise RuntimeError("QR_SECRET_KEY가 .env에 설정되지 않았습니다.")


def generate_qr_token(
    reservation_id: int,
    expires_at: datetime
) -> str:
    expiry_timestamp = int(expires_at.timestamp())

    payload = f"{reservation_id}:{expiry_timestamp}"

    signature = hmac.new(
        QR_SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

    return f"pickup_{reservation_id}_{expiry_timestamp}_{signature}"

def hash_qr_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

@router.post(
    "",
    response_model=ReservationCreateResponse,
    status_code=201
)

def create_reservation(
    body: ReservationCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. 픽업 시간 검증
    if body.pickup_at.tzinfo is None or body.pickup_at.utcoffset() is None:
        raise HTTPException(
            status_code=422,
            detail="픽업 시간에는 시간대 정보가 필요합니다."
        )

    now = datetime.now(timezone.utc)

    if body.pickup_at <= now:
        raise HTTPException(
            status_code=422,
            detail="픽업 시간은 현재 시각 이후여야 합니다."
        )

    # 2. 판매 게시물 조회 및 행 잠금
    listing = (
        db.query(Listing)
        .filter(
            Listing.listing_id == body.listing_id,
            Listing.deleted_at.is_(None)
        )
        .with_for_update()
        .first()
    )

    if not listing:
        raise HTTPException(
            status_code=404,
            detail="판매 게시물을 찾을 수 없습니다."
        )

    # 3. 상품 ID 일치 여부 확인
    if listing.product_id != body.product_id:
        raise HTTPException(
            status_code=400,
            detail="판매 게시물과 상품 정보가 일치하지 않습니다."
        )

    product = db.query(Product).filter(
        Product.product_id == listing.product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="상품을 찾을 수 없습니다."
        )

    store = db.query(Store).filter(
        Store.store_id == listing.store_id
    ).first()

    if not store:
        raise HTTPException(
            status_code=404,
            detail="상점 정보를 찾을 수 없습니다."
        )

    # 4. 판매 가능 여부 확인
    if listing.is_sold_out:
        raise HTTPException(
            status_code=409,
            detail="품절된 상품입니다."
        )

    if listing.stock_quantity is None:
        raise HTTPException(
            status_code=409,
            detail="상품의 예약 가능 수량이 등록되지 않았습니다."
        )

    if listing.stock_quantity < body.quantity:
        raise HTTPException(
            status_code=409,
            detail="예약 가능 수량이 부족합니다."
        )

    # 5. 추천 요청 검증
    if body.request_id:
        recommendation_request = (
            db.query(RecommendationRequest)
            .filter(
                RecommendationRequest.request_id == body.request_id,
                RecommendationRequest.user_id == current_user.user_id
            )
            .first()
        )

        if not recommendation_request:
            raise HTTPException(
                status_code=404,
                detail="추천 요청을 찾을 수 없습니다."
            )

        recommendation_item = (
            db.query(RecommendationItem)
            .filter(
                RecommendationItem.request_id == body.request_id,
                RecommendationItem.listing_id == body.listing_id
            )
            .first()
        )

        if not recommendation_item:
            raise HTTPException(
                status_code=400,
                detail="해당 상품은 추천 결과에 포함되지 않았습니다."
            )

    # 6. 예약 가격 계산
    unit_price = (
        listing.sale_price
        if listing.sale_price is not None
        else listing.price
    )

    total_price = unit_price * body.quantity

    # 7. 재고 차감
    listing.stock_quantity -= body.quantity

    if listing.stock_quantity == 0:
        listing.is_sold_out = True

    # 8. 예약 생성
    reservation = Reservation(
        user_id=current_user.user_id,
        listing_id=listing.listing_id,
        product_id=product.product_id,
        store_id=store.store_id,
        quantity=body.quantity,
        unit_price=unit_price,
        total_price=total_price,
        pickup_at=body.pickup_at,
        request_note=body.request_note,
        request_id=body.request_id,
        status="PENDING",
    )

    try:
        db.add(reservation)
        db.flush()

        # 9. 추천 AI 예약 이벤트 기록
        reservation_event = ReservationEvent(
            request_id=body.request_id,
            user_id=current_user.user_id,
            reservation_id=reservation.reservation_id,
            listing_id=listing.listing_id,
            product_id=product.product_id,
            store_id=store.store_id,
            event_type="RESERVATION",
            occurred_at=now,
        )

        db.add(reservation_event)

        # 10. 고객에게 예약 완료 알림 생성
        notification = Notification(
            user_id=current_user.user_id,
            type="RESERVATION",
            title="픽업 예약 완료",
            content=f"{product.product_name} 픽업 예약이 완료되었습니다.",
            related_id=reservation.reservation_id,
            is_read=False,
        )

        db.add(notification)

        # 예약과 알림을 함께 저장
        db.commit()
        db.refresh(reservation)

    except Exception:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="예약 생성 중 오류가 발생했습니다."
        )

    # 10. 응답 반환
    return ReservationCreateResponse(
        reservation_id=reservation.reservation_id,
        user_id=current_user.user_id,
        listing_id=listing.listing_id,
        product_id=product.product_id,
        product_name=product.product_name,
        store_id=store.store_id,
        store_name=store.store_name,
        quantity=body.quantity,
        unit_price=unit_price,
        total_price=total_price,
        pickup_at=reservation.pickup_at,
        request_note=reservation.request_note,
        status=reservation.status,
        created_at=reservation.created_at,
        message="픽업 예약이 완료되었습니다."
    )

@router.get(
    "/merchant",
    response_model=MerchantReservationListResponse,
)
def get_merchant_reservations(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    status: str | None = Query(
        None,
        pattern="^(PENDING|CONFIRMED|READY|COMPLETED|CANCELLED)$",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 상인 계정 확인
    if current_user.role != "MERCHANT":
        raise HTTPException(
            status_code=403,
            detail="상인만 예약 목록을 조회할 수 있습니다.",
        )

    # 로그인한 상인의 가게 조회
    store = db.query(Store).filter(
        Store.user_id == current_user.user_id
    ).first()

    if not store:
        raise HTTPException(
            status_code=403,
            detail="등록된 가게가 없습니다.",
        )

    # 해당 가게의 예약 조회
    query = (
        db.query(Reservation, Product)
        .join(Product, Reservation.product_id == Product.product_id)
        .filter(Reservation.store_id == store.store_id)
    )

    # 상태 필터
    if status:
        query = query.filter(Reservation.status == status)

    # 전체 개수
    total_count = query.count()

    # 페이지네이션
    results = (
        query
        .order_by(Reservation.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    reservations = [
        MerchantReservationListItem(
            reservation_id=reservation.reservation_id,
            customer_id=reservation.user_id,
            product_id=reservation.product_id,
            product_name=product.product_name,
            quantity=reservation.quantity,
            unit_price=reservation.unit_price,
            total_price=reservation.total_price,
            pickup_at=reservation.pickup_at,
            request_note=reservation.request_note,
            status=reservation.status,
            created_at=reservation.created_at,
        )
        for reservation, product in results
    ]

    return MerchantReservationListResponse(
        reservations=reservations,
        total_count=total_count,
        page=page,
        size=size,
    )

@router.get(
    "/{reservation_id}",
    response_model=ReservationDetailResponse
)
def get_reservation_detail(
    reservation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. 예약 조회
    reservation = db.query(Reservation).filter(
        Reservation.reservation_id == reservation_id
    ).first()

    if not reservation:
        raise HTTPException(
            status_code=404,
            detail="예약을 찾을 수 없습니다."
        )

    # 2. 예약 소유자 확인
    if reservation.user_id != current_user.user_id:
        raise HTTPException(
            status_code=403,
            detail="해당 예약을 조회할 권한이 없습니다."
        )

    # 3. 상품 및 상점 조회
    product = db.query(Product).filter(
        Product.product_id == reservation.product_id
    ).first()

    store = db.query(Store).filter(
        Store.store_id == reservation.store_id
    ).first()

    if not product or not store:
        raise HTTPException(
            status_code=404,
            detail="상품 또는 상점 정보를 찾을 수 없습니다."
        )

    now = datetime.now(timezone.utc)

    qr_code_data = None
    qr_code_expires_at = None

    # 4. READY 상태일 때만 QR 발급
    if reservation.status == "READY":

        # 기존 QR이 유효한 경우
        if (
            reservation.qr_token_hash
            and reservation.qr_code_expires_at
            and reservation.qr_code_expires_at > now
        ):
            existing_token = generate_qr_token(
                reservation.reservation_id,
                reservation.qr_code_expires_at
            )

            # DB에 저장된 해시와 일치하는지 확인
            if hmac.compare_digest(
                reservation.qr_token_hash,
                hash_qr_token(existing_token)
            ):
                qr_code_data = existing_token
                qr_code_expires_at = reservation.qr_code_expires_at

        # 기존 QR이 없거나 만료된 경우 새로 발급
        if qr_code_data is None:
            new_expires_at = now + timedelta(hours=24)

            new_token = generate_qr_token(
                reservation.reservation_id,
                new_expires_at
            )

            reservation.qr_token_hash = hash_qr_token(new_token)
            reservation.qr_code_expires_at = new_expires_at

            db.commit()
            db.refresh(reservation)

            qr_code_data = new_token
            qr_code_expires_at = new_expires_at

    # 5. 응답 반환
    return ReservationDetailResponse(
        reservation_id=reservation.reservation_id,
        listing_id=reservation.listing_id,
        product_id=reservation.product_id,
        product_name=product.product_name,
        store_id=reservation.store_id,
        store_name=store.store_name,
        quantity=reservation.quantity,
        total_price=reservation.total_price,
        status=reservation.status,
        created_at=reservation.created_at,
        qr_code_data=qr_code_data,
        qr_code_expires_at=qr_code_expires_at
    )

@router.post(
    "/pickup/verify",
    response_model=PickupVerifyResponse
)
def verify_pickup(
    body: PickupVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. 상점 운영자 권한 확인
    if current_user.role != "MERCHANT":
        raise HTTPException(
            status_code=403,
            detail="상점 운영자만 픽업을 처리할 수 있습니다."
        )

    store = db.query(Store).filter(
        Store.user_id == current_user.user_id
    ).first()

    if not store:
        raise HTTPException(
            status_code=403,
            detail="등록된 상점이 없습니다."
        )

    # 2. QR 토큰 형식 확인
    token = body.qr_code_data

    try:
        prefix, reservation_id_str, expiry_str, signature = token.split("_")

        if prefix != "pickup":
            raise ValueError

        reservation_id = int(reservation_id_str)
        expiry_timestamp = int(expiry_str)

    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=400,
            detail="QR 코드 데이터 형식이 올바르지 않습니다."
        )

    # 3. QR 서명 검증
    payload = f"{reservation_id}:{expiry_timestamp}"

    expected_signature = hmac.new(
        QR_SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(
            status_code=404,
            detail="유효한 QR 토큰을 찾을 수 없습니다."
        )

    # 4. QR 만료 확인
    now = datetime.now(timezone.utc)
    expires_at = datetime.fromtimestamp(
        expiry_timestamp,
        timezone.utc
    )

    if expires_at <= now:
        raise HTTPException(
            status_code=410,
            detail="QR 토큰의 유효기간이 만료되었습니다."
        )

    # 5. 예약 조회 및 동시 처리 방지
    reservation = db.query(Reservation).filter(
        Reservation.reservation_id == reservation_id
    ).with_for_update().first()

    if not reservation:
        raise HTTPException(
            status_code=404,
            detail="예약을 찾을 수 없습니다."
        )

    # 6. 가게 소유권 확인
    if reservation.store_id != store.store_id:
        raise HTTPException(
            status_code=403,
            detail="해당 예약을 처리할 권한이 없습니다."
        )

    # 7. 예약 상태 확인
    if reservation.status in ["COMPLETED", "CANCELLED"]:
        raise HTTPException(
            status_code=409,
            detail="이미 완료되었거나 취소된 예약입니다."
        )

    if reservation.status != "READY":
        raise HTTPException(
            status_code=409,
            detail="픽업 가능한 예약 상태가 아닙니다."
        )

    # 8. DB에 저장된 토큰 해시와 비교
    if (
        not reservation.qr_token_hash
        or not hmac.compare_digest(
            reservation.qr_token_hash,
            hash_qr_token(token)
        )
        or int(reservation.qr_code_expires_at.timestamp()) != expiry_timestamp
    ):
        raise HTTPException(
            status_code=410,
            detail="QR 토큰이 만료되었거나 이미 사용되었습니다."
        )

    # 9. 상품 조회
    product = db.query(Product).filter(
        Product.product_id == reservation.product_id
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="상품을 찾을 수 없습니다."
        )

    # 10. 픽업 완료 처리 및 QR 무효화
    reservation.status = "COMPLETED"
    reservation.picked_up_at = now
    reservation.qr_token_hash = None
    reservation.qr_code_expires_at = None
    # 고객에게 픽업 완료 알림
    notification = Notification(
        user_id=reservation.user_id,
        type="RESERVATION",
        title="픽업 완료",
        content=f"{product.product_name} 픽업이 완료되었습니다.",
        related_id=reservation.reservation_id,
        is_read=False,
    )
    db.add(notification)

    try:
        db.commit()
        db.refresh(reservation)

    except Exception:
        db.rollback()
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="픽업 완료 처리 중 오류가 발생했습니다."
        )

    return PickupVerifyResponse(
        reservation_id=reservation.reservation_id,
        listing_id=reservation.listing_id,
        product_id=reservation.product_id,
        product_name=product.product_name,
        store_name=store.store_name,
        status=reservation.status,
        completed_at=reservation.picked_up_at,
        message="픽업이 완료 처리되었습니다."
    )


@router.patch(
    "/{reservation_id}/status",
    response_model=ReservationStatusUpdateResponse,
)
def update_reservation_status(
    reservation_id: int,
    request: ReservationStatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_transitions = {
        "PENDING": ["CONFIRMED"],
        "CONFIRMED": ["READY"],
    }

    if request.status not in ["CONFIRMED", "READY", "COMPLETED", "CANCELLED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="올바르지 않은 예약 상태입니다.",
        )

    # 상인 권한 확인
    if current_user.role != "MERCHANT":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="상인만 예약 상태를 변경할 수 있습니다.",
        )

    # 상인이 등록한 가게 조회
    store = (
        db.query(Store)
        .filter(Store.user_id == current_user.user_id)
        .first()
    )

    if not store:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="등록된 가게가 없습니다.",
        )

    try:
        reservation = (
            db.query(Reservation)
            .filter(Reservation.reservation_id == reservation_id)
            .with_for_update()
            .first()
        )

        if not reservation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="예약 정보를 찾을 수 없습니다.",
            )

        # 해당 상인의 가게 예약인지 확인
        if reservation.store_id != store.store_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="해당 예약의 상점 운영자가 아닙니다.",
            )

        # 허용된 상태 변경인지 확인
        if request.status not in allowed_transitions.get(reservation.status, []):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="허용되지 않는 예약 상태 변경입니다.",
            )

        now = datetime.now(timezone.utc)

        reservation.status = request.status

        # READY로 변경되면 QR 토큰 발급
        if request.status == "READY":
            expires_at = now + timedelta(hours=24)

            qr_token = generate_qr_token(
                reservation.reservation_id,
                expires_at,
            )

            reservation.qr_token_hash = hash_qr_token(qr_token)
            reservation.qr_code_expires_at = expires_at

            message = "상품 준비가 완료되었습니다. 고객에게 픽업 QR이 발급되었습니다."
                        # 고객에게 상품 준비 완료 알림
            notification = Notification(
                user_id=reservation.user_id,
                type="RESERVATION",
                title="상품 준비 완료",
                content="예약하신 상품이 준비되었습니다. 픽업 QR을 확인해 주세요.",
                related_id=reservation.reservation_id,
                is_read=False,
            )
            db.add(notification)

        else:
            message = "예약 상태가 변경되었습니다."

        reservation.updated_at = now

        db.commit()
        db.refresh(reservation)

        return {
            "reservation_id": reservation.reservation_id,
            "status": reservation.status,
            "updated_at": reservation.updated_at,
            "message": message,
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="예약 상태 변경 중 오류가 발생했습니다.",
        )

@router.patch("/{reservation_id}/cancel")
def cancel_reservation(
    reservation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 예약 조회 및 동시 수정 방지
    reservation = (
        db.query(Reservation)
        .filter(Reservation.reservation_id == reservation_id)
        .with_for_update()
        .first()
    )

    if not reservation:
        raise HTTPException(
            status_code=404,
            detail="예약을 찾을 수 없습니다.",
        )

    # 본인의 예약인지 확인
    if reservation.user_id != current_user.user_id:
        raise HTTPException(
            status_code=403,
            detail="본인의 예약만 취소할 수 있습니다.",
        )

    # 취소 가능한 상태인지 확인
    if reservation.status not in ["PENDING", "CONFIRMED"]:
        raise HTTPException(
            status_code=409,
            detail="현재 예약 상태에서는 취소할 수 없습니다.",
        )

    # 상품 재고 복구
    listing = (
        db.query(Listing)
        .filter(Listing.listing_id == reservation.listing_id)
        .with_for_update()
        .first()
    )

    if listing:
        if listing.stock_quantity is not None:
            listing.stock_quantity += reservation.quantity

        # 재고가 복구되면 품절 해제
        if listing.stock_quantity is None or listing.stock_quantity > 0:
            listing.is_sold_out = False

    # 예약 취소 처리
    reservation.status = "CANCELLED"
    reservation.cancelled_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(reservation)

    return {
        "reservation_id": reservation.reservation_id,
        "status": reservation.status,
        "cancelled_at": reservation.cancelled_at,
        "message": "예약이 취소되었습니다.",
    }