"""Run with --apply to seed the configured development DB, preserving real history."""
import argparse
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / '.env')
from database import SessionLocal
from models import Listing, Store, User, ListingPriceHistory
from demo_price_history import REGISTRY_PATH, load_registry, generate_prices


def seed(apply=False):
    if os.getenv('APP_ENV', '').lower() != 'development':
        raise RuntimeError('Demo seeding requires APP_ENV=development')
    as_of = datetime.now(timezone.utc)
    registry = load_registry()
    with SessionLocal() as db, db.begin():
        listings = db.query(Listing).join(Store, Listing.store_id == Store.store_id).join(
            User, Store.user_id == User.user_id).filter(
            Listing.deleted_at.is_(None), User.deleted_at.is_(None)).all()
        existing = {row.history_id for row in db.query(ListingPriceHistory.history_id).all()}
        seeded = {entry['listing_id'] for entry in registry['listings'] if any(
            history_id in existing for history_id in entry['history_ids'])}
        additions = []
        for listing in listings:
            if listing.listing_id in seeded:
                continue
            current_price = listing.sale_price if listing.sale_price is not None and listing.sale_price < listing.price else listing.price
            points = generate_prices(listing.listing_id, current_price, as_of)
            additions.append((listing.listing_id, [ListingPriceHistory(
                listing_id=listing.listing_id, price=price, recorded_at=at) for at, price in points]))
        summary = {'eligible_listings': len(listings), 'new_listings': len(additions),
                   'new_history_rows': sum(len(points) for _, points in additions), 'applied': apply}
        if not apply or not additions:
            return summary
        db.add_all([row for _, points in additions for row in points])
        db.flush()
        registry['generated_at'] = as_of.isoformat()
        registry['listings'].extend({'listing_id': listing_id, 'history_ids': [row.history_id for row in points]}
                                    for listing_id, points in additions)
        REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
        # Record IDs before commit. A failed DB commit leaves unused IDs in the
        # ledger, but never committed synthetic records without provenance.
        temporary = REGISTRY_PATH.with_suffix('.tmp')
        temporary.write_text(json.dumps(registry, indent=2) + '\n', encoding='utf-8')
        temporary.replace(REGISTRY_PATH)
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(seed(args.apply)))
    except Exception:
        logging.getLogger(__name__).error('demo_price_history.seed: SEED_FAILED')
        raise SystemExit(1)
