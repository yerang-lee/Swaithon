"""Regenerate human-reviewed extraction fixtures; not training or model inference."""
import json
from pathlib import Path

rows = [
('사과 얼마에 올려놨어?', 'PRODUCT_DETAIL', {'product_name':'사과'}, 'SUCCEEDED','PRODUCT_DETAIL','사과 10개 기본 가격 5,000원 조회'),
('배 5개에 만 원 등록해', 'PRODUCT_CREATE', {'product_name':'배','price':10000,'sale_quantity':5,'sale_unit':'개'}, 'NEEDS_CONFIRMATION','PRODUCT_CREATE','배 5개 10,000원 신규 등록 확인'),
('감자 1킬로에 삼천 원 등록해', 'PRODUCT_CREATE', {'product_name':'감자','price':3000,'sale_quantity':1,'sale_unit':'kg'}, 'NEEDS_CONFIRMATION','PRODUCT_CREATE','감자 1kg 신규 등록 확인'),
('사과 5천 원', 'PRODUCT_CREATE', {'product_name':'사과','price':5000}, 'NEEDS_INPUT','PRODUCT_CREATE','판매 수량과 단위 질문'),
('사과 10개 3천 원', 'PRODUCT_CREATE', {'product_name':'사과','price':3000,'sale_quantity':10,'sale_unit':'개'}, 'NEEDS_CONFIRMATION','PRODUCT_UPDATE','기존 사과 게시물 가격만 3,000원으로 변경'),
('사과 가격 6천 원으로 바꿔', 'PRODUCT_UPDATE', {'product_name':'사과','price':6000}, 'NEEDS_CONFIRMATION','PRODUCT_UPDATE','기존 기본 가격 변경'),
('사과 가격 바꿉니다', 'PRODUCT_UPDATE', {'product_name':'사과'}, 'NEEDS_INPUT','PRODUCT_UPDATE','변경할 가격 질문'),
('딸기 오늘 저녁 7시까지 20퍼센트 할인', 'SALE_CREATE', {'product_name':'딸기','discount_rate':20,'sale_ends_at':'2026-11-06T19:00:00+09:00'}, 'NEEDS_CONFIRMATION','SALE_CREATE','8,000원, 19시 종료 확인'),
('딸기 20퍼센트 할인', 'SALE_CREATE', {'product_name':'딸기','discount_rate':20}, 'NEEDS_CONFIRMATION','SALE_CREATE','종료 시각 null로 할인 확인, 기간 질문 없음'),
('딸기 오늘 저녁 8시까지 7천 원에 할인해', 'SALE_CREATE', {'product_name':'딸기','sale_price':7000,'sale_ends_at':'2026-11-06T20:00:00+09:00'}, 'NEEDS_CONFIRMATION','SALE_CREATE','고정 할인 가격 7,000원 설정'),
('사과 게시물 삭제해', 'PRODUCT_DELETE', {'product_name':'사과'}, 'NEEDS_CONFIRMATION','PRODUCT_DELETE','삭제 버튼 확인 후 deleted_at 기록'),
('딸기 다 팔렸어', 'SOLD_OUT', {'product_name':'딸기'}, 'NEEDS_CONFIRMATION','SOLD_OUT','품절 상태 변경 확인'),
('딸기 할인 끝내', 'SALE_DELETE', {'product_name':'딸기'}, 'NEEDS_CONFIRMATION','SALE_DELETE','할인 정보 해제, 기본 가격 유지'),
('사과 등록하고 배는 삭제해', 'MULTIPLE', {}, 'NEEDS_INPUT','MULTIPLE','한 상품씩 한 작업 안내'),
('사과 삭제하지 마', 'CANCEL', {}, 'CANCELLED','CANCEL','변경 없음'),
('취소할게', 'CANCEL', {}, 'CANCELLED','CANCEL','변경 없음'),
('바나나 얼마야?', 'PRODUCT_DETAIL', {'product_name':'바나나'}, 'NEEDS_INPUT','PRODUCT_DETAIL','없는 상품 안내'),
('오이 가격 2천 원으로 바꿔', 'PRODUCT_UPDATE', {'product_name':'오이','price':2000}, 'NEEDS_SELECTION','PRODUCT_UPDATE','오이 1개 / 5개 선택'),
('오이 5개 가격 4천 원으로 바꿔', 'PRODUCT_UPDATE', {'product_name':'오이','sale_quantity':5,'sale_unit':'개','price':4000}, 'NEEDS_CONFIRMATION','PRODUCT_UPDATE','오이 5개 게시물만 수정'),
('양파 1봉지 2천 원 등록해', 'PRODUCT_CREATE', {'product_name':'양파','sale_quantity':1,'sale_unit':'봉지','price':2000}, 'NEEDS_CONFIRMATION','PRODUCT_CREATE','양파 신규 등록, 재고 추측 없음'),
('사과 재고 8묶음으로 바꿔', 'PRODUCT_UPDATE', {'product_name':'사과','stock_quantity':8}, 'NEEDS_CONFIRMATION','PRODUCT_UPDATE','재고만 8, 판매 단위 10개 유지'),
('사과 가격 오천 원 아니 육천 원으로 바꿔', 'PRODUCT_UPDATE', {'product_name':'사과','price':6000}, 'NEEDS_CONFIRMATION','PRODUCT_UPDATE','정정된 최종 금액 사용'),
('고구마 반 킬로에 이천오백 원 등록해', 'PRODUCT_CREATE', {'product_name':'고구마','sale_quantity':0.5,'sale_unit':'kg','price':2500}, 'NEEDS_CONFIRMATION','PRODUCT_CREATE','소수 판매 단위 지원'),
('딸기 오늘 저녁 7시까지 할인해', 'SALE_CREATE', {'product_name':'딸기','sale_ends_at':'2026-11-06T19:00:00+09:00'}, 'NEEDS_INPUT','SALE_CREATE','할인율 또는 할인 가격 질문'),
('딸기 오늘 오전 9시까지 20퍼센트 할인', 'SALE_CREATE', {'product_name':'딸기','discount_rate':20,'sale_ends_at':'2026-11-06T09:00:00+09:00'}, 'NEEDS_INPUT','SALE_CREATE','기준시각보다 과거이므로 종료 시각 재질문'),
('딸기 오늘 저녁 7시까지 만이천 원으로 할인해', 'SALE_CREATE', {'product_name':'딸기','sale_price':12000,'sale_ends_at':'2026-11-06T19:00:00+09:00'}, 'NEEDS_INPUT','SALE_CREATE','기본가보다 높은 할인 가격 거절'),
('딸기 가격 2만 원으로 바꿔', 'PRODUCT_UPDATE', {'product_name':'딸기','price':20000}, 'NEEDS_CONFIRMATION','PRODUCT_UPDATE','기존 20% 할인 유지, 실제 가격 16,000원'),
('사과 10개 5천 원', 'PRODUCT_CREATE', {'product_name':'사과','sale_quantity':10,'sale_unit':'개','price':5000}, 'NEEDS_CONFIRMATION','PRODUCT_UPDATE','중복 등록 없이 기존 게시물 대상'),
('사과 20개 만 원 등록해', 'PRODUCT_CREATE', {'product_name':'사과','sale_quantity':20,'sale_unit':'개','price':10000}, 'NEEDS_CONFIRMATION','PRODUCT_CREATE','다른 판매 묶음이므로 신규 게시물'),
('오늘 날씨 어때?', 'UNKNOWN', {}, 'NEEDS_INPUT','UNKNOWN','상품 작업으로 다시 질문'),
]
root=Path(__file__).resolve().parents[1]
cases=[dict(id=i,text=t,parsed={'intent':intent,**fields},expected_status=status,
            expected_intent=resolved,description=desc) for i,(t,intent,fields,status,resolved,desc) in enumerate(rows,1)]
(root/'tests').mkdir(exist_ok=True)
(root/'tests'/'cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2),encoding='utf-8')
doc=['# 명령 문장 30개와 기대 결과','',
     '공통 조건: 2026-11-06 12:00 KST. 내 상점 사과 10개 5,000원 재고 10묶음, 딸기 1팩 10,000원(20% 할인, 당일 21시까지), 오이 1개·5개 두 게시물. 나머지는 없음.',
     '각 사례는 독립적으로 초기화합니다. 확인이 필요한 경우 DB는 확인 전까지 변경되지 않습니다.',
     '이 JSON은 기대 추출값입니다. 자동 테스트 통과는 Gemini/Whisper 실제 정확도를 뜻하지 않습니다.','',
     '|번호|명령|기대 결과|서버 상태|','|---|---|---|---|']
doc += [f"|{c['id']}|{c['text']}|{c['description']}|`{c['expected_status']}`|" for c in cases]
(root/'COMMAND_CASES.md').write_text('\n'.join(doc)+'\n',encoding='utf-8')
