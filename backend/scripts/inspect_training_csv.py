"""Read-only inspection of a proposed recommendation training CSV import."""
import csv
from datetime import datetime, timedelta
import hashlib
import math
from collections import Counter
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / '.env')
from database import engine
from sqlalchemy import text


FIELDS = ['request_id', 'user_id', 'listing_id', 'requested_at', 'impressed_at', 'label_available_at',
          'interest_match', 'category_preference', 'store_preference', 'distance_km',
          'hours_since_created', 'user_state', 'rule_score', 'label']


def validate_csv(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != FIELDS:
            raise ValueError('CSV columns do not match the 14-field training schema')
        rows = list(reader)
    keys, requests = set(), {}
    for number, row in enumerate(rows, 2):
        if set(row) != set(FIELDS) or any(value is None or not value.strip() for value in row.values()):
            raise ValueError(f'Missing fields on CSV line {number}')
        if not row['request_id'].startswith('synthetic_training_'):
            raise ValueError(f'Non-synthetic request ID on CSV line {number}')
        if int(row['user_id']) <= 0 or int(row['listing_id']) <= 0:
            raise ValueError(f'Invalid ID on CSV line {number}')
        key = row['request_id'], int(row['listing_id'])
        if key in keys:
            raise ValueError(f'Duplicate request/listing on CSV line {number}')
        keys.add(key)
        times = [datetime.fromisoformat(row[field]) for field in ('requested_at', 'impressed_at', 'label_available_at')]
        if any(at.tzinfo is None for at in times) or not times[0] <= times[1] or times[2] != times[1] + timedelta(hours=24):
            raise ValueError(f'Invalid observation period on CSV line {number}')
        values = {field: float(row[field]) for field in FIELDS[6:11] + ['rule_score']}
        if not all(math.isfinite(value) and value >= 0 for value in values.values()):
            raise ValueError(f'Invalid numeric value on CSV line {number}')
        if values['interest_match'] not in (0, 1) or any(values[field] > 1 for field in ('category_preference', 'store_preference')):
            raise ValueError(f'Invalid preference range on CSV line {number}')
        state = row['user_state']
        d, recency = 1 / (1 + values['distance_km']), math.exp(-values['hours_since_created'] / 24)
        scores = {
            'new_no_interest': .75 * d + .25 * recency,
            'new_with_interest': .6 * values['interest_match'] + .3 * d + .1 * recency,
            'behavior_based': .4 * values['interest_match'] + .25 * values['category_preference']
                              + .15 * values['store_preference'] + .15 * d + .05 * recency,
        }
        if state not in scores or abs(values['rule_score'] - scores[state]) > 1e-8 or int(row['label']) not in range(5):
            raise ValueError(f'Invalid state, rule score or label on CSV line {number}')
        context = int(row['user_id']), times[0], state
        if row['request_id'] in requests and requests[row['request_id']] != context:
            raise ValueError(f'Inconsistent request context on CSV line {number}')
        requests[row['request_id']] = context
    return rows


def inspect(path):
    rows = validate_csv(path)
    print('Validation: OK; source SHA256:', hashlib.sha256(Path(path).read_bytes()).hexdigest())
    requests = sorted({row['request_id'] for row in rows})
    users = sorted({int(row['user_id']) for row in rows})
    listings = sorted({int(row['listing_id']) for row in rows})
    print('CSV rows:', len(rows), 'requests:', len(requests), 'users:', len(users), 'listings:', len(listings))
    print('States:', dict(Counter(row['user_state'] for row in rows)))
    print('Labels:', dict(Counter(row['label'] for row in rows)))
    print('Duplicate keys:', len(rows)-len({(r['request_id'], r['listing_id']) for r in rows}))
    with engine.connect() as db:
        tables = db.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%training%' OR table_name LIKE '%recommendation%') ORDER BY table_name")).scalars().all()
        print('DB tables:', tables)
        for table, column, values in [('recommendation_requests', 'request_id', requests),
                                      ('users', 'user_id', users), ('listings', 'listing_id', listings)]:
            count = db.execute(text(f'SELECT count(*) FROM {table} WHERE {column}=ANY(:ids)'), {'ids': values}).scalar()
            print(f'Matching {table}:', count, '/', len(values))
        columns = db.execute(text("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('recommendation_requests','recommendation_items') ORDER BY table_name,ordinal_position")).all()
        print('DB columns:', [tuple(row) for row in columns])


if __name__ == '__main__':
    inspect(sys.argv[1])
