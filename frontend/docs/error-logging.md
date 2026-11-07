# 개발 터미널 오류 로그

앱을 실행하는 Expo/Metro 터미널에 [앱 오류]로 발생 파일/기능, 메시지, HTTP 상태, 가능한 JS 스택이 표시됩니다. metro.config.js를 변경했으므로 Expo를 종료하고 frontend에서 npx expo start -c로 재시작해야 합니다.

- RootLayout에서 개발 로거를 설치합니다. React 렌더링 ErrorBoundary, React Native ErrorUtils, console.error/warn, 웹 error/unhandledrejection을 연결합니다. 기존 RN 오류 핸들러와 오류 화면 동작을 유지합니다.
- 화면과 서비스의 catch에서 처리한 오류도 공통 로거를 호출합니다. 의도적으로 복구한 위치/저장소/로그아웃 오류도 기록됩니다. 이미지/WebView 실패와 지도 HTML의 JS/SDK 로드 오류도 브리지로 전달합니다.
- API 로그는 요청 메서드/경로/상태/정제된 원인을 표시합니다. 쿼리·본문·원본 서버 응답·파일·개인정보 객체를 기록하지 않습니다. Bearer/JWT/전화번호 및 알려진 민감 키를 마스킹합니다. 에러 메시지에 임의 개인 데이터를 직접 넣지 않아야 합니다.
- 같은 객체 오류와 짧은 시간에 반복된 동일 로그를 중복 제거하며, 로그 전송 실패를 다시 로깅하지 않습니다. Fast Refresh로 콘솔 래퍼를 반복 설치하지 않습니다.
- 개발 모드에서만 기동합니다. React Native는 Expo hostUri의 Metro로, 웹은 같은 origin으로 정제된 로그를 POST합니다. 전송은 앱 API 인증/비즈니스 요청과 별개이며 실패해도 앱 작업을 중단하지 않습니다.

새 코드는 catch에서 logAppError를 사용해야 합니다. 앱/컴포넌트는 utils/appDiagnostics.ts의 함수를 import하고, 의존성 순환을 피해야 하는 서비스는 초기화된 globalThis.__jangbosoLogError?.(범위, 오류)를 사용할 수 있습니다. 입력값·토큰·파일 자체를 로그 인수로 전달하지 마세요.

JS 실행 전 컴파일 오류는 Metro가 원래 표시합니다. 앱 프로세스 자체가 종료되는 네이티브 크래시는 JS 로거가 수집할 수 없고 adb logcat/Xcode 등 기기 로그가 필요합니다. RN 런타임에서 발생한 미처리 Promise는 RN의 콘솔 경고 경로로 전달되는 범위에서 수집하며 브라우저 전용 unhandledrejection을 모든 네이티브 엔진에서 지원한다고 가정하지 않습니다.

검증: npm run typecheck, node tests/app-diagnostics.test.cjs, node --check metro.config.js. 진단 테스트는 실제 네트워크 없이 Metro 미들웨어의 터미널 출력을 검증합니다. 휴대폰에서 Metro로 로그가 전송되는지는 연결 환경별 확인이 필요합니다.
