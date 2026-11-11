# Recommendation training DB setup

Apply `20261111_recommendation_training.sql` manually in PostgreSQL after deploying the backend changes. It creates helper functions, a candidate view, exclusion tables and indexes; it does not export CSV or change historical features. Regular index creation can block writes; apply during a maintenance window on large tables.

Register every known test/synthetic user in `recommendation_training_excluded_users(user_id, reason)` and synthetic request in `recommendation_training_excluded_requests(request_id, reason)` before extracting. The backend cannot infer whether an existing account or row is synthetic. Exclusions are explicit, not automatic.

Use one fixed timezone-aware DATA_AS_OF in all queries:

```sql
SELECT * FROM recommendation_training_rows('2026-11-11T12:00:00+09:00'::timestamptz);
```

This returns the required 14 columns. Timestamps are timestamptz; set your export tool to ISO 8601 including timezone and UTF-8. No exposure means no row. Observation is 24 hours from first exposure. Missing/invalid snapshots, unknown rule versions and immature rows are excluded. Only rules_v1 is supported. No historical inputs are reconstructed from current preferences.

Label 4 is disabled by default. Only after agreeing that QR pickup is purchase confirmation, pass `true` as the second argument. This uses picked_up_at, not COMPLETED alone. Cancellation after the observation deadline does not invalidate a reservation at the deadline. Cancellation before it does. Favorite cancellation is evaluated across all requests for that user/listing, while the positive action is attributed only to its own request. Reservation events supply the original attribution and creation time. Current confirmed/ready status transitions are not needed for the valid/not-cancelled reservation label.

Audit counts (replace the timestamp consistently):

```sql
WITH rows AS (
 SELECT * FROM recommendation_training_rows('2026-11-11T12:00:00+09:00'::timestamptz)
)
SELECT count(*) AS rows, count(DISTINCT request_id) AS requests,
 count(DISTINCT user_id) AS users, min(requested_at), max(requested_at) FROM rows;
SELECT label, count(*) FROM recommendation_training_rows(
 '2026-11-11T12:00:00+09:00'::timestamptz) GROUP BY label ORDER BY label;
SELECT count(*) FILTER (WHERE excluded) AS excluded_test_or_synthetic,
 count(*) FILTER (WHERE NOT excluded AND label_available_at > '2026-11-11T12:00:00+09:00') AS immature,
 count(*) FILTER (WHERE NOT excluded AND
  (interest_match IS NULL OR category_preference IS NULL OR store_preference IS NULL
   OR distance_km IS NULL OR hours_since_created IS NULL)) AS missing_snapshot
FROM recommendation_training_candidates;
```

Recalculate rule scores with tolerance 1e-8 (must return no rows):

```sql
WITH rows AS (
 SELECT *, 1.0/(1.0+distance_km) AS d, exp(-hours_since_created/24.0) AS t
 FROM recommendation_training_rows('2026-11-11T12:00:00+09:00'::timestamptz)
), checked AS (
 SELECT *, CASE user_state
 WHEN 'new_no_interest' THEN .75*d+.25*t
 WHEN 'new_with_interest' THEN .60*interest_match+.30*d+.10*t
 WHEN 'behavior_based' THEN .40*interest_match+.25*category_preference
   +.15*store_preference+.15*d+.05*t END AS expected FROM rows
)
SELECT request_id, listing_id, rule_score, expected
FROM checked WHERE abs(rule_score-expected)>1e-8;
```

Rows with attributed reservations cancelled without cancelled_at are excluded because historical state cannot be reconstructed reliably. Late-arriving mobile events can change a later extraction; choose DATA_AS_OF after allowing event delivery time. Existing empty snapshots remain excluded. The migration has not been applied to the operating database by this change. Migration creation/reapplication, extraction SQL, label rules and the real impression route were tested against a disposable local PostgreSQL 18 database.


## Files to run

1. Execute `20261111_recommendation_training.sql` once before using the updated backend. This also adds feature_snapshot if absent; existing empty values are not filled with fabricated inputs.
2. Register known test users and synthetic requests in the exclusion tables.
3. Execute `20261111_recommendation_training_queries.sql` in one session. Edit the single training_parameters SELECT to specify DATA_AS_OF. Export the first result set; subsequent result sets provide counts and validation. The temporary tables disappear at COMMIT, so rerun the complete script for another extraction.
4. The validation queries must return zero rows. Scores and within-request category/store preferences are checked; category validation uses the immutable category_id saved inside new snapshots, not mutable product metadata. Older snapshots without category_id cannot be checked that way.

Example exclusions (replace IDs, do not run these examples unchanged):

```sql
INSERT INTO recommendation_training_excluded_users(user_id,reason)
VALUES (123,'test account') ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason;
INSERT INTO recommendation_training_excluded_requests(request_id,reason)
VALUES ('synthetic-request-id','synthetic data')
ON CONFLICT(request_id) DO UPDATE SET reason=excluded.reason;
```

A fresh installation requires the normal application tables from models.py to exist first. No operating DB credentials or data are needed for the disposable integration test. Run `tests/check_training_postgres.py` with an explicit disposable DB URL; fixtures are rolled back and operating databases must not be used for testing.
