import { Task } from "@/types/carrymate";
import { TaskRow } from "@/lib/supabase/tasks";

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
