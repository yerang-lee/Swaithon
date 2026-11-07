import { logAppError } from '../../utils/appDiagnostics';
import { useEffect, useRef } from 'react';
import { storeMapDocument, type StoreMapProps } from './storeMapDocument';
export default function StoreMap(props: StoreMapProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => { if(event.source===ref.current?.contentWindow&&event.data?.source==='store-map'&&event.data?.type==='diagnostic-error'){logAppError('maps/store-iframe',new Error(String(event.data.message??'지도 오류')));return;} if (event.source === ref.current?.contentWindow && event.data?.source === 'store-map' && Number.isFinite(event.data.latitude) && Number.isFinite(event.data.longitude)) props.onLocated?.(event.data.latitude, event.data.longitude); };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [props.onLocated]);
  return <iframe ref={ref} title="가게 위치 지도" srcDoc={storeMapDocument(props)} style={{ border: 0, width: '100%', height: '100%' }} />;
}
