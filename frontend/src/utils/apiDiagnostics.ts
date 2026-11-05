import Constants from 'expo-constants';

export function logApiError(method: string, path: string, reason: string, status?: number, serverDetail?: unknown, privateValues: string[] = []) {
  if (!__DEV__) return;
  const clean = (text: string) => {
    for (const value of privateValues) if (value) text = text.split(value).join('[숨김]');
    return text.replace(/Bearer\s+\S+/gi, 'Bearer [숨김]').replace(/\beyJ[\w.-]+/g, '[토큰 숨김]').replace(/\b01\d[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[전화번호 숨김]').slice(0, 1200);
  };
  // FastAPI 검증 오류의 input/ctx에는 입력 개인정보가 들어갈 수 있어 출력하지 않습니다.
  const detail = Array.isArray(serverDetail) ? serverDetail.map(item => item && typeof item === 'object' ? { loc: item.loc, msg: item.msg, type: item.type } : null) : typeof serverDetail === 'string' ? serverDetail : undefined;
  const report = { method, path: path.split('?')[0], status: status ?? null, reason: clean(reason), detail: detail === undefined ? undefined : clean(JSON.stringify(detail)) };
  console.warn('[API 오류]', JSON.stringify(report));
  // React Native 버전에 따라 JS 로그가 터미널로 전달되지 않아 Metro에도 별도 전달합니다.
  const host = Constants.expoConfig?.hostUri;
  if (!host) return;
  const origin = /^https?:\/\//.test(host) ? new URL(host).origin : `http://${host.split('/')[0]}`;
  void fetch(`${origin}/__jangboso_api_log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }).catch(() => {});
}
