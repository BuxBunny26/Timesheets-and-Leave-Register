-- ============================================================
-- 019: ADD AFS PAYMENT CENTRE
-- ============================================================
-- The Wearcheck employee CSV uses "AFS" as a payment centre
-- for the Applied Field Services team. Add it here.
-- ============================================================

INSERT INTO payment_centres (code, name)
VALUES ('AFS', 'Applied Field Services')
ON CONFLICT (code) DO NOTHING;
