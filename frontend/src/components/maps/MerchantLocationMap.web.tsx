import { logAppError } from '../../utils/appDiagnostics';
import { useEffect, useMemo, useRef } from 'react';
import type { MapProps } from './MerchantLocationMap';
import { merchantMapDocument } from './merchantMapDocument';
import { iconAssets } from '../ui/iconAssets';
export default function MerchantLocationMap({
  initial,
  onMessage,
  getGps,
}: MapProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const html = useMemo(
    () =>
      merchantMapDocument(
        process.env.EXPO_PUBLIC_KAKAO_MAP_KEY || '',
        initial,
        iconAssets.gps,
      ),
    [],
  );
  useEffect(() => {
    const receive = async (event: MessageEvent) => {
      if (
        event.source !== ref.current?.contentWindow ||
        event.data?.source !== 'jangboso-map'
      )
        return;
      if (event.data.type === 'diagnostic-error') {
        logAppError(
          'maps/iframe-script',
          new Error(String(event.data.message ?? '지도 오류')),
        );
        return;
      }
      if (event.data.type === 'gps-request') {
        let reply;
        try {
          reply = { type: 'gps', location: await getGps() };
        } catch (error) {
          logAppError('components/maps/MerchantLocationMap.web.tsx', error);
          reply = {
            type: 'gps-error',
            message:
              error instanceof Error
                ? error.message
                : '위치를 가져오지 못했어요.',
          };
        }
        ref.current?.contentWindow?.postMessage(reply, window.location.origin);
      } else onMessage(event.data);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [getGps, onMessage]);
  return (
    <iframe
      ref={ref}
      srcDoc={html}
      title="가게 위치 설정 지도"
      allow="geolocation"
      style={{ border: 0, flex: 1, width: '100%', height: '100%' }}
    />
  );
}
