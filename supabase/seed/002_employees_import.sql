-- Employee staging table for bulk import (not kept in production schema)
-- This is run once during initial setup with Supabase service role
-- After auth users are created via Admin API, run 003_link_employees.sql

-- Example: creating auth users is done via Supabase Admin API or Supabase Dashboard
-- Each employee gets: email as login, temporary password 'WearCheck@2024!'
-- Their employee_code, role, first_name, surname are stored in user_metadata

-- This file documents the employee list for reference during setup:

/*
EMPLOYEE IMPORT LIST (use Supabase Admin API or Dashboard to create auth users)
Format: employee_code | first_name | surname | email | division | department | payment_centre | site_code | role | supervisor_code

WC253 | Philip    | Schutte  | philip@wearcheckrs.com        | ARC | ARC-RCM | WEARCHECK | SA-HO | manager | (none)
WC319 | Annemie   | Willer   | annemie@wearcheckrs.com       | ARC | ARC-RCM | WEARCHECK | SA-HO | manager | WC253
WC352 | Jaco      | Willer   | jaco@wearcheckrs.com          | ARC | ARC-RCM | WEARCHECK | SA-HO | manager | WC253
WC508 | Johan     | Stols    | Johans@wearcheckrs.com        | AFS | AFS-TC  | WEARCHECK | SA-HO | manager | WC253
WC504 | Roger     | Henwood  | rogerh@wearcheckrs.com        | AFS | AFS-RCA | WEARCHECK | SA-HO | manager | WC253
WC492 | Adri      | Ludick   | a.ludick@wearcheckRS.com      | AFS | AFS-NDT | WEARCHECK | SA-HO | manager | WC253

IMPORT STEPS:
1. Use Supabase Admin API (POST /auth/v1/admin/users) for each employee with:
   {
     "email": "<email>",
     "password": "WearCheck@2024!",
     "email_confirm": true,
     "user_metadata": {
       "first_name": "<first_name>",
       "surname": "<surname>",
       "employee_code": "<code>",
       "role": "<role>"
     }
   }
2. The on_auth_user_created trigger will auto-create a profile row.
3. Run 003_link_employees.sql to set org structure (division, department, site, supervisor).
*/

-- Two-pass approach explanation:
-- Pass 1: Update each profile with division_id, department_id, payment_centre_id, site_id, employee_code, role
-- Pass 2: Set supervisor_id (requires all employees to exist first so UUIDs are available)
-- This avoids foreign key constraint issues when employees supervise each other.
