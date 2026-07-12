import { Task, TeamMember } from "@/types/carrymate";
import { TeamMemberRow } from "@/lib/supabase/team-members";
import { TaskRow } from "@/lib/supabase/tasks";
import { TeamRow } from "@/lib/supabase/teams";
import { formatDeadlineLabel } from "@/lib/carrymate/project-dates";
import {
  ConfirmedMeeting,
  MeetingActionItem,
  MeetingMessage,
  MeetingNote,
  Project,
} from "@/types/carrymate";
import {
  MeetingMessageRow,
  MeetingNoteRow,
  MeetingRow,
} from "@/lib/supabase/meetings";

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

function formatMeetingDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "회의 일정";
  }

  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return "오늘";
  }

  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatMeetingTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function mapMeetingRowToConfirmedMeeting(row: MeetingRow): ConfirmedMeeting {
  const isEnded =
    Boolean(row.ends_at) &&
    new Date(row.ends_at as string).getTime() <= Date.now();

  return {
    id: row.id,
    title: row.title,
    dateLabel: formatMeetingDateLabel(row.starts_at),
    timeRange: `${formatMeetingTime(row.starts_at)} - ${row.ends_at ? formatMeetingTime(row.ends_at) : "진행 중"}`,
    attendeeCount: 0,
    createdByMemberId: row.created_by,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    teamId: row.team_id,
    isEnded,
  };
}

export function mapMeetingRowsToConfirmedMeetings(rows: MeetingRow[]) {
  return rows.map(mapMeetingRowToConfirmedMeeting);
}

export function mapMeetingMessageRowToMeetingMessage(
  row: MeetingMessageRow,
): MeetingMessage {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    memberId: row.member_id,
    senderName: row.sender_name,
    message: row.message,
    createdAt: row.created_at,
  };
}

export function mapMeetingMessageRowsToMeetingMessages(rows: MeetingMessageRow[]) {
  return rows.map(mapMeetingMessageRowToMeetingMessage);
}

function normalizeDecisionList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeActionItemList(value: unknown): MeetingActionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title : "";
      if (!title) {
        return null;
      }

      return {
        title,
        assigneeName:
          typeof record.assigneeName === "string" ? record.assigneeName : "",
        dueDateOffsetDays:
          typeof record.dueDateOffsetDays === "number" &&
          Number.isFinite(record.dueDateOffsetDays)
            ? Math.round(record.dueDateOffsetDays)
            : 3,
      };
    })
    .filter((item): item is MeetingActionItem => Boolean(item));
}

export function mapMeetingNoteRowToMeetingNote(row: MeetingNoteRow): MeetingNote {
  return {
    id: row.id,
    teamId: row.team_id,
    meetingId: row.meeting_id,
    title: row.title,
    content: row.content,
    aiSummary: row.ai_summary,
    aiDecisions: normalizeDecisionList(row.ai_decisions),
    aiActionItems: normalizeActionItemList(row.ai_action_items),
    createdAt: row.created_at,
  };
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
