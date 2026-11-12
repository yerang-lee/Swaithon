import { useEffect, useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import { getProduct } from '../../services/api/products';
import { useCatalogRevision } from '../../services/catalogChanges';
import { resolveImageUrl } from '../../utils/imageUrl';
import { logAppError } from '../../utils/appDiagnostics';

// Some list responses omit the photo although the detail already has it.
export function ListingImage({ listingId, uri, style, label }: {
  listingId: string | number;
  uri?: string | null;
  style: StyleProp<ImageStyle>;
  label: string;
}) {
  const revision = useCatalogRevision();
  const source = resolveImageUrl(uri);
  const key = `${listingId}:${source ?? ''}:${revision}`;
  const [failed, setFailed] = useState<string>();
  const [detail, setDetail] = useState<{ key: string; uri: string | null }>();
  const currentUri = detail?.key === key ? detail.uri : source;
  const failureKey = `${key}:${currentUri}`;
  const needsDetail = !source || failed === `${key}:${source}`;
  useEffect(() => {
    if (!needsDetail || !/^[1-9]\d*$/.test(String(listingId))) return;
    let active = true;
    void getProduct(String(listingId)).then((product) => {
      if (active) setDetail({ key, uri: resolveImageUrl(product.image_url) });
    }).catch(() => {
      // Do not log server responses or URLs from image fallback requests.
      logAppError('products/list-image', new Error('상품 목록 사진 주소를 확인하지 못했어요.'));
    });
    return () => { active = false; };
  }, [key, listingId, needsDetail]);
  return currentUri && failed !== failureKey ? (
    <Image source={{ uri: currentUri }} style={style} resizeMode="cover"
      accessibilityLabel={label} onError={() => {
        logAppError('products/list-image', new Error('상품 목록 사진을 불러오지 못했어요.'));
        setFailed(failureKey);
      }} />
  ) : <View style={style} accessibilityLabel="상품 사진 없음" />;
}
