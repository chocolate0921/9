import { Task, TeamMember } from "@/types/carrymate";
import { TeamMemberRow } from "@/lib/supabase/team-members";
import { TaskRow } from "@/lib/supabase/tasks";
import { TeamRow } from "@/lib/supabase/teams";
import { formatDeadlineLabel } from "@/lib/carrymate/project-dates";
import { Project } from "@/types/carrymate";

export function isUuid(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function formatTaskDueLabel(dueAt?: string | null, completedAt?: string | null) {
  if (completedAt) {
    return "완료";
  }

  if (!dueAt) {
    return "일정 미정";
  }

  const dueDate = new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) {
    return "일정 미정";
  }

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startOfDueDate = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  );

  const diffDays = Math.round(
    (startOfDueDate.getTime() - startOfToday.getTime()) / 86400000,
  );

  if (diffDays === 0) {
    return "오늘";
  }

  if (diffDays === 1) {
    return "내일";
  }

  return `${dueDate.getMonth() + 1}월 ${dueDate.getDate()}일`;
}

export function mapTaskRowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    assigneeId: row.assignee_id,
    status: row.status,
    priority: row.priority,
    dueLabel: formatTaskDueLabel(row.due_at, row.completed_at),
    dueAt: row.due_at,
    aiSuggestedRole: row.ai_suggested_role ?? undefined,
    completedAt: row.completed_at,
  };
}

export function mapTaskRowsToTasks(rows: TaskRow[]) {
  return rows.map(mapTaskRowToTask);
}

export function mapTeamRowToProject(row: TeamRow): Project {
  return {
    id: row.id,
    name: row.team_name,
    courseName: row.course_name,
    deadlineLabel:
      row.deadline_label || (row.end_date ? formatDeadlineLabel(row.end_date) : ""),
    inviteCode: row.invite_code,
    description: row.description ?? undefined,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
  };
}

export function mapTeamMemberRowToTeamMember(row: TeamMemberRow): TeamMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    skillTag: row.skill_tag,
    isLeader: row.is_leader,
    availability: [],
    status: row.status === "active" ? "active" : "former",
  };
}

export function mapTeamMemberRowsToTeamMembers(rows: TeamMemberRow[]) {
  return rows.map(mapTeamMemberRowToTeamMember);
}
