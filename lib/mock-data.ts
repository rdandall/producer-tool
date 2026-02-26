// Realistic mock data — will be replaced with Supabase queries
// This lets us build and design with real-feeling content

export type ProjectStatus =
  | "idea"
  | "pre-production"
  | "filming"
  | "editing"
  | "review"
  | "delivered";

export type EditStatus =
  | "not-started"
  | "in-progress"
  | "draft-sent"
  | "changes-requested"
  | "approved";

export interface EditVersion {
  version: number;
  label: string; // "v1", "v2", etc.
  status: EditStatus;
  sentAt: string | null;
  notes: string | null;
  frameioLink: string | null;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  projectId: string | null;
  dueDate: string | null;
  priority: "high" | "medium" | "low";
}

export interface Project {
  id: string;
  title: string;
  client: string;
  status: ProjectStatus;
  brief: string;
  dueDate: string;
  frameioLink: string | null;
  driveLink: string | null;
  editorName: string | null;
  editorEmail: string | null;
  clientEmail: string | null;
  color: string;
  editVersions: EditVersion[];
  tasks: Task[];
  createdAt: string;
}

export const PROJECTS: Project[] = [
  {
    id: "nike-brand-film",
    title: "Brand Film",
    client: "Nike",
    status: "filming",
    brief:
      "A 90-second brand film for Nike's Spring 2026 running campaign. Focus on everyday athletes in urban environments. Tone: gritty, real, aspirational. Deliverables: 1x 90s hero film, 3x 15s cutdowns for social.",
    dueDate: "2026-03-28",
    frameioLink: "https://app.frame.io/reviews/...",
    driveLink: null,
    editorName: "James Okafor",
    editorEmail: "james@edithaus.co",
    clientEmail: "marketing@nike.com",
    color: "#f59e0b",
    editVersions: [
      {
        version: 1,
        label: "v1",
        status: "approved",
        sentAt: "2026-01-10",
        notes: "Rough cut. Client happy with pacing, requested colour grade adjustment.",
        frameioLink: "https://app.frame.io/reviews/v1",
      },
      {
        version: 2,
        label: "v2",
        status: "changes-requested",
        sentAt: "2026-02-01",
        notes: "Colour graded. Client wants the final 10 seconds reworked.",
        frameioLink: "https://app.frame.io/reviews/v2",
      },
      {
        version: 3,
        label: "v3",
        status: "in-progress",
        sentAt: null,
        notes: "Final 10s rework in progress.",
        frameioLink: null,
      },
    ],
    tasks: [
      { id: "t1", title: "Confirm shoot locations for day 3", completed: false, projectId: "nike-brand-film", dueDate: "2026-02-25", priority: "high" },
      { id: "t2", title: "Send v3 to James once ready", completed: false, projectId: "nike-brand-film", dueDate: "2026-03-01", priority: "high" },
      { id: "t3", title: "Book colour grade suite", completed: true, projectId: "nike-brand-film", dueDate: null, priority: "medium" },
      { id: "t4", title: "Deliver social cutdowns", completed: false, projectId: "nike-brand-film", dueDate: "2026-03-28", priority: "medium" },
    ],
    createdAt: "2026-01-15",
  },
  {
    id: "aesop-product-launch",
    title: "Product Launch Film",
    client: "Aesop",
    status: "editing",
    brief:
      "A slow, tactile product film launching Aesop's new body care range. No dialogue. Focus on texture, light, and ritual. 60 seconds. Deliver in 4K. Tone: quiet luxury.",
    dueDate: "2026-04-10",
    frameioLink: "https://app.frame.io/reviews/aesop",
    driveLink: "https://drive.google.com/...",
    editorName: "James Okafor",
    editorEmail: "james@edithaus.co",
    clientEmail: "content@aesop.com",
    color: "#8b5cf6",
    editVersions: [
      {
        version: 1,
        label: "v1",
        status: "draft-sent",
        sentAt: "2026-02-15",
        notes: "First assembly cut sent to client.",
        frameioLink: "https://app.frame.io/reviews/aesop-v1",
      },
    ],
    tasks: [
      { id: "t5", title: "Review v1 and send notes to James", completed: false, projectId: "aesop-product-launch", dueDate: "2026-02-26", priority: "high" },
      { id: "t6", title: "Confirm music licence", completed: false, projectId: "aesop-product-launch", dueDate: "2026-03-05", priority: "medium" },
    ],
    createdAt: "2026-02-01",
  },
  {
    id: "studio-content-march",
    title: "March Content Pack",
    client: "Studio Selects",
    status: "idea",
    brief:
      "Monthly content pack for Studio Selects Instagram and TikTok. 8x short-form videos (15–30s each). Shoot 2 days in studio. Lifestyle and product mixed.",
    dueDate: "2026-03-31",
    frameioLink: null,
    driveLink: null,
    editorName: null,
    editorEmail: null,
    clientEmail: "hi@studioselects.com",
    color: "#3b82f6",
    editVersions: [],
    tasks: [
      { id: "t7", title: "Confirm concept with client", completed: false, projectId: "studio-content-march", dueDate: "2026-02-28", priority: "high" },
      { id: "t8", title: "Book studio space for March 10–11", completed: false, projectId: "studio-content-march", dueDate: "2026-02-28", priority: "high" },
    ],
    createdAt: "2026-02-20",
  },
];

export const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  idea: {
    label: "Idea",
    color: "text-zinc-400",
    bg: "bg-zinc-400/10",
    dot: "bg-zinc-400",
  },
  "pre-production": {
    label: "Pre-Production",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    dot: "bg-blue-400",
  },
  filming: {
    label: "Filming",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    dot: "bg-amber-400",
  },
  editing: {
    label: "Editing",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    dot: "bg-purple-400",
  },
  review: {
    label: "In Review",
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    dot: "bg-orange-400",
  },
  delivered: {
    label: "Delivered",
    color: "text-green-400",
    bg: "bg-green-400/10",
    dot: "bg-green-400",
  },
};

export const EDIT_STATUS_CONFIG: Record<
  EditStatus,
  { label: string; color: string }
> = {
  "not-started": { label: "Not started", color: "text-zinc-500" },
  "in-progress": { label: "In progress", color: "text-blue-400" },
  "draft-sent": { label: "Draft sent", color: "text-amber-400" },
  "changes-requested": { label: "Changes requested", color: "text-orange-400" },
  approved: { label: "Approved", color: "text-green-400" },
};

// All tasks across all projects, plus standalone tasks
export const ALL_TASKS: Task[] = [
  ...PROJECTS.flatMap((p) => p.tasks),
  {
    id: "global-1",
    title: "Renew Premiere Pro licence",
    completed: false,
    projectId: null,
    dueDate: "2026-03-01",
    priority: "low",
  },
  {
    id: "global-2",
    title: "Chase James re: invoice",
    completed: false,
    projectId: null,
    dueDate: "2026-02-26",
    priority: "medium",
  },
];
