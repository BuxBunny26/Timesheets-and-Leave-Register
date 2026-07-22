-- 081_notification_trigger_updates.sql
-- Updates notification trigger functions that embed raw leave_type text
-- to instead use leave_types.name via a lookup.
--
-- Affected triggers:
--   notify_leave_final_actioned  (migration 059) — embeds NEW.leave_type
--   notify_leave_submitted       (migration 010) — embeds leave_type
--
-- PREREQUISITE: migration 072 (leave_types) must be applied.
-- IDEMPOTENCY: CREATE OR REPLACE.

-- ── notify_leave_final_actioned ───────────────────────────────────────────────
-- Original in migration 059 used: NEW.leave_type || ' leave request'
-- Updated to resolve via leave_types.name using leave_type_id if available,
-- falling back to the legacy leave_type text for backward compatibility.

CREATE OR REPLACE FUNCTION notify_leave_final_actioned()
RETURNS TRIGGER AS $$
DECLARE
  v_leave_name TEXT;
BEGIN
  IF OLD.final_status = NEW.final_status THEN RETURN NEW; END IF;
  IF NEW.final_status NOT IN ('approved', 'denied', 'returned') THEN RETURN NEW; END IF;

  -- Resolve human-readable leave type name
  IF NEW.leave_type_id IS NOT NULL THEN
    SELECT name INTO v_leave_name FROM leave_types WHERE id = NEW.leave_type_id;
  END IF;
  v_leave_name := COALESCE(
    v_leave_name,
    initcap(REPLACE(NEW.leave_type, '_', ' ')) || ' Leave'
  );

  PERFORM create_notification(
    NEW.employee_id,
    'leave_final_' || NEW.final_status,
    'Leave request ' || NEW.final_status,
    v_leave_name || ' request (' ||
      to_char(NEW.start_date, 'DD Mon') || ' – ' ||
      to_char(NEW.end_date, 'DD Mon YYYY') ||
      ') has received final ' || NEW.final_status ||
      CASE WHEN NEW.final_comment IS NOT NULL
           THEN '. Note: ' || NEW.final_comment
           ELSE '' END,
    'leave_request',
    NEW.id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_leave_final_actioned ON leave_requests;
CREATE TRIGGER trg_notify_leave_final_actioned
  AFTER UPDATE OF final_status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION notify_leave_final_actioned();

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT routine_name FROM information_schema.routines
--  WHERE routine_name IN ('notify_leave_final_actioned')
--    AND routine_type = 'FUNCTION';
-- Expected: 1 row
