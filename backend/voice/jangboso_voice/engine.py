
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4

from .schema import Command

EXECUTION_ENDPOINTS = {
    "PRODUCT_CREATE": "/voice/product-registration/confirm",
    "PRODUCT_UPDATE": "/voice/product-update",
    "SALE_CREATE": "/voice/sale-registration",
    "PRODUCT_DELETE": "/voice/product-delete",
    "SOLD_OUT": "/voice/sold-out",
    "SALE_DELETE": "/voice/sale-delete",
}


def utcnow():
    return datetime.now(timezone.utc)


class VoiceError(Exception):
    def __init__(self, code, message, status=409):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def normalized(name):
    return "".join((name or "").split()).casefold()


def timestamp(value):
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            raise ValueError()
        return dt
    except (TypeError, ValueError):
        raise VoiceError(
            "INVALID_TIME",
            "날짜와 오전/오후를 포함해 종료 시각을 알려주세요.",
            422,
        )


def is_sold_out(product):
    return bool(
        product.get(
            "is_sold_out",
            product.get("status") == "SOLD_OUT",
        )
    )


def sale_price_from(parsed):
    return parsed.get("sale_price", parsed.get("discount_price"))


def sale_is_active(sale, now):
    if not sale:
        return False

    ends_at = sale.get("ends_at")

    if ends_at is None:
        return True

    return timestamp(ends_at) > now


def effective_price(product, now):
    sale = product.get("sale")

    if not sale_is_active(sale, now):
        return product["price"]

    if sale.get("rate") is not None:
        return int(
            (
                Decimal(product["price"])
                * (100 - sale["rate"])
                / 100
            ).quantize(
                Decimal("1"),
                rounding=ROUND_HALF_UP,
            )
        )

    if sale.get("price") is not None:
        return sale["price"]

    return product["price"]


class VoiceService:

    def __init__(self, store, parser, clock=utcnow):
        self.store = store
        self.parser = parser
        self.clock = clock

    def _owned(self, state, cid, user, shop):
        command = state["commands"].get(cid)

        if (
            not command
            or str(command["user_id"]) != str(user)
            or str(command["store_id"]) != str(shop)
        ):
            raise VoiceError(
                "NOT_FOUND",
                "명령을 찾을 수 없습니다.",
                404,
            )

        if command["status"] not in ("SUCCEEDED", "CANCELLED"):
            if timestamp(command["expires_at"]) <= self.clock():
                raise VoiceError(
                    "EXPIRED",
                    "명령이 만료되었습니다. 다시 말씀해 주세요.",
                )

        return command

    def analyze(self, text, user, shop):
        parsed = self.parser.parse([text])

        with self.store.transaction() as state:
            command = {
                "command_id": str(uuid4()),
                "user_id": str(user),
                "store_id": str(shop),
                "messages": [text],
                "parsed": parsed.model_dump(),
                "status": "NEW",
                "revision": 0,
                "expires_at": (
                    self.clock() + timedelta(minutes=10)
                ).isoformat(),
                "selected_id": None,
            }

            self._plan(state, command)
            state["commands"][command["command_id"]] = command

            return deepcopy(command)

    def check_answerable(self, cid, user, shop):
        with self.store.transaction() as state:
            command = self._owned(state, cid, user, shop)

            if command["status"] not in (
                "NEEDS_INPUT",
                "NEEDS_SELECTION",
            ):
                raise VoiceError(
                    "INVALID_STATE",
                    "현재 명령에는 추가 답변을 할 수 없습니다.",
                )

            return command["revision"]

    def answer(
        self,
        cid,
        user,
        shop,
        text="",
        listing_id=None,
        expected_revision=None,
    ):
        with self.store.transaction() as state:
            command = deepcopy(
                self._owned(state, cid, user, shop)
            )

            if command["status"] not in (
                "NEEDS_INPUT",
                "NEEDS_SELECTION",
            ):
                raise VoiceError(
                    "INVALID_STATE",
                    "현재 명령에는 추가 답변을 할 수 없습니다.",
                )

            if (
                expected_revision is not None
                and command["revision"] != expected_revision
            ):
                raise VoiceError(
                    "STALE_COMMAND",
                    "명령이 변경되었습니다. 다시 확인해 주세요.",
                )

            revision = command["revision"]
            original_status = command["status"]

        if not text.strip() and not listing_id:
            raise VoiceError(
                "EMPTY_ANSWER",
                "답변 또는 상품을 선택해 주세요.",
                422,
            )

        if listing_id:
            # 상품 선택이 필요한 상태에서만 선택값 검증
            if original_status != "NEEDS_SELECTION":
                raise VoiceError(
                    "INVALID_SELECTION",
                    "현재는 상품 선택이 필요한 상태가 아닙니다.",
                    422,
                )

            valid_ids = [
                str(p["listing_id"])
                for p in command.get("candidates", [])
            ]

            if str(listing_id) not in valid_ids:
                raise VoiceError(
                    "INVALID_SELECTION",
                    "표시된 상품 중에서 선택해 주세요.",
                    422,
                )

        if text.strip():
            command["messages"].append(text)
            command["parsed"] = self.parser.parse(
                command["messages"]
            ).model_dump()
            command["selected_id"] = None

        if listing_id:
            command["selected_id"] = str(listing_id)

        with self.store.transaction() as state:
            current = self._owned(state, cid, user, shop)

            if (
                current["revision"] != revision
                or current["status"] != original_status
            ):
                raise VoiceError(
                    "STALE_COMMAND",
                    "명령이 변경되었습니다. 다시 확인해 주세요.",
                )

            command["revision"] += 1
            self._plan(state, command)
            state["commands"][cid] = command

            return deepcopy(command)


    def execute(
        self,
        cid,
        user,
        shop,
        confirmed,
        allowed,
        sale_action=None,
    ):
        with self.store.transaction() as state:
            command = self._owned(state, cid, user, shop)

            if command["intent"] not in allowed:
                raise VoiceError(
                    "WRONG_ENDPOINT",
                    (
                        f"최종 작업은 {command['intent']}입니다. "
                        f"POST {EXECUTION_ENDPOINTS.get(command['intent'], '(실행 불가)')}를 "
                        "사용하세요."
                    ),
                    422,
                )

            if command["status"] == "SUCCEEDED":
                return deepcopy(command)

            if (
                command["status"] != "NEEDS_CONFIRMATION"
                or not confirmed
            ):
                raise VoiceError(
                    "CONFIRMATION_REQUIRED",
                    "화면에서 변경 내용을 확인해 주세요.",
                )

            product = (
                state["products"].get(str(command["listing_id"]))
                if command["listing_id"]
                else None
            )

            if command["listing_id"]:
                if (
                    not product
                    or product["version"] != command["product_version"]
                    or product.get("deleted_at")
                    or str(product["store_id"]) != str(shop)
                ):
                    raise VoiceError(
                        "STALE_PRODUCT",
                        "상품이 변경되었습니다. 새 명령으로 다시 확인해 주세요.",
                    )

            # 할인 등록과 할인 수정 구분
            if command["intent"] == "SALE_CREATE":
                has_active_sale = sale_is_active(
                    product.get("sale") if product else None,
                    self.clock(),
                )

                if sale_action == "create" and has_active_sale:
                    raise VoiceError(
                        400,
                        "SALE_ALREADY_EXISTS",
                        "이미 진행 중인 할인이 있습니다. 할인 수정을 이용해 주세요.",
                    )

                if sale_action == "update" and not has_active_sale:
                    raise VoiceError(
                        "SALE_NOT_FOUND",
                        "수정할 진행 중인 할인이 없습니다. 먼저 할인을 등록해 주세요.",
                        400,
                    )

            fresh = deepcopy(command)
            self._plan(state, fresh)

            if (
                fresh["status"] != "NEEDS_CONFIRMATION"
                or fresh["intent"] != command["intent"]
                or fresh["listing_id"] != command["listing_id"]
            ):
                raise VoiceError(
                    "RECONFIRM_REQUIRED",
                    "상품이나 조건이 변경되었습니다. 새 명령으로 다시 확인해 주세요.",
                    400,
                )

            after = self._changed(product, command)

            temp_id = str(after["listing_id"])
            state["products"][temp_id] = after

            command["listing_id"] = temp_id
            command["product_version"] = after["version"]

            state["events"].append({
                "command_id": cid,
                "user_id": str(user),
                "store_id": str(shop),
                "at": self.clock().isoformat(),
                "intent": command["intent"],
                "before": deepcopy(product),
                "after": deepcopy(after),
            })

            command.update(
                status="SUCCEEDED",
                result=self._view(after),
                message="처리했습니다.",
            )

        with self.store.transaction() as state:
            saved_command = self._owned(state, cid, user, shop)
            return deepcopy(saved_command)


    def _plan(self, state, command):
        data = Command.model_validate(
            command["parsed"]
        ).model_dump()

        command.update(
            parsed=data,
            missing_fields=[],
            candidates=[],
            preview=None,
            listing_id=None,
            product_version=None,
            message="",
            status="NEEDS_INPUT",
            intent=data["intent"],
        )

        if data["intent"] == "CANCEL":
            command.update(
                status="CANCELLED",
                message="변경하지 않았습니다.",
            )
            return

        if data["intent"] in ("MULTIPLE", "UNKNOWN"):
            command["message"] = (
                "한 상품씩 한 작업을 말씀해 주세요."
                if data["intent"] == "MULTIPLE"
                else "어떤 상품을 어떻게 처리할지 말씀해 주세요."
            )
            return

        missing = []

        if not data["product_name"] or not data["product_name"].strip():
            missing.append("product_name")

        if data["intent"] == "PRODUCT_CREATE":
            missing += [
                field
                for field in (
                    "price",
                    "sale_quantity",
                    "sale_unit",
                    "category",
                )
                if data[field] is None
            ]

        if missing:
            self._ask(command, missing)
            return

        products = [
            product
            for product in state["products"].values()
            if str(product["store_id"]) == str(command["store_id"])
            and not product.get("deleted_at")
            and product["product_name"].strip()
            == data["product_name"].strip()
        ]

        if data["sale_quantity"] is not None:
            products = [
                p for p in products
                if p["sale_quantity"] == data["sale_quantity"]
            ]

        if data["sale_unit"] is not None:
            products = [
                p for p in products
                if p["sale_unit"] == data["sale_unit"]
            ]

        if command.get("selected_id"):
            products = [
                p for p in products
                if str(p["listing_id"])
                == str(command["selected_id"])
            ]

            if not products:
                raise VoiceError(
                    "STALE_SELECTION",
                    "선택한 상품이 변경되었습니다. 다시 말씀해 주세요.",
                )

        if len(products) > 1:
            command.update(
                status="NEEDS_SELECTION",
                message="어떤 상품인가요?",
                candidates=deepcopy(products),
            )
            return

        product = products[0] if products else None

        if data["intent"] == "PRODUCT_CREATE" and product:
            if (
                data["stock_quantity"] is not None
                and data["stock_quantity"] != product.get("stock_quantity")
            ):
                command["message"] = (
                    "기존 상품과 재고가 다릅니다. "
                    "재고 변경인지 새 상품 등록인지 다시 말씀해 주세요."
                )
                return

            command["intent"] = "PRODUCT_UPDATE"
            data["stock_quantity"] = None
            command["parsed"] = data

        elif data["intent"] != "PRODUCT_CREATE" and not product:
            command["message"] = (
                "해당 상품을 찾지 못했습니다. "
                "상품명과 판매 단위를 확인해 주세요."
            )
            return

        if product:
            command["listing_id"] = str(product["listing_id"])
            command["product_version"] = product["version"]

        if command["intent"] == "PRODUCT_DETAIL":
            command.update(
                status="SUCCEEDED",
                result=self._view(product),
                message="상품을 조회했습니다.",
            )
            return

        if (
            command["intent"] == "PRODUCT_UPDATE"
            and data["price"] is None
            and data["stock_quantity"] is None
        ):
            self._ask(command, ["price"])
            return

        if command["intent"] == "SALE_CREATE":
            discount_price = sale_price_from(data)

            if (
                data["discount_rate"] is None
                and discount_price is None
            ):
                missing.append("discount")

            if (
                data["discount_rate"] is None
                and discount_price is None
            ):
                missing.append("discount")

            if (
                data["sale_ends_at"] is None
                and data.get("sale_end_expression")
            ):
                command["message"] = (
                    "말씀하신 종료 시각의 날짜와 오전/오후를 확인해 주세요."
                )
                command["missing_fields"] = ["sale_ends_at"]
                return

            if data["sale_ends_at"] is not None:
                if timestamp(data["sale_ends_at"]) <= self.clock():
                    command["message"] = (
                        "종료 시간이 지났습니다. "
                        "앞으로의 종료 시각을 알려주세요."
                    )
                    command["missing_fields"] = ["sale_ends_at"]
                    return

            if missing:
                self._ask(command, missing)
                return

            if is_sold_out(product):
                command["message"] = (
                    "품절 상품에는 할인을 설정할 수 없습니다."
                )
                return

            if (
                discount_price is not None
                and data["discount_rate"] is not None
            ):
                command["message"] = (
                    "할인율 또는 할인 가격 중 하나만 말씀해 주세요."
                )
                return

            if (
                discount_price is not None
                and discount_price >= product["price"]
            ):
                command["message"] = (
                    "할인 가격은 기본 가격보다 낮아야 합니다."
                )
                return

        if (
            command["intent"] == "PRODUCT_UPDATE"
            and product
            and data["price"] is not None
        ):
            sale = product.get("sale")

            if (
                sale_is_active(sale, self.clock())
                and sale.get("price") is not None
                and sale["price"] >= data["price"]
            ):
                command["message"] = (
                    "유지할 할인 가격보다 기본 가격이 낮거나 같습니다. "
                    "기본 가격을 다시 알려주세요."
                )
                command["missing_fields"] = ["price"]
                return

        after = self._changed(product, command, preview=True)

        command.update(
            status="NEEDS_CONFIRMATION",
            preview={
                "before": self._view(product) if product else None,
                "after": self._view(after),
            },
            message="변경 내용을 확인해 주세요.",
        )

    def _ask(self, command, missing):
        questions = {
            "product_name": "어떤 상품인가요?",
            "price": "가격을 얼마로 할까요?",
            "sale_quantity": "몇 개인지도 알려주세요.",
            "sale_unit": "판매 단위도 알려주세요.",
            "discount": "할인율 또는 할인 가격을 알려주세요.",
        }

        command["missing_fields"] = missing
        command["message"] = " ".join(
            questions[field] for field in missing
        )

    def _view(self, product):
        result = deepcopy(product)
        result["is_sold_out"] = is_sold_out(product)
        result["effective_price"] = effective_price(
            product,
            self.clock(),
        )
        result["sale_active"] = sale_is_active(
            product.get("sale"),
            self.clock(),
        )
        return result

    def _changed(self, product, command, preview=False):
        data = command["parsed"]
        intent = command["intent"]

        if product is None:
            return {
                "listing_id": (
                    "pending" if preview else str(uuid4())
                ),
                "store_id": str(command["store_id"]),
                "product_name": data["product_name"].strip(),
                "category": data["category"],
                "price": data["price"],
                "sale_price": None,
                "sale_quantity": data["sale_quantity"],
                "sale_unit": data["sale_unit"],
                "stock_quantity": data["stock_quantity"],
                "is_sold_out": False,
                "status": "ACTIVE",
                "sale": None,
                "deleted_at": None,
                "version": 1,
            }

        product = deepcopy(product)

        if intent == "PRODUCT_UPDATE":
            for field in ("price", "stock_quantity"):
                if data[field] is not None:
                    product[field] = data[field]

        elif intent == "PRODUCT_DELETE":
            product["deleted_at"] = self.clock().isoformat()

        elif intent == "SOLD_OUT":
            product["is_sold_out"] = True
            product["status"] = "SOLD_OUT"

        elif intent == "SALE_DELETE":
            product["sale"] = None
            product["sale_price"] = None

        elif intent == "SALE_CREATE":
            discount_price = sale_price_from(data)

            product["sale"] = {
                "rate": data["discount_rate"],
                "price": discount_price,
                "starts_at": self.clock().isoformat(),
                "ends_at": data["sale_ends_at"],
            }

            product["sale_rate"] = data["discount_rate"]
            product["sale_price"] = discount_price

        product["version"] = product.get("version", 1) + 1
        return product



    def cancel(self, cid, user, shop):
        with self.store.transaction() as state:
            command = self._owned(state, cid, user, shop)

            if command["status"] == "SUCCEEDED":
                raise VoiceError(
                    "ALREADY_EXECUTED",
                    "이미 처리된 명령입니다.",
                )

            command.update(
                status="CANCELLED",
                revision=command["revision"] + 1,
                message="취소했습니다.",
            )

            return deepcopy(command)

    def products(self, shop):
        with self.store.transaction() as state:
            return [
                self._view(product)
                for product in state["products"].values()
                if str(product["store_id"]) == str(shop)
                and not product.get("deleted_at")
            ]
