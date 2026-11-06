"""Bundle only source/test text into a self-contained Colab notebook."""
import base64
import io
import json
import zipfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
buf=io.BytesIO()
with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
    for directory in ('jangboso_voice','tests'):
        for p in sorted((root/directory).glob('*')):
            if p.suffix in ('.py','.json'):
                z.writestr(str(p.relative_to(root)).replace('\\','/'),p.read_bytes())
payload=base64.b64encode(buf.getvalue()).decode()

cells=[]
def md(s): cells.append({'cell_type':'markdown','metadata':{},'source':s.splitlines(True)})
def code(s): cells.append({'cell_type':'code','metadata':{},'execution_count':None,'outputs':[],'source':s.splitlines(True)})
md('''# 장보소 음성 AI v1 — 추론·평가 노트북
이 노트북은 모델을 새로 학습하지 않습니다. 사전학습 Whisper + Gemini API를 연결합니다.
원래 지정된 Colab에는 아직 저장하지 않았습니다. 이 파일을 업로드하거나 셀을 복사하세요.
테스트 문장 재생은 AI 정확도 평가가 아닙니다. 실제 API 키/녹음을 사용한 결과를 별도로 확인하세요.
Colab 무료 자원과 Gemini 무료 등급은 사용량 제한이 있습니다. GPU는 선택 사항입니다.
''')
code('''%pip -q install fastapi pydantic google-genai python-multipart pytest httpx openai-whisper
import shutil, subprocess
if not shutil.which('ffmpeg'):
    subprocess.run(['apt-get', '-qq', 'update'], check=True)
    subprocess.run(['apt-get', '-qq', 'install', '-y', 'ffmpeg'], check=True)
''')
md('## 소스 복원\n이 셀의 압축 데이터에는 공개 가능한 프로젝트 코드와 가상 테스트만 포함됩니다. 키나 사용자 데이터는 없습니다.')
code(f'''import base64, io, zipfile, sys
from pathlib import Path
workspace = Path('/content/jangboso_voice_v1')
workspace.mkdir(exist_ok=True)
archive = base64.b64decode('{payload}')
with zipfile.ZipFile(io.BytesIO(archive)) as z:
    for name in z.namelist():
        destination = (workspace / name).resolve()
        if not destination.is_relative_to(workspace.resolve()):
            raise ValueError('Invalid archive path')
    z.extractall(workspace)
if str(workspace) not in sys.path:
    sys.path.insert(0, str(workspace))
print('소스 복원 완료')
''')
code('''import subprocess, os
result = subprocess.run([sys.executable, '-m', 'pytest', str(workspace/'tests'), '-q'],
    cwd=workspace, env={**os.environ, 'PYTHONPATH':str(workspace)}, capture_output=True, text=True)
print(result.stdout)
print(result.stderr)
assert result.returncode == 0
''')
md('''## 실제 Gemini 연결
왼쪽 열쇠(Secrets)에 GEMINI_API_KEY와 GEMINI_MODEL을 추가하고 이 노트북 접근을 허용하세요.
키를 코드 셀에 직접 적지 마세요. 모델 ID는 본인 계정의 구조화 출력 지원 모델을 사용합니다.
아래 실행부터 텍스트가 Gemini로 전달되며 계정 사용량이 소모됩니다.
''')
code('''from google.colab import userdata
os.environ['GEMINI_API_KEY'] = userdata.get('GEMINI_API_KEY')
os.environ['GEMINI_MODEL'] = userdata.get('GEMINI_MODEL')
from jangboso_voice.parser import GeminiParser
from jangboso_voice.engine import VoiceService
from jangboso_voice.storage import SQLiteStore
parser = GeminiParser()
service = VoiceService(SQLiteStore(workspace/'colab-demo.db'), parser)
command = service.analyze('사과 10개 5천 원', 'colab-user', 'colab-store')
print(command)
''')
md('''## 변경 내용 확인 후 실행
아래 셀은 Colab의 실습 DB만 변경합니다. 먼저 위 preview를 읽고, 실행하려면 CONFIRM을 True로 바꾸세요.
NEEDS_INPUT이면 다음 셀의 추가 답변을 먼저 사용하세요.
''')
code('''CONFIRM = False
if CONFIRM and command['status'] == 'NEEDS_CONFIRMATION':
    command = service.execute(command['command_id'], 'colab-user', 'colab-store', True, {command['intent']})
    print(command)
else:
    print('실행하지 않았습니다. 상태:', command['status'])
''')
code('''# 필요한 경우만 실행. answer_text를 질문에 맞게 수정하세요.
answer_text = '10개'
if command['status'] == 'NEEDS_INPUT':
    command = service.answer(command['command_id'], 'colab-user', 'colab-store', text=answer_text)
    print(command)
elif command['status'] == 'NEEDS_SELECTION':
    print('candidates를 확인하고 service.answer(..., listing_id=선택한_ID)를 호출하세요.')
''')
md('''## 실제 녹음 업로드 → Whisper → Gemini
본인이 시험에 사용할 녹음을 선택하세요. 원음은 Colab에서 처리하고 인식된 텍스트는 Gemini에 전달됩니다.
최초 실행 시 Whisper 모델을 다운로드합니다. CPU에서는 시간이 오래 걸릴 수 있습니다.
아래 업로드는 Colab 작업 파일로 남으므로 필요 없어진 파일은 직접 삭제하세요.
''')
code('''from google.colab import files
from jangboso_voice.stt import WhisperSTT
uploaded = files.upload()
stt = WhisperSTT()
for filename, data in uploaded.items():
    transcript = stt.transcribe(data, Path(filename).suffix)
    print('인식 문장:', transcript)
    command = service.analyze(transcript, 'colab-user', 'colab-store')
    print(command)
    # 실제 DB 변경은 위 확인 셀에서 별도 실행.
''')
md('''## 실제 LLM 추출 평가
전체 30문장을 호출합니다. 실행 전 RUN_EVALUATION=True로 변경하세요.
오늘/오전 같은 상대 시각은 실제 요청 날짜가 다르므로 평가에서 제외하고 직접 확인합니다.
이 점수는 텍스트 추출 부분 점수이며 음성 인식·운영 전체 정확도가 아닙니다.
''')
code('''import json, time
RUN_EVALUATION = False
results = []
if RUN_EVALUATION:
    cases = json.loads((workspace/'tests/cases.json').read_text())
    for case in cases:
        try:
            actual = parser.parse([case['text']]).model_dump()
            expected = {k:v for k,v in case['parsed'].items() if k != 'sale_ends_at'}
            passed = all(actual.get(k) == v for k,v in expected.items())
            results.append({'id':case['id'],'pass':passed,'expected':expected,'actual':actual})
        except Exception as exc:
            results.append({'id':case['id'],'pass':False,'error_type':type(exc).__name__})
        time.sleep(2)
    (workspace/'evaluation-result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print('필드 부분 일치:', sum(r['pass'] for r in results), '/', len(results))
else:
    print('평가 호출을 실행하지 않았습니다.')
''')
md('## 결과 저장\nColab 런타임 파일은 영구 보관되지 않습니다. 필요한 평가 결과를 다운로드하세요. 모델 학습 가중치는 생성하지 않습니다.')
code('''if (workspace/'evaluation-result.json').exists():
    files.download(str(workspace/'evaluation-result.json'))
''')
notebook={'nbformat':4,'nbformat_minor':5,'metadata':{'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'},'language_info':{'name':'python'}},'cells':cells}
for i,c in enumerate(cells): c['id']=f'voice-{i:02d}'
(root/'notebooks').mkdir(exist_ok=True)
(root/'notebooks/jangboso_voice_v1.ipynb').write_text(json.dumps(notebook,ensure_ascii=False,indent=2),encoding='utf-8')
print('Notebook generated:',len(cells),'cells')
