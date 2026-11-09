import { iconAssets } from '../ui/iconAssets';
export type StoreMapProps = {
  latitude?: number;
  longitude?: number;
  address?: string;
  onLocated?: (latitude: number, longitude: number) => void;
};
export function storeMapDocument({
  latitude,
  longitude,
  address,
}: StoreMapProps) {
  const key = JSON.stringify(
    process.env.EXPO_PUBLIC_KAKAO_MAP_KEY ?? '',
  ).replace(/</g, '\\u003c');
  const lat =
    latitude !== undefined && Number.isFinite(latitude) ? latitude : 0;
  const lng =
    longitude !== undefined && Number.isFinite(longitude) ? longitude : 0;
  const safeAddress = JSON.stringify(address ?? '').replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#map{margin:0;width:100%;height:100%;font-family:sans-serif}#status{position:absolute;bottom:10px;left:10px;right:10px;background:white;padding:10px;font-size:13px;z-index:5;border-radius:8px}.pin{color:#53B175;filter:drop-shadow(0 2px 3px #0004)}.pin svg{width:36px;height:44px}</style><div id="map"></div><div id="status">지도를 불러오고 있어요.</div><script>const status=document.getElementById('status');const report=message=>{const msg={source:'store-map',type:'diagnostic-error',message};if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(msg));else window.parent.postMessage(msg,'*');};window.addEventListener('error',()=>report('가게 지도 JavaScript 오류'));window.addEventListener('unhandledrejection',()=>report('가게 지도 비동기 오류'));const sdk=document.createElement('script');sdk.src='https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey='+encodeURIComponent(${key});sdk.onerror=()=>{report('가게 지도 SDK 로드 실패');status.textContent='지도를 불러오지 못했어요. 네트워크와 지도 설정을 확인해주세요.'};sdk.onload=()=>{try{kakao.maps.load(()=>{const draw=(lat,lng)=>{const position=new kakao.maps.LatLng(lat,lng);const map=new kakao.maps.Map(document.getElementById('map'),{center:position,level:3});new kakao.maps.CustomOverlay({map,position,content:'<div class="pin">${iconAssets['location-pin']}</div>',yAnchor:1});status.style.display='none';const msg={source:'store-map',latitude:lat,longitude:lng};if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(msg));else window.parent.postMessage(msg,'*');};if(${lat}&&${lng})draw(${lat},${lng});else new kakao.maps.services.Geocoder().addressSearch(${safeAddress},(rows,result)=>{if(result===kakao.maps.services.Status.OK&&rows.length===1)draw(Number(rows[0].y),Number(rows[0].x));else status.textContent='정확한 가게 주소가 필요해요. 아래 주소를 확인해주세요.';});});}catch(e){report('가게 지도 초기화 실패');status.textContent='지도 설정을 확인해주세요.'}};document.head.appendChild(sdk);</script></html>`;
}
