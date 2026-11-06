from copy import deepcopy
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4
from .schema import Command

EXECUTION_ENDPOINTS = {
    'PRODUCT_CREATE': '/voice/product-registration',
    'PRODUCT_UPDATE': '/voice/product-update',
    'SALE_CREATE': '/voice/sale-registration',
    'PRODUCT_DELETE': '/voice/product-delete',
    'SOLD_OUT': '/voice/sold-out',
    'SALE_DELETE': '/voice/sale-delete',
}

def utcnow():
    return datetime.now(timezone.utc)

class VoiceError(Exception):
    def __init__(self, code, message, status=409):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)

def normalized(name):
    return ''.join((name or '').split()).casefold()

def timestamp(value):
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            raise ValueError()
        return dt
    except (TypeError, ValueError):
        raise VoiceError('INVALID_TIME', '날짜와 오전/오후를 포함해 종료 시각을 알려주세요.', 422)

def sale_is_active(sale, now):
    # A null end is explicitly open-ended, not an invalid/missing timestamp.
    return bool(sale) and (sale.get('ends_at') is None or timestamp(sale['ends_at']) > now)

def is_sold_out(product):
    """Listing.is_sold_out is the canonical product availability field.

    The fallback only reads pre-rename local demo data; new results never expose
    the legacy listing-level status value.
    """
    return bool(product.get('is_sold_out', product.get('status') == 'SOLD_OUT'))

def effective_price(product, now):
    sale = product.get('sale')
    if not sale_is_active(sale, now):
        return product['price']
    if sale.get('rate') is not None:
        return int((Decimal(product['price']) * (100-sale['rate']) / 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    return sale['price']

class VoiceService:
    def __init__(self, store, parser, clock=utcnow):
        self.store, self.parser, self.clock = store, parser, clock

    def _owned(self, state, cid, user, shop):
        c = state['commands'].get(cid)
        if not c or c['user_id'] != user or c['store_id'] != shop:
            raise VoiceError('NOT_FOUND', '명령을 찾을 수 없습니다.', 404)
        if c['status'] not in ('SUCCEEDED', 'CANCELLED') and timestamp(c['expires_at']) <= self.clock():
            raise VoiceError('EXPIRED', '명령이 만료되었습니다. 다시 말씀해 주세요.')
        return c

    def analyze(self, text, user, shop):
        parsed = self.parser.parse([text])
        with self.store.transaction() as state:
            c = dict(command_id=str(uuid4()), user_id=user, store_id=shop,
                messages=[text], parsed=parsed.model_dump(), status='NEW', revision=0,
                expires_at=(self.clock()+timedelta(minutes=10)).isoformat(), selected_id=None)
            self._plan(state, c)
            state['commands'][c['command_id']] = c
            return deepcopy(c)

    def check_answerable(self, cid, user, shop):
        with self.store.transaction() as state:
            c = self._owned(state, cid, user, shop)
            if c['status'] not in ('NEEDS_INPUT', 'NEEDS_SELECTION'):
                raise VoiceError('INVALID_STATE', '현재 명령에는 추가 답변을 할 수 없습니다.')
            return c['revision']

    def answer(self, cid, user, shop, text='', listing_id=None, expected_revision=None):
        with self.store.transaction() as state:
            c = deepcopy(self._owned(state, cid, user, shop))
            if c['status'] not in ('NEEDS_INPUT', 'NEEDS_SELECTION'):
                raise VoiceError('INVALID_STATE', '현재 명령에는 추가 답변을 할 수 없습니다.')
            if expected_revision is not None and c['revision'] != expected_revision:
                raise VoiceError('STALE_COMMAND', '명령이 변경되었습니다. 다시 확인해 주세요.')
            revision = c['revision']
        if not text.strip() and not listing_id:
            raise VoiceError('EMPTY_ANSWER', '답변 또는 상품을 선택해 주세요.', 422)
        if listing_id and listing_id not in [p['listing_id'] for p in c.get('candidates', [])]:
            raise VoiceError('INVALID_SELECTION', '표시된 상품 중에서 선택해 주세요.', 422)
        if text.strip():
            c['messages'].append(text)
            c['parsed'] = self.parser.parse(c['messages']).model_dump()
            # Re-resolve after a natural-language correction.
            c['selected_id'] = None
        if listing_id:
            c['selected_id'] = listing_id
        with self.store.transaction() as state:
            current = self._owned(state, cid, user, shop)
            if current['revision'] != revision or current['status'] != c['status']:
                raise VoiceError('STALE_COMMAND', '명령이 변경되었습니다. 다시 확인해 주세요.')
            c['revision'] += 1
            self._plan(state, c)
            state['commands'][cid] = c
            return deepcopy(c)

    def _plan(self, state, c):
        d = Command.model_validate(c['parsed']).model_dump()
        c.update(parsed=d, missing_fields=[], candidates=[], preview=None, listing_id=None,
                 product_version=None, message='', status='NEEDS_INPUT', intent=d['intent'])
        if d['intent'] == 'CANCEL':
            c.update(status='CANCELLED', message='변경하지 않았습니다.')
            return
        if d['intent'] in ('MULTIPLE', 'UNKNOWN'):
            c['message'] = '한 상품씩 한 작업을 말씀해 주세요.' if d['intent']=='MULTIPLE' else '어떤 상품을 어떻게 처리할지 말씀해 주세요.'
            return
        missing = []
        if not d['product_name'] or not d['product_name'].strip():
            missing.append('product_name')
        if d['intent'] == 'PRODUCT_CREATE':
            missing += [k for k in ('price', 'sale_quantity', 'sale_unit') if d[k] is None]
        if missing:
            self._ask(c, missing)
            return
        products = [p for p in state['products'].values() if p['store_id']==c['store_id']
                    and not p.get('deleted_at') and normalized(p['product_name'])==normalized(d['product_name'])]
        if d['sale_quantity'] is not None:
            products = [p for p in products if p['sale_quantity']==d['sale_quantity']]
        if d['sale_unit'] is not None:
            products = [p for p in products if p['sale_unit']==d['sale_unit']]
        if c['selected_id']:
            products = [p for p in products if p['listing_id']==c['selected_id']]
            if not products:
                raise VoiceError('STALE_SELECTION', '선택한 상품이 변경되었습니다. 다시 말씀해 주세요.')
        if len(products)>1:
            c.update(status='NEEDS_SELECTION', message='어떤 상품인가요?',
                     candidates=[deepcopy(p) for p in products])
            return
        p = products[0] if products else None
        if d['intent']=='PRODUCT_CREATE' and p:
            # A registration-like utterance matching the sale bundle updates only price.
            if d['stock_quantity'] is not None and d['stock_quantity'] != p.get('stock_quantity'):
                c['message']='기존 상품과 재고가 다릅니다. 재고 변경인지 새 상품 등록인지 다시 말씀해 주세요.'
                return
            c['intent']='PRODUCT_UPDATE'
            d['stock_quantity']=None
            c['parsed']=d
        elif d['intent']!='PRODUCT_CREATE' and not p:
            c['message']='해당 상품을 찾지 못했습니다. 상품명과 판매 단위를 확인해 주세요.'
            return
        if p:
            c.update(listing_id=p['listing_id'], product_version=p['version'])
        if c['intent']=='PRODUCT_DETAIL':
            c.update(status='SUCCEEDED', result=self._view(p), message='상품을 조회했습니다.')
            return
        if c['intent']=='PRODUCT_UPDATE' and d['price'] is None and d['stock_quantity'] is None:
            self._ask(c, ['price'])
            return
        if c['intent']=='SALE_CREATE':
            if d['discount_rate'] is None and d['sale_price'] is None:
                missing.append('discount')
            if d['sale_ends_at'] is None and d.get('sale_end_expression'):
                c['message']='말씀하신 종료 시각의 날짜와 오전/오후를 확인해 주세요.'
                c['missing_fields']=['sale_ends_at']
                return
            if d['sale_ends_at'] is not None and timestamp(d['sale_ends_at']) <= self.clock():
                c['message']='종료 시간이 지났습니다. 앞으로의 종료 시각을 알려주세요.'
                c['missing_fields']=['sale_ends_at']
                return
            if missing:
                self._ask(c, missing)
                return
            if is_sold_out(p):
                c['message']='품절 상품에는 할인을 설정할 수 없습니다.'
                return
            if d['sale_price'] is not None and d['discount_rate'] is not None:
                c['message']='할인율 또는 할인 가격 중 하나만 말씀해 주세요.'
                return
            if d['sale_price'] is not None and d['sale_price']>=p['price']:
                c['message']='할인 가격은 기본 가격보다 낮아야 합니다.'
                return
        if c['intent']=='PRODUCT_UPDATE' and p and d['price'] is not None:
            sale=p.get('sale')
            if sale_is_active(sale, self.clock()) and sale.get('price') is not None and sale['price']>=d['price']:
                c['message']='유지할 할인 가격보다 기본 가격이 낮거나 같습니다. 기본 가격을 다시 알려주세요.'
                c['missing_fields']=['price']
                return
        after=self._changed(p, c, preview=True)
        c.update(status='NEEDS_CONFIRMATION', preview={'before': self._view(p) if p else None,
                 'after': self._view(after)}, message='변경 내용을 확인해 주세요.')

    def _ask(self, c, missing):
        questions={'product_name':'어떤 상품인가요?', 'price':'가격을 얼마로 할까요?',
                   'sale_quantity':'몇 개인지도 알려주세요.', 'sale_unit':'판매 단위도 알려주세요.',
                   'discount':'할인율 또는 할인 가격을 알려주세요.'}
        c['missing_fields']=missing
        c['message']=' '.join(questions[k] for k in missing)

    def _view(self, p):
        result=deepcopy(p)
        result['effective_price']=effective_price(p, self.clock())
        result['sale_active']=sale_is_active(p.get('sale'), self.clock())
        return result

    def _changed(self, p, c, preview=False):
        d, intent=c['parsed'], c['intent']
        if p is None:
            return dict(listing_id='pending' if preview else str(uuid4()), store_id=c['store_id'],
                product_name=d['product_name'].strip(), price=d['price'], sale_quantity=d['sale_quantity'],
                sale_unit=d['sale_unit'], stock_quantity=d['stock_quantity'], is_sold_out=False,
                sale=None, deleted_at=None, version=1)
        p=deepcopy(p)
        if intent=='PRODUCT_UPDATE':
            for field in ('price','stock_quantity'):
                if d[field] is not None:
                    p[field]=d[field]
        elif intent=='PRODUCT_DELETE':
            p['deleted_at']=self.clock().isoformat()
        elif intent=='SOLD_OUT':
            # Intent SOLD_OUT maps to Listing.is_sold_out=True in the real DB.
            p['is_sold_out']=True
            p.pop('status', None)
        elif intent=='SALE_DELETE':
            p['sale']=None
        elif intent=='SALE_CREATE':
            p['sale']={'rate':d['discount_rate'], 'price':d['sale_price'],
                       'starts_at':self.clock().isoformat(), 'ends_at':d['sale_ends_at']}
        p['version']+=1
        return p

    def execute(self, cid, user, shop, confirmed, allowed):
        with self.store.transaction() as state:
            c=self._owned(state,cid,user,shop)
            if c['intent'] not in allowed:
                raise VoiceError('WRONG_ENDPOINT', f"최종 작업은 {c['intent']}입니다. POST {EXECUTION_ENDPOINTS.get(c['intent'], '(실행 불가)')}를 사용하세요.", 422)
            if c['status']=='SUCCEEDED':
                return deepcopy(c)
            if c['status']!='NEEDS_CONFIRMATION' or not confirmed:
                raise VoiceError('CONFIRMATION_REQUIRED','화면에서 변경 내용을 확인해 주세요.')
            p=state['products'].get(c['listing_id']) if c['listing_id'] else None
            if c['listing_id'] and (not p or p['version']!=c['product_version'] or p.get('deleted_at') or p['store_id']!=shop):
                raise VoiceError('STALE_PRODUCT','상품이 변경되었습니다. 새 명령으로 다시 확인해 주세요.')
            # Recompute all business rules under the same transaction before committing.
            fresh=deepcopy(c)
            self._plan(state,fresh)
            if fresh['status']!='NEEDS_CONFIRMATION' or fresh['intent']!=c['intent'] or fresh['listing_id']!=c['listing_id']:
                raise VoiceError('RECONFIRM_REQUIRED','상품이나 조건이 변경되었습니다. 새 명령으로 다시 확인해 주세요.')
            after=self._changed(p,c)
            state['products'][after['listing_id']]=after
            state['events'].append(dict(command_id=cid,user_id=user,store_id=shop,
                at=self.clock().isoformat(),intent=c['intent'],before=deepcopy(p),after=deepcopy(after)))
            c.update(status='SUCCEEDED',result=self._view(after),message='처리했습니다.')
            return deepcopy(c)

    def cancel(self,cid,user,shop):
        with self.store.transaction() as state:
            c=self._owned(state,cid,user,shop)
            if c['status']=='SUCCEEDED':
                raise VoiceError('ALREADY_EXECUTED','이미 처리된 명령입니다.')
            c.update(status='CANCELLED',revision=c['revision']+1,message='취소했습니다.')
            return deepcopy(c)

    def products(self, shop):
        with self.store.transaction() as state:
            return [self._view(p) for p in state['products'].values() if p['store_id']==shop and not p.get('deleted_at')]
