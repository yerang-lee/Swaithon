# 공통 디자인 기준

- 메인 색상: `#53B175`
- 기본 초록 버튼: `PrimaryButton` (`src/components/ui/PrimaryButton.tsx`)
- 버튼 모서리 반경: `19`
- 버튼 최소 높이: `67`
- 버튼 글자: 흰색, 18, 굵게
- 같은 종류의 초록 버튼을 추가할 때는 새 스타일을 만들지 않고 `PrimaryButton`을 재사용합니다.
- 색상과 버튼 치수는 `src/constants/theme.ts`에서 관리합니다.
- 원본 차양 SVG는 `assets/images/awning_only.svg`에 보관하고, 앱에서는 같은 path를 사용하는 `BrandLogo`로 메인 색상을 적용합니다.
