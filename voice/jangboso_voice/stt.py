"""Optional local Whisper adapter. Requires FFmpeg and requirements-stt.txt."""
import os
import threading
import subprocess
import tempfile
from pathlib import Path

class WhisperSTT:
    def __init__(self):
        self.model = None
        self.lock = threading.Lock()

    def transcribe(self, audio: bytes, suffix: str):
        if suffix.lower() not in ('.wav', '.mp3', '.m4a', '.webm', '.mp4', '.ogg'):
            raise ValueError('지원하지 않는 녹음 형식입니다.')
        if not audio or len(audio)>10*1024*1024:
            raise ValueError('녹음은 10MB 이하로 보내주세요.')
        with tempfile.TemporaryDirectory(prefix='jangboso-voice-') as folder:
            source=Path(folder)/('input'+suffix.lower())
            decoded=Path(folder)/'audio.wav'
            source.write_bytes(audio)
            # Decode at most 31 seconds, without network protocols or unbounded output.
            subprocess.run(['ffmpeg','-nostdin','-v','error','-protocol_whitelist','file,pipe',
                '-i',str(source),'-t','31','-ar','16000','-ac','1',str(decoded)],
                check=True,capture_output=True,timeout=30)
            import whisper
            import numpy as np
            samples=whisper.load_audio(str(decoded))
            if len(samples)/16000>30:
                raise ValueError('30초 이내로 녹음해 주세요.')
            if not len(samples) or float(np.sqrt(np.mean(samples**2)))<0.002:
                raise ValueError('음성을 확인하지 못했습니다. 다시 녹음해 주세요.')
            with self.lock:
                if self.model is None:
                    self.model=whisper.load_model(os.getenv('WHISPER_MODEL','small'))
                result=self.model.transcribe(samples,language='ko',task='transcribe',
                    fp16=str(self.model.device).startswith('cuda'),condition_on_previous_text=False)
            text=result['text'].strip()
            segments=result.get('segments',[])
            if not text or (segments and all(s.get('no_speech_prob',0)>0.7 for s in segments)):
                raise ValueError('음성을 확인하지 못했습니다. 다시 녹음해 주세요.')
            return text
