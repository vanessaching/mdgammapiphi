export type Permissions = {
  is_member: boolean;
  is_president: boolean;
  is_exec: boolean;
  is_vpo: boolean;
  can_manage_attendance: boolean;
  rank: number;
};

export type RoleTier = "president" | "exec" | "director" | "committee" | "member";
export type Role = { id: string; key: string; name: string; tier: RoleTier; is_system: boolean; sort_order: number };

export type EventRow = {
  id: string;
  google_event_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  is_required: boolean;
  points: number;
  excusal_deadline_hours: number;
  allow_emergency: boolean;
  cancelled: boolean;
  attendance_taken: boolean;
};

export type ExcusalStatus = "pending" | "approved" | "rejected";
export type TaskStatus = "todo" | "in_progress" | "done";

export type MemberStats = {
  user_id: string;
  full_name: string;
  points: number;
  events_attended: number;
  required_total: number;
  required_attended: number;
  required_excused: number;
  attendance_pct: number | null;
};
