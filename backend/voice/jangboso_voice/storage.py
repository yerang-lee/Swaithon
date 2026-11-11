"""PostgreSQL storage adapter for Jangboso voice engine."""

from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import UUID
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import text

from database import SessionLocal
from models import Product, Listing, VoiceCommand, VoiceEvent, ListingPriceHistory


def to_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value)


def to_int(value):
    if value is None:
        return None
    return int(value)

def get_effective_price(price, sale_price, sale_rate, sale_ends_at):
    now = datetime.now(timezone.utc)

    if sale_ends_at is not None and sale_ends_at <= now:
        return price

    if sale_rate is not None:
        return int(
            (
                Decimal(price) * (100 - sale_rate) / 100
            ).quantize(
                Decimal("1"),
                rounding=ROUND_HALF_UP,
            )
        )

    if sale_price is not None and sale_price < price:
        return sale_price

    return price


class PostgreSQLStore:

    CATEGORY_IDS = {
    "VEGETABLE": 1,
    "FRUIT": 2,
    "MEAT_EGGS": 3,
    "SEAFOOD": 4,
    "SIDE_DISH": 5,
    "PROCESSED_FOOD": 6,
    "GRAINS_NUTS": 7,
    "RICE_CAKE_BAKERY": 8,
    "OTHER": 9,
}

    def __init__(self, store_id: int, session_factory=SessionLocal):
        self.session_factory = session_factory
        self.store_id = store_id

    @contextmanager
    def transaction(self):
        with self.session_factory() as db:
            with db.begin():
                # 가게별 동시 실행 충돌 방지
                db.execute(
                    text(
                        "SELECT pg_advisory_xact_lock(:lock_id)"
                    ),
                    {"lock_id": 20261106 + self.store_id},
                )

                state = self._load_state(db)
                yield state
                self._save_state(db, state)

    # --------------------------------------------------
    # PostgreSQL -> VoiceService
    # --------------------------------------------------

    def _load_state(self, db):
        products = {}

        rows = (
            db.query(Listing, Product)
            .join(Product, Listing.product_id == Product.product_id)
            .filter(
                Listing.store_id == self.store_id,
                Listing.deleted_at.is_(None),
            )
            .all()
        )

        for listing, product in rows:
            sale = None

            if (
                listing.sale_price is not None
                or listing.sale_rate is not None
                or listing.sale_starts_at is not None
                or listing.sale_ends_at is not None
            ):
                sale = {
                    "rate": listing.sale_rate,
                    "price": listing.sale_price,
                    "starts_at": (
                        listing.sale_starts_at.isoformat()
                        if listing.sale_starts_at else None
                    ),
                    "ends_at": (
                        listing.sale_ends_at.isoformat()
                        if listing.sale_ends_at else None
                    ),
                }

            listing_id = str(listing.listing_id)

            products[listing_id] = {
                "listing_id": listing_id,
                "product_id": listing.product_id,
                "store_id": str(listing.store_id),
                "product_name": product.product_name,
                "price": listing.price,
                "sale_price": listing.sale_price,
                "sale_quantity": listing.sale_quantity,
                "sale_unit": listing.sale_unit,
                "stock_quantity": listing.stock_quantity,
                "is_sold_out": listing.is_sold_out,
                "status": (
                    "SOLD_OUT" if listing.is_sold_out else "ACTIVE"
                ),
                "sale": sale,
                "version": listing.version,
                "deleted_at": (
                    listing.deleted_at.isoformat()
                    if listing.deleted_at else None
                ),
            }

        commands = {}

        for command in db.query(VoiceCommand).filter(VoiceCommand.store_id == self.store_id).all():
            commands[command.command_id] = {
                "command_id": command.command_id,
                "user_id": str(command.user_id),
                "store_id": str(command.store_id),
                "messages": command.messages or [],
                "parsed": command.parsed or {},
                "intent": command.intent,
                "status": command.status,
                "message": command.message or "",
                "missing_fields": command.missing_fields or [],
                "candidates": command.candidates or [],
                "selected_id": command.selected_id,
                "preview": command.preview,
                "result": command.result,
                "listing_id": (
                    str(command.listing_id)
                    if command.listing_id is not None else None
                ),
                "product_version": command.product_version,
                "revision": command.revision,
                "expires_at": command.expires_at.isoformat(),
            }

        events = []

        for event in db.query(VoiceEvent).filter(VoiceEvent.store_id == self.store_id).all():
            events.append({
                "command_id": event.command_id,
                "user_id": str(event.user_id),
                "store_id": str(event.store_id),
                "intent": event.intent,
                "at": event.created_at.isoformat(),
                "before": event.before_data,
                "after": event.after_data,
            })

        return {
            "products": products,
            "commands": commands,
            "events": events,
        }

    # --------------------------------------------------
    # VoiceService -> PostgreSQL
    # --------------------------------------------------

    def _save_state(self, db, state):
        id_mapping = {}

        # 1. 새 상품의 임시 UUID를 실제 listing_id로 교체
        for key, data in list(state["products"].items()):
            listing_id = data.get("listing_id", key)

            try:
                int(listing_id)
                continue
            except (ValueError, TypeError):
                pass

            try:
                UUID(str(listing_id))
            except (ValueError, TypeError):
                continue

            # 표준 상품(Product)이 이미 있으면 재사용
            product = (
                db.query(Product)
                .filter(Product.product_name == data["product_name"])
                .first()
            )

            category_code = data.get("category")
            category_id = self.CATEGORY_IDS.get(category_code)

            if product is None:
                product = Product(
                    product_name=data["product_name"],
                    category_id=category_id,
                )
                db.add(product)
                db.flush()

            elif product.category_id is None and category_id is not None:
                product.category_id = category_id

            sale = data.get("sale") or {}

            listing = Listing(
                product_id=product.product_id,
                store_id=int(data["store_id"]),
                price=data["price"],
                sale_price=sale.get("price"),
                sale_quantity=data.get("sale_quantity"),
                sale_unit=data.get("sale_unit"),
                stock_quantity=data.get("stock_quantity"),
                is_sold_out=bool(
                    data.get(
                        "is_sold_out",
                        data.get("status") == "SOLD_OUT",
                    )
                ),
                sale_rate=sale.get("rate"),
                sale_starts_at=to_datetime(sale.get("starts_at")),
                sale_ends_at=to_datetime(sale.get("ends_at")),
                version=data.get("version", 1),
                deleted_at=to_datetime(data.get("deleted_at")),
            )

            db.add(listing)
            db.flush()

            # 신규 판매 게시물의 최초 정상 판매가 기록
            db.add(
                ListingPriceHistory(
                    listing_id=listing.listing_id,
                    price=data["price"],
                )
            )
            db.flush()

            id_mapping[str(listing_id)] = str(listing.listing_id)

            data["listing_id"] = str(listing.listing_id)
            data["product_id"] = product.product_id

        # 2. 임시 ID를 상품/명령/이벤트 전체에서 치환
        if id_mapping:
            state["products"] = self._remap(
                state["products"], id_mapping
            )
            state["commands"] = self._remap(
                state["commands"], id_mapping
            )
            state["events"] = self._remap(
                state["events"], id_mapping
            )

        # 3. 기존 상품의 변경 사항 반영
        for data in state["products"].values():
            listing_id = to_int(data.get("listing_id"))

            if listing_id is None:
                continue

            listing = (
                db.query(Listing)
                .filter(
                    Listing.listing_id == listing_id,
                    Listing.store_id == self.store_id,
                )
                .with_for_update()
                .first()
            )

            if listing is None:
                continue

            # 변경 전 실제 판매 가격
            old_price = get_effective_price(
                listing.price,
                listing.sale_price,
                listing.sale_rate,
                listing.sale_ends_at,
            )
            listing.price = data["price"]
            listing.sale_quantity = data.get("sale_quantity")
            listing.sale_unit = data.get("sale_unit")
            listing.stock_quantity = data.get("stock_quantity")
            listing.is_sold_out = bool(
                data.get(
                    "is_sold_out",
                    data.get("status") == "SOLD_OUT",
                )
            )
            listing.version = data.get("version", 1)
            listing.deleted_at = to_datetime(
                data.get("deleted_at")
            )
            sale = data.get("sale")

            if sale:
                listing.sale_rate = sale.get("rate")
                listing.sale_price = sale.get("price")
                listing.sale_starts_at = to_datetime(
                    sale.get("starts_at")
                )
                listing.sale_ends_at = to_datetime(
                    sale.get("ends_at")
                )
            else:
                listing.sale_rate = None
                listing.sale_price = None
                listing.sale_starts_at = None
                listing.sale_ends_at = None

            # 변경 후 실제 판매 가격 계산
            new_price = get_effective_price(
                listing.price,
                listing.sale_price,
                listing.sale_rate,
                listing.sale_ends_at,
            )

            # 실제 판매 가격이 변경된 경우에만 이력 저장
            if old_price != new_price:
                db.add(
                    ListingPriceHistory(
                        listing_id=listing.listing_id,
                        price=new_price,
                    )
                )

        # 4. 음성 명령 저장
        for data in state["commands"].values():
            command = db.get(
                VoiceCommand,
                data["command_id"],
            )

            if command is None:
                command = VoiceCommand(
                    command_id=data["command_id"],
                    user_id=int(data["user_id"]),
                    store_id=int(data["store_id"]),
                    messages=[],
                    parsed={},
                    intent=data["intent"],
                    status=data["status"],
                    expires_at=to_datetime(data["expires_at"]),
                )
                db.add(command)

            command.messages = data["messages"]
            command.parsed = data["parsed"]
            command.intent = data["intent"]
            command.status = data["status"]
            command.message = data.get("message")
            command.missing_fields = data.get("missing_fields", [])
            command.candidates = data.get("candidates", [])
            command.selected_id = data.get("selected_id")
            command.preview = data.get("preview")
            command.result = data.get("result")
            command.listing_id = to_int(data.get("listing_id"))
            command.product_version = data.get("product_version")
            command.revision = data.get("revision", 0)
            command.expires_at = to_datetime(data["expires_at"])

        db.flush()

        # 5. 실행 이력 저장
        for data in state["events"]:
            existing = (
                db.query(VoiceEvent)
                .filter(
                    VoiceEvent.command_id == data["command_id"]
                )
                .first()
            )

            if existing:
                continue

            db.add(
                VoiceEvent(
                    command_id=data["command_id"],
                    user_id=int(data["user_id"]),
                    store_id=int(data["store_id"]),
                    intent=data["intent"],
                    before_data=data.get("before"),
                    after_data=data["after"],
                )
            )

        db.flush()

    # --------------------------------------------------
    # 임시 ID 재귀 치환
    # --------------------------------------------------

    def _remap(self, value, mapping):
        if isinstance(value, dict):
            result = {}

            for key, item in value.items():
                new_key = mapping.get(str(key), key)
                result[new_key] = self._remap(item, mapping)

            return result

        if isinstance(value, list):
            return [
                self._remap(item, mapping)
                for item in value
            ]

        if isinstance(value, str) and value in mapping:
            return mapping[value]

        return value
