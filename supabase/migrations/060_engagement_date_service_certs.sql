-- 060_engagement_date_service_certs.sql
-- 1. Add engagement_date to employee_details for HR engagement tracking.
-- 2. Add service-award certification types so milestone work anniversaries
--    (1, 3, 5, 10, 15, 20, 25, 30 years) can be recorded as certifications.

ALTER TABLE employee_details
  ADD COLUMN IF NOT EXISTS engagement_date DATE;

INSERT INTO certification_types (code, name, category, display_order) VALUES
  ('service_1yr',  '1-Year Service Award',  'service_award', 110),
  ('service_3yr',  '3-Year Service Award',  'service_award', 120),
  ('service_5yr',  '5-Year Service Award',  'service_award', 130),
  ('service_10yr', '10-Year Service Award', 'service_award', 140),
  ('service_15yr', '15-Year Service Award', 'service_award', 150),
  ('service_20yr', '20-Year Service Award', 'service_award', 160),
  ('service_25yr', '25-Year Service Award', 'service_award', 170),
  ('service_30yr', '30-Year Service Award', 'service_award', 180)
ON CONFLICT (code) DO NOTHING;
