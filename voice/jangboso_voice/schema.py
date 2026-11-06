from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

Intent = Literal['PRODUCT_DETAIL', 'PRODUCT_CREATE', 'PRODUCT_UPDATE',
                 'SALE_CREATE', 'PRODUCT_DELETE', 'SOLD_OUT', 'SALE_DELETE',
                 'UNKNOWN', 'MULTIPLE', 'CANCEL']

class Command(BaseModel):
    model_config = ConfigDict(extra='forbid')
    intent: Intent
    product_name: str | None = Field(default=None, max_length=100)
    price: int | None = Field(default=None, strict=True, gt=0, le=100000000)
    sale_quantity: float | None = Field(default=None, gt=0, le=1000000, allow_inf_nan=False)
    sale_unit: Literal['kg', 'g', '개', '봉지', '상자', '팩', '단', '마리', '근'] | None = None
    stock_quantity: int | None = Field(default=None, strict=True, ge=0, le=1000000)
    discount_rate: int | None = Field(default=None, strict=True, gt=0, lt=100)
    discount_price: int | None = Field(default=None, strict=True, gt=0)
    # Only an explicitly resolved, offset-bearing timestamp. Ambiguous times stay null.
    sale_ends_at: str | None = None

class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    text: str = Field(min_length=1, max_length=2000)

class AnswerRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    text: str = Field(default='', max_length=2000)
    listing_id: str | None = None

class ExecuteRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    command_id: str
    confirmed: bool = False
