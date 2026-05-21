-- 047_dedupe_legacy_ghost_weeks.sql
-- Cleans up legacy timesheet_weeks rows whose week_start is not a true Monday
-- (the canonical start of week). These ghosts cause duplicate entries in the
-- Timesheets History list (e.g. "10 May 2026 - 17 May 2026" Draft showing
-- next to the real "11 May - 17 May" Resubmitted row).
--
-- Strategy:
--   1. For each ghost row (dow(week_start) <> 1), find the true Monday for
--      that week (date_trunc('week', week_start)::DATE).
--   2. If a real Monday-aligned row exists for the same employee + week,
--      delete the ghost (timesheet_days cascade-delete via FK).
--      Status precedence: real row wins regardless of its status.
--   3. If no Monday-aligned counterpart exists, promote the ghost: set its
--      week_start to the true Monday and week_end to that Monday + 6 days.
--
-- After this migration the History page and verification trigger will see a
-- single canonical row per employee-week.

DO $$
DECLARE
  ghost RECORD;
  true_monday DATE;
  has_real BOOLEAN;
BEGIN
  FOR ghost IN
    SELECT id, employee_id, week_start
      FROM timesheet_weeks
     WHERE EXTRACT(ISODOW FROM week_start) <> 1
  LOOP
    true_monday := date_trunc('week', ghost.week_start)::DATE;
    SELECT EXISTS (
      SELECT 1 FROM timesheet_weeks
       WHERE employee_id = ghost.employee_id
         AND week_start = true_monday
         AND id <> ghost.id
    ) INTO has_real;

    IF has_real THEN
      -- Ghost is a duplicate. ot_approvals -> timesheet_days FK does not
      -- cascade, so remove approval rows tied to the ghost's days first.
      DELETE FROM ot_approvals
       WHERE timesheet_day_id IN (
         SELECT id FROM timesheet_days WHERE timesheet_week_id = ghost.id
       );
      DELETE FROM timesheet_weeks WHERE id = ghost.id;
    ELSE
      -- Promote the ghost to the true Monday.
      UPDATE timesheet_weeks
         SET week_start = true_monday,
             week_end   = true_monday + INTERVAL '6 days'
       WHERE id = ghost.id;
    END IF;
  END LOOP;
END $$;

-- Add a guard so future inserts/updates can't drift off a Monday again.
CREATE OR REPLACE FUNCTION enforce_monday_week_start()
RETURNS TRIGGER AS $$
BEGIN
  IF EXTRACT(ISODOW FROM NEW.week_start) <> 1 THEN
    NEW.week_start := date_trunc('week', NEW.week_start)::DATE;
    NEW.week_end   := NEW.week_start + INTERVAL '6 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_monday_week_start ON timesheet_weeks;
CREATE TRIGGER trg_enforce_monday_week_start
  BEFORE INSERT OR UPDATE OF week_start ON timesheet_weeks
  FOR EACH ROW EXECUTE FUNCTION enforce_monday_week_start();
