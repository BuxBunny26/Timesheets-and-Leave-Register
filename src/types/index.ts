export type Role = 'employee' | 'supervisor' | 'manager' | 'admin_manager' | 'system_admin'
export type DayStatus = 'present' | 'leave' | 'sick' | 'awol' | 'public_holiday' | 'standby'
export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type LeaveType = 'annual' | 'sick' | 'family' | 'study' | 'unpaid' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'denied' | 'cancelled'
export type OTApprovalStatus = 'pending' | 'approved' | 'denied'
export type CountryCode = 'ZA' | 'MZ' | 'NA'

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
  job_title: string | null
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
  resubmission_count: number
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
  overtime_reason: string | null
  standby_flag: boolean
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
  leave_year: number | null
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

export type DocumentCategory =
  | 'sick_note'
  | 'doctors_certificate'
  | 'medical_report'
  | 'leave_form'
  | 'id_document'
  | 'overtime_form'
  | 'payslip'
  | 'contract'
  | 'accident_report'
  | 'affidavit'
  | 'other'

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  sick_note: 'Sick Note',
  doctors_certificate: "Doctor's Certificate",
  medical_report: 'Medical Report',
  leave_form: 'Leave Form',
  id_document: 'ID Document',
  overtime_form: 'Overtime Form',
  payslip: 'Payslip',
  contract: 'Contract',
  accident_report: 'Accident Report',
  affidavit: 'Affidavit',
  other: 'Misc Documents',
}

export const DOCUMENT_CATEGORY_COLOURS: Record<DocumentCategory, string> = {
  sick_note: 'bg-red-100 text-red-700',
  doctors_certificate: 'bg-rose-100 text-rose-700',
  medical_report: 'bg-pink-100 text-pink-700',
  leave_form: 'bg-blue-100 text-blue-700',
  id_document: 'bg-indigo-100 text-indigo-700',
  overtime_form: 'bg-amber-100 text-amber-700',
  payslip: 'bg-emerald-100 text-emerald-700',
  contract: 'bg-violet-100 text-violet-700',
  accident_report: 'bg-orange-100 text-orange-700',
  affidavit: 'bg-cyan-100 text-cyan-700',
  other: 'bg-gray-100 text-gray-600',
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
  // AI classification fields (populated async after upload)
  category: DocumentCategory | null
  ai_display_name: string | null
  ai_classified_at: string | null
  // joined
  uploader?: Pick<Profile, 'id' | 'first_name' | 'surname'>
}

export type BalanceLeaveType = 'annual' | 'sick' | 'family' | 'study'

export interface LeaveBalance {
  id: string
  employee_id: string
  leave_type: BalanceLeaveType
  year: number
  total_days: number
  used_days: number
  created_at: string
  updated_at: string
  // joined
  employee?: Profile
}

export interface TimesheetVerification {
  id: string
  employee_id: string
  week_start: string
  period_month: string | null
  status: 'pending' | 'verified' | 'disputed'
  dispute_note: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
  // joined
  employee?: Profile
}

export interface AuditLog {
  id: string
  actor_id: string | null
  action_type: string
  entity_type: string | null
  entity_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
  // joined
  actor?: Pick<Profile, 'id' | 'first_name' | 'surname'>
}

// ============================================================
// Employee Directory (HR fields, dependants, certifications)
// ============================================================

export interface EmployeeDetails {
  employee_id: string

  id_attached: boolean
  has_passport: boolean
  passport_number: string | null
  passport_expiry: string | null
  passport_attached: boolean

  cell_phone_contract_owner: string | null
  service_provider: string | null
  whatsapp_number: string | null
  personal_email: string | null

  has_drivers_licence: boolean
  drivers_licence_number: string | null
  drivers_licence_expiry: string | null
  drivers_licence_attached: boolean

  has_medical_aid: boolean
  medical_aid_provider: string | null
  medical_aid_number: string | null
  medical_practitioner_name: string | null
  doctor_contact_number: string | null
  allergies_diet: string | null

  home_address: string | null
  complex_street_name: string | null
  suburb: string | null
  city: string | null
  province: string | null
  country: string | null
  postal_code: string | null
  home_pin_location: string | null

  next_of_kin_name: string | null
  next_of_kin_relationship: string | null
  next_of_kin_contact: string | null

  matric: boolean
  matric_year: number | null
  trade_certificate: string | null
  diplomas_degrees: string | null
  other_qualification: string | null
  start_date: string | null

  comp_alignment: boolean
  comp_balancing: boolean
  comp_vibration: boolean
  comp_sampling: boolean
  comp_thermography: boolean
  comp_motor_circuit_analysis: boolean
  comp_vibration_monitoring: boolean

  created_at: string
  updated_at: string
}

export interface EmployeeDependant {
  id: string
  employee_id: string
  name: string
  date_of_birth: string | null
  notes: string | null
  created_at: string
}

export interface CertificationType {
  id: string
  code: string
  name: string
  category: string | null
  display_order: number
}

export interface EmployeeCertification {
  id: string
  employee_id: string
  certification_type_id: string
  has_certification: boolean
  expiry_date: string | null
  attached: boolean
  notes: string | null
  created_at: string
  updated_at: string
  // joined
  certification_type?: CertificationType
}
