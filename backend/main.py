from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from market_assets import mount_market_images

from database import test_connection, engine
from models import (
    Base,
    User,
    Store,
    Product,
    Listing,
    Favorite,
    VoiceAnalysis,
    VoiceCommand,
    VoiceEvent,
    ListingPriceHistory,
)

# 기존 API 라우터
from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.markets import router as markets_router
from routers.stores import router as stores_router
from routers.products import router as products_router
from routers.favorites import router as favorites_router
from routers.recommendations import router as recommendations_router
from ai.recommendation_runtime import load_demo_recommender
from routers.reservations import router as reservations_router
from routers.notifications import router as notifications_router
from routers.images import router as images_router

# 음성 AI 모듈
from routers.voice import create_voice_router
from voice.jangboso_voice.engine import VoiceService
from voice.jangboso_voice.parser import GeminiParser
from voice.jangboso_voice.storage import PostgreSQLStore
from voice.jangboso_voice.stt import WhisperSTT


# Gemini AI 파서 연결
voice_parser = GeminiParser()

# Whisper STT 연결
voice_stt = WhisperSTT()


# 상인별 음성 명령 처리 서비스 생성
def create_voice_service(actor):
    voice_store = PostgreSQLStore(
        store_id=int(actor.store_id)
    )

    return VoiceService(
        store=voice_store,
        parser=voice_parser,
    )


# 음성 AI API 라우터 생성
voice_router = create_voice_router(
    service_factory=create_voice_service,
    stt=voice_stt,
)


# 서버 시작 및 종료 관리
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    app.state.recommender = load_demo_recommender()
    yield
    app.state.recommender = None


app = FastAPI(
    title="Jangboso API",
    lifespan=lifespan,
)

# 업로드 이미지 정적 파일 제공
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
mount_market_images(app, UPLOAD_DIR)

app.mount(
    "/uploads",
    StaticFiles(directory=UPLOAD_DIR),
    name="uploads",
)


# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 기존 API 등록
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(markets_router)
app.include_router(stores_router)
app.include_router(products_router)
app.include_router(favorites_router)
app.include_router(recommendations_router)
app.include_router(reservations_router)
app.include_router(notifications_router)
# 음성 AI API 등록
app.include_router(voice_router)
app.include_router(images_router)


@app.get("/")
def home():
    return {
        "message": "장보소 백엔드 서버 작동 중"
    }


@app.get("/db-check")
def db_check():
    result = test_connection()

    return {
        "database": "connected",
        "result": result,
    }
