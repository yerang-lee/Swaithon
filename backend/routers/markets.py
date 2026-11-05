
import os
import httpx

from fastapi import APIRouter, Depends, HTTPException, Query
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

            documents.append({
                "place_id": place["id"],
                "market_name": place["place_name"],
                "address": address,
                "latitude": float(place["y"]),
                "longitude": float(place["x"]),
                "category_name": place["category_name"],
                "place_url": place["place_url"],
            })

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
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius: float = Query(5, gt=0, le=20),
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
        "radius": int(radius * 1000),
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

            documents.append({
                "place_id": place["id"],
                "market_name": place["place_name"],
                "address": address,
                "latitude": float(place["y"]),
                "longitude": float(place["x"]),
                "distance_km": round(
                    float(place["distance"]) / 1000, 2
                ),
                "place_url": place["place_url"],
            })

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
    db: Session = Depends(get_db),
):
    # 시장 존재 여부 확인
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

    # 해당 시장에 속한 가게 조회
    stores = (
        db.query(Store)
        .filter(Store.market_id == market_id)
        .order_by(Store.store_id.asc())
        .all()
    )

    return {
        "total_count": len(stores),
        "stores": stores,
    }

