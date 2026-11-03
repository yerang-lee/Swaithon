# 공통 디자인 기준

- 홈 카드/바로가기 radius: `16`, 위치/검색 입력창: `12`, 이미지: `8`, 바텀 시트: `24`. `theme.radii`를 재사용합니다.
- 아이콘 파일은 `assets/icons`에 소문자 kebab-case로 보관합니다. `home`, `heart-outline`, `receipt`, `account-outline`, `clock`, `storefront`, `settings`, `bell`, `location-pin`을 `AppIcon`으로 사용합니다.
- 제공된 SVG의 도형은 유지하고 fill을 currentColor로 통일했습니다. `iconAssets.ts`는 같은 SVG를 담은 React Native용 데이터입니다.

- 메인 색상: `#53B175`
- 기본 초록 버튼: `PrimaryButton` (`src/components/ui/PrimaryButton.tsx`)
- 버튼 모서리 반경: `19`
- 버튼 최소 높이: `67`
- 버튼 글자: 흰색, 18, 굵게
- 같은 종류의 초록 버튼을 추가할 때는 새 스타일을 만들지 않고 `PrimaryButton`을 재사용합니다.
- 색상과 버튼 치수는 `src/constants/theme.ts`에서 관리합니다.
- 원본 차양 SVG는 `assets/images/awning_only.svg`에 보관하고, 앱에서는 같은 path를 사용하는 `BrandLogo`로 메인 색상을 적용합니다.
