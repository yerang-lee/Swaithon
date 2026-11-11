"""Optional local Whisper adapter. Requires FFmpeg and requirements-stt.txt."""
import os
import threading
import subprocess
import tempfile
from pathlib import Path
import shutil

FFMPEG_BIN = (
    r"C:\Users\SM-PC\AppData\Local\Microsoft\WinGet\Packages"
    r"\Gyan.FFmpeg.Shared_Microsoft.Winget.Source_8wekyb3d8bbwe"
    r"\ffmpeg-9.0.2-full_build-shared\bin"
)

os.environ["PATH"] = FFMPEG_BIN + os.pathsep + os.environ.get("PATH", "")

class WhisperSTT:
    def __init__(self):
        self.model = None
        self.processor = None
        self.model_dir = os.getenv("WHISPER_MODEL_DIR", "").strip()
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
            ffmpeg_path = shutil.which("ffmpeg") or (
                r"C:\Users\SM-PC\AppData\Local\Microsoft\WinGet\Packages"
                r"\Gyan.FFmpeg.Shared_Microsoft.Winget.Source_8wekyb3d8bbwe"
                r"\ffmpeg-9.0.2-full_build-shared\bin\ffmpeg.exe"
            )

            subprocess.run([ffmpeg_path, '-nostdin', '-v', 'error',
                '-protocol_whitelist', 'file,pipe',
                '-i', str(source), '-t', '31', '-ar', '16000',
                '-ac', '1', str(decoded)],
                check=True, capture_output=True, timeout=30)
            import whisper
            import numpy as np
            samples=whisper.load_audio(str(decoded))
            if len(samples)/16000>30:
                raise ValueError('30초 이내로 녹음해 주세요.')
            if not len(samples) or float(np.sqrt(np.mean(samples**2)))<0.002:
                raise ValueError('음성을 확인하지 못했습니다. 다시 녹음해 주세요.')
            with self.lock:
                if self.model_dir:
                    import torch
                    from transformers import (
                        WhisperForConditionalGeneration,
                        WhisperProcessor,
                    )

                    if self.model is None:
                        model_dir = Path(self.model_dir).expanduser()
                        if not (model_dir / "config.json").is_file():
                            raise RuntimeError(
                                f"학습 모델의 config.json을 찾을 수 없습니다: {model_dir}"
                            )

                        device = "cuda" if torch.cuda.is_available() else "cpu"

                        processor = WhisperProcessor.from_pretrained(
                            model_dir, local_files_only=True
                        )
                        model = WhisperForConditionalGeneration.from_pretrained(
                            model_dir,
                            local_files_only=True,
                            use_safetensors=True,
                        ).to(device).eval()
                        model.generation_config.forced_decoder_ids = None

                        self.processor = processor
                        self.model = model

                    batch = self.processor.feature_extractor(
                        samples,
                        sampling_rate=16000,
                        return_attention_mask=True,
                        return_tensors="pt",
                    ).to(self.model.device)

                    with torch.inference_mode():
                        token_ids = self.model.generate(
                            **batch,
                            language="korean",
                            task="transcribe",
                            max_new_tokens=225,
                            num_beams=1,
                            do_sample=False,
                        )

                    text = self.processor.batch_decode(
                        token_ids, skip_special_tokens=True
                    )[0]
                    segments = []

                else:
                    if self.model is None:
                        model_name = os.getenv(
                            "WHISPER_MODEL", "small"
                        ).strip().rstrip("\\/")
                        self.model = whisper.load_model(model_name)

                    result = self.model.transcribe(
                        samples,
                        language="ko",
                        task="transcribe",
                        fp16=str(self.model.device).startswith("cuda"),
                        condition_on_previous_text=False,
                    )
                    text = result["text"]
                    segments = result.get("segments", [])

            text = text.strip()
            if not text or (
                segments and all(s.get("no_speech_prob", 0) > 0.7 for s in segments)
            ):
                raise ValueError("음성을 확인하지 못했습니다. 다시 녹음해 주세요.")
            return text