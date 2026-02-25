// Shared TypeScript types for the entire app
// These describe the shape of your data — think of them as blueprints

export type UserRole = "producer" | "editor" | "cinematographer" | "sound" | "pa" | "director";

export type ProjectStatus = "development" | "pre-production" | "production" | "post-production" | "delivered";

export interface Project {
  id: string;
  user_id: string;
  title: string;
  client: string | null;
  status: ProjectStatus;
  description: string | null;
  color: string; // hex color for calendar/UI display
  created_at: string;
  updated_at: string;
}

export interface ShootDay {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  date: string; // ISO date string
  location: string | null;
  call_time: string | null;
  wrap_time: string | null;
  notes: string | null;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  project_id: string | null;
  user_id: string;
  title: string;
  date: string;
  end_date: string | null;
  type: "shoot_day" | "deadline" | "meeting" | "milestone" | "other";
  color: string;
  notes: string | null;
  source: "manual" | "email" | "otter"; // where the event came from
  created_at: string;
}

export interface Note {
  id: string;
  project_id: string | null;
  user_id: string;
  title: string;
  content: string;
  source: "manual" | "dictation" | "otter";
  roles: UserRole[]; // which crew roles this note is relevant to
  transcript_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string | null;
  note_id: string | null;
  user_id: string;
  title: string;
  completed: boolean;
  assigned_role: UserRole | null;
  due_date: string | null;
  created_at: string;
}

export interface TeamBrief {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  content: string;
  target_roles: UserRole[];
  shared_at: string | null;
  created_at: string;
  updated_at: string;
}
