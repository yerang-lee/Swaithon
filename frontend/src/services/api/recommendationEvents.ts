import { ApiError, postJson } from './client';
import { getAuthSession } from './auth';

export type ImpressionEvent = {
  event_id: string;
  listing_id: string;
  position: number;
  occurred_at: string;
};
export type ViewEvent = {
  request_id: string;
  event_id: string;
  listing_id: string;
  occurred_at: string;
};
const text = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim();
const timestamp = (value: unknown) =>
  text(value) && Number.isFinite(Date.parse(value));
function token(expected?: string) {
  const session = getAuthSession();
  if (
    !session ||
    session.expiresAt <= Date.now() ||
    (expected !== undefined && expected !== session.access_token)
  )
    throw new ApiError(401, '추천 기록을 저장할 인증 정보가 없어요.');
  return session.access_token;
}
export async function postRecommendationImpressions(
  requestId: string,
  events: ImpressionEvent[],
  expectedToken?: string,
): Promise<void> {
  try {
    const access = token(expectedToken);
    if (
      !text(requestId) ||
      !Array.isArray(events) ||
      !events.length ||
      !events.every(
        (event) =>
          event &&
          text(event.event_id) &&
          event.event_id.length <= 36 &&
          text(event.listing_id) &&
          Number.isSafeInteger(event.position) &&
          event.position > 0 &&
          timestamp(event.occurred_at),
      ) ||
      new Set(events.map((event) => event.event_id)).size !== events.length
    )
      throw new Error('상품 노출 기록 형식이 올바르지 않아요.');
    const result = (await postJson(
      '/recommendations/events/impressions',
      { request_id: requestId, events },
      access,
      200,
    )) as {
      request_id: string;
      recorded_count: number;
      duplicate_count: number;
      message: string;
    } | null;
    if (
      !result ||
      result.request_id !== requestId ||
      !Number.isSafeInteger(result.recorded_count) ||
      result.recorded_count < 0 ||
      !Number.isSafeInteger(result.duplicate_count) ||
      result.duplicate_count < 0 ||
      result.recorded_count + result.duplicate_count !== events.length ||
      !text(result.message)
    )
      throw new Error('상품 노출 기록 결과를 확인하지 못했어요.');
  } catch (error) {
    globalThis.__jangbosoLogError?.(
      'services/api/recommendationEvents.ts/impressions',
      error,
    );
    throw error;
  }
}
export async function postRecommendationView(
  event: ViewEvent,
  expectedToken?: string,
): Promise<void> {
  try {
    const access = token(expectedToken);
    if (
      !event ||
      ![event.request_id, event.event_id, event.listing_id].every(text) ||
      event.event_id.length > 36 ||
      !timestamp(event.occurred_at)
    )
      throw new Error('상품 상세 조회 기록 형식이 올바르지 않아요.');
    const result = (await postJson(
      '/recommendations/events/views',
      event,
      access,
      201,
    )) as {
      event_id: string;
      listing_id: string;
      event_type: string;
      recorded_at: string;
      message: string;
    } | null;
    if (
      !result ||
      result.event_id !== event.event_id ||
      result.listing_id !== event.listing_id ||
      result.event_type !== 'detail_view' ||
      !timestamp(result.recorded_at) ||
      !text(result.message)
    )
      throw new Error('상품 상세 조회 기록 결과를 확인하지 못했어요.');
  } catch (error) {
    globalThis.__jangbosoLogError?.(
      'services/api/recommendationEvents.ts/view',
      error,
    );
    throw error;
  }
}

// In-memory only: never replay one account's events under a different account.
type Pending =
  | {
      kind: 'impression';
      requestId: string;
      event: ImpressionEvent;
      attempts: number;
      nextAt: number;
    }
  | {
      kind: 'view';
      requestId: string;
      event: ViewEvent;
      attempts: number;
      nextAt: number;
    };
type Scope = {
  token: string;
  requests: Set<string>;
  seen: Set<string>;
  pending: Map<string, Pending>;
  timer: ReturnType<typeof setTimeout> | null;
  flushing: boolean;
};
let scope: Scope | null = null;
let sequence = 0;
// 18자 실행 식별자 + 종류 + 36진수 순번으로 DB의 36자 제한을 지킵니다.
// 순번은 생성 시에만 증가하며 재전송 시 기존 이벤트 ID를 그대로 사용합니다.
const installation = `${Date.now().toString(36).slice(-10).padStart(10, '0')}${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
export function newRecommendationEventId(kind: 'imp' | 'view') {
  return `${kind}_${installation}_${(++sequence).toString(36)}`;
}
function current(owner: Scope) {
  const session = getAuthSession();
  return (
    scope === owner &&
    session?.access_token === owner.token &&
    session.expiresAt > Date.now()
  );
}
export function registerRecommendationRequest(
  requestId: string,
  accessToken: string,
) {
  const session = getAuthSession();
  if (
    !text(requestId) ||
    session?.access_token !== accessToken ||
    session.expiresAt <= Date.now()
  )
    return;
  if (scope?.token !== accessToken) {
    if (scope?.timer) clearTimeout(scope.timer);
    scope = {
      token: accessToken,
      requests: new Set(),
      seen: new Set(),
      pending: new Map(),
      timer: null,
      flushing: false,
    };
  }
  scope.requests.add(requestId);
}
function schedule(owner: Scope, delay = 100) {
  if (!current(owner) || owner.flushing || owner.timer || !owner.pending.size)
    return;
  owner.timer = setTimeout(() => {
    owner.timer = null;
    void flush(owner);
  }, delay);
}
async function flush(owner: Scope) {
  if (!current(owner)) {
    owner.pending.clear();
    return;
  }
  if (owner.flushing) return;
  owner.flushing = true;
  try {
    const ready = [...owner.pending.values()].filter(
      (item) => item.nextAt <= Date.now(),
    );
    while (ready.length && current(owner)) {
      const first = ready.shift()!;
      const batch = [first];
      if (first.kind === 'impression') {
        for (let index = 0; index < ready.length;) {
          if (
            ready[index].kind === 'impression' &&
            ready[index].requestId === first.requestId
          )
            batch.push(ready.splice(index, 1)[0]);
          else index++;
        }
      }
      try {
        if (first.kind === 'view')
          await postRecommendationView(first.event, owner.token);
        else
          await postRecommendationImpressions(
            first.requestId,
            batch.map((item) => item.event as ImpressionEvent),
            owner.token,
          );
        for (const item of batch) owner.pending.delete(item.event.event_id);
      } catch (error) {
        globalThis.__jangbosoLogError?.(
          'services/api/recommendationEvents.ts/queue',
          error,
        );
        for (const item of batch) {
          item.attempts++;
          const retryable =
            !(error instanceof ApiError) ||
            error.status === 0 ||
            error.status >= 500;
          if (!retryable || item.attempts >= 3)
            owner.pending.delete(item.event.event_id);
          else item.nextAt = Date.now() + (item.attempts === 1 ? 1000 : 3000);
        }
      }
    }
  } finally {
    owner.flushing = false;
    if (!current(owner)) owner.pending.clear();
    else if (owner.pending.size)
      schedule(
        owner,
        Math.max(
          100,
          Math.min(...[...owner.pending.values()].map((item) => item.nextAt)) -
            Date.now(),
        ),
      );
  }
}
export function trackRecommendationImpressions(
  requestId: string,
  visible: { listingId: string; position: number }[],
  ownerToken?: string,
) {
  const owner = scope;
  if (
    !owner ||
    !current(owner) ||
    owner.token !== ownerToken ||
    !owner.requests.has(requestId)
  )
    return;
  for (const item of visible) {
    const key = JSON.stringify(['impression', requestId, item.listingId]);
    if (
      owner.seen.has(key) ||
      !text(item.listingId) ||
      !Number.isSafeInteger(item.position) ||
      item.position <= 0
    )
      continue;
    owner.seen.add(key);
    const event = {
      event_id: newRecommendationEventId('imp'),
      listing_id: item.listingId,
      position: item.position,
      occurred_at: new Date().toISOString(),
    };
    owner.pending.set(event.event_id, {
      kind: 'impression',
      requestId,
      event,
      attempts: 0,
      nextAt: 0,
    });
  }
  schedule(owner);
}
export function trackRecommendationView(
  requestId: string,
  listingId: string,
  visitId: string,
  ownerToken?: string,
) {
  const owner = scope;
  if (
    !owner ||
    !current(owner) ||
    owner.token !== ownerToken ||
    !owner.requests.has(requestId) ||
    !text(listingId) ||
    !text(visitId)
  )
    return;
  const key = JSON.stringify(['view', requestId, listingId, visitId]);
  if (owner.seen.has(key)) return;
  owner.seen.add(key);
  const event = {
    request_id: requestId,
    event_id: visitId,
    listing_id: listingId,
    occurred_at: new Date().toISOString(),
  };
  owner.pending.set(event.event_id, {
    kind: 'view',
    requestId,
    event,
    attempts: 0,
    nextAt: 0,
  });
  schedule(owner);
}
