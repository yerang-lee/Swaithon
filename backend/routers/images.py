
import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from database import get_db
from models import Image, Listing, Store, User
from security import get_current_user


router = APIRouter(prefix="/images", tags=["Images"])

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads" / "images"

MAX_FILE_SIZE = 5 * 1024 * 1024

IMAGE_SIGNATURES = {
    "jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
    "png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
    "webp": lambda data: (
        len(data) >= 12
        and data[:4] == b"RIFF"
        and data[8:12] == b"WEBP"
    ),
}


# 판매 상품 이미지 업로드
@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_image(
    image_file: UploadFile = File(...),
    listing_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. 상인 권한 확인
    if current_user.role != "MERCHANT":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="상인만 이미지를 업로드할 수 있습니다.",
        )

    # 2. Listing 및 상점 소유권 확인
    listing = (
        db.query(Listing)
        .join(Store, Listing.store_id == Store.store_id)
        .filter(
            Listing.listing_id == listing_id,
            Store.user_id == current_user.user_id,
        )
        .first()
    )

    if listing is None:
        existing_listing = (
            db.query(Listing)
            .filter(Listing.listing_id == listing_id)
            .first()
        )

        if existing_listing is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="존재하지 않는 판매 상품입니다.",
            )

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="해당 판매 상품의 이미지 등록 권한이 없습니다.",
        )

    # 3. 파일명 확인
    if not image_file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="파일명이 존재하지 않습니다.",
        )

    # 4. 파일 읽기 및 용량 확인
    file_content = await image_file.read(MAX_FILE_SIZE + 1)

    if not file_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="빈 파일은 업로드할 수 없습니다.",
        )

    if len(file_content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="이미지 파일은 5MB 이하만 업로드할 수 있습니다.",
        )

    # 5. 실제 이미지 형식 확인
    image_extension = None

    for extension, checker in IMAGE_SIGNATURES.items():
        if checker(file_content):
            image_extension = extension
            break

    if image_extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="지원하지 않는 이미지 형식입니다. JPG, PNG, WEBP만 가능합니다.",
        )

    # 6. Content-Type 확인
    allowed_content_types = {
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }

    if image_file.content_type != allowed_content_types[image_extension]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="이미지 파일 형식이 올바르지 않습니다.",
        )

    # 7. 이미지 파일 저장
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    original_file_name = Path(image_file.filename).name
    stored_file_name = f"{uuid.uuid4().hex}.{image_extension}"
    file_path = UPLOAD_DIR / stored_file_name

    try:
        file_path.write_bytes(file_content)

        image_url = f"/uploads/images/{stored_file_name}"

        # 8. 이미지 정보 DB 저장
        image = Image(
            listing_id=listing_id,
            user_id=current_user.user_id,
            image_url=image_url,
            file_name=original_file_name,
            stored_file_name=stored_file_name,
        )

        db.add(image)

        # 9. 해당 판매 상품에 이미지 연결
        listing.image_url = image_url

        db.commit()
        db.refresh(image)

    except Exception:
        db.rollback()

        if file_path.exists():
            file_path.unlink()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="이미지 업로드 중 오류가 발생했습니다.",
        )

    return {
        "image_id": image.image_id,
        "listing_id": image.listing_id,
        "image_url": image.image_url,
        "file_name": image.file_name,
        "uploaded_at": image.uploaded_at,
        "message": "이미지가 업로드되었습니다.",
    }


# 판매 상품 이미지 삭제
@router.delete("/{image_id}")
def delete_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. 이미지 조회
    image = (
        db.query(Image)
        .filter(Image.image_id == image_id)
        .first()
    )

    if image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="이미지를 찾을 수 없습니다.",
        )

    # 2. 이미지 소유권 확인
    if image.user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="해당 이미지를 삭제할 권한이 없습니다.",
        )

    # 3. 연결된 Listing 조회
    listing = (
        db.query(Listing)
        .filter(Listing.listing_id == image.listing_id)
        .first()
    )

    # 4. 해당 Listing의 대표 이미지 연결 해제
    if listing and listing.image_url == image.image_url:
        listing.image_url = None

    file_path = UPLOAD_DIR / image.stored_file_name

    try:
        # 5. DB에서 이미지 정보 삭제
        db.delete(image)
        db.commit()

        # 6. 실제 이미지 파일 삭제
        if file_path.exists():
            file_path.unlink()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="이미지 삭제 중 오류가 발생했습니다.",
        )

    return {
        "image_id": image_id,
        "message": "이미지가 삭제되었습니다.",
    }
