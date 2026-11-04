import { SvgXml } from 'react-native-svg';
import { iconAssets } from './iconAssets';
export type IconName = keyof typeof iconAssets;
export function AppIcon({ name, size = 26, color = '#181725' }: { name: IconName; size?: number; color?: string }) {
  return <SvgXml xml={iconAssets[name]} width={size} height={size} color={color} />;
}
