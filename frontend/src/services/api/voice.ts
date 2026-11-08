import { postMultipart } from './multipart';
import { productCategories } from '../../constants/productCategories';
import { Platform } from 'react-native';
import { getAuthSession } from './auth';
import { ApiError, deleteJson, postJson } from './client';
import { isMockMode } from '../devMock';

export const voiceActions = {
  registration: { title: '상품 등록하기', path: '/voice/product-registration' },
  update: { title: '상품 수정·할인하기', path: '/voice/product-update' },
  delete: { title: '상품 삭제하기', path: '/voice/product-delete' },
  soldOut: { title: '상품 품절 처리하기', path: '/voice/sold-out' },
  saleDelete: { title: '할인 종료하기', path: '/voice/sale-delete' },
} as const;
export type VoiceAction = keyof typeof voiceActions;
export const analysisIntents = {
  registration: 'PRODUCT_CREATE',
  update: 'PRODUCT_UPDATE',
  delete: 'PRODUCT_DELETE',
  soldOut: 'SOLD_OUT',
  saleDelete: 'SALE_DELETE',
} as const;
export type AnalysisAction = keyof typeof analysisIntents;
export type AnalysisIntent = (typeof analysisIntents)[AnalysisAction];
export type VoiceAnalysis = {
  kind: 'analysis';
  analysisId: string;
  intent: AnalysisIntent;
  status: 'READY';
  transcript?: string;
  productId?: number;
  saleId?: number;
  productName?: string;
  price?: number;
  unit?: string;
  discountRate?: number | null;
  discountPrice?: number | null;
  category?: string | null;
  categoryName?: string | null;
  isOnSale?: false;
  isSoldOut?: true;
  missingFields: string[];
  needsConfirmation: true;
  expiresAt: string;
  message: string;
};
export type RegistrationAnalysis = VoiceAnalysis;
export type VoiceResult =
  | VoiceAnalysis
  | {
      kind?: 'applied';
      productId: number;
      productName?: string;
      price?: number;
      unit?: string;
      message: string;
    };
export type ConfirmedFields = {
  product_name?: string;
  price?: number;
  unit?: string;
  category?: string;
  category_name?: string;
  discount_rate?: number | null;
  discount_price?: number | null;
};
export type AppliedAnalysis = {
  analysis_id: string;
  intent: AnalysisIntent;
  status: 'APPLIED';
  product_id: number;
  product_name: string;
  category?: string | null;
  category_name?: string | null;
  message: string;
};
export const voiceIntentLabels: Record<VoiceAction, string> = {
  registration: '신규등록',
  update: '상품 정보 수정',
  delete: '상품 삭제',
  soldOut: '품절 처리',
  saleDelete: '할인 종료',
};
const positiveId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const amount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
function categoryKnown(value: string) {
  return productCategories.some((item) => item.code === value);
}
function merchantToken() {
  const session = getAuthSession();
  if (
    !session ||
    session.expiresAt <= Date.now() ||
    session.role !== 'MERCHANT'
  )
    throw new ApiError(401, '상인 계정으로 다시 로그인해주세요.');
  return session.access_token;
}
export function parseVoiceAnalysis(
  data: unknown,
  action: AnalysisAction,
  targetId?: number,
): VoiceAnalysis {
  const d = data as Record<string, unknown> | null;
  const classified = action === 'registration' || action === 'update';
  if (
    !d ||
    !text(d.analysis_id) ||
    d.intent !== analysisIntents[action] ||
    d.status !== 'READY' ||
    d.needs_confirmation !== true ||
    !text(d.message) ||
    !text(d.expires_at) ||
    !Number.isFinite(Date.parse(d.expires_at)) ||
    !(d.transcript === undefined || typeof d.transcript === 'string') ||
    !(
      (d.missing_fields === undefined && !classified) ||
      (Array.isArray(d.missing_fields) &&
        d.missing_fields.every((v) => typeof v === 'string'))
    ) ||
    !(d.product_name == null || typeof d.product_name === 'string') ||
    !(d.price == null || amount(d.price)) ||
    !(d.unit == null || typeof d.unit === 'string')
  )
    throw new Error('음성 분석 응답을 확인할 수 없어요. 다시 녹음해주세요.');
  if (
    classified &&
    (!(d.category === null || text(d.category)) ||
      !(d.category_name === null || text(d.category_name)) ||
      (d.category === null) !== (d.category_name === null) ||
      (d.category === null &&
        !(d.missing_fields as string[]).includes('category')))
  )
    throw new Error('카테고리 분석 결과를 확인할 수 없어요.');
  if (
    classified &&
    typeof d.category === 'string' &&
    !categoryKnown(d.category)
  )
    throw new Error('지원하지 않는 카테고리 분석 결과예요.');
  if (
    action !== 'registration' &&
    (!positiveId(d.product_id) ||
      (action !== 'saleDelete' &&
        targetId !== undefined &&
        d.product_id !== targetId))
  )
    throw new Error('분석 대상 상품이 요청과 달라요.');
  if (
    action === 'saleDelete' &&
    (!positiveId(d.sale_id) ||
      (targetId !== undefined && d.sale_id !== targetId) ||
      d.is_on_sale !== false)
  )
    throw new Error('분석 대상 할인 정보를 확인할 수 없어요.');
  if (action === 'soldOut' && d.is_sold_out !== true)
    throw new Error('품절 분석 결과를 확인할 수 없어요.');
  if (
    action === 'update' &&
    (!(
      d.discount_rate === null ||
      (amount(d.discount_rate) && d.discount_rate <= 100)
    ) ||
      !(d.discount_price === null || amount(d.discount_price)) ||
      (d.discount_rate === null) !== (d.discount_price === null))
  )
    throw new Error('할인 분석 정보를 확인할 수 없어요.');
  return {
    kind: 'analysis',
    analysisId: d.analysis_id,
    intent: d.intent as AnalysisIntent,
    status: 'READY',
    transcript: d.transcript as string | undefined,
    productId: d.product_id as number | undefined,
    saleId: d.sale_id as number | undefined,
    productName: d.product_name as string | undefined,
    price: d.price as number | undefined,
    unit: d.unit as string | undefined,
    category: d.category as string | null | undefined,
    categoryName: d.category_name as string | null | undefined,
    discountRate: d.discount_rate as number | null | undefined,
    discountPrice: d.discount_price as number | null | undefined,
    isOnSale: d.is_on_sale as false | undefined,
    isSoldOut: d.is_sold_out as true | undefined,
    missingFields: (d.missing_fields ?? []) as string[],
    needsConfirmation: true,
    expiresAt: d.expires_at,
    message: d.message,
  };
}
export const parseRegistrationAnalysis = (data: unknown) =>
  parseVoiceAnalysis(data, 'registration');
const mockAnalyses = new Map<
  string,
  {
    token: string;
    analysis: VoiceAnalysis;
    state: 'READY' | 'APPLIED' | 'CANCELLED';
  }
>();
let mockSequence = 0;
export function mockVoiceAnalysis(
  action: AnalysisAction,
  targetId = 101,
): VoiceAnalysis {
  const token = merchantToken();
  if (!isMockMode()) throw new Error('테스트 모드가 필요해요.');
  const analysis = parseVoiceAnalysis(
    {
      analysis_id: `mock-analysis-${++mockSequence}`,
      intent: analysisIntents[action],
      status: 'READY',
      transcript: action === 'update' ? '사과 20% 할인' : '사과 상품 처리',
      product_id: action === 'registration' ? undefined : 101,
      sale_id: action === 'saleDelete' ? targetId : undefined,
      product_name: '사과',
      price: 5000,
      unit: '3개',
      category: 'FRUIT',
      category_name: '과일',
      ...(action === 'update'
        ? { product_id: targetId, discount_rate: 20, discount_price: 4000 }
        : action === 'delete' || action === 'soldOut'
          ? { product_id: targetId }
          : {}),
      ...(action === 'saleDelete' ? { is_on_sale: false } : {}),
      ...(action === 'soldOut'
        ? {
            is_sold_out: true,
            price: undefined,
            category: undefined,
            category_name: undefined,
            unit: undefined,
            transcript: '사과 품절.',
          }
        : {}),
      missing_fields: [],
      needs_confirmation: true,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      message: '분석 결과를 확인해주세요.',
    },
    action,
    action === 'registration' ? undefined : targetId,
  );
  mockAnalyses.set(analysis.analysisId, { token, analysis, state: 'READY' });
  return analysis;
}
export const mockRegistrationAnalysis = () => mockVoiceAnalysis('registration');
function analysisError(e: unknown): never {
  if (e instanceof ApiError) {
    const messages: Record<number, string> = {
      400: '입력 정보와 카테고리를 확인해주세요.',
      401: '인증이 만료됐어요. 다시 로그인해주세요.',
      403: '이 분석 결과를 처리할 권한이 없어요.',
      404: '분석 결과 또는 대상 상품을 찾지 못했어요.',
      409: '이미 처리되었거나 만료된 분석이에요. 상품 상태를 확인해주세요.',
      422: '필수 정보와 입력값을 확인해주세요.',
      500: '서버 오류가 발생했어요. 상품 상태를 확인한 뒤 다시 시도해주세요.',
    };
    throw new ApiError(e.status, messages[e.status] ?? e.message);
  }
  throw e;
}
export async function applyVoiceAnalysis(
  analysis: VoiceAnalysis,
  fields?: ConfirmedFields,
): Promise<AppliedAnalysis> {
  const token = merchantToken();
  if (Date.parse(analysis.expiresAt) <= Date.now())
    throw new ApiError(409, '분석 결과가 만료됐어요. 다시 녹음해주세요.');
  if (fields) {
    if (
      (fields.product_name !== undefined && !text(fields.product_name)) ||
      (fields.price !== undefined && !amount(fields.price)) ||
      (fields.category !== undefined &&
        (!text(fields.category) || !categoryKnown(fields.category))) ||
      (fields.discount_rate != null &&
        (!amount(fields.discount_rate) || fields.discount_rate > 100)) ||
      (fields.discount_price != null && !amount(fields.discount_price))
    )
      throw new ApiError(422, '입력값을 확인해주세요.');
  }
  try {
    let d: unknown;
    if (isMockMode()) {
      const item = mockAnalyses.get(analysis.analysisId);
      if (!item || item.token !== token)
        throw new ApiError(404, '분석을 찾을 수 없어요.');
      if (item.state !== 'READY')
        throw new ApiError(409, '이미 처리된 분석이에요.');
      item.state = 'APPLIED';
      d = {
        analysis_id: analysis.analysisId,
        intent: analysis.intent,
        status: 'APPLIED',
        product_id: analysis.productId ?? 101,
        product_name: fields?.product_name ?? analysis.productName ?? '상품',
        category: fields?.category ?? analysis.category,
        category_name: fields?.category_name ?? analysis.categoryName,
        message: '상품 처리가 완료되었습니다.',
      };
    } else
      d = await postJson(
        `/voice/analysis/${encodeURIComponent(analysis.analysisId)}/apply`,
        fields ? { confirmed_fields: fields } : {},
        token,
      );
    const result = d as AppliedAnalysis | null;
    if (
      !result ||
      result.analysis_id !== analysis.analysisId ||
      result.intent !== analysis.intent ||
      result.status !== 'APPLIED' ||
      !positiveId(result.product_id) ||
      !text(result.product_name) ||
      !text(result.message) ||
      (analysis.productId !== undefined &&
        result.product_id !== analysis.productId)
    )
      throw new Error(
        '반영 결과를 확인하지 못했어요. 중복 요청 전에 상품 상태를 확인해주세요.',
      );
    return result;
  } catch (e) {
    globalThis.__jangbosoLogError?.('services/api/voice.ts', e);
    return analysisError(e);
  }
}
export async function cancelVoiceAnalysis(analysisId: string): Promise<void> {
  const token = merchantToken();
  if (!text(analysisId)) throw new Error('분석 ID를 확인해주세요.');
  try {
    if (isMockMode()) {
      const item = mockAnalyses.get(analysisId);
      if (!item || item.token !== token)
        throw new ApiError(404, '분석을 찾을 수 없어요.');
      if (item.state !== 'READY')
        throw new ApiError(409, '이미 처리된 분석이에요.');
      item.state = 'CANCELLED';
      return;
    }
    const d = (await deleteJson(
      `/voice/analysis/${encodeURIComponent(analysisId)}`,
      token,
    )) as { analysis_id: string; status: string; message: string };
    if (
      !d ||
      d.analysis_id !== analysisId ||
      d.status !== 'CANCELLED' ||
      !text(d.message)
    )
      throw new Error('분석 취소 결과를 확인하지 못했어요. 다시 시도해주세요.');
  } catch (e) {
    globalThis.__jangbosoLogError?.('services/api/voice.ts', e);
    analysisError(e);
  }
}
export async function submitVoice(
  action: VoiceAction,
  uri: string,
  id?: number,
): Promise<VoiceResult> {
  const token = merchantToken();
  if (action !== 'registration' && !positiveId(id))
    throw new Error('올바른 상품 또는 할인 ID를 입력해주세요.');
  if (isMockMode()) return mockVoiceAnalysis(action, id);
  const base = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!base) throw new Error('API 서버 주소가 설정되지 않았어요.');
  const form = new FormData();
  if (action !== 'registration')
    form.append(action === 'saleDelete' ? 'sale_id' : 'product_id', String(id));
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    if (!blob.size || blob.size > 10 * 1024 * 1024)
      throw new Error('빈 파일이 아닌 10MB 이내 녹음이 필요해요.');
    form.append(
      'audio_file',
      blob,
      blob.type.includes('mp4') ? 'voice.m4a' : 'voice.webm',
    );
  } else
    form.append('audio_file', {
      uri,
      name: 'voice.m4a',
      type: 'audio/mp4',
    } as unknown as Blob);
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await postMultipart(
      `${base.replace(/\/$/, '')}${voiceActions[action].path}`,
      form,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      },
    );
    if (!response.ok)
      throw new ApiError(
        response.status,
        response.status === 422
          ? '음성에서 상품 정보를 추출하지 못했어요. 다시 녹음해주세요.'
          : '음성 요청을 처리하지 못했어요.',
      );
    const data = await response.json();
    if (response.status !== 200)
      throw new Error('음성 처리 응답 상태를 확인할 수 없어요.');
    return parseVoiceAnalysis(data, action, id);
  } catch (e) {
    globalThis.__jangbosoLogError?.('services/api/voice.ts', e);
    if (controller.signal.aborted || e instanceof TypeError)
      throw new Error('분석 결과를 가져오지 못했어요. 다시 시도해주세요.');
    return analysisError(e);
  } finally {
    clearTimeout(timeout);
  }
}
