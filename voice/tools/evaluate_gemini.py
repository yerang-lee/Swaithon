"""Opt-in live extraction evaluation; never writes product data."""
import argparse
import json
import sys
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend.voice.jangboso_voice.parser import GeminiParser

def main():
    args=argparse.ArgumentParser(description='실제 Gemini 호출: 텍스트만 전송하며 API 사용량이 발생합니다.')
    args.add_argument('--run',action='store_true')
    args.add_argument('--limit',type=int,default=5)
    options=args.parse_args()
    if not options.run:
        args.error('실제 호출을 실행하려면 --run을 지정하세요.')
    if not 1<=options.limit<=30:
        args.error('--limit은 1~30입니다.')
    parser=GeminiParser()
    cases=json.loads((ROOT/'tests/cases.json').read_text(encoding='utf-8'))
    results=[]
    for case in cases[:options.limit]:
        try:
            actual=parser.parse([case['text']]).model_dump()
            expected={k:v for k,v in case['parsed'].items() if k!='sale_ends_at'}
            results.append({'id':case['id'],'pass':all(actual.get(k)==v for k,v in expected.items()),
                            'expected':expected,'actual':actual})
        except Exception as exc:
            results.append({'id':case['id'],'pass':False,'error_type':type(exc).__name__})
        time.sleep(2)
    (ROOT/'evaluation-result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f"날짜 제외 필드 부분 일치: {sum(r['pass'] for r in results)}/{len(results)}")
    print('실제 STT 정확도와 시간 해석은 별도 녹음/수동 검증이 필요합니다.')

if __name__=='__main__':
    main()
