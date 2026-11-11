
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Listing, Product, Store, Market, PriceHistory
from schemas import ProductDetailResponse, ProductListResponse, ProductListItem

router = APIRouter(prefix="/products", tags=["Products"])


# 상품 목록 조회
@router.get("", response_model=ProductListResponse)
def get_products(
    market_id: int,
    category_id: int | None = None,
    keyword: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Listing, Product, Store)
        .join(Product, Listing.product_id == Product.product_id)
        .join(Store, Listing.store_id == Store.store_id)
        .filter(Store.market_id == market_id)
    )

    if category_id is not None:
        query = query.filter(Product.category_id == category_id)

    if keyword:
        query = query.filter(Product.product_name.ilike(f"%{keyword}%"))

    total_count = query.count()

    results = (
        query
        .order_by(Listing.created_at.desc(), Listing.listing_id.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    category_map = {
        1 : "채소",
        2: "과일",
        3: "정육·계란",
        4: "수산물",
        5: "반찬",
        6: "가공식품",
        7: "곡물·견과",
        8: "떡·베이커리",
        9: "기타",
    }

    products = [
        ProductListItem(
            listing_id=listing.listing_id,
            product_id=product.product_id,
            store_id=store.store_id,
            market_id=store.market_id,
            store_name=store.store_name,
            product_name=product.product_name,
            category_id=product.category_id,
            category=category_map.get(product.category_id),
            price=listing.price,
            sale_price=listing.sale_price,
            is_on_sale=(
                listing.sale_price is not None
                and listing.sale_price < listing.price
            ),
            image_url=listing.image_url,
            is_sold_out=listing.is_sold_out,
            created_at=listing.created_at,
        )
        for listing, product, store in results
    ]

    return ProductListResponse(
        total_count=total_count,
        page=page,
        size=size,
        products=products,
    )


# 상품 상세 조회
@router.get("/{listing_id}", response_model=ProductDetailResponse)
def get_product_detail(
    listing_id: int,
    db: Session = Depends(get_db),
):
    result = (
        db.query(Listing, Product, Store, Market)
        .join(Product, Listing.product_id == Product.product_id)
        .join(Store, Listing.store_id == Store.store_id)
        .join(Market, Store.market_id == Market.market_id)
        .filter(Listing.listing_id == listing_id)
        .first()
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="상품을 찾을 수 없습니다.",
        )

    listing, product, store, market = result

    return ProductDetailResponse(
        listing_id=listing.listing_id,
        product_id=product.product_id,
        product_name=product.product_name,
        category_id=product.category_id,
        description=product.description,
        image_url=listing.image_url,
        price=listing.price,
        sale_price=listing.sale_price,
        is_sold_out=listing.is_sold_out,
        store_id=store.store_id,
        store_name=store.store_name,
        market_id=market.market_id,
        market_name=market.market_name,
    )


# 상품 가격 변동 이력 조회
@router.get("/{listing_id}/price-history")
def get_price_history(
    listing_id: int,
    db: Session = Depends(get_db),
):
    result = (
        db.query(Listing, Product, Store)
        .join(Product, Listing.product_id == Product.product_id)
        .join(Store, Listing.store_id == Store.store_id)
        .filter(
            Listing.listing_id == listing_id,
            Listing.deleted_at.is_(None),
        )
        .first()
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="판매 게시물을 찾을 수 없습니다.",
        )

    listing, product, store = result

    current_price = (
        listing.sale_price
        if listing.sale_price is not None
        and listing.sale_price < listing.price
        else listing.price
    )

    histories = (
        db.query(PriceHistory)
        .filter(PriceHistory.listing_id == listing_id)
        .order_by(PriceHistory.recorded_at.asc())
        .all()
    )

    return {
        "listing_id": listing.listing_id,
        "product_id": product.product_id,
        "product_name": product.product_name,
        "store_id": store.store_id,
        "store_name": store.store_name,
        "current_price": current_price,
        "price_history": [
            {
                "price": history.price,
                "recorded_at": history.recorded_at,
            }
            for history in histories
        ],
    }

