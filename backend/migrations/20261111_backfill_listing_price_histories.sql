-- Optional one-time preservation of legacy graph history.
-- Canonical writes and reads now use listing_price_histories.
-- Run on the deployment database before switching the price-history API.
-- No table is dropped; rerunning does not duplicate identical samples.
BEGIN;

INSERT INTO listing_price_histories (listing_id, price, recorded_at)
SELECT DISTINCT legacy.listing_id, legacy.price, legacy.recorded_at
FROM price_histories AS legacy
WHERE NOT EXISTS (
    SELECT 1
    FROM listing_price_histories AS canonical
    WHERE canonical.listing_id = legacy.listing_id
      AND canonical.price = legacy.price
      AND canonical.recorded_at = legacy.recorded_at
);

COMMIT;
