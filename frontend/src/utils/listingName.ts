export function listingName(item: {
  product_name: string;
  sale_quantity?: number | null;
  sale_unit?: string | null;
}): string {
  const quantity = item.sale_quantity;
  const unit = item.sale_unit?.trim();
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || !unit)
    return item.product_name;
  const suffix = `${quantity}${unit}`;
  if (item.product_name.replace(/\s/g, '').endsWith(suffix.replace(/\s/g, '')))
    return item.product_name;
  return `${item.product_name} ${suffix}`;
}
