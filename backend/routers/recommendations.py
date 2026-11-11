import math
import uuid

from datetime import datetime, timezone, timedelta
from sqlalchemy.dialects.postgresql import insert

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from security import get_current_user

from ai.recommendation_rules import recommend_from_payload

from models import (
    User,
    Market,
    Store,
    Product,
    Listing,
    Favorite,
    FavoriteEvent,
    ProductViewEvent,
    RecommendationRequest,
    RecommendationItem,
    RecommendationImpression,
    Reservation,
)

router = APIRouter(
    prefix="/recommendations",
    tags=["Recommendations"],
)

class ImpressionEvent(BaseModel):
    event_id: str = Field(..., min_length=1, max_length=36)
    listing_id: str
    position: int = Field(..., ge=1)
    occurred_at: datetime


class ImpressionRequest(BaseModel):
    request_id: str = Field(..., min_length=1, max_length=100)
    events: list[ImpressionEvent]

class ProductViewRequest(BaseModel):
    request_id: str = Field(..., min_length=1, max_length=100)
    event_id: str = Field(..., min_length=1, max_length=36)
    listing_id: str
    occurred_at: datetime

def calculate_distance_km(
    user_latitude: float,
    user_longitude: float,
    market_latitude: float,
    market_longitude: float,
) -> float:
    """고객 위치와 시장 위치 사이의 거리를 km로 계산합니다."""

    earth_radius_km = 6371.0

    lat1 = math.radians(user_latitude)
    lat2 = math.radians(market_latitude)

    delta_lat = math.radians(market_latitude - user_latitude)
    delta_lon = math.radians(market_longitude - user_longitude)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(delta_lon / 2) ** 2
    )

    return earth_radius_km * 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a),
    )

def get_recommendation_candidates(
    db: Session,
    latitude: float,
    longitude: float,
    market_id: int | None = None,
):
    query = (
        db.query(Listing, Product, Store, Market)
        .join(Product, Listing.product_id == Product.product_id)
        .join(Store, Listing.store_id == Store.store_id)
        .join(Market, Store.market_id == Market.market_id)
        .filter(
            Listing.deleted_at.is_(None),
            Listing.is_sold_out.is_(False),
            Store.market_id.isnot(None),
        )
    )

    if market_id is not None:
        query = query.filter(Market.market_id == market_id)

    rows = query.all()

    candidates = []

    for listing, product, store, market in rows:
        if market.latitude is None or market.longitude is None:
            continue

        distance_km = calculate_distance_km(
            latitude,
            longitude,
            float(market.latitude),
            float(market.longitude),
        )

        candidates.append({
            "listing": listing,
            "product": product,
            "store": store,
            "market": market,
            "distance_km": distance_km,
        })

    return candidates


def build_recommendation_payload(
    candidates: list,
    user_id: int,
    latitude: float,
    longitude: float,
    db: Session | None = None,
):
    as_of = datetime.now(timezone.utc)

    products = {}
    listings = []

    for candidate in candidates:
        listing = candidate["listing"]
        product = candidate["product"]
        store = candidate["store"]

        # 카테고리가 없는 상품은 현재 추천 입력에서 제외
        if product.category_id is None:
            continue

        products[str(product.product_id)] = {
            "product_id": str(product.product_id),
            "category_id": str(product.category_id),
        }

        listings.append({
            "listing_id": str(listing.listing_id),
            "product_id": str(product.product_id),
            "store_id": str(store.store_id),
            "name": product.product_name,
            "category_id": str(product.category_id),
            "distance_km": candidate["distance_km"],
            "created_at": listing.created_at.isoformat(),
        })

    events = []
    if db is not None:
        cutoff = as_of - timedelta(days=30)
        def add_event(key, row, kind, at, **extra):
            events.append({"event_id": key, "product_id": str(row.product_id),
                           "store_id": str(row.store_id), "event_type": kind,
                           "occurred_at": at.isoformat(), **extra})
        for row in db.query(ProductViewEvent).filter(
            ProductViewEvent.user_id == user_id,
            ProductViewEvent.occurred_at.between(cutoff, as_of),
        ).all():
            add_event(f"view:{row.event_id}", row, "detail_view", row.occurred_at)
        latest = {}
        for row in db.query(FavoriteEvent).filter(
            FavoriteEvent.user_id == user_id, FavoriteEvent.occurred_at <= as_of,
        ).order_by(FavoriteEvent.occurred_at, FavoriteEvent.event_id).all():
            latest[row.listing_id] = row
        for row in latest.values():
            if row.event_type == "FAVORITE" and row.occurred_at >= cutoff:
                add_event(f"favorite:{row.event_id}", row, "favorite", row.occurred_at)
        for row in db.query(Reservation).filter(
            Reservation.user_id == user_id, Reservation.created_at <= as_of,
        ).all():
            valid = (row.cancelled_at is None or row.cancelled_at > as_of)
            if row.status == "CANCELLED" and row.cancelled_at is None:
                valid = False
            if valid and row.created_at >= cutoff:
                add_event(f"reserve:{row.reservation_id}", row, "reserve",
                          row.created_at, is_valid_reservation=True)
        event_products = {int(event["product_id"]) for event in events}
        if event_products:
            for product in db.query(Product).filter(Product.product_id.in_(event_products)).all():
                if product.category_id is not None:
                    products[str(product.product_id)] = {
                        "product_id": str(product.product_id), "category_id": str(product.category_id)}
        events = [event for event in events if event["product_id"] in products]

    return {
        "as_of": as_of.isoformat(),
        "request_id": f"rec_{as_of.strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}",
        "user": {
            "user_id": str(user_id),
            "interest_product_ids": [],
            "events": events,
        },
        "products": list(products.values()),
        "listings": listings,
    }

def run_rule_recommendation(payload: dict, top_n: int = 20):
    result = recommend_from_payload(payload, top_n=top_n)

    return {
        "request_id": result["request_id"],
        "as_of": payload["as_of"],
        "generated_at": result["generated_at"],
        "recommendation_type": "rule",
        "rule_version": result["rule_version"],
        "model_version": None,
        "user_state": result["user_state"],
        "items": result["items"],
    }



def save_recommendation_result(
    db: Session,
    result: dict,
    payload: dict,
    current_user: User,
    candidates: list,
):
    try:
        request = RecommendationRequest(
            request_id=result["request_id"],
            user_id=current_user.user_id,
            as_of=datetime.fromisoformat(result["as_of"]),
            generated_at=datetime.fromisoformat(result["generated_at"]),
            rule_version=result["rule_version"],
            user_state=result["user_state"],
        )

        db.add(request)
        db.flush()

        candidate_map = {
            str(candidate["listing"].listing_id): candidate
            for candidate in candidates
        }

        for item in result["items"]:
            candidate = candidate_map.get(str(item["listing_id"]))

            if candidate is None:
                continue

            snapshot = item.get("feature_snapshot")

            fields = ("interest_match", "category_preference", "store_preference",
                      "distance_km", "hours_since_created")
            valid = isinstance(snapshot, dict) and all(
                isinstance(snapshot.get(key), (int, float))
                and not isinstance(snapshot.get(key), bool)
                and math.isfinite(snapshot[key]) for key in fields)
            if not valid or snapshot["interest_match"] not in (0, 1) or not (
                0 <= snapshot["category_preference"] <= 1
                and 0 <= snapshot["store_preference"] <= 1
                and snapshot["distance_km"] >= 0
                and snapshot["hours_since_created"] >= 0
            ):
                raise ValueError("Invalid recommendation feature snapshot")
            recommendation_item = RecommendationItem(
                request_id=result["request_id"],
                listing_id=candidate["listing"].listing_id,
                product_id=candidate["product"].product_id,
                store_id=candidate["store"].store_id,
                rank=item["rank"],
                score=item["score"],
                feature_snapshot=dict(item.get("feature_snapshot") or {}),
            )

            db.add(recommendation_item)

        db.commit()

    except Exception:
        db.rollback()
        raise

@router.get("")
def get_recommendations(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    market_id: int | None = Query(None),
    top_n: int = Query(20, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 특정 시장을 요청했다면 해당 시장이 존재하는지 확인
    if market_id is not None:
        market = (
            db.query(Market)
            .filter(Market.market_id == market_id)
            .first()
        )

        if market is None:
            raise HTTPException(
                status_code=404,
                detail="Market not found",
            )

    # 추천 후보 상품 조회
    candidates = get_recommendation_candidates(
        db=db,
        latitude=latitude,
        longitude=longitude,
        market_id=market_id,
    )

    if not candidates:
        raise HTTPException(
            status_code=404,
            detail="추천할 상품이 없습니다.",
        )

    # 추천 AI 입력 데이터 생성
    payload = build_recommendation_payload(
        candidates=candidates,
        user_id=current_user.user_id,
        latitude=latitude,
        longitude=longitude,
        db=db,
    )

    # 규칙 기반 추천 실행
    result = run_rule_recommendation(
        payload=payload,
        top_n=top_n,
    )

    # 추천 결과에 상품 상세 정보 추가

    # 추천 결과에 상품 상세 정보 추가
    candidate_map = {
        str(candidate["listing"].listing_id): candidate
        for candidate in candidates
    }

    response_items = []

    for item in result["items"]:
        candidate = candidate_map.get(str(item["listing_id"]))

        if candidate is None:
            continue

        listing = candidate["listing"]
        product = candidate["product"]
        store = candidate["store"]
        market = candidate["market"]

        feature_snapshot = item.get("feature_snapshot")

        if not feature_snapshot:
            raise ValueError(
                f"추천 스냅샷이 없습니다. listing_id={item['listing_id']}"
            )

        response_items.append({
            "rank": item["rank"],
            "score": item["score"],
            "listing_id": str(listing.listing_id),
            "product_id": str(product.product_id),
            "store_id": str(store.store_id),
            "store_name": store.store_name,
            "market_id": str(market.market_id),
            "name": product.product_name,
            "category_id": str(product.category_id),
            "price": listing.sale_price if listing.sale_price is not None else listing.price,
            "distance_km": candidate["distance_km"],
            "created_at": listing.created_at.isoformat(),
            "feature_snapshot": feature_snapshot,
        })

    result["items"] = response_items


    # 추천 요청 및 추천 상품 순위 DB 저장
    save_recommendation_result(
        db=db,
        result=result,
        payload=payload,
        current_user=current_user,
        candidates=candidates,
    )

    return result

@router.post("/events/impressions")
def record_recommendation_impressions(
    body: ImpressionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. 추천 요청이 존재하고 로그인한 사용자의 것인지 확인
    request = (
        db.query(RecommendationRequest)
        .filter(
            RecommendationRequest.request_id == body.request_id,
            RecommendationRequest.user_id == current_user.user_id,
        )
        .first()
    )

    if request is None:
        raise HTTPException(
            status_code=404,
            detail="Recommendation request not found",
        )

    recorded_count = 0
    duplicate_count = 0

    # 요청 본문 안에서 event_id 중복도 검사
    seen_events = {}

    try:
        for event in body.events:
            # 2. listing_id를 DB의 Integer 형식으로 변환
            try:
                listing_id = int(event.listing_id)
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid listing_id: {event.listing_id}",
                )

            if event.occurred_at.tzinfo is None:
                raise HTTPException(
                    status_code=400,
                    detail="occurred_at must include timezone information",
                )

            # 3. 해당 상품이 이 추천 요청에 포함되어 있는지 확인
            recommendation_item = (
                db.query(RecommendationItem)
                .filter(
                    RecommendationItem.request_id == body.request_id,
                    RecommendationItem.listing_id == listing_id,
                )
                .first()
            )

            if recommendation_item is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Listing {listing_id} not found in recommendation result",
                )

            # 4. 같은 요청 본문 안에서 event_id가 중복됐는지 확인
            event_data = (
                body.request_id,
                current_user.user_id,
                listing_id,
                event.position,
                event.occurred_at,
            )

            if event.event_id in seen_events:
                if seen_events[event.event_id] != event_data:
                    raise HTTPException(
                        status_code=409,
                        detail="Event ID already exists with different data",
                    )

                duplicate_count += 1
                continue

            seen_events[event.event_id] = event_data

            # 5. DB에 같은 event_id가 이미 있는지 확인
            existing_event = (
                db.query(RecommendationImpression)
                .filter(
                    RecommendationImpression.event_id == event.event_id
                )
                .first()
            )

            if existing_event:
                existing_data = (
                    existing_event.request_id,
                    existing_event.user_id,
                    existing_event.listing_id,
                    existing_event.position,
                    existing_event.occurred_at,
                )

                if existing_data != event_data:
                    raise HTTPException(
                        status_code=409,
                        detail="Event ID already exists with different data",
                    )

                duplicate_count += 1
                continue

            # 6. 노출 이벤트 저장
            statement = insert(RecommendationImpression).values(
                event_id=event.event_id, request_id=body.request_id,
                user_id=current_user.user_id, listing_id=listing_id,
                position=event.position, occurred_at=event.occurred_at,
            )
            statement = statement.on_conflict_do_update(
                constraint="uq_impression_request_listing",
                set_={"event_id": statement.excluded.event_id,
                      "occurred_at": statement.excluded.occurred_at,
                      "position": statement.excluded.position},
                where=statement.excluded.occurred_at < RecommendationImpression.occurred_at,
            )
            outcome = db.execute(statement.returning(RecommendationImpression.event_id))
            if outcome.scalar_one_or_none() is not None:
                recorded_count += 1
            else:
                duplicate_count += 1

        db.commit()

    except Exception:
        db.rollback()
        raise

    return {
        "request_id": body.request_id,
        "recorded_count": recorded_count,
        "duplicate_count": duplicate_count,
        "message": "Recommendation impressions recorded successfully",
    }

@router.post("/events/views", status_code=201)
def record_recommendation_view(
    body: ProductViewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. 추천 요청이 존재하고 로그인한 사용자의 것인지 확인
    request = (
        db.query(RecommendationRequest)
        .filter(
            RecommendationRequest.request_id == body.request_id,
            RecommendationRequest.user_id == current_user.user_id,
        )
        .first()
    )

    if request is None:
        raise HTTPException(
            status_code=404,
            detail="Recommendation request not found",
        )

    # 2. listing_id를 Integer로 변환
    try:
        listing_id = int(body.listing_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid listing_id: {body.listing_id}",
        )

    # 3. 조회 시각에 타임존이 포함되어 있는지 확인
    if body.occurred_at.tzinfo is None:
        raise HTTPException(
            status_code=400,
            detail="occurred_at must include timezone information",
        )

    # 4. 해당 상품이 이 추천 요청에 포함되어 있는지 확인
    recommendation_item = (
        db.query(RecommendationItem)
        .filter(
            RecommendationItem.request_id == body.request_id,
            RecommendationItem.listing_id == listing_id,
        )
        .first()
    )

    if recommendation_item is None:
        raise HTTPException(
            status_code=404,
            detail="Listing not found in recommendation result",
        )

    # 5. 동일한 event_id가 이미 존재하는지 확인
    existing_event = (
        db.query(ProductViewEvent)
        .filter(
            ProductViewEvent.event_id == body.event_id
        )
        .first()
    )

    if existing_event:
        existing_data = (
            existing_event.request_id,
            existing_event.user_id,
            existing_event.listing_id,
            existing_event.product_id,
            existing_event.store_id,
            existing_event.occurred_at,
        )

        new_data = (
            body.request_id,
            current_user.user_id,
            listing_id,
            recommendation_item.product_id,
            recommendation_item.store_id,
            body.occurred_at,
        )

        if existing_data != new_data:
            raise HTTPException(
                status_code=409,
                detail="Event ID already exists with different data",
            )

        return {
            "event_id": existing_event.event_id,
            "listing_id": str(existing_event.listing_id),
            "event_type": "detail_view",
            "recorded_at": existing_event.occurred_at.isoformat(),
            "message": "상품 상세 조회 기록이 저장되었습니다.",
        }

    # 6. 상세 조회 이벤트 저장
    view_event = ProductViewEvent(
        event_id=body.event_id,
        request_id=body.request_id,
        user_id=current_user.user_id,
        listing_id=listing_id,
        product_id=recommendation_item.product_id,
        store_id=recommendation_item.store_id,
        occurred_at=body.occurred_at,
    )

    try:
        db.add(view_event)
        db.commit()
        db.refresh(view_event)

    except Exception:
        db.rollback()
        raise

    # 7. 응답 반환
    return {
        "event_id": view_event.event_id,
        "listing_id": str(view_event.listing_id),
        "event_type": "detail_view",
        "recorded_at": view_event.occurred_at.isoformat(),
        "message": "상품 상세 조회 기록이 저장되었습니다.",
    }