-- Divisions
INSERT INTO divisions (code, name) VALUES
('ARC', 'Asset Reliability Care'),
('AFS', 'AFS')
ON CONFLICT (code) DO NOTHING;

-- Departments
INSERT INTO departments (code, name, division_code) VALUES
('ARC-RCM', 'Reliability Condition Monitoring', 'ARC'),
('ARC-NDT', 'Non-Destructive Testing', 'ARC'),
('ARC-TCA', 'Technical Condition Assessment', 'ARC'),
('ARC-RCA', 'Rope Condition Assessment', 'ARC'),
('AFS-NDT', 'Non-Destructive Testing', 'AFS'),
('AFS-RCA', 'Rope Condition Assessment', 'AFS'),
('AFS-TC',  'Technical Compliance', 'AFS')
ON CONFLICT (code) DO NOTHING;

-- Payment Centres
INSERT INTO payment_centres (code, name) VALUES
('WEARCHECK', 'WearCheck'),
('GP_CONSULT', 'GP Consult')
ON CONFLICT (code) DO NOTHING;

-- Sites
INSERT INTO sites (code, name, city, province, country_code) VALUES
('SA-HO',   'Longmeadow H/O',          'Johannesburg', 'Gauteng',       'ZA'),
('SA-MOT',  'Valterra - Mototolo',      'Burgersfort',  'Limpopo',       'ZA'),
('SA-WAT',  'Valterra - Waterval',      'Limpopo',      'Limpopo',       'ZA'),
('SA-RBM',  'RBMR and PMR',             'Rustenburg',   'North West',    'ZA'),
('SA-TWF',  'Samancor - Tweefontein',   'Middelburg',   'Mpumalanga',    'ZA'),
('SA-TAS',  'Samancor - TAS',           'Mpumalanga',   'Mpumalanga',    'ZA'),
('SA-DBB',  'Samancor - Doornbosch',    'Middelburg',   'Mpumalanga',    'ZA'),
('SA-MFC',  'Samancor - MFC',           'Middelburg',   'Mpumalanga',    'ZA'),
('SA-MOO',  'Samancor - Mooinooi',      'Brits',        'North West',    'ZA'),
('SA-MLC',  'Samancor - Millcell',      'Mpumalanga',   'Mpumalanga',    'ZA'),
('SA-KHU',  'Seriti - Khutala',         'Mpumalanga',   'Mpumalanga',    'ZA'),
('SA-NRP',  'Neopak - Rosslyn',         'Pretoria',     'Gauteng',       'ZA'),
('SA-SPR',  'Springs',                  'Springs',      'Gauteng',       'ZA'),
('SA-KZH',  'KwaZulu Natal - Hillside', 'Richards Bay', 'KwaZulu-Natal', 'ZA'),
('SA-KZT',  'KwaZulu Natal - Tronox',   'Empangeni',    'KwaZulu-Natal', 'ZA'),
('SA-MAT',  'Eskom - Matimba',          'Lephalale',    'Limpopo',       'ZA'),
('SA-REM',  'Remote Centre',            'Kempton Park', 'Gauteng',       'ZA'),
('SA-KAT',  'Kathu',                    'Kathu',        'Northern Cape', 'ZA'),
('SA-ROA',  'Roamer',                   'Various',      'Various',       'ZA'),
('INT-MOZ', 'Mozambique',               'Maputo',       'Maputo',        'MZ'),
('INT-NAW', 'Namibia - Walvis Bay',     'Walvis Bay',   'Erongo',        'NA'),
('INT-NAW2','Namibia - Windhoek',       'Windhoek',     'Khomas',        'NA')
ON CONFLICT (code) DO NOTHING;
