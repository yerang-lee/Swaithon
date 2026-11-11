from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from database import get_db
from models import Favorite, FavoriteEvent, Listing, User, Product, Store, Market
from schemas import (
    FavoriteCreateRequest,
    FavoriteCreateResponse,
    FavoriteResponse,
    FavoriteListResponse,
    FavoriteDeleteResponse,
)
from models import RecommendationRequest, RecommendationItem
from security import get_current_user


router = APIRouter(tags=["Favorites"])


# 찜하기 등록
@router.post(
    "/favorites",
    response_model=FavoriteCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_favorite(
    request: FavoriteCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. 상품 판매 정보 조회
    listing = (
        db.query(Listing)
        .filter(Listing.listing_id == request.listing_id)
        .first()
    )

    if not listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="상품을 찾을 수 없습니다.",
        )

    # 2. 기존 찜하기 조회
    if request.request_id is not None:
        owned_item = db.query(RecommendationItem).join(
            RecommendationRequest,
            RecommendationRequest.request_id == RecommendationItem.request_id,
        ).filter(
            RecommendationItem.request_id == request.request_id,
            RecommendationItem.listing_id == listing.listing_id,
            RecommendationRequest.user_id == current_user.user_id,
        ).first()
        if owned_item is None:
            raise HTTPException(status_code=400, detail="Invalid recommendation request")

    favorite = (
        db.query(Favorite)
        .filter(
            Favorite.user_id == current_user.user_id,
            Favorite.listing_id == request.listing_id,
        )
        .first()
    )

    if favorite and favorite.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 찜한 상품입니다.",
        )

    try:
        # 3. 기존 찜하기 재활성화 또는 신규 등록
        if favorite:
            favorite.is_active = True
        else:
            favorite = Favorite(
                user_id=current_user.user_id,
                listing_id=request.listing_id,
                is_active=True,
            )
            db.add(favorite)

        db.flush()

        # 4. 찜하기 이력 저장
        favorite_event = FavoriteEvent(
            user_id=current_user.user_id,
            listing_id=listing.listing_id,
            product_id=listing.product_id,
            store_id=listing.store_id,
            request_id=request.request_id,
            event_type="FAVORITE",
        )
        db.add(favorite_event)

        # 5. DB 저장
        db.commit()
        db.refresh(favorite)

    except Exception as e:
        db.rollback()
        print("찜하기 등록 실제 오류:", repr(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="찜하기 등록 중 오류가 발생했습니다.",
        )

    return {
        "favorite_id": favorite.favorite_id,
        "user_id": current_user.user_id,
        "listing_id": listing.listing_id,
        "product_id": listing.product_id,
        "store_id": listing.store_id,
        "product_name": db.query(Product.product_name)
            .filter(Product.product_id == listing.product_id)
            .scalar(),
        "store_name": db.query(Store.store_name)
            .filter(Store.store_id == listing.store_id)
            .scalar(),
        "created_at": favorite.created_at,
        "message": "찜하기가 등록되었습니다.",
    }


# 내가 찜한 상품 목록 조회
@router.get(
    "/users/me/favorites",
    response_model=FavoriteListResponse,
    status_code=status.HTTP_200_OK,
)
def get_my_favorites(
    page: int = 1,
    size: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 페이지네이션 유효성 검사
    if page < 1 or size < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="page와 size는 1 이상의 값이어야 합니다.",
        )

    # 현재 사용자의 활성화된 찜 개수
    total_count = (
        db.query(Favorite)
        .filter(
            Favorite.user_id == current_user.user_id,
            Favorite.is_active.is_(True),
        )
        .count()
    )

    # 찜 목록 상세 정보 조회
    favorites = (
        db.query(
            Favorite.favorite_id,
            Listing.listing_id,
            Product.product_id,
            Product.product_name,
            Store.store_id,
            Store.store_name,
            Market.market_id,
            Market.market_name,
            Product.category_id,
            Listing.price,
            Listing.sale_price,
            Listing.is_sold_out,
            Listing.sale_starts_at,
            Listing.sale_ends_at,
            Product.image_url,
            Favorite.created_at,
        )
        .join(Listing, Favorite.listing_id == Listing.listing_id)
        .join(Product, Listing.product_id == Product.product_id)
        .join(Store, Listing.store_id == Store.store_id)
        .join(Market, Store.market_id == Market.market_id)
        .filter(
            Favorite.user_id == current_user.user_id,
            Favorite.is_active.is_(True),
        )
        .order_by(Favorite.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    # 응답 데이터 구성
    favorite_items = []

    for item in favorites:
        now = datetime.now(timezone.utc)

        is_on_sale = (
            item.sale_price is not None
            and item.sale_starts_at is not None
            and item.sale_ends_at is not None
            and item.sale_starts_at <= now <= item.sale_ends_at
        )

        favorite_items.append({
            "favorite_id": item.favorite_id,
            "listing_id": item.listing_id,
            "product_id": item.product_id,
            "product_name": item.product_name,
            "store_id": item.store_id,
            "store_name": item.store_name,
            "market_id": item.market_id,
            "market_name": item.market_name,
            "category_id": item.category_id,
            "price": item.price,
            "sale_price": item.sale_price,
            "is_sold_out": item.is_sold_out,
            "is_on_sale": is_on_sale,
            "image_url": item.image_url,
            "created_at": item.created_at,
        })

    return {
        "total_count": total_count,
        "page": page,
        "size": size,
        "favorites": favorite_items,
    }


# 찜 취소
@router.delete(
    "/favorites/{favorite_id}",
    response_model=FavoriteDeleteResponse,
    status_code=status.HTTP_200_OK,
)
def delete_favorite(
    favorite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. 찜 기록 조회
    favorite = (
        db.query(Favorite)
        .filter(Favorite.favorite_id == favorite_id)
        .first()
    )

    if not favorite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="존재하지 않는 찜 내역입니다.",
        )

    # 2. 다른 사용자의 찜인지 확인
    if favorite.user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="다른 사용자의 찜 내역은 취소할 수 없습니다.",
        )

    # 3. 이미 취소된 찜인지 확인
    if not favorite.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="이미 취소된 찜 내역입니다.",
        )

    # 4. 판매 게시물 조회
    listing = (
        db.query(Listing)
        .filter(Listing.listing_id == favorite.listing_id)
        .first()
    )

    if not listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="판매 게시물을 찾을 수 없습니다.",
        )

    try:
        # 5. 기존 찜 데이터 비활성화 (물리적 삭제 X)
        favorite.is_active = False

        # 6. 기존 FAVORITE 이벤트에서 request_id 가져오기
        original_event = (
            db.query(FavoriteEvent)
            .filter(
                FavoriteEvent.user_id == current_user.user_id,
                FavoriteEvent.listing_id == favorite.listing_id,
                FavoriteEvent.event_type == "FAVORITE",
            )
            .order_by(FavoriteEvent.occurred_at.desc(), FavoriteEvent.event_id.desc())
            .first()
        )

        # 7. 찜 취소 이벤트 생성
        favorite_event = FavoriteEvent(
            user_id=current_user.user_id,
            listing_id=listing.listing_id,
            product_id=listing.product_id,
            store_id=listing.store_id,
            request_id=(
                original_event.request_id
                if original_event
                else None
            ),
            event_type="FAVORITE_CANCEL",
        )

        db.add(favorite_event)

        # 8. DB 저장
        db.commit()
        db.refresh(favorite)

    except Exception as e:
        db.rollback()
        print("찜 취소 실제 오류:", repr(e))

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="찜 취소 중 오류가 발생했습니다.",
        )

    return {
        "favorite_id": favorite.favorite_id,
        "listing_id": favorite.listing_id,
        "message": "찜이 취소되었습니다.",
    }