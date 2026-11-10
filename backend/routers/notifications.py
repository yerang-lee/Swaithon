
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import User, Notification
from schemas import NotificationListResponse, NotificationReadResponse
from datetime import datetime, timezone

router = APIRouter(

    tags=["Notifications"],
)


# 내 알림 목록 조회
@router.get(
    "/users/me/notifications",
    response_model=NotificationListResponse,
    status_code=status.HTTP_200_OK,
)
def get_my_notifications(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    is_read: bool | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 현재 사용자의 알림 조회
    query = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.user_id
        )
    )

    # 읽음 여부 필터
    if is_read is not None:
        query = query.filter(
            Notification.is_read.is_(is_read)
        )

    # 필터 적용 후 전체 알림 개수
    total_count = query.count()

    # 읽지 않은 알림 전체 개수
    unread_count = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.user_id,
            Notification.is_read.is_(False),
        )
        .count()
    )

    # 최신 알림순 정렬 및 페이지네이션
    notifications = (
        query
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )

    return {
        "notifications": notifications,
        "unread_count": unread_count,
        "total_count": total_count,
        "page": page,
        "size": size,
    }

@router.patch(
    "/notifications/{notification_id}/read",
    response_model=NotificationReadResponse,
    status_code=status.HTTP_200_OK,
)
def read_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(Notification.notification_id == notification_id)
        .first()
    )

    # 알림이 존재하지 않는 경우
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="알림을 찾을 수 없습니다.",
        )

    # 다른 사용자의 알림인 경우
    if notification.user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="해당 알림에 접근할 권한이 없습니다.",
        )

    # 읽음 상태로 변경
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notification)

    return {
        "notification_id": notification.notification_id,
        "is_read": notification.is_read,
        "read_at": notification.read_at,
        "message": "알림을 읽음 처리했습니다.",
    }