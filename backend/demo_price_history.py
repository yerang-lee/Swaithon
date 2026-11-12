"""Explicitly seeded development data; never synthesize prices during API reads."""
import calendar
from datetime import timedelta
import json
import logging
import math
from pathlib import Path
import random

REGISTRY_PATH = Path(__file__).resolve().parent / 'uploads' / 'demo-price-history.json'


def load_registry():
    if not REGISTRY_PATH.exists():
        return {'source': 'synthetic_demo_v1', 'listings': []}
    try:
        return json.loads(REGISTRY_PATH.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        logging.getLogger(__name__).error('demo_price_history.registry: REGISTRY_READ_FAILED')
        raise


def get_demo_history_ids():
    return {history_id for listing in load_registry()['listings'] for history_id in listing['history_ids']}


def generate_prices(listing_id, current_price, as_of):
    """Five calendar months of example prices rounded to multiples of 500 won."""
    month_index = as_of.year * 12 + as_of.month - 1 - 5
    year, month = divmod(month_index, 12)
    month += 1
    start = as_of.replace(year=year, month=month,
                          day=min(as_of.day, calendar.monthrange(year, month)[1]))
    times = []
    at = start
    while at < as_of:
        times.append(at)
        at += timedelta(days=3)
    times.append(as_of)
    rng = random.Random(f'demo-price-v1:{listing_id}')
    phase = rng.uniform(0, math.tau)
    raw = [math.sin(i * .5 + phase) * .08 + rng.uniform(-.045, .045) for i in range(len(times))]
    quantum = 500
    prices = []
    for i, at in enumerate(times):
        factor = max(.8, min(1.2, 1 + raw[i] - raw[-1] * i / (len(times) - 1)))
        price = max(quantum, round(current_price * factor / quantum) * quantum) if current_price else 0
        prices.append((at, price))
    prices[-1] = (as_of, max(quantum, round(current_price / quantum) * quantum) if current_price else 0)
    return prices
