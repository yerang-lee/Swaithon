
import os
import httpx

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from math import radians, sin, cos, sqrt, atan2
from database import get_db
from models import Market, Store
from schemas import (
    MarketResponse,
    MarketListResponse,
    KakaoMarketSearchResponse,
    MarketCreateRequest,
    MarketCreateResponse,
    StoreListResponse,
)


router = APIRouter(
    prefix="/markets",
    tags=["Markets"],
)


# 카카오 장소 검색
@router.get("/search/kakao", response_model=KakaoMarketSearchResponse)
async def search_kakao_markets(
    query: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    kakao_key = os.getenv("KAKAO_REST_API_KEY")

    if not kakao_key:
        raise HTTPException(
            status_code=500,
            detail="Kakao REST API 키가 설정되지 않았습니다.",
        )

    headers = {
        "Authorization": f"KakaoAK {kakao_key}"
    }

    params = {
        "query": query,
        "page": 1,
        "size": 15,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://dapi.kakao.com/v2/local/search/keyword.json",
                headers=headers,
                params=params,
            )

        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail={
                    "status_code": response.status_code,
                    "kakao_error": response.text,
                },
            )

        data = response.json()
        documents = []
        place_ids = []

        for place in data["documents"]:

            # 시장 카테고리만 필터링
            if "가정,생활 > 시장" not in place["category_name"]:
                continue

            address = (
                place["road_address_name"]
                or place["address_name"]
            )

            if not address:
                continue

            place_id = place["id"]
            place_ids.append(place_id)

            documents.append({
                "place_id": place_id,
                "market_name": place["place_name"],
                "address": address,
                "latitude": float(place["y"]),
                "longitude": float(place["x"]),
                "category_name": place["category_name"],
                "place_url": place["place_url"],
            })

        # 카카오 place_id와 DB의 kakao_place_id를 기준으로 매핑
        registered_markets = (
            db.query(Market)
            .filter(Market.kakao_place_id.in_(place_ids))
            .all()
            if place_ids
            else []
        )

        market_id_by_place_id = {
            market.kakao_place_id: market.market_id
            for market in registered_markets
        }

        # 모든 검색 결과에 market_id 추가
        for document in documents:
            document["market_id"] = market_id_by_place_id.get(
                document["place_id"]
            )

        return {
            "total_count": data["meta"]["total_count"],
            "is_end": data["meta"]["is_end"],
            "documents": documents,
        }

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Kakao API 서버에 연결할 수 없습니다.",
        )


# 카카오 검색 결과로 시장 등록
@router.post("", response_model=MarketCreateResponse, status_code=201)
def create_market(
    request: MarketCreateRequest,
    db: Session = Depends(get_db),
):
    existing_market = (
        db.query(Market)
        .filter(Market.kakao_place_id == request.kakao_place_id)
        .first()
    )

    if existing_market:
        raise HTTPException(
            status_code=409,
            detail="이미 등록된 시장입니다.",
        )

    existing_market = (
        db.query(Market)
        .filter(
            Market.market_name == request.market_name,
            Market.address == request.address,
        )
        .first()
    )

    if existing_market:
        existing_market.kakao_place_id = request.kakao_place_id
        db.commit()
        db.refresh(existing_market)
        return existing_market

    new_market = Market(
        kakao_place_id=request.kakao_place_id,
        market_name=request.market_name,
        address=request.address,
        latitude=request.latitude,
        longitude=request.longitude,
    )

    db.add(new_market)
    db.commit()
    db.refresh(new_market)

    return new_market


# 시장 목록 조회
@router.get("", response_model=MarketListResponse)
def get_markets(
    db: Session = Depends(get_db),
):
    markets = (
        db.query(Market)
        .order_by(Market.market_id.asc())
        .all()
    )

    return {
        "total_count": len(markets),
        "markets": markets,
    }


# 주변 시장 조회 (카카오 Local API)
@router.get("/nearby")
async def get_nearby_markets(
    request: Request,
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius: float = Query(5000, gt=0, le=20000),
    limit: int = Query(20, gt=0, le=20),
    db: Session = Depends(get_db),
):
    kakao_key = os.getenv("KAKAO_REST_API_KEY")

    if not kakao_key:
        raise HTTPException(
            status_code=500,
            detail="Kakao REST API 키가 설정되지 않았습니다.",
        )

    headers = {
        "Authorization": f"KakaoAK {kakao_key}"
    }

    params = {
        "query": "시장",
        "x": longitude,
        "y": latitude,
        "radius": int(radius),
        "sort": "distance",
        "page": 1,
        "size": 15,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://dapi.kakao.com/v2/local/search/keyword.json",
                headers=headers,
                params=params,
            )

        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail={
                    "status_code": response.status_code,
                    "kakao_error": response.text,
                },
            )

        data = response.json()
        documents = []
        place_ids = []

        for place in data["documents"]:

            # 시장 카테고리만 필터링
            if "가정,생활 > 시장" not in place["category_name"]:
                continue

            address = (
                place["road_address_name"]
                or place["address_name"]
            )

            if not address:
                continue

            place_id = place["id"]
            place_ids.append(place_id)

            documents.append({
                "place_id": place_id,
                "market_name": place["place_name"],
                "address": address,
                "latitude": float(place["y"]),
                "longitude": float(place["x"]),
                "distance": round(
                    float(place["distance"]) / 1000, 2
                ),
                "image_url": None,
                "place_url": place["place_url"],
            })

        # DB에 등록된 시장의 내부 market_id 조회
        registered_markets = (
            db.query(Market)
            .filter(Market.kakao_place_id.in_(place_ids))
            .all()
            if place_ids
            else []
        )

        market_id_by_place_id = {
            market.kakao_place_id: market.market_id
            for market in registered_markets
        }

        # 모든 검색 결과에 market_id 포함
        for document in documents:
            document["market_id"] = market_id_by_place_id.get(
                document["place_id"]
            )

        # 요청한 개수만큼 반환
        market_images = {market.kakao_place_id: market.image_url for market in registered_markets}
        named_images = {
            market.market_name.replace(" ", ""): market.image_url
            for market in db.query(Market).filter(Market.image_url.isnot(None)).all()
        }
        for document in documents:
            image = market_images.get(document["place_id"]) or named_images.get(
                document["market_name"].replace(" ", "")
            )
            image_path = image or "/uploads/markets/default-market.jpg"
            # Mobile clients need a complete URL; resolve using this request's
            # server host, never localhost or a baked-in development address.
            document["image_url"] = (
                str(request.url_for("uploads", path=image_path.removeprefix("/uploads/")))
                if image_path.startswith("/uploads/") else image_path
            )
            document["image_is_placeholder"] = not bool(image)

        documents = documents[:limit]

        return {
            "total_count": len(documents),
            "markets": documents,
        }

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Kakao API 서버에 연결할 수 없습니다.",
        )


# 시장 상세 조회
@router.get("/{market_id}", response_model=MarketResponse)
def get_market(
    market_id: int,
    db: Session = Depends(get_db),
):
    market = (
        db.query(Market)
        .filter(Market.market_id == market_id)
        .first()
    )

    if market is None:
        raise HTTPException(
            status_code=404,
            detail="존재하지 않는 시장입니다.",
        )

    return market

# 시장 내 가게 목록 조회
@router.get("/{market_id}/stores", response_model=StoreListResponse)
def get_market_stores(
    market_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    keyword: str | None = None,
):
    market = db.query(Market).filter(
        Market.market_id == market_id
    ).first()

    if market is None:
        raise HTTPException(
            status_code=404,
            detail="존재하지 않는 시장입니다."
        )

    query = db.query(Store).filter(
        Store.market_id == market_id
    )

    if keyword and keyword.strip():
        query = query.filter(Store.store_name.ilike(f"%{keyword.strip()}%"))

    total_count = query.count()

    stores = (
        query
        .order_by(Store.store_id.asc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    return {
        "total_count": total_count,
        "page": page,
        "size": size,
        "stores": stores,
    }