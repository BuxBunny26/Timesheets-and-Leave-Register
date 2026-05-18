-- Rename ARC division to WearCheck and add GP Consult as a new division

UPDATE divisions SET name = 'WearCheck' WHERE code = 'ARC';

INSERT INTO divisions (code, name)
VALUES ('GP_CONSULT', 'GP Consult')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- Update GP Consult employees' division_id to GP Consult
-- (employees whose payment centre is GP Consult but were previously mapped to ARC)
UPDATE profiles
SET division_id = (SELECT id FROM divisions WHERE code = 'GP_CONSULT')
WHERE payment_centre_id = (SELECT id FROM payment_centres WHERE code = 'GP_CONSULT')
  AND division_id = (SELECT id FROM divisions WHERE code = 'ARC');
