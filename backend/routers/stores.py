
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Market, Store, User, Listing, Product
from schemas import (
  StoreCreateRequest, 
  StoreCreateResponse,
  StoreProductListResponse,
  StoreProductListItem,
)
from dependencies import get_current_user


router = APIRouter(
    prefix="/stores",
    tags=["Stores"],
)


# 가게 등록
@router.post(
    "",
    response_model=StoreCreateResponse,
    status_code=201,
)
def create_store(
    request: StoreCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 상인 권한 확인
    if current_user.role != "MERCHANT":
        raise HTTPException(
            status_code=403,
            detail="상인만 가게를 등록할 수 있습니다.",
        )

    # 카카오 장소 ID로 시장 조회
    market = (
        db.query(Market)
        .filter(
            Market.kakao_place_id == request.kakao_place_id
        )
        .first()
    )

    # 시장이 DB에 없는 경우 시장 정보 저장
    if market is None:
        market = (
            db.query(Market)
            .filter(
                Market.market_name == request.market_name,
                Market.address == request.address,
            )
            .first()
        )

        if market is not None:
            market.kakao_place_id = request.kakao_place_id
            market.latitude = request.latitude
            market.longitude = request.longitude

        else:
            market = Market(
                kakao_place_id=request.kakao_place_id,
                market_name=request.market_name,
                address=request.address,
                latitude=request.latitude,
                longitude=request.longitude,
            )

            db.add(market)

        db.flush()

    # 가게 등록
    new_store = Store(
        market_id=market.market_id,
        user_id=current_user.user_id,
        store_name=request.store_name,
        description=request.description,
    )

    db.add(new_store)
    db.commit()
    db.refresh(new_store)

    return new_store

# 가게 상세 조회
@router.get(
    "/{store_id}",
    response_model=StoreCreateResponse,
)
def get_store(
    store_id: int,
    db: Session = Depends(get_db),
):
    store = (
        db.query(Store)
        .filter(Store.store_id == store_id)
        .first()
    )

    if store is None:
        raise HTTPException(
            status_code=404,
            detail="가게를 찾을 수 없습니다.",
        )

    return store

# 가게 상품 목록 조회
@router.get(
    "/{store_id}/products",
    response_model=StoreProductListResponse,
)
def get_store_products(
    store_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    category_id: int | None = None,
    is_sold_out: bool | None = None,
    is_on_sale: bool | None = None,
    db: Session = Depends(get_db),
):
    # 1. 가게 존재 여부 확인
    store = (
        db.query(Store)
        .filter(Store.store_id == store_id)
        .first()
    )

    if store is None:
        raise HTTPException(
            status_code=404,
            detail="가게를 찾을 수 없습니다.",
        )

    # 2. 해당 가게의 판매 상품 조회
    query = (
        db.query(Listing, Product)
        .join(Product, Listing.product_id == Product.product_id)
        .filter(Listing.store_id == store_id)
    )

    # 3. 카테고리 필터
    if category_id is not None:
        query = query.filter(
            Product.category_id == category_id
        )

    # 4. 품절 여부 필터
    if is_sold_out is not None:
        query = query.filter(
            Listing.is_sold_out == is_sold_out
        )

    # 5. 할인 여부 필터
    if is_on_sale is not None:
        if is_on_sale:
            query = query.filter(
                Listing.discount_price.isnot(None)
            )
        else:
            query = query.filter(
                Listing.discount_price.is_(None)
            )

    # 6. 전체 개수
    total_count = query.count()

    # 7. 페이지네이션
    results = (
        query
        .order_by(
            Listing.created_at.desc(),
            Listing.listing_id.desc(),
        )
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    # 8. 응답 데이터 생성
    products = [
        StoreProductListItem(
            listing_id=listing.listing_id,
            product_id=product.product_id,
            store_id=listing.store_id,
            product_name=product.product_name,
            price=listing.price,
            sale_price=listing.discount_price,
            category_id=product.category_id,
            is_sold_out=listing.is_sold_out,
            is_on_sale=listing.discount_price is not None,
            image_url=product.image_url,
            created_at=listing.created_at,
        )
        for listing, product in results
    ]

    return StoreProductListResponse(
        products=products,
        total_count=total_count,
        page=page,
        size=size,
    )