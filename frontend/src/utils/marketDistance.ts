export function parseMarketDistance(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const distance = Number(value);
  return Number.isFinite(distance) && distance >= 0 ? distance : null;
}
export function formatMarketDistance(distance: number): string {
  return `${(distance / 1000).toFixed(1)}km`;
}
export function marketDistanceParams(distance: number | null): { marketDistanceMeters?: string } {
  return distance !== null && Number.isFinite(distance) && distance >= 0 ? { marketDistanceMeters: String(distance) } : {};
}
