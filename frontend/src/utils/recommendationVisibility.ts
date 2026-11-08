export type VisibleRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export function isRecommendationVisible(
  card: VisibleRect,
  viewports: VisibleRect[],
): boolean {
  if (
    !viewports.length ||
    ![card, ...viewports].every(
      (rect) =>
        [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
        rect.width > 0 &&
        rect.height > 0,
    )
  )
    return false;
  const left = Math.max(card.x, ...viewports.map((rect) => rect.x));
  const top = Math.max(card.y, ...viewports.map((rect) => rect.y));
  const right = Math.min(
    card.x + card.width,
    ...viewports.map((rect) => rect.x + rect.width),
  );
  const bottom = Math.min(
    card.y + card.height,
    ...viewports.map((rect) => rect.y + rect.height),
  );
  return (
    (Math.max(0, right - left) * Math.max(0, bottom - top)) /
      (card.width * card.height) >=
    0.5
  );
}
