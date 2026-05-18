-- Add job_title column to profiles (stores the employee's position/role description)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_title TEXT;
