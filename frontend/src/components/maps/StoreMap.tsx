import { logAppError } from '../../utils/appDiagnostics';
import { WebView } from 'react-native-webview';
import { storeMapDocument, type StoreMapProps } from './storeMapDocument';
export default function StoreMap(props: StoreMapProps) {
  return (
    <WebView
      source={{
        html: storeMapDocument(props),
        baseUrl:
          process.env.EXPO_PUBLIC_KAKAO_MAP_ORIGIN || 'https://localhost',
      }}
      onError={(event) =>
        logAppError(
          'maps/StoreMap.tsx',
          new Error(event.nativeEvent.description),
        )
      }
      onHttpError={(event) =>
        logAppError(
          'maps/StoreMap.tsx',
          new Error(`지도 HTTP ${event.nativeEvent.statusCode}`),
        )
      }
      originWhitelist={['*']}
      onMessage={(event) => {
        try {
          const point = JSON.parse(event.nativeEvent.data);
          if (point.type === 'diagnostic-error') {
            logAppError(
              'maps/store-script',
              new Error(String(point.message ?? '지도 오류')),
            );
            return;
          }
          if (
            point.source === 'store-map' &&
            Number.isFinite(point.latitude) &&
            Number.isFinite(point.longitude)
          )
            props.onLocated?.(point.latitude, point.longitude);
        } catch (__caughtError) {
          logAppError('components/maps/StoreMap.tsx', __caughtError);
        }
      }}
      scrollEnabled={false}
      style={{ flex: 1 }}
    />
  );
}
