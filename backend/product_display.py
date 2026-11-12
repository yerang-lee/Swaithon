"""Display the registered product name together with its sale package."""
import math


def listing_display_name(product_name, listing):
    quantity = getattr(listing, 'sale_quantity', None)
    unit = getattr(listing, 'sale_unit', None)
    if (not isinstance(quantity, (int, float)) or isinstance(quantity, bool)
            or not math.isfinite(quantity) or quantity <= 0
            or not isinstance(unit, str) or not unit.strip()):
        return product_name
    suffix = f'{quantity:g}{unit.strip()}'
    if ''.join(product_name.split()).endswith(''.join(suffix.split())):
        return product_name
    return f'{product_name} {suffix}'
