export type Role = 'employee' | 'supervisor' | 'manager' | 'admin_manager' | 'system_admin'
export type DayStatus = 'present' | 'leave' | 'sick' | 'awol' | 'public_holiday' | 'standby'
export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type LeaveType = 'annual' | 'sick' | 'family' | 'study' | 'unpaid' | 'other'
export type BalanceLeaveType = 'annual' | 'sick' | 'family' | 'study'
export type LeaveStatus = 'pending' | 'approved' | 'denied' | 'cancelled'
export type OTApprovalStatus = 'pending' | 'approved' | 'denied'
export type CountryCode = 'ZA' | 'MZ' | 'NA'
export type VerificationStatus = 'pending' | 'verified' | 'overdue' | 'disputed'

export interface Division {
  id: string
  code: string
  name: string
}

export interface Department {
  id: string
  code: string
  name: string
  division_code: string
}

export interface PaymentCentre {
  id: string
  code: string
  name: string
}

export interface Site {
  id: string
  code: string
  name: string
  city: string | null
  province: string | null
  country_code: CountryCode
}

export interface Profile {
  id: string
  employee_code: string | null
  first_name: string
  surname: string
  email: string
  cell_number: string | null
  division_id: string | null
  department_id: string | null
  payment_centre_id: string | null
  site_id: string | null
  supervisor_id: string | null
  role: Role
  country_code: CountryCode
  status: 'active' | 'inactive'
  preferred_name: string | null
  phone: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
  // joined fields
  division?: Division
  department?: Department
  payment_centre?: PaymentCentre
  site?: Site
  supervisor?: Profile
}

export interface TimesheetWeek {
  id: string
  employee_id: string
  week_start: string
  week_end: string
  status: TimesheetStatus
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  reviewer_comment: string | null
  created_at: string
  updated_at: string
  // joined
  employee?: Profile
  days?: TimesheetDay[]
}

export interface TimesheetDay {
  id: string
  timesheet_week_id: string
  date: string
  day_of_week: string
  primary_status: DayStatus
  overtime_flag: boolean
  overtime_hours: number | null
  lol_flag: boolean
  loi_flag: boolean
  notes: string | null
  is_locked: boolean
}

export interface OTApproval {
  id: string
  timesheet_day_id: string
  employee_id: string
  approver_id: string | null
  status: OTApprovalStatus
  approver_comment: string | null
  submitted_at: string
  actioned_at: string | null
}

export interface LeaveRequest {
  id: string
  employee_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  total_days: number
  reason: string | null
  status: LeaveStatus
  supervisor_id: string | null
  supervisor_comment: string | null
  submitted_at: string
  actioned_at: string | null
  // joined
  employee?: Profile
}

export interface Notification {
  id: string
  recipient_id: string
  type: string
  title: string
  message: string
  is_read: boolean
  related_entity_type: string | null
  related_entity_id: string | null
  created_at: string
}

export interface PublicHoliday {
  id: string
  date: string
  name: string
  country_code: CountryCode
  is_custom: boolean
}

export interface Attachment {
  id: string
  linked_to_type: 'timesheet' | 'leave_request'
  linked_to_id: string
  display_name: string
  storage_path: string
  file_size_bytes: number | null
  mime_type: string | null
  uploaded_by: string | null
  uploaded_at: string
}

export interface TimesheetVerification {
  id: string
  employee_id: string
  period_month: string // 'YYYY-MM'
  status: VerificationStatus
  verified_at: string | null
  dispute_note: string | null
  dispute_flagged_to: string | null
  updated_at: string
  // joined
  employee?: Profile
}

export interface LeaveBalance {
  id: string
  employee_id: string
  leave_type: BalanceLeaveType
  year: number
  total_days: number
  used_days: number
  updated_at: string
  // computed helper
  remaining_days?: number
  // joined
  employee?: Profile
}

export interface AuditLog {
  id: string
  actor_id: string | null
  action_type: string
  entity_type: string
  entity_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  // joined
  actor?: Profile
}
