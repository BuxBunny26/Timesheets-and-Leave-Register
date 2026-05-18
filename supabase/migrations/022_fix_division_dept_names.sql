-- Fix division and department display names
UPDATE divisions SET name = 'Asset Reliability Care' WHERE code = 'ARC';
UPDATE divisions SET name = 'AFS'                    WHERE code = 'AFS';

UPDATE departments SET name = 'Rope Condition Assessment' WHERE code = 'ARC-RCA';
