-- 063_preferred_names_supervisors_sites.sql
-- Comprehensive update from master employee spreadsheet:
--   1. Preferred/nick names → first_name
--   2. Direct supervisor relationships
--   3. Site assignments
--
-- All matches are by LOWER(email). Rows not found are silently skipped.
-- Eddie Jnr = edwardfp@wearcheckrs.com | Eddie Snr = epieterse@wearcheckrs.com

-- ============================================================
-- HELPERS: resolve supervisor and site by email / code
-- (Used inline as subqueries below)
-- ============================================================

-- ============================================================
-- 1. PREFERRED NAME (first_name) UPDATES
-- ============================================================
UPDATE profiles SET first_name = 'Annah Seipone' WHERE LOWER(email) = 'annahm@wearcheckrs.com';
UPDATE profiles SET first_name = 'Dezman'        WHERE LOWER(email) = 'desmond@wearcheckrs.com';
UPDATE profiles SET first_name = 'Eddie',  surname = 'Pieterse'
  WHERE LOWER(email) = 'edwardfp@wearcheckrs.com';
UPDATE profiles SET first_name = 'Eddie Snr'     WHERE LOWER(email) = 'epieterse@wearcheckrs.com';
UPDATE profiles SET first_name = 'Francois'      WHERE LOWER(email) = 'micheal@wearcheckrs.com';
UPDATE profiles SET first_name = 'Gordon'        WHERE LOWER(email) = 'freddish@wearcheck.co.za';
UPDATE profiles SET first_name = 'Isac'          WHERE LOWER(email) = 'isac@wearcheckrs.com';
UPDATE profiles SET first_name = 'Isac'          WHERE LOWER(email) = 'isa@wearcheckrs.com';
UPDATE profiles SET first_name = 'Londi'         WHERE LOWER(email) = 'londolanim@wearcheckrs.com';
UPDATE profiles SET first_name = 'Lopi'          WHERE LOWER(email) IN ('lopim@wearcheckrs.com','lopim@wearcheck.co.za');
UPDATE profiles SET first_name = 'Lucas'         WHERE LOWER(email) IN ('lucas@wearcheckrs.com','laas@wearcheckrs.com');
UPDATE profiles SET first_name = 'Mike'          WHERE LOWER(email) = 'michealm@wearcheckrs.com';
UPDATE profiles SET first_name = 'Mörne'         WHERE LOWER(email) = 'mornea@wearcheckrs.com';
UPDATE profiles SET first_name = 'Nkateko'       WHERE LOWER(email) = 'lloyd@wearcheckrs.com';
UPDATE profiles SET first_name = 'Thapelo', surname = 'Mohlala'
  WHERE LOWER(email) = 'thapelo@wearcheckrs.com';
UPDATE profiles SET first_name = 'Lopi'          WHERE LOWER(email) = 'lopim@wearcheck.co.za';
-- Fix Eddie Jnr job title (migration 062 used wrong email edwardp@)
UPDATE profiles SET job_title = 'Operations Manager'
  WHERE LOWER(email) = 'edwardfp@wearcheckrs.com';

-- ============================================================
-- 2. SUPERVISOR UPDATES
--    supervisor_id = lookup by supervisor's email
-- ============================================================

-- Adri Ludick → Philip Schutte
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='philip@wearcheckrs.com')
  WHERE LOWER(email) = 'a.ludick@wearcheckrs.com';

-- Adriaan Bouwer → Louis Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='louis@wearcheckrs.com')
  WHERE LOWER(email) = 'adriaanb@wearcheckrs.com';

-- Ailwel Rasimphi → Riaan de Beer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='riaandb@wearcheckrs.com')
  WHERE LOWER(email) = 'marshallr@wearcheckrs.com';

-- Alex Outram → Micheal Pretorius
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='micheal@wearcheckrs.com')
  WHERE LOWER(email) = 'alex@wearcheckrs.com';

-- Allan Stuurman → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'allan@wearcheckrs.com';

-- Andrew Robb → Louis Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='louis@wearcheckrs.com')
  WHERE LOWER(email) = 'andrew@wearcheckrs.com';

-- Annah Modutwane → Londolani Managa
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='londolanim@wearcheckrs.com')
  WHERE LOWER(email) = 'annahm@wearcheckrs.com';

-- Annemie Willer → Philip Schutte
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='philip@wearcheckrs.com')
  WHERE LOWER(email) = 'annemie@wearcheckrs.com';

-- Armindo Muchacho → Riaan du Plooy
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='riaandp@wearcheckrs.com')
  WHERE LOWER(email) = 'armindo@wearcheckrs.com';

-- Aubrey Tshabalala → Annah Modutwane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annahm@wearcheckrs.com')
  WHERE LOWER(email) = 'aubrey@wearcheckrs.com';

-- Bianka de Beer → Megan Salzwedel
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='megan@wearcheckrs.com')
  WHERE LOWER(email) = 'bianka@wearcheckrs.com';

-- Boitumeio Makgamatha → Tsietsi Monnanyane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='tsietsi@wearcheckrs.com')
  WHERE LOWER(email) = 'boitumeio@wearcheckrs.com';

-- Chicco Tivane → Londolani Managa
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='londolanim@wearcheckrs.com')
  WHERE LOWER(email) = 'chicco@wearcheckrs.com';

-- Chris Mostert → Eddie Pieterse Snr
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='epieterse@wearcheckrs.com')
  WHERE LOWER(email) = 'chrism@wearcheckrs.com';

-- Christene Smal → Megan Salzwedel
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='megan@wearcheckrs.com')
  WHERE LOWER(email) IN ('chrstene@wearcheckrs.com','christene@wearcheckrs.com');

-- CJ Woller → Micheal Pretorius
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='micheal@wearcheckrs.com')
  WHERE LOWER(email) = 'cj@wearcheckrs.com';

-- Daniel Molapo → Annah Modutwane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annahm@wearcheckrs.com')
  WHERE LOWER(email) = 'daniel@wearcheckrs.com';

-- Dave Viljoen → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'david@wearcheckrs.com';

-- David Lipague → Riaan du Plooy
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='riaandp@wearcheckrs.com')
  WHERE LOWER(email) = 'davidi@wearcheckrs.com';

-- Deon Gaarkeuken → Andrew Robb
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='andrew@wearcheckrs.com')
  WHERE LOWER(email) = 'deon@wearcheckrs.com';

-- Dezman Ngomane → Annah Modutwane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annahm@wearcheckrs.com')
  WHERE LOWER(email) = 'desmond@wearcheckrs.com';

-- Dian Leff → Rohan Willer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='rohan@wearcheckrs.com')
  WHERE LOWER(email) = 'dian@wearcheckrs.com';

-- Douglas Prout-Jones → Riaan de Beer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='riaandb@wearcheckrs.com')
  WHERE LOWER(email) = 'douglas@wearcheckrs.com';

-- Dyllen van Heerden → Riaan de Beer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='riaandb@wearcheckrs.com')
  WHERE LOWER(email) = 'dyllen@wearcheckrs.com';

-- Eben Prinsloo → Eddie Pieterse Jnr
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='edwardfp@wearcheckrs.com')
  WHERE LOWER(email) = 'eben@wearcheckrs.com';

-- Eddie (Edward Frederick IV) → Annemie Willer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annemie@wearcheckrs.com')
  WHERE LOWER(email) = 'edwardfp@wearcheckrs.com';

-- Eddie Snr → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'epieterse@wearcheckrs.com';

-- Eugene Scheepers → Francois (Micheal) Pretorius
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='franciosp@wearcheckrs.com')
  WHERE LOWER(email) = 'eugene@wearcheckrs.com';

-- Francios (Micheal) Pretorius → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'franciosp@wearcheckrs.com';

-- Francois van Eeden → Andrew Robb
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='andrew@wearcheckrs.com')
  WHERE LOWER(email) = 'francoive@wearcheckrs.com';

-- Francois Pienaar → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'francoisp@wearcheckrs.com';

-- Freddy-Ben Gariseb → Rohan Willer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='rohan@wearcheckrs.com')
  WHERE LOWER(email) = 'freddy-ben@wearcheckrs.com';

-- Gabriel Nuunyango → Rohan Willer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='rohan@wearcheckrs.com')
  WHERE LOWER(email) = 'gabriel@wearcheckrs.com';

-- Gordon Hoy → Adri Ludick
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='a.ludick@wearcheckrs.com')
  WHERE LOWER(email) = 'freddish@wearcheck.co.za';

-- Gustav Lourens → Eddie Pieterse Snr
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='epieterse@wearcheckrs.com')
  WHERE LOWER(email) = 'gustav@wearcheckrs.com';

-- Hannest Koegelenberg → Eddie Pieterse Snr
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='epieterse@wearcheckrs.com')
  WHERE LOWER(email) = 'hannest@wearcheckrs.com';

-- Hein Coetzer → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'heinc@wearcheckrs.com';

-- Heinrich Kusel → Roger Henwood
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='rogert@wearcheckrs.com')
  WHERE LOWER(email) = 'heinrich@wearcheckrs.com';

-- Henry Mherekumombe → Adri Ludick
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='a.ludick@wearcheckrs.com')
  WHERE LOWER(email) = 'henry@wearcheckrs.com';

-- Isac Zacarias → Riaan du Plooy
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='riaandp@wearcheckrs.com')
  WHERE LOWER(email) IN ('isac@wearcheckrs.com','isa@wearcheckrs.com');

-- Jaco Willer → Philip Schutte
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='philip@wearcheckrs.com')
  WHERE LOWER(email) = 'jaco@wearcheckrs.com';

-- Jaco de Beer → Eben Prinsloo
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='eben@wearcheckrs.com')
  WHERE LOWER(email) = 'jacodb@wearcheckrs.com';

-- James Tshabalala → Annah Modutwane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annahm@wearcheckrs.com')
  WHERE LOWER(email) = 'james@wearcheckrs.com';

-- JJ de Beer → Andrew Robb
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='andrew@wearcheckrs.com')
  WHERE LOWER(email) = 'jj@wearcheckrs.com';

-- Johandro Oosthuizen → clear supervisor
UPDATE profiles SET supervisor_id = NULL
  WHERE LOWER(email) IN ('johandro@wearcheckrs.com','johandra@wearcheckrs.com');

-- Leané Bodenstein → clear supervisor
UPDATE profiles SET supervisor_id = NULL
  WHERE LOWER(email) = 'leane@wearcheckrs.com';

-- Kevin Henwood → Roger Henwood
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='rogert@wearcheckrs.com')
  WHERE LOWER(email) = 'kevin@wearcheckrs.com';

-- Leon Coetzee → Londolani Managa
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='londolanim@wearcheckrs.com')
  WHERE LOWER(email) = 'leon@wearcheckrs.com';

-- Lesego Khuthwane → Andrew Robb
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='andrew@wearcheckrs.com')
  WHERE LOWER(email) = 'lesego@wearcheckrs.com';

-- Londolani Managa → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'londolanim@wearcheckrs.com';

-- Lopi Molangoane → Annah Modutwane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annahm@wearcheckrs.com')
  WHERE LOWER(email) IN ('lopim@wearcheckrs.com','lopim@wearcheck.co.za');

-- Louis Peacock → Annemie Willer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annemie@wearcheckrs.com')
  WHERE LOWER(email) = 'louis@wearcheckrs.com';

-- Lubby Lubis → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'lubby@wearcheckrs.com';

-- Lucas Luus → Andrew Robb
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='andrew@wearcheckrs.com')
  WHERE LOWER(email) IN ('lucas@wearcheckrs.com','laas@wearcheckrs.com');

-- Mandé Coetzee → Shivon Alberts
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='shivon@wearcheckrs.com')
  WHERE LOWER(email) IN ('mande@wearcheckrs.com','mand@wearcheckrs.com');

-- Marcel Schoeman → Annemie Willer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annemie@wearcheckrs.com')
  WHERE LOWER(email) = 'marcel@wearcheckrs.com';

-- Mariette du Rand → Eddie Pieterse Snr
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='epieterse@wearcheckrs.com')
  WHERE LOWER(email) = 'mariette@wearcheckrs.com';

-- Martiens van Aarde → Tsietsi Monnanyane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='tsietsi@wearcheckrs.com')
  WHERE LOWER(email) = 'martiens@wearcheckrs.com';

-- Megan Salzwedel → Eddie Pieterse Jnr
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='edwardfp@wearcheckrs.com')
  WHERE LOWER(email) = 'megan@wearcheckrs.com';

-- Micheal Masemola (Mike) → Annah Modutwane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annahm@wearcheckrs.com')
  WHERE LOWER(email) = 'michealm@wearcheckrs.com';

-- Micheal Pretorius (Francois) → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'micheal@wearcheckrs.com';

-- Betty Monyepao → Annah Modutwane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annahm@wearcheckrs.com')
  WHERE LOWER(email) = 'betty@wearcheckrs.com';

-- Mörne Alberts → Andrew Robb
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='andrew@wearcheckrs.com')
  WHERE LOWER(email) = 'mornea@wearcheckrs.com';

-- Nadhira Bux → Louis Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='louis@wearcheckrs.com')
  WHERE LOWER(email) = 'nadhira@wearcheckrs.com';

-- Muhamad Hanif → Riaan du Plooy
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='riaandp@wearcheckrs.com')
  WHERE LOWER(email) = 'muhamad@wearcheckrs.com';

-- Nkateko (Lloyd) Ngobeni → Riaan de Beer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='riaandb@wearcheckrs.com')
  WHERE LOWER(email) = 'lloyd@wearcheckrs.com';

-- Nomvula Mkhize → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'nomvulam@wearcheckrs.com';

-- Passwell Mashoeu → Annah Modutwane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annahm@wearcheckrs.com')
  WHERE LOWER(email) = 'passwell@wearcheckrs.com';

-- Peet Peacock → Annemie Willer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annemie@wearcheckrs.com')
  WHERE LOWER(email) = 'peet@wearcheckrs.com';

-- Percy Hall → Londolani Managa
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='londolanim@wearcheckrs.com')
  WHERE LOWER(email) = 'percy@wearcheckrs.com';

-- Permission Malele → Annah Modutwane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='annahm@wearcheckrs.com')
  WHERE LOWER(email) = 'permission@wearcheckrs.com';

-- Philip Schutte → no supervisor (top level)
UPDATE profiles SET supervisor_id = NULL
  WHERE LOWER(email) = 'philip@wearcheckrs.com';

-- Placido Maculuve → Riaan du Plooy
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='riaandp@wearcheckrs.com')
  WHERE LOWER(email) = 'placido@wearcheckrs.com';

-- Reinier Kalp → Andrew Robb
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='andrew@wearcheckrs.com')
  WHERE LOWER(email) = 'reinlerk@wearcheckrs.com';

-- Riaan du Plooy → Jaco Willer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='jaco@wearcheckrs.com')
  WHERE LOWER(email) = 'riaandp@wearcheckrs.com';

-- Riaan de Beer → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'riaandb@wearcheckrs.com';

-- Rakcal Bataram → Francois Pienaar
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='francoisp@wearcheckrs.com')
  WHERE LOWER(email) = 'rakcal@wearcheckrs.com';

-- Rohan Willer → Jaco Willer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='jaco@wearcheckrs.com')
  WHERE LOWER(email) = 'rohan@wearcheckrs.com';

-- Rynhardt Meyer → Riaan de Beer
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='riaandb@wearcheckrs.com')
  WHERE LOWER(email) = 'rynhardt@wearcheckrs.com';

-- Sergant Tlou → Eben Prinsloo
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='eben@wearcheckrs.com')
  WHERE LOWER(email) = 'sergent@wearcheckrs.com';

-- Shaun Janse van Rensburg → Johan Stols
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='johans@wearcheckrs.com')
  WHERE LOWER(email) = 'shaun@wearcheckrs.com';

-- Shivon Alberts → Megan Salzwedel
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='megan@wearcheckrs.com')
  WHERE LOWER(email) = 'shivon@wearcheckrs.com';

-- Simon Mosima → Tsietsi Monnanyane
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='tsietsi@wearcheckrs.com')
  WHERE LOWER(email) = 'simon@wearcheckrs.com';

-- Sipho Zwane → Francois Pienaar
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='francoisp@wearcheckrs.com')
  WHERE LOWER(email) IN ('sipho@wearcheckrs.com','siphoz@wearcheckrs.com');

-- Sipho Mathibela → Londolani Managa
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='londolanim@wearcheckrs.com')
  WHERE LOWER(email) = 'siphom@wearcheckrs.com';

-- Stephanie du Plessis → Francois Pienaar
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='francoisp@wearcheckrs.com')
  WHERE LOWER(email) = 'stephanie@wearcheckrs.com';

-- Thapelo Mohlala → Allan Stuurman (primary)
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='allan@wearcheckrs.com')
  WHERE LOWER(email) = 'thapelo@wearcheckrs.com';

-- Thomas Mdhlala → Micheal Pretorius
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='micheal@wearcheckrs.com')
  WHERE LOWER(email) = 'thomas@wearcheckrs.com';

-- Thulani Tembe → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'thulani@wearcheckrs.com';

-- Tonny Simelani → Eddie Pieterse Snr
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='epieterse@wearcheckrs.com')
  WHERE LOWER(email) = 'tonny@wearcheckrs.com';

-- Tsietsi Monnanyane → Peet Peacock
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='peet@wearcheckrs.com')
  WHERE LOWER(email) = 'tsietsi@wearcheckrs.com';

-- Wihan Willer → Francios Pretorius
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='franciosp@wearcheckrs.com')
  WHERE LOWER(email) = 'wihan@wearcheckrs.com';

-- Dejs Lecordeur → Johan Stols
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='johans@wearcheckrs.com')
  WHERE LOWER(email) = 'dejs@wearcheckrs.com';

-- Refuse Mpela → Johan Stols
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='johans@wearcheckrs.com')
  WHERE LOWER(email) = 'refuse@wearcheckrs.com';

-- Ryan Henwood → Johan Stols
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email)='johans@wearcheckrs.com')
  WHERE LOWER(email) = 'ryan@wearcheckrs.com';

-- ============================================================
-- 3. SITE UPDATES
--    Uses site codes from sites table
-- ============================================================

-- Roamer (SA-ROA)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-ROA')
  WHERE LOWER(email) IN (
    'a.ludick@wearcheckrs.com','david@wearcheckrs.com','deon@wearcheckrs.com',
    'eben@wearcheckrs.com','freddish@wearcheck.co.za','heinrich@wearcheckrs.com',
    'henry@wearcheckrs.com','jacodb@wearcheckrs.com','mornea@wearcheckrs.com',
    'sergent@wearcheckrs.com','dejs@wearcheckrs.com','refuse@wearcheckrs.com',
    'ryan@wearcheckrs.com'
  );

-- KwaZulu Natal - Hillside (SA-KZH)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-KZH')
  WHERE LOWER(email) IN (
    'adriaanb@wearcheckrs.com','francoisp@wearcheckrs.com',
    'sipho@wearcheckrs.com','siphoz@wearcheckrs.com'
  );

-- KwaZulu Natal - Tronox (SA-KZT)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-KZT')
  WHERE LOWER(email) IN ('rakcal@wearcheckrs.com','stephanie@wearcheckrs.com');

-- Valterra - Waterval (SA-WAT)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-WAT')
  WHERE LOWER(email) IN (
    'marshallr@wearcheckrs.com','douglas@wearcheckrs.com',
    'lloyd@wearcheckrs.com','riaandb@wearcheckrs.com','rynhardt@wearcheckrs.com'
  );

-- RBMR and PMR (SA-RBM)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-RBM')
  WHERE LOWER(email) IN (
    'alex@wearcheckrs.com','cj@wearcheckrs.com',
    'micheal@wearcheckrs.com','thomas@wearcheckrs.com'
  );

-- Samancor - Tweefontein (SA-TWF)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-TWF')
  WHERE LOWER(email) IN ('allan@wearcheckrs.com','thapelo@wearcheckrs.com');

-- Remote Centre (SA-REM)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-REM')
  WHERE LOWER(email) IN (
    'andrew@wearcheckrs.com','francoive@wearcheckrs.com',
    'jj@wearcheckrs.com','mornea@wearcheckrs.com','reinlerk@wearcheckrs.com'
  );

-- Valterra - Mototolo / Steelpoort (SA-MOT)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-MOT')
  WHERE LOWER(email) IN (
    'annahm@wearcheckrs.com','aubrey@wearcheckrs.com','chicco@wearcheckrs.com',
    'daniel@wearcheckrs.com','desmond@wearcheckrs.com','james@wearcheckrs.com',
    'leon@wearcheckrs.com','lopim@wearcheckrs.com','lopim@wearcheck.co.za',
    'michealm@wearcheckrs.com','betty@wearcheckrs.com','passwell@wearcheckrs.com',
    'permission@wearcheckrs.com'
  );

-- Longmeadow H/O (SA-HO)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-HO')
  WHERE LOWER(email) IN (
    'annemie@wearcheckrs.com','bianka@wearcheckrs.com','chrstene@wearcheckrs.com',
    'christene@wearcheckrs.com','edwardfp@wearcheckrs.com','jaco@wearcheckrs.com',
    'lesego@wearcheckrs.com','louis@wearcheckrs.com','mande@wearcheckrs.com',
    'mand@wearcheckrs.com','marcel@wearcheckrs.com','mariette@wearcheckrs.com',
    'megan@wearcheckrs.com','nadhira@wearcheckrs.com','peet@wearcheckrs.com',
    'philip@wearcheckrs.com','shivon@wearcheckrs.com'
  );

-- Mozambique (INT-MOZ)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='INT-MOZ')
  WHERE LOWER(email) IN (
    'armindo@wearcheckrs.com','davidi@wearcheckrs.com','isac@wearcheckrs.com',
    'isa@wearcheckrs.com','muhamad@wearcheckrs.com','placido@wearcheckrs.com',
    'riaandp@wearcheckrs.com'
  );

-- Eskom - Matimba (SA-MAT)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-MAT')
  WHERE LOWER(email) IN (
    'boitumeio@wearcheckrs.com','martiens@wearcheckrs.com',
    'simon@wearcheckrs.com','tsietsi@wearcheckrs.com'
  );

-- Springs (SA-SPR)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-SPR')
  WHERE LOWER(email) IN (
    'chrism@wearcheckrs.com','epieterse@wearcheckrs.com',
    'gustav@wearcheckrs.com','hannest@wearcheckrs.com','tonny@wearcheckrs.com'
  );

-- Neopak - Rosslyn (SA-NRP)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-NRP')
  WHERE LOWER(email) IN (
    'eugene@wearcheckrs.com','franciosp@wearcheckrs.com','wihan@wearcheckrs.com'
  );

-- Namibia - Walvis Bay (INT-NAW)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='INT-NAW')
  WHERE LOWER(email) IN (
    'dian@wearcheckrs.com','freddy-ben@wearcheckrs.com',
    'gabriel@wearcheckrs.com','rohan@wearcheckrs.com'
  );

-- Samancor - TAS (SA-TAS)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-TAS')
  WHERE LOWER(email) = 'heinc@wearcheckrs.com';

-- Samancor - MFC (SA-MFC)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-MFC')
  WHERE LOWER(email) IN (
    'londolanim@wearcheckrs.com','nomvulam@wearcheckrs.com','siphom@wearcheckrs.com'
  );

-- Samancor - Doornbosch (SA-DBB)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-DBB')
  WHERE LOWER(email) = 'lubby@wearcheckrs.com';

-- Samancor - Millcell (SA-MLC)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-MLC')
  WHERE LOWER(email) = 'thulani@wearcheckrs.com';

-- Seriti - Khutala (SA-KHU)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-KHU')
  WHERE LOWER(email) = 'percy@wearcheckrs.com';

-- Samancor - Mooinooi (SA-MOO)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-MOO')
  WHERE LOWER(email) IN ('johandro@wearcheckrs.com','johandra@wearcheckrs.com');

-- Kathu (SA-KAT)
UPDATE profiles SET site_id = (SELECT id FROM sites WHERE code='SA-KAT')
  WHERE LOWER(email) IN ('lucas@wearcheckrs.com','laas@wearcheckrs.com');

-- Clear site: Dyllen (TBC) and Shaun (GP Consult = not a site)
UPDATE profiles SET site_id = NULL
  WHERE LOWER(email) IN ('dyllen@wearcheckrs.com','shaun@wearcheckrs.com');
