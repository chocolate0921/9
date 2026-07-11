export type TabId = "home" | "tasks" | "schedule" | "files";

export type HealthStatus = "safe" | "warning" | "risk";
export type TaskStatus = "todo" | "inProgress" | "done";
export type TaskPriority = "high" | "medium" | "low";
export type FileCategory = "minutes" | "materials" | "links";

export type Project = {
  id: string;
  name: string;
  courseName: string;
  deadlineLabel: string;
  inviteCode?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
};

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  skillTag: string;
  isLeader?: boolean;
  availability: string[];
  status: "active" | "former";
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  assigneeId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueLabel: string;
  dueAt?: string | null;
  aiSuggestedRole?: string;
  completedAt?: string | null;
};

export type ScheduleSlot = {
  id: string;
  label: string;
  dateLabel: string;
  timeRange: string;
  memberIds: string[];
  recommended: boolean;
};

export type ConfirmedMeeting = {
  id: string;
  title: string;
  dateLabel: string;
  timeRange: string;
  attendeeCount: number;
  createdByMemberId?: string | null;
};

export type FileItem = {
  id: string;
  name: string;
  category: FileCategory;
  uploadedBy: string;
  uploadedByMemberId?: string | null;
  uploadedAt: string;
  statusLabel: "초안" | "검토중" | "최종본";
  isFinal: boolean;
};
