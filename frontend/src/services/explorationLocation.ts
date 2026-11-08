import { markLocationChanged } from './locationChanges';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { isMockMode, mockLocation } from './devMock';

export type ExplorationLocation = {
  latitude: number;
  longitude: number;
  name: string;
  radius: number;
};
const storageKey = 'jangboso.exploration-location.v1';
export async function readLocation(): Promise<ExplorationLocation | null> {
  if (isMockMode()) return { ...mockLocation };
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return isLocation(value) ? value : null;
  } catch (__caughtError) {
    globalThis.__jangbosoLogError?.(
      'services/explorationLocation.ts',
      __caughtError,
    );
    return null;
  }
}
export function isLocation(value: unknown): value is ExplorationLocation {
  if (!value || typeof value !== 'object') return false;
  const p = value as ExplorationLocation;
  return (
    Number.isFinite(p.latitude) &&
    Math.abs(p.latitude) <= 90 &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.longitude) <= 180 &&
    typeof p.name === 'string' &&
    Number.isFinite(p.radius) &&
    p.radius >= 1 &&
    p.radius <= 5
  );
}
export async function saveLocation(value: ExplorationLocation) {
  if (isMockMode()) {
    Object.assign(mockLocation, value);
    markLocationChanged();
    return;
  }
  await AsyncStorage.setItem(storageKey, JSON.stringify(value));
  markLocationChanged();
}
export async function getCurrentLocation(): Promise<ExplorationLocation> {
  if (isMockMode()) return { ...mockLocation };
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      '위치 권한이 필요해요. 기기 설정에서 허용하거나 주소를 검색해주세요.',
    );
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  let name = '현재 위치';
  try {
    const [address] = await Location.reverseGeocodeAsync(position.coords);
    const parts = [address?.district, address?.subregion, address?.city];
    name =
      parts.find((part) => part && /[동읍면]$/.test(part)) ||
      address?.district ||
      address?.city ||
      name;
  } catch (__caughtError) {
    globalThis.__jangbosoLogError?.(
      'services/explorationLocation.ts',
      __caughtError,
    ); /* 지도 SDK에서 동 이름을 다시 확인합니다. */
  }
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    name,
    radius: 1,
  };
}
