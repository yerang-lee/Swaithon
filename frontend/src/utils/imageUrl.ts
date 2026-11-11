// Uploaded images belong to the API server, including when API routes use /api.
export function resolveImageUrl(value: string | null | undefined): string | null {
  const path = value?.trim().replace(/^<|>$/g, '');
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return null;
  const base = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!base) return null;
  return new URL(path, `${new URL(base).origin}/`).href;
}
