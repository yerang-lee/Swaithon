-- PostgreSQL only. Apply in a maintenance window before starting the renamed backend.
-- Preserves values; Base.metadata.create_all does not rename existing columns.
BEGIN;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = 'listings'
                 AND column_name = 'discount_price') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = current_schema() AND table_name = 'listings'
                     AND column_name = 'sale_price') THEN
            RAISE EXCEPTION 'Both price columns exist; reconcile data before migration';
        END IF;
        ALTER TABLE listings RENAME COLUMN discount_price TO sale_price;
    END IF;
END $$;
COMMIT;
