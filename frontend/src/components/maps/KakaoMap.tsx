import { logAppError } from '../../utils/appDiagnostics';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ExplorationLocation } from '../../services/explorationLocation';
import { mapDocument } from './mapDocument';
import { iconAssets } from '../ui/iconAssets';
export type MapMessage = { type: string; location?: ExplorationLocation };
export type MapProps = {
  initial: ExplorationLocation | null;
  onMessage: (data: MapMessage) => void;
  getGps: () => Promise<ExplorationLocation>;
};
export default function KakaoMap({ initial, onMessage, getGps }: MapProps) {
  const ref = useRef<WebView<object>>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const html = useMemo(
    () =>
      mapDocument(
        process.env.EXPO_PUBLIC_KAKAO_MAP_KEY || '',
        initial,
        iconAssets.gps,
      ),
    [],
  );
  const receive = async (raw: string) => {
    try {
      const data = JSON.parse(raw) as MapMessage;
      if (data.type === 'diagnostic-error') {
        logAppError(
          'maps/webview-script',
          new Error(
            String(
              (data as MapMessage & { message?: string }).message ??
                '지도 오류',
            ),
          ),
        );
        return;
      }
      if (data.type === 'gps-request') {
        let reply;
        try {
          reply = { type: 'gps', location: await getGps() };
        } catch (error) {
          logAppError('components/maps/KakaoMap.tsx', error);
          reply = {
            type: 'gps-error',
            message:
              error instanceof Error
                ? error.message
                : '위치를 가져오지 못했어요.',
          };
        }
        ref.current?.injectJavaScript(
          `window.receiveLocation(${JSON.stringify(reply).replace(/</g, '\\u003c')});true;`,
        );
      } else onMessage(data);
    } catch (__caughtError) {
      logAppError(
        'components/maps/KakaoMap.tsx',
        __caughtError,
      ); /* 알 수 없는 WebView 메시지는 무시합니다. */
    }
  };
  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setLayoutReady(true);
      }}
    >
      {layoutReady && (
        <WebView<object>
          ref={ref}
          source={{
            html,
            baseUrl:
              process.env.EXPO_PUBLIC_KAKAO_MAP_ORIGIN || 'https://localhost',
          }}
          onError={(event) =>
            logAppError(
              'maps/KakaoMap.tsx',
              new Error(event.nativeEvent.description),
            )
          }
          onHttpError={(event) =>
            logAppError(
              'maps/KakaoMap.tsx',
              new Error(`지도 HTTP ${event.nativeEvent.statusCode}`),
            )
          }
          originWhitelist={['*']}
          javaScriptEnabled
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          contentInset={{ top: 0, bottom: 0, left: 0, right: 0 }}
          scrollEnabled={false}
          bounces={false}
          scalesPageToFit={false}
          textZoom={100}
          onMessage={(e) => void receive(e.nativeEvent.data)}
          style={{ flex: 1 }}
        />
      )}
    </View>
  );
}
