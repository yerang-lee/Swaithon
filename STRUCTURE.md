# 장보소 프론트엔드 구조

기획서의 React Native + Expo + TypeScript를 기준으로 구성했습니다.
화면 경로는 Expo Router를 사용하는 것으로 가정했습니다. Expo Router는 기획서에 지정된 기술이 아니라 폴더 기반 화면 이동을 위한 구성 선택입니다.

현재는 폴더와 빈 소스 파일만 있습니다. 패키지 설치, Expo 초기화, 설정, 화면 구현은 아직 하지 않았으므로 앱을 실행할 수 없습니다.
실제 구현 시 package.json, app.json, tsconfig.json, expo-env.d.ts 등 Expo 설정을 추가해야 합니다.

```text
assets/
  images/                  이미지
  icons/                   아이콘
  fonts/                   폰트
src/
  app/                     Expo Router 화면 경로
    _layout.tsx            최상위 레이아웃
    index.tsx              시작 화면 및 사용자 역할 진입
    (consumer)/            소비자 화면 그룹
      (tabs)/              홈 / 관심 상품 / 마감 세일 / 마이페이지
      products/            상품 상세
      stores/              점포 상세
      markets/             시장 선택
      map.tsx              시장 및 점포 지도
      wishlist.tsx         개별 판매 게시물 찜 목록
      reservations/        예약 목록 / 생성 / 상세
      notifications.tsx    알림 목록
    (merchant)/            상인 화면 그룹
      index.tsx            상인 홈
      products/            판매 상품 목록 및 관리
      voice.tsx            음성 상품 등록 / 판매 종료 / 세일 등록
      sales.tsx            마감 세일 관리
      reservations.tsx     예약 관리
      store.tsx            내 점포 관리
  components/
    ui/                    공통 UI
    products/              상품 카드 등
    markets/               시장 선택 등
    prices/                시장 평균과 점포 가격 비교 그래프
    reservations/          예약 관련 UI
    voice/                 녹음 및 음성 처리 결과 UI
  services/
    api/                   FastAPI 백엔드 통신
    location.ts            현재 위치 및 권한
    maps.ts                Kakao Maps 연동
    notifications.ts       푸시 알림 및 권한
  types/                   상품 / 시장 / 점포 / 예약 / 사용자 / 음성 타입
  hooks/                   재사용 React 훅
  constants/               테마 및 공통 설정
  utils/                   가격 / 거리 / 날짜 등의 유틸리티
```

- 관심 상품은 상품 종류를 기준으로 주변 여러 점포의 판매 게시물을 모아보는 기능입니다.
- 찜은 개별 판매 게시물을 저장하는 기능으로 구분했습니다.
- STT, LLM, 추천 AI, MySQL, 가격 분석 구현은 백엔드 영역이며 프론트엔드에는 연동할 위치만 마련했습니다.
- 빈 폴더의 `.gitkeep`은 Git에 폴더 구조를 보존하기 위한 파일입니다.
