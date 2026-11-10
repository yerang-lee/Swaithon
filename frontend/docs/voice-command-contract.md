# 명령 기반 음성 연결

원본 FRONTEND_HANDOFF.md는 voice-frontend-handoff-reference.md에 보관했습니다. 사용자가 추가 제공한 BACKEND_HANDOFF 내용도 실제 JWT/상점 소유권/상품 DB 통합이 완료되지 않았고 새 경로·필드는 제안임을 명시합니다. 상품 등록/수정하기 화면은 사용자 요청에 따라 command_id 기반 의도 분석을 기본 사용합니다. 작업 선택이나 상품 ID 사전 입력 없이 녹음을 보내고 서버가 반환한 의도와 실행 경로로 처리합니다. 기존 analysis_id 서비스는 호환 코드로 남아 있지만 기본 화면에서 사용하지 않습니다. CSV의 (제안) 행은 확정된 서버 명세로 간주하지 않습니다.

## 실행 방법

- 실제 서버: EXPO_PUBLIC_API_URL을 설정합니다. 홈의 상품 등록/수정하기 버튼에서 바로 의도 분석 화면으로 진입합니다. EXPO_PUBLIC_VOICE_COMMAND_API 옵션은 더 이상 사용하지 않습니다. 제안 경로의 실제 서버 지원 여부는 별도 통합 확인이 필요합니다.
- 서버 없는 테스트: 상인으로 테스트 → 상품 등록/수정하기. 별도 테스트 진입 버튼과 작업 변경 버튼은 제거했습니다.
- 테스트 텍스트: 질문(추가 입력), 후보(상품 후보 선택), 삭제(삭제 확인), 조회·취소 단독 입력(지원하지 않는 분석 명령으로 422 안내). 음성 파일은 테스트 모드에서 STT 결과를 모의 생성합니다.

## 연결한 제안 경로

| 작업 | 요청 |
| --- | --- |
| 최초 텍스트 | POST /voice/analyze, JSON {text} |
| 최초 녹음 | POST /voice/analyze-audio, multipart audio_file |
| 추가 텍스트 | POST /voice/commands/{command_id}/answer, JSON {answer} |
| 후보 선택 | 같은 answer 경로, JSON {listing_id} |
| 추가 녹음 | POST /voice/commands/{command_id}/answer-audio, multipart audio_file |
| 초안 취소 | POST /voice/commands/{command_id}/cancel, 본문 없음 |
| 실행 | 서버 execution_endpoint, JSON {command_id,confirmed:true} |

실행 경로는 상대 경로 허용 목록에서만 선택하고 같은 EXPO_PUBLIC_API_URL로 요청합니다. 기존 /voice/product-registration, product-update, product-delete, sold-out, sale-delete와 새 /voice/sale-registration만 허용합니다. 오래된 sale-update 경로는 FRONTEND_HANDOFF의 실행 표에 없어 임의로 허용하지 않습니다. parsed.intent로 경로를 추측하지 않습니다. 사용자 답변에 따라 /voice/sale-delete는 JSON 통합 명령 실행과 multipart 할인 종료 분석을 함께 지원하는 전제로 유지합니다. 첨부된 할인 종료 분석 명세는 sale_id·audio_file 분석 요청에 적용하며, 통합 명령의 command_id·confirmed 실행 요청과 구분합니다. 실제 서버의 호환 처리는 연동 시 검증합니다.

## 상태별 동작

NEEDS_INPUT은 질문과 텍스트/녹음 답변, NEEDS_SELECTION은 listing_id가 있는 명시적 선택, NEEDS_CONFIRMATION만 전후 비교 및 버튼 승인을 제공합니다. PRODUCT_DELETE는 유지하기/삭제하기, PRODUCT_DETAIL의 SUCCEEDED는 조회 완료로 표시합니다. 음성의 네를 실행 승인으로 보내지 않습니다. 등록 발화가 최종 PRODUCT_UPDATE가 될 수 있으므로 최상위 intent와 서버 경로를 보관합니다.

command_id는 후속 답변·선택·실행·취소마다 같아야 하며 불일치 응답은 거부합니다. 단일 요청 잠금으로 녹음/답변/실행 동시 요청을 방지합니다. 후속 응답은 최초 10분 만료를 연장하지 않습니다. expires_at이 실제 응답에 있으면 더 이른 만료를 적용하고 없으면 최초 요청 시작 기준 10분을 UI 임시 기준으로 사용합니다. 실제 만료 판단은 서버가 최종 수행합니다.

실행 응답 유실 시 같은 command_id/같은 execution_endpoint로 재시도합니다. 새 분석을 만들지 않습니다. 409/WRONG_ENDPOINT/EXPIRED/STALE_COMMAND/STALE_PRODUCT는 실행을 막고 새 분석·확인을 안내합니다. 답변 요청은 revision 변경 가능성이 있어 자동 재시도하지 않습니다. 오류 detail의 code/message 객체·문자열·검증 배열을 처리하되 내부 오류 문구는 사용자에게 그대로 노출하지 않습니다. 401/403/404/409/413/422/503 안내를 구분합니다. 실행 성공한 명령을 다시 취소하지 않습니다.

## 녹음 및 상품 갱신

실제 마이크 권한 요청, 녹음/종료/분석 상태, 30초·10MB 제한, 빈 파일 거절을 적용했습니다. native recorder 상태의 최종 fileSize와 durationMillis를 사용하고, 웹은 최종 Blob 크기/MIME도 검증합니다. FormData 파일 필드는 새 계약에서 file이며 기존 분석 모드의 audio_file과 구분합니다. 허용 wav/mp3/m4a/webm/mp4/ogg의 실제 확장자/MIME을 사용하고 multipart boundary는 직접 지정하지 않습니다. 권한 거부/503에서 텍스트 입력을 제공합니다. 백그라운드 전환은 녹음을 취소합니다. native/Web 파일 정보와 권한 동작은 실기기 검증이 필요합니다.

변경 SUCCEEDED에서 catalogChanges 알림으로 마운트된 시장 상품/가게 상품/상품 상세 조회를 다시 실행합니다. 조회 PRODUCT_DETAIL/CANCELLED에는 변경 알림을 보내지 않습니다. 화면이 마운트되지 않은 경우 다음 진입 시 기존 조회 effect로 새로 조회합니다. 홈 추천은 별도 GET /recommendations로 연결하며 홈 재진입 시 새 추천을 조회합니다.

판매 가격은 최신 서버 preview.after/result의 effective_price를 그대로 표시하고 할인 표시는 sale_active=true일 때만 표시합니다. sale_active=false여도 가격을 price로 대체하거나 프론트에서 재계산하지 않습니다. 완료 응답에 가격/상태가 없으면 이전 분석값을 현재 값으로 추정하지 않습니다.

## 아직 확인이 필요한 계약

상태별 실제 응답 및 OpenAPI가 미제공입니다. 현재 개발 어댑터는 최상위 command_id/status/intent/message/transcript/execution_endpoint, candidates[].listing_id/product_name/sale_quantity/sale_unit/price, preview.before/after, result의 기록 객체 구조로 연결한 제안 구현입니다. status별 실제 키 이름·null·숫자 타입·result 포맷을 확인해야 합니다. 서버 주소, Bearer 인증/실제 상인 및 소유권, listing_id/product_id 매핑, 10분 만료와 동일 command_id 멱등 실행도 통합 확인이 필요합니다. 데모 토큰·Gemini 키·DB 주소를 앱에 넣지 않았습니다.

수정 코드의 타입/계약 테스트와 실제 로그인·PostgreSQL·휴대폰 통합 완료를 구분합니다. 앱 재시작 시 복원/명령 조회 API는 없으므로 자동 복원하지 않습니다. 원격/네이티브 스와이프 닫기는 새 화면에서 막고 헤더/Android 뒤로가기에서 미완료 초안 취소를 시도합니다. 실행 결과 불확실 상태에서 나가기는 자동 취소·재분석을 하지 않습니다.

## 녹음 종료 및 결과 화면 수정

Android expo-audio는 stopRecording의 reset에서 durationAlreadyRecorded를 0으로 초기화합니다. 종료 후 getStatus만 읽지 않고 종료 전 시간을 보존하며, expo-file-system File.size로 최종 저장 파일 크기를 확인합니다. 웹은 종료 후 생성된 Blob URI와 기존 Blob 크기 검증을 사용합니다. 빈 파일과 30초/10MB 제한은 유지합니다.

기본 명령 화면의 분석/완료 화면은 초록 배경, 상품명·판매 가격·판매 의도 카드로 표시합니다. 분석 설명은 “AI가 상품명, 가격, 판매 의도를 분석했어요”입니다. 등록 분석에는 사진도 함께 등록하기 / 이대로 등록하기 / 다시 등록하기, 완료에는 다른 상품 등록하기 / 내 상품 보기 / 홈으로를 표시합니다. 완료는 서버 SUCCEEDED 이후에만 표시하며 사진 업로드 실패 시 상품 실행을 반복하지 않습니다. 내 상품 보기는 실행 결과의 store_id 또는 listing_id로 조회한 가게로 이동합니다. 해당 ID가 없는 서버 응답은 연결 정보를 제공해야 한다는 안내를 표시합니다. 제안 응답 필드의 실제 제공 여부는 서버 통합 확인 대상입니다.

검증: node tests/recorded-audio.test.cjs, node tests/voice-command-api.test.cjs, npm run typecheck. 실기기 마이크 입력과 화면 배치는 별도 확인이 필요합니다.

## 할인 기간 UI 정책

- 할인 기간 미입력을 이유로 프론트에서 질문·필수 입력 검증을 추가하지 않습니다.
- 기간 발화 여부와 관계없이 할인 기간, 종료 시각, 할인 카운트다운 UI를 표시하지 않습니다. 결과 카드는 정해진 상품명·판매 가격·판매 의도와 서버 할인 상태만 표시합니다.
- 서버 preview/result의 시간 필드는 원본 그대로 보존합니다. 숨김 처리를 위해 삭제하거나 null로 덮어쓰지 않습니다.
- 실행은 서버 execution_endpoint에 POST {command_id, confirmed:true}만 보냅니다. 할인 시간이나 가격 필드를 추가 전송하지 않습니다.
- 판매 가격은 effective_price, 할인 상태는 sale_active를 사용합니다. 기기 시간이나 발화의 기간으로 할인 여부를 판정하지 않습니다.
- command.expiresAt은 명령 자체의 유효시간 검증이며 할인 종료 시각과 별개입니다. 기존 명령 만료 검증과 녹음 길이 제한은 유지합니다.


## Expo 음성·사진 multipart 호환

iOS/Android 업로드는 공통 postMultipart의 React Native XMLHttpRequest를 사용합니다. Expo fetch의 FormDataPart 변환을 거치지 않으며, 실제 RN FormData.getParts가 지원하는 {uri,name,type} 파일 파트를 네이티브 네트워크 계층에 보냅니다. 네이티브 전송기가 multipart Content-Type과 boundary를 생성하므로 수동 설정하지 않습니다. 웹은 Blob/FormData와 fetch를 유지합니다.

최초 음성 및 추가 답변의 file, 기존 분석 API의 audio_file, 사진의 image_file/product_id 필드를 유지합니다. Authorization Bearer 및 기존 요청 타임아웃의 AbortSignal을 전달합니다. HTTP 오류는 상태를 유지하며 네트워크 오류·취소 시 이벤트 핸들러와 abort 리스너를 정리합니다. 음성의 실제 파일 크기 검증과 30초/10MB 제한은 유지하며 파일 바이트를 JS로 읽거나 임의 객체를 Blob으로 가장하지 않습니다.

검증: node tests/multipart-upload.test.cjs(실제 설치된 RN FormData와 Expo 패치, 네이티브 XHR 요청·사진 API·취소·HTTP 오류·웹 분기), node tests/voice-command-api.test.cjs, node tests/voice-api.test.cjs, npm run typecheck. 실제 iPhone/Android 업로드는 서버 환경에서 별도 확인해야 합니다. 이 절이 앞선 File/bytes 어댑터 전송 설명을 대체합니다.

## 최신 STT·추가 정보 명세

이전 제안 설명 중 analyze-audio/answer/answer-audio는 이번에 전달받은 사용자 확정 명세를 우선합니다.

- 최초·추가 녹음은 audio_file 파일만 multipart로 전송합니다. RN은 기존 native XHR 업로드를 유지하고 boundary를 직접 지정하지 않습니다. 추가 텍스트는 answer 문자열만 JSON으로 전송합니다.
- READY는 분석 완료 상태이며 상품 완료가 아닙니다. analysis_result를 상품명·가격·unit 표시로 사용하고, needs_confirmation=true 및 빈 missing_fields를 검증합니다. NEEDS_INPUT은 부족 필드와 question을 표시하고 추가 텍스트·녹음 입력을 받습니다. 필드 부족 자체로 상품 정보를 변경하지 않습니다.
- 같은 command_id만 허용합니다. 최초 서버 expires_at을 보관하고 추가 응답이 만료 시각을 생략해도 원래 시각을 유지합니다. 추가 응답으로 기한을 연장하지 않습니다. 분석 결과의 서버 시간 필드는 삭제하거나 null로 바꾸지 않으며 할인 기간·종료 시각·카운트다운을 표시하지 않습니다.
- 410은 만료, 413은 크기 초과, 422는 인식/분석 실패로 안내합니다. 실패하면 추가 분석이나 최종 실행을 자동 호출하지 않습니다. 분석은 HTTP 200을 확인합니다.
- 기존 NEEDS_CONFIRMATION/preview 응답도 호환 처리합니다. 후보 선택·취소·최종 실행은 이번 세 API 명세에서 변경되지 않았으므로 기존 계약을 유지합니다.
- 새 예시에는 execution_endpoint가 없습니다. 응답에 주소가 있으면 기존 허용 목록·command_id/confirmed 실행 규칙을 적용합니다. 주소가 없으면 READY 분석 결과는 표시하되 실행 버튼을 비활성화하고 최종 연결 대기 안내를 표시합니다. intent로 실행 경로를 추측하거나 command_id를 analysis_id로 바꾸지 않습니다. 사용자 답변에 따라 기존 command_id/confirmed 실행 계약을 유지하고 READY 응답에 execution_endpoint를 추가하는 백엔드 구현 요청안을 voice-stt-api.md에 정리했습니다. 백엔드는 아직 구현 전이므로 서버 적용 완료로 간주하지 않습니다.
- 테스트 서버도 READY·분석 필드·추가 질문과 answer/audio_file을 사용합니다. 기존 최종 반영 동작 테스트를 위해 테스트 응답은 execution_endpoint 메타데이터를 추가 제공하며, 이 값이 실제 최신 응답에도 있다고 가정하지 않습니다.

## 텍스트 명령 분석 최신 명세

POST /voice/analyze는 JSON {text}를 상인 Bearer 인증으로 보냅니다. 빈 입력은 전송하지 않습니다. READY·analysis_result·missing_fields·needs_confirmation·expires_at 또는 NEEDS_INPUT·question 응답을 처리합니다. 명령 유형마다 분석 필드가 달라 원본 analysis_result를 유지하며, 기간 데이터를 지우지 않습니다. PRODUCT_CREATE/PRODUCT_UPDATE/PRODUCT_DELETE/SOLD_OUT/SALE_CREATE/SALE_UPDATE/SALE_DELETE 의도를 지원합니다.

텍스트 분석의 SUCCEEDED/CANCELLED 응답은 실제 반영 완료로 처리하지 않고 오류로 차단합니다. 분석 API를 한 번 호출한 뒤 최종 실행을 자동 호출하지 않습니다. 사용자 확인과 서버가 제공하는 허용된 execution_endpoint가 모두 있어야 기존 실행 요청을 보냅니다. 새 SALE_UPDATE 실행 경로는 이번 명세에 없으므로 /voice/sale-update 등을 임의 추가하지 않습니다. 주소 없는 READY는 결과만 표시합니다.

테스트 서버의 텍스트 분석도 READY 또는 추가 입력 상태만 반환하며 조회/취소 단독 입력을 성공 완료로 처리하지 않습니다. 기존 후보 선택 응답은 레거시 호환용으로 유지합니다. 최신 요청·응답과 400/401/403/422/500 및 자동 실행 금지를 회귀 테스트로 검증합니다.
