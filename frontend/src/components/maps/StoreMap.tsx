import { WebView } from 'react-native-webview';
import { storeMapDocument, type StoreMapProps } from './storeMapDocument';
export default function StoreMap(props: StoreMapProps) {
  return <WebView source={{ html: storeMapDocument(props), baseUrl: process.env.EXPO_PUBLIC_KAKAO_MAP_ORIGIN || 'https://localhost' }} originWhitelist={['*']} onMessage={event => { try { const point = JSON.parse(event.nativeEvent.data); if (point.source === 'store-map' && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)) props.onLocated?.(point.latitude, point.longitude); } catch {} }} scrollEnabled={false} style={{ flex: 1 }} />;
}
