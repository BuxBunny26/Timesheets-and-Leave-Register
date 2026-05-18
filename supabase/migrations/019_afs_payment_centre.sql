-- ============================================================
-- 019: ADD AFS PAYMENT CENTRE
-- ============================================================
-- The Wearcheck employee CSV uses "AFS" as a payment centre
-- for the AFS team. Add it here.
-- ============================================================

INSERT INTO payment_centres (code, name)
VALUES ('AFS', 'AFS')
ON CONFLICT (code) DO NOTHING;
