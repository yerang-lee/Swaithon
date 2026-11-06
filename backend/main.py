
from contextlib import asynccontextmanager

from fastapi import FastAPI

from database import test_connection, engine
from models import Base, User, Store, Product, Listing, VoiceAnalysis

from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.markets import router as markets_router
from routers.stores import router as stores_router
from routers.products import router as products_router
from routers.voice import router as voice_router
from fastapi.middleware.cors import CORSMiddleware

# 서버 시작 시 DB 테이블 생성
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Jangboso API",
    lifespan=lifespan,
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 회원가입 및 인증 라우터 등록
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(markets_router)
app.include_router(stores_router)
app.include_router(products_router)
app.include_router(voice_router)

@app.get("/")
def home():
    return {"message": "장보소 백엔드 서버 작동 중"}


@app.get("/db-check")
def db_check():
    result = test_connection()
    return {"database": "connected", "result": result}
