
from contextlib import asynccontextmanager

from fastapi import FastAPI

from database import test_connection, engine
from models import Base, User


# 서버 시작 시 DB 테이블 생성
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Jangboso API",
    lifespan=lifespan
)


@app.get("/")
def home():
    return {"message": "장보소 백엔드 서버 작동 중"}


@app.get("/db-check")
def db_check():
    result = test_connection()
    return {"database": "connected", "result": result}
