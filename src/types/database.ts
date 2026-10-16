import type { AppModule, PermAction, RoleKey } from './permissions';

export type MembershipStatus = 'active' | 'frozen' | 'expired' | 'debtor' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'wallet';
export type PlanKind = 'daily' | 'monthly' | 'quarterly' | 'annual' | 'class_pack';
export type CheckinResult = 'granted' | 'warning' | 'denied';
export type RegisterStatus = 'open' | 'closed';
export type SaleKind = 'product' | 'membership';
export type BookingStatus = 'booked' | 'attended' | 'cancelled';
export type Discipline = 'CrossFit' | 'Spinning' | 'Yoga' | 'Funcional' | 'Otro';
export type Currency = 'S/' | '$' | '€';

export interface OpeningHours {
  weekdays: string;
  saturday: string;
  sunday: string;
}

export interface BusinessSettings {
  id: number;
  name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: Currency;
  timezone: string;
  logo_path: string | null;
  payment_qr_path: string | null;
  freeze_max_days: number;
  tolerance_days: number;
  expiry_warning_days: number;
  opening_hours: OpeningHours;
  notifications_enabled: boolean;
  reminder_days_before: number;
  whatsapp_webhook_url: string | null;
  email_webhook_url: string | null;
  reminder_template: string;
  updated_at: string;
}

export interface Role {
  id: string;
  key: RoleKey;
  name: string;
  description: string | null;
  is_system: boolean;
}

export interface Permission {
  id: string;
  module: AppModule;
  action: PermAction;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role_id: string | null;
  branch_id: string | null;
  avatar_path: string | null;
  active: boolean;
  created_at: string;
}

export interface ProfileWithRole extends Profile {
  role: Pick<Role, 'id' | 'key' | 'name'> | null;
}

export interface Member {
  id: string;
  dni: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  gender: 'M' | 'F' | 'O' | null;
  photo_path: string | null;
  medical_notes: string | null;
  emergency_contact: string | null;
  qr_token: string;
  status: MembershipStatus;
  trainer_id: string | null;
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  name: string;
  kind: PlanKind;
  duration_days: number;
  price: number;
  class_credits: number | null;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface Membership {
  id: string;
  member_id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  price: number;
  amount_paid: number;
  status: MembershipStatus;
  frozen_at: string | null;
  freeze_days_used: number;
  sale_id: string | null;
  created_at: string;
}

export interface MembershipWithPlan extends Membership {
  plan: Pick<Plan, 'id' | 'name' | 'kind'> | null;
}

export interface Attendance {
  id: string;
  member_id: string;
  membership_id: string | null;
  checked_in_at: string;
  result: CheckinResult;
  reason: string | null;
  checked_by: string | null;
}

export interface CashRegister {
  id: string;
  opened_by: string;
  opened_at: string;
  opening_amount: number;
  closed_by: string | null;
  closed_at: string | null;
  expected_amount: number | null;
  declared_amount: number | null;
  difference: number | null;
  status: RegisterStatus;
  notes: string | null;
}

export interface Product {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  active: boolean;
  created_at: string;
}

export interface Sale {
  id: string;
  cash_register_id: string;
  member_id: string | null;
  kind: SaleKind;
  payment_method: PaymentMethod;
  total: number;
  created_by: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  plan_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  notes?: string;
}

export interface Routine {
  id: string;
  member_id: string;
  trainer_id: string | null;
  title: string;
  goal: string | null;
  exercises: Exercise[];
  start_date: string;
  end_date: string | null;
  active: boolean;
  created_at: string;
}

export interface GroupClass {
  id: string;
  name: string;
  discipline: Discipline;
  trainer_id: string | null;
  starts_at: string;
  duration_min: number;
  capacity: number;
  location: string | null;
  created_at: string;
}

export interface ClassBooking {
  id: string;
  class_id: string;
  member_id: string;
  status: BookingStatus;
  created_at: string;
}

export interface CheckinResponse {
  result: CheckinResult | 'not_found';
  reason: string;
  member_id?: string;
  full_name?: string;
  dni?: string;
  photo_path?: string | null;
  medical_notes?: string | null;
  plan_name?: string | null;
  end_date?: string | null;
  days_left?: number | null;
  debt?: number;
}

export interface CashSummary {
  register_id: string;
  status: RegisterStatus;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  by_method: Partial<Record<PaymentMethod, number>>;
  sales_total: number;
  sales_count: number;
  expected_cash: number;
  declared_amount: number | null;
  difference: number | null;
}

export interface DashboardStats {
  active_members: number;
  debtor_members: number;
  expiring_soon: number;
  checkins_today: number;
  revenue_today: number | null;
  revenue_month: number | null;
}

export interface RevenueRow {
  day: string;
  payment_method: PaymentMethod;
  kind: SaleKind;
  total: number;
  sales_count: number;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
