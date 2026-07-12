"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { FileTab } from "@/components/file-tab";
import { HomeTab } from "@/components/home-tab";
import { MeetingRoomSheet } from "@/components/meeting-room-sheet";
import { ScheduleTab } from "@/components/schedule-tab";
import { TaskTab } from "@/components/task-tab";
import { getDemoWorkspace } from "@/data/carrymate";
import {
  formatTaskDueLabel,
  getMeetingStatus,
  isUuid,
  mapMeetingRowsToConfirmedMeetings,
  mapTeamRowToProject,
  mapTaskRowsToTasks,
  mapTeamMemberRowsToTeamMembers,
} from "@/lib/mappers/carrymate";
import { formatDeadlineLabel } from "@/lib/carrymate/project-dates";
import {
  createMeeting,
  getMeetingsByTeam,
} from "@/lib/supabase/meetings";
import {
  createTask,
  getTasksByTeam,
  updateTaskFields,
} from "@/lib/supabase/tasks";
import {
  connectProfileToTeamMember,
  createAndLinkTeamMember,
  createTeamMembers,
  getTeamMemberByProfile,
  getTeamMembersByTeam,
  getTeamsForProfile,
  getUnlinkedTeamMembersByTeam,
  type ProfileTeamSummary,
  type CreateTeamMemberSeed,
  type TeamMemberRow,
} from "@/lib/supabase/team-members";
import {
  getCurrentSession,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  subscribeToAuthChanges,
} from "@/lib/supabase/auth";
import {
  generateInviteCode,
  getTeamById,
  getTeamByInviteCode,
  normalizeInviteCode,
  saveTeamToSupabase,
} from "@/lib/supabase/teams";
import {
  ConfirmedMeeting,
  FileCategory,
  FileItem,
  HealthStatus,
  MeetingActionItem,
  Project,
  ScheduleSlot,
  TabId,
  Task,
  TaskStatus,
  TeamMember,
} from "@/types/carrymate";

type ViewMode = "onboarding" | "workspace";
type WorkspaceSheetMode = "task" | "schedule" | "meeting" | "file" | null;
type OnboardingSheetMode =
  | "createTeam"
  | "joinTeam"
  | "joinLink"
  | "joinQr"
  | "shareInvite"
  | null;
type AuthMode = "signIn" | "signUp";

type ProjectSummary = {
  totalCount: number;
  todayTaskCount: number;
  todoCount: number;
  inProgressCount: number;
  doneCount: number;
  overdueCount: number;
  unassignedCount: number;
  urgentTask?: Task;
  progress: number;
  healthScore: number;
  healthStatus: HealthStatus;
  briefing: string;
};

const DEFAULT_AVAILABILITY = ["수 18:00", "목 14:00", "목 19:00"];
const ROLE_POOL = ["팀장 / 진행 정리", "자료 조사", "디자인", "문서 작성"];
const SKILL_POOL = ["정리형", "리서치형", "비주얼형", "문서형"];
const DEMO_INVITE_CODE = "CARRY2026";
const LAST_TEAM_ID_STORAGE_KEY = "carrymate:last-team-id";
const LAST_TAB_STORAGE_KEY = "carrymate:last-tab";

function getTaskDueAt(daysFromToday: number, hour = 18) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString();
}

function getEffectiveDueAt(task: Task) {
  if (task.dueAt) {
    return task.dueAt;
  }

  if (task.dueLabel === "오늘") {
    return getTaskDueAt(0, 18);
  }

  if (task.dueLabel === "내일") {
    return getTaskDueAt(1, 18);
  }

  return null;
}

function getUserNickname(user: User | null) {
  if (!user) {
    return "";
  }

  const metadata = user.user_metadata;
  if (
    typeof metadata === "object" &&
    metadata !== null &&
    "nickname" in metadata &&
    typeof metadata.nickname === "string"
  ) {
    return metadata.nickname;
  }

  return user.email?.split("@")[0] ?? "";
}

function normalizeMemberNameKey(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function dedupeMemberNames(names: string[]) {
  const seen = new Set<string>();

  return names.filter((name) => {
    const key = normalizeMemberNameKey(name);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildInviteLink(inviteCode: string) {
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://carrymate.app";

  return `${origin}/join/${inviteCode}`;
}

function formatMeetingDateLabel(startsAt: string) {
  const date = new Date(startsAt);
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

function formatMeetingTimeRange(startsAt: string, endsAt?: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;

  if (Number.isNaN(start.getTime())) {
    return "시간 미정";
  }

  const startLabel = start.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (!end || Number.isNaN(end.getTime())) {
    return `${startLabel} - 진행 중`;
  }

  const endLabel = end.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${startLabel} - ${endLabel}`;
}

export function CarryMateApp({
  initialInviteCode,
}: {
  initialInviteCode?: string;
}) {
  const router = useRouter();
  // TODO: Supabase Auth/Router 연동 시 온보딩 여부와 현재 탭 상태는
  // 세션/유저 프로필/URL 상태를 기준으로 초기화하도록 교체 가능
  const [viewMode, setViewMode] = useState<ViewMode>("onboarding");
  const [activeTab, setActiveTab] = useState<TabId>("home");

  // TODO: Supabase 연동 시 아래 workspace 상태들은 `getDemoWorkspace()` 대신
  // 초기 fetch 결과와 subscription(on realtime change) 데이터로 대체 가능
  const [project, setProject] = useState<Project>(() => getDemoWorkspace().project);
  const [members, setMembers] = useState<TeamMember[]>(() => getDemoWorkspace().members);
  const [tasks, setTasks] = useState<Task[]>(() => getDemoWorkspace().tasks);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>(
    () => getDemoWorkspace().scheduleSlots,
  );
  const [confirmedMeetings, setConfirmedMeetings] = useState<ConfirmedMeeting[]>(
    () => getDemoWorkspace().meetings,
  );
  const [files, setFiles] = useState<FileItem[]>(() => getDemoWorkspace().files);
  const [taskSyncMessage, setTaskSyncMessage] = useState("");
  const [memberSyncMessage, setMemberSyncMessage] = useState("");
  const [meetingSyncMessage, setMeetingSyncMessage] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [memberLinkMessage, setMemberLinkMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isMemberLinkLoading, setIsMemberLinkLoading] = useState(false);
  const [isAuthSheetOpen, setIsAuthSheetOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isMemberLinkSheetOpen, setIsMemberLinkSheetOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [currentMember, setCurrentMember] = useState<TeamMember | null>(null);
  const [unlinkedMemberRows, setUnlinkedMemberRows] = useState<TeamMemberRow[]>([]);
  const [isTaskCreating, setIsTaskCreating] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const tasksRef = useRef(tasks);
  const membersRef = useRef(members);
  const handledInviteCodeRef = useRef("");

  // TODO: Supabase 연동 시 아래 UI 상태들은 서버 저장 대상이 아니라
  // 클라이언트 전용 로컬 UI 상태로 그대로 유지하거나 zustand/router state로 분리 가능
  const [sheetMode, setSheetMode] = useState<WorkspaceSheetMode>(null);
  const [onboardingSheetMode, setOnboardingSheetMode] =
    useState<OnboardingSheetMode>(null);
  // TODO: Supabase 연동 시 inviteError/copyFeedback는 서버 에러 메시지나
  // 공유 성공 토스트 상태로 대체 가능
  const [inviteError, setInviteError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [teamSaveMessage, setTeamSaveMessage] = useState("");
  const [pendingMemberExitId, setPendingMemberExitId] = useState<string | null>(
    null,
  );
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [myTeams, setMyTeams] = useState<ProfileTeamSummary[]>([]);
  const [myTeamsLoading, setMyTeamsLoading] = useState(false);
  const [myTeamsMessage, setMyTeamsMessage] = useState("");
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceLoadMessage, setWorkspaceLoadMessage] = useState("");
  const [isRestoringWorkspace, setIsRestoringWorkspace] = useState(
    () => !normalizeInviteCode(initialInviteCode),
  );
  const restoredTeamRef = useRef(false);
  const restoreAttemptKeyRef = useRef<string | null>(null);
  const loadWorkspaceFromTeamIdRef = useRef<
    (options: {
      source: "card" | "restore" | "invite";
      teamId: string;
      memberRow?: TeamMemberRow | null;
    }) => Promise<boolean>
  >(async () => false);

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  );
  const hasPersistentProjectId = isUuid(project.id);
  const authenticatedUser = session?.user ?? null;
  const isAuthenticated = Boolean(authenticatedUser);
  const isTeamMember = Boolean(currentMember);
  const isTeamLeader = Boolean(currentMember?.isLeader);
  const userNickname = getUserNickname(authenticatedUser ?? user);
  const inviteCode = project.inviteCode || (!hasPersistentProjectId ? DEMO_INVITE_CODE : "");
  const inviteLink = inviteCode ? buildInviteLink(inviteCode) : "";
  const workspaceInviteCode = normalizeInviteCode(initialInviteCode);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedTab = window.localStorage.getItem(LAST_TAB_STORAGE_KEY);
    if (
      savedTab === "home" ||
      savedTab === "tasks" ||
      savedTab === "schedule" ||
      savedTab === "files"
    ) {
      setActiveTab(savedTab);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      const result = await getCurrentSession();

      if (cancelled) {
        return;
      }

      if (!result.ok) {
        console.error(result.message);
        setAuthMessage(result.message);
      }

      setSession(result.session);
      setUser(result.user);
      setAuthLoading(false);
    };

    void loadSession();

    const subscription = subscribeToAuthChanges((nextSession, nextUser) => {
      if (cancelled) {
        return;
      }

      setSession(nextSession);
      setUser(nextUser);
      setAuthLoading(false);

      if (!nextUser) {
        setCurrentMember(null);
      }
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authenticatedUser?.id) {
      setMyTeams([]);
      setMyTeamsMessage("");
      setMyTeamsLoading(false);
      restoredTeamRef.current = false;
      return;
    }

    let cancelled = false;

    const loadMyTeams = async () => {
      setMyTeamsLoading(true);
      setMyTeamsMessage("내 팀을 불러오는 중입니다.");
      const result = await getTeamsForProfile(authenticatedUser.id);

      if (cancelled) {
        return;
      }

      setMyTeamsLoading(false);

      if (!result.ok || !result.data) {
        setMyTeams([]);
        setMyTeamsMessage(result.message);
        return;
      }

      setMyTeams(result.data);
      setMyTeamsMessage(
        result.data.length > 0 ? "" : "아직 소속된 실제 팀이 없습니다.",
      );
    };

    void loadMyTeams();

    return () => {
      cancelled = true;
    };
  }, [authenticatedUser?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || authLoading || workspaceInviteCode) {
      return;
    }

    if (!authenticatedUser?.id) {
      setIsRestoringWorkspace(false);
      restoredTeamRef.current = false;
      restoreAttemptKeyRef.current = null;
      return;
    }

    const savedTeamId = window.localStorage.getItem(LAST_TEAM_ID_STORAGE_KEY);
    if (!savedTeamId) {
      setIsRestoringWorkspace(false);
      return;
    }

    const restoreAttemptKey = `${authenticatedUser.id}:${savedTeamId}`;
    if (restoredTeamRef.current || restoreAttemptKeyRef.current === restoreAttemptKey) {
      return;
    }

    restoredTeamRef.current = true;
    restoreAttemptKeyRef.current = restoreAttemptKey;
    setIsRestoringWorkspace(true);

    let cancelled = false;

    const restoreWorkspace = async () => {
      const membershipResult = await getTeamMemberByProfile(
        savedTeamId,
        authenticatedUser.id,
      );

      if (cancelled) {
        return;
      }

      if (!membershipResult.ok) {
        console.error("Workspace restore membership query failed.", {
          savedTeamId,
          userId: authenticatedUser.id,
          membershipError: membershipResult.message,
        });
        window.localStorage.removeItem(LAST_TEAM_ID_STORAGE_KEY);
        setWorkspaceLoadMessage("마지막 팀 복원에 실패했습니다.");
        setIsRestoringWorkspace(false);
        setViewMode("onboarding");
        return;
      }

      if (!membershipResult.data) {
        console.error("Workspace restore membership missing.", {
          savedTeamId,
          userId: authenticatedUser.id,
          membershipError: "No team_members row for saved team and current user.",
        });
        window.localStorage.removeItem(LAST_TEAM_ID_STORAGE_KEY);
        setWorkspaceLoadMessage("마지막 팀 복원에 실패했습니다.");
        setIsRestoringWorkspace(false);
        setViewMode("onboarding");
        return;
      }

      const restored = await loadWorkspaceFromTeamIdRef.current({
        source: "restore",
        teamId: savedTeamId,
        memberRow: membershipResult.data,
      });

      if (cancelled) {
        return;
      }

      if (!restored) {
        console.error("Workspace restore data load failed.", {
          savedTeamId,
          userId: authenticatedUser.id,
          membershipError: null,
        });
        setViewMode("onboarding");
      }

      setIsRestoringWorkspace(false);
    };

    void restoreWorkspace();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    authenticatedUser?.id,
    workspaceInviteCode,
  ]);

  useEffect(() => {
    if (!hasPersistentProjectId) {
      return;
    }

    let cancelled = false;

    const loadTasks = async () => {
      const result = await getTasksByTeam(project.id);

      if (cancelled) {
        return;
      }

      if (!result.ok || !result.data) {
        console.error(result.message);
        setTaskSyncMessage(result.message);
        return;
      }

      if (
        result.data.length === 0 &&
        tasksRef.current.some((task) => !isUuid(task.id))
      ) {
        setTaskSyncMessage("");
        return;
      }

      setTasks(mapTaskRowsToTasks(result.data));
      setTaskSyncMessage("");
    };

    void loadTasks();

    return () => {
      cancelled = true;
    };
  }, [hasPersistentProjectId, project.id]);

  useEffect(() => {
    if (!hasPersistentProjectId) {
      return;
    }

    let cancelled = false;

    const loadMembers = async () => {
      const result = await getTeamMembersByTeam(project.id);

      if (cancelled) {
        return;
      }

      if (!result.ok || !result.data) {
        console.error(result.message);
        setMemberSyncMessage(result.message);
        return;
      }

      if (
        result.data.length === 0 &&
        membersRef.current.some((member) => !isUuid(member.id))
      ) {
        setMemberSyncMessage("");
        return;
      }

      setMembers(mapTeamMemberRowsToTeamMembers(result.data));
      setMemberSyncMessage("");
    };

    void loadMembers();

    return () => {
      cancelled = true;
    };
  }, [hasPersistentProjectId, project.id]);

  useEffect(() => {
    if (!hasPersistentProjectId) {
      return;
    }

    let cancelled = false;

    const loadMeetings = async () => {
      const result = await getMeetingsByTeam(project.id);

      if (cancelled) {
        return;
      }

      if (!result.ok || !result.data) {
        console.error(result.message);
        setMeetingSyncMessage(result.message);
        return;
      }

      setConfirmedMeetings(mapMeetingRowsToConfirmedMeetings(result.data));
      setMeetingSyncMessage("");
    };

    void loadMeetings();

    return () => {
      cancelled = true;
    };
  }, [hasPersistentProjectId, project.id]);

  useEffect(() => {
    if (!hasPersistentProjectId || !authenticatedUser?.id) {
      setCurrentMember(null);
      return;
    }

    let cancelled = false;

    const loadCurrentMember = async () => {
      const result = await getTeamMemberByProfile(project.id, authenticatedUser.id);

      if (cancelled) {
        return;
      }

      if (!result.ok) {
        console.error(result.message);
        setAuthMessage(result.message);
        return;
      }

      setCurrentMember(
        result.data ? mapTeamMemberRowsToTeamMembers([result.data])[0] : null,
      );
    };

    void loadCurrentMember();

    return () => {
      cancelled = true;
    };
  }, [authenticatedUser?.id, hasPersistentProjectId, project.id]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (viewMode !== "workspace" || !hasPersistentProjectId) {
      return;
    }

    window.localStorage.setItem(LAST_TAB_STORAGE_KEY, activeTab);
  }, [activeTab, hasPersistentProjectId, viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (hasPersistentProjectId && project.id) {
      window.localStorage.setItem(LAST_TEAM_ID_STORAGE_KEY, project.id);
      return;
    }

    if (authLoading || isRestoringWorkspace || viewMode !== "workspace") {
      return;
    }

    window.localStorage.removeItem(LAST_TEAM_ID_STORAGE_KEY);
  }, [authLoading, hasPersistentProjectId, isRestoringWorkspace, project.id, viewMode]);

  useEffect(() => {
    if (!workspaceInviteCode) {
      handledInviteCodeRef.current = "";
      return;
    }

    if (handledInviteCodeRef.current === workspaceInviteCode) {
      return;
    }

    handledInviteCodeRef.current = workspaceInviteCode;

    if (workspaceInviteCode === DEMO_INVITE_CODE) {
      loadDemoWorkspace();
      return;
    }

    let cancelled = false;

    const loadWorkspaceFromInviteCode = async () => {
      setInviteError("");
      setTeamSaveMessage("");

      const teamResult = await getTeamByInviteCode(workspaceInviteCode);

      if (cancelled) {
        return;
      }

      if (!teamResult.ok || !teamResult.data) {
        setInviteError(
          teamResult.ok
            ? "존재하지 않는 초대 코드입니다. 링크를 다시 확인해 주세요."
            : teamResult.message,
        );
        setViewMode("onboarding");
        return;
      }
      await loadWorkspaceFromTeamIdRef.current({
        source: "invite",
        teamId: teamResult.data.id,
      });
    };

    void loadWorkspaceFromInviteCode();

    return () => {
      cancelled = true;
    };
  }, [workspaceInviteCode]);

  // 파생 요약 값은 여러 카드가 동시에 참조하므로
  // 렌더마다 직접 계산하지 않고 한 곳에서 일관되게 계산한다.
  const summary = useMemo<ProjectSummary>(() => {
    const now = new Date();
    const totalCount = tasks.length;
    const todayTaskCount = tasks.filter((task) => {
      const effectiveDueAt = getEffectiveDueAt(task);
      if (task.status === "done" || !effectiveDueAt) {
        return false;
      }

      const dueDate = new Date(effectiveDueAt);
      return (
        dueDate.getFullYear() === now.getFullYear() &&
        dueDate.getMonth() === now.getMonth() &&
        dueDate.getDate() === now.getDate()
      );
    }).length;
    const todoCount = tasks.filter((task) => task.status === "todo").length;
    const inProgressCount = tasks.filter((task) => task.status === "inProgress").length;
    const doneCount = tasks.filter((task) => task.status === "done").length;
    const overdueCount = tasks.filter((task) => {
      const effectiveDueAt = getEffectiveDueAt(task);
      if (task.status === "done" || !effectiveDueAt) {
        return false;
      }

      return new Date(effectiveDueAt).getTime() < now.getTime();
    }).length;
    const unassignedCount = tasks.filter((task) => task.assigneeId === null).length;
    const progress = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
    const urgentTask =
      tasks.find(
        (task) =>
          task.status !== "done" &&
          getEffectiveDueAt(task) &&
          new Date(getEffectiveDueAt(task) as string).getTime() < now.getTime(),
      ) ??
      tasks.find((task) => task.status !== "done" && task.assigneeId === null) ??
      tasks.find((task) => task.status !== "done");

    let healthScore = 100;
    healthScore -= overdueCount * 15;
    healthScore -= unassignedCount * 10;
    if (progress < 40) {
      healthScore -= 20;
    }
    healthScore = Math.max(0, Math.min(100, healthScore));

    let healthStatus: HealthStatus = "safe";
    if (healthScore < 50) {
      healthStatus = "risk";
    } else if (healthScore < 80) {
      healthStatus = "warning";
    }

    let briefing = "";
    if (overdueCount > 0) {
      briefing = `연체 업무가 ${overdueCount}개 있어요. 오늘 우선순위를 다시 정리해 주세요.`;
    } else if (unassignedCount > 0) {
      briefing = `담당자 미정 업무가 ${unassignedCount}개 있어요. 자동 재분배로 먼저 정리해 주세요.`;
    } else if (progress < 40) {
      briefing = "완료율이 아직 낮아요. 진행 중인 업무를 먼저 끝내면 팀 상태가 빠르게 안정됩니다.";
    } else {
      const briefingMap: Record<HealthStatus, string> = {
        safe: "좋아요. 현재 업무 진행이 안정적이에요. 남은 발표 흐름만 마무리하면 됩니다.",
        warning: "주의 단계예요. 진행 중인 업무를 하나만 더 끝내도 전체 흐름이 훨씬 안정돼요.",
        risk: "위험 단계예요. 연체나 미배정 업무부터 먼저 정리해야 발표 준비가 무너지지 않아요.",
      };
      briefing = briefingMap[healthStatus];
    }

    return {
      totalCount,
      todayTaskCount,
      todoCount,
      inProgressCount,
      doneCount,
      overdueCount,
      unassignedCount,
      urgentTask,
      progress,
      healthScore,
      healthStatus,
      briefing,
    };
  }, [tasks]);

  const todayMeetings = confirmedMeetings.filter(
    (meeting) => meeting.dateLabel === "오늘",
  );
  const upcomingMeetings = confirmedMeetings.filter(
    (meeting) => meeting.dateLabel !== "오늘",
  );
  const hasUnassignedTasks = summary.unassignedCount > 0;

  // 데모 진입/초대 링크/초대 코드/QR 스캔이 모두 같은 결과를 만들도록
  // workspace 초기화 로직을 한 함수로 모아 중복을 방지한다.
  const loadDemoWorkspace = () => {
    const demo = getDemoWorkspace();
    setProject(demo.project);
    setMembers(demo.members);
    setTasks(demo.tasks);
    setScheduleSlots(demo.scheduleSlots);
    setConfirmedMeetings(demo.meetings);
    setFiles(demo.files);
    setActiveTab("home");
    setViewMode("workspace");
    setOnboardingSheetMode(null);
    setSheetMode(null);
    setInviteError("");
    setCopyFeedback("");
    setTeamSaveMessage("");
    setTaskSyncMessage("");
    setMemberSyncMessage("");
    setMeetingSyncMessage("");
    setMemberLinkMessage("");
    setIsInviteModalOpen(false);
    setIsMemberLinkSheetOpen(false);
    setUnlinkedMemberRows([]);
    setCurrentMember(null);
    setPendingMemberExitId(null);
    setActiveMeetingId(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LAST_TEAM_ID_STORAGE_KEY);
    }
  };

  const loadWorkspaceFromTeamId = useCallback(async (options: {
    source: "card" | "restore" | "invite";
    teamId: string;
    memberRow?: TeamMemberRow | null;
  }) => {
    setIsWorkspaceLoading(true);
    setWorkspaceLoadMessage(
      options.source === "restore"
        ? "마지막 팀을 복원하는 중입니다."
        : "팀 데이터를 불러오는 중입니다.",
    );
    setTaskSyncMessage("실제 팀 업무를 불러오는 중입니다.");
    setMemberSyncMessage("실제 팀원 정보를 불러오는 중입니다.");
    setMeetingSyncMessage("실제 팀 회의를 불러오는 중입니다.");

    const [teamResult, teamMembersResult, tasksResult, meetingsResult] =
      await Promise.all([
        getTeamById(options.teamId),
        getTeamMembersByTeam(options.teamId),
        getTasksByTeam(options.teamId),
        getMeetingsByTeam(options.teamId),
      ]);

    if (!teamResult.ok || !teamResult.data) {
      const message = teamResult.ok
        ? "해당 팀을 찾을 수 없습니다."
        : teamResult.message;
      if (options.source === "restore") {
        console.error("Workspace restore team load failed.", {
          savedTeamId: options.teamId,
          userId: authenticatedUser?.id ?? null,
          membershipError: null,
          teamLoadError: message,
        });
      }
      setWorkspaceLoadMessage(message);
      setInviteError(message);
      if (options.source === "restore" && typeof window !== "undefined") {
        window.localStorage.removeItem(LAST_TEAM_ID_STORAGE_KEY);
      }
      setIsWorkspaceLoading(false);
      return false;
    }

    const mappedMembers =
      teamMembersResult.ok && teamMembersResult.data
        ? mapTeamMemberRowsToTeamMembers(teamMembersResult.data)
        : [];
    const currentMemberRow =
      options.memberRow ??
      (authenticatedUser?.id && teamMembersResult.ok && teamMembersResult.data
        ? teamMembersResult.data.find(
            (member) => member.profile_id === authenticatedUser.id,
          ) ?? null
        : null);

    if (options.source === "restore" && !currentMemberRow) {
      const message = "마지막 팀 복원에 실패했습니다. 현재 계정의 팀 멤버십을 확인해 주세요.";
      console.error("Workspace restore current member missing.", {
        savedTeamId: options.teamId,
        userId: authenticatedUser?.id ?? null,
        membershipError: message,
      });
      setWorkspaceLoadMessage(message);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(LAST_TEAM_ID_STORAGE_KEY);
      }
      setIsWorkspaceLoading(false);
      return false;
    }
    const savedTab =
      typeof window !== "undefined"
        ? window.localStorage.getItem(LAST_TAB_STORAGE_KEY)
        : null;
    const restoredTab: TabId =
      savedTab === "tasks" || savedTab === "schedule" || savedTab === "files"
        ? savedTab
        : "home";

    setProject(mapTeamRowToProject(teamResult.data));
    setMembers(mappedMembers);
    setTasks(
      tasksResult.ok && tasksResult.data ? mapTaskRowsToTasks(tasksResult.data) : [],
    );
    setConfirmedMeetings(
      meetingsResult.ok && meetingsResult.data
        ? mapMeetingRowsToConfirmedMeetings(meetingsResult.data)
        : [],
    );
    setScheduleSlots([]);
    setFiles([]);
    setCurrentMember(
      currentMemberRow ? mapTeamMemberRowsToTeamMembers([currentMemberRow])[0] : null,
    );
    setActiveTab(options.source === "restore" ? restoredTab : "home");
    setViewMode("workspace");
    setOnboardingSheetMode(null);
    setSheetMode(null);
    setIsInviteModalOpen(false);
    setInviteError("");
    setCopyFeedback("");
    setMemberLinkMessage("");
    setPendingMemberExitId(null);
    setActiveMeetingId(null);
    setTaskSyncMessage(tasksResult.ok ? "" : tasksResult.message);
    setMemberSyncMessage(teamMembersResult.ok ? "" : teamMembersResult.message);
    setMeetingSyncMessage(meetingsResult.ok ? "" : meetingsResult.message);
    setWorkspaceLoadMessage("");
    setIsWorkspaceLoading(false);
    setIsRestoringWorkspace(false);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_TEAM_ID_STORAGE_KEY, options.teamId);
      window.localStorage.setItem(
        LAST_TAB_STORAGE_KEY,
        options.source === "restore" ? restoredTab : "home",
      );
    }

    return true;
  }, [authenticatedUser?.id]);

  loadWorkspaceFromTeamIdRef.current = loadWorkspaceFromTeamId;

  const openAuthSheet = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthMessage("");
    setIsAuthSheetOpen(true);
  };

  const closeAuthSheet = () => {
    if (isAuthSubmitting) {
      return;
    }

    setIsAuthSheetOpen(false);
  };

  const closeInviteModal = () => {
    setIsInviteModalOpen(false);
  };

  const openInviteModal = () => {
    setCopyFeedback("");
    setIsInviteModalOpen(true);
  };

  const handleCopyInviteInfo = async () => {
    if (!inviteCode || !inviteLink) {
      setCopyFeedback("초대 정보를 아직 만들지 못했어요.");
      return;
    }

    const payload = `초대 코드: ${inviteCode}\n초대 링크: ${inviteLink}`;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        setCopyFeedback("초대 정보 복사 완료!");
        return;
      }
    } catch {
      // Clipboard API can fail depending on browser permissions.
    }

    setCopyFeedback(payload);
  };

  const handleSignIn = async (input: { email: string; password: string }) => {
    setIsAuthSubmitting(true);
    const result = await signInWithEmail(input);
    setIsAuthSubmitting(false);
    setAuthMessage(result.message);

    if (!result.ok) {
      return false;
    }

    setSession(result.session);
    setUser(result.user);
    setIsAuthSheetOpen(false);
    return true;
  };

  const handleSignUp = async (input: {
    email: string;
    password: string;
    nickname: string;
  }) => {
    setIsAuthSubmitting(true);
    const result = await signUpWithEmail(input);
    setIsAuthSubmitting(false);
    setAuthMessage(result.message);

    if (!result.ok) {
      return false;
    }

    setSession(result.session);
    setUser(result.user);

    if (!result.needsEmailConfirmation) {
      setIsAuthSheetOpen(false);
    }

    return true;
  };

  const handleSignOut = async () => {
    const result = await signOut();
    setAuthMessage(result.message);

    if (!result.ok) {
      console.error(result.message);
      return;
    }

    setSession(null);
    setUser(null);
    setCurrentMember(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LAST_TEAM_ID_STORAGE_KEY);
    }
  };

  const openMemberLinkSheet = async () => {
    if (!authenticatedUser?.id || !hasPersistentProjectId) {
      setMemberLinkMessage("로그인된 실제 팀에서만 팀원 연결을 진행할 수 있어요.");
      return;
    }

    setIsMemberLinkLoading(true);
    const result = await getUnlinkedTeamMembersByTeam(project.id);
    setIsMemberLinkLoading(false);

    if (!result.ok || !result.data) {
      console.error(result.message);
      setMemberLinkMessage(result.message);
      return;
    }

    setUnlinkedMemberRows(result.data);
    setMemberLinkMessage("");
    setIsMemberLinkSheetOpen(true);
  };

  const closeMemberLinkSheet = () => {
    if (isMemberLinkLoading) {
      return;
    }

    setIsMemberLinkSheetOpen(false);
  };

  const handleClaimMember = async (memberId: string) => {
    if (!authenticatedUser?.id || !hasPersistentProjectId) {
      return;
    }

    setIsMemberLinkLoading(true);
    const result = await connectProfileToTeamMember({
      teamId: project.id,
      memberId,
      profileId: authenticatedUser.id,
    });
    setIsMemberLinkLoading(false);

    if (!result.ok || !result.data) {
      console.error(result.message);
      setMemberLinkMessage(result.message);
      return;
    }

    const mappedMember = mapTeamMemberRowsToTeamMembers([result.data])[0];
    setCurrentMember(mappedMember);
    setMembers((current) =>
      current.map((member) => (member.id === mappedMember.id ? mappedMember : member)),
    );
    setUnlinkedMemberRows((current) => current.filter((member) => member.id !== memberId));
    setMemberLinkMessage("내 팀원 정보 연결이 완료되었습니다.");
    setIsMemberLinkSheetOpen(false);
  };

  const handleCreateLinkedMember = async () => {
    if (!authenticatedUser?.id || !hasPersistentProjectId) {
      return;
    }

    const joiningName = userNickname || authenticatedUser.email?.split("@")[0] || "팀원";
    setIsMemberLinkLoading(true);
    const result = await createAndLinkTeamMember({
      teamId: project.id,
      profileId: authenticatedUser.id,
      name: joiningName,
      role: "팀원",
      skillTag: SKILL_POOL[0],
    });
    setIsMemberLinkLoading(false);

    if (!result.ok || !result.data) {
      console.error(result.message);
      setMemberLinkMessage(result.message);
      return;
    }

    const mappedMember = mapTeamMemberRowsToTeamMembers([result.data])[0];
    setCurrentMember(mappedMember);
    setMembers((current) => [...current, mappedMember]);
    setMemberLinkMessage("새 팀원으로 참여 연결이 완료되었습니다.");
    setIsMemberLinkSheetOpen(false);
  };

  const createWorkspaceFromForm = async (input: {
    teamName: string;
    courseName: string;
    memberNames: string;
    description: string;
    startDate: string;
    endDate: string;
  }) => {
    const deadlineLabel = formatDeadlineLabel(input.endDate);
    const generatedInviteCode = generateInviteCode();
    const creatorName =
      authenticatedUser && (userNickname || authenticatedUser.email?.split("@")[0])
        ? userNickname || authenticatedUser.email?.split("@")[0] || "팀장"
        : null;

    // 새 팀 생성은 백엔드가 없는 MVP이므로
    // 입력값을 현재 화면 상태에 즉시 반영하는 방식으로 시뮬레이션한다.
    const inputNames = input.memberNames
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const inviteeNames = creatorName
      ? dedupeMemberNames(
          inputNames.filter(
            (name) => normalizeMemberNameKey(name) !== normalizeMemberNameKey(creatorName),
          ),
        )
      : dedupeMemberNames(inputNames);

    const allMemberNames = creatorName
      ? [creatorName, ...inviteeNames]
      : inviteeNames.length > 0
        ? inviteeNames
        : ["팀장"];

    const nextMembers: TeamMember[] = allMemberNames.map((name, index) => ({
      id: `member-${Date.now()}-${index}`,
      name,
      role: index === 0 ? ROLE_POOL[0] : ROLE_POOL[(index % (ROLE_POOL.length - 1)) + 1],
      skillTag: SKILL_POOL[index % SKILL_POOL.length],
      isLeader: index === 0,
      availability: DEFAULT_AVAILABILITY,
      status: "active" as const,
    }));

    const teamMemberSeeds: CreateTeamMemberSeed[] = creatorName
      ? [
          {
            profileId: authenticatedUser?.id ?? null,
            name: creatorName,
            role: "팀장 / 발표 정리",
            skillTag: SKILL_POOL[0],
            isLeader: true,
            status: "active",
          },
          ...inviteeNames.map((name, index) => ({
            profileId: null,
            name,
            role: "팀원",
            skillTag: SKILL_POOL[(index + 1) % SKILL_POOL.length],
            isLeader: false,
            status: "active",
          })),
        ]
      : allMemberNames.map((name, index) => ({
          profileId: null,
          name,
          role: index === 0 ? "팀장 / 발표 정리" : "팀원",
          skillTag: SKILL_POOL[index % SKILL_POOL.length],
          isLeader: index === 0,
          status: "active",
        }));

    const [leader, secondMember, thirdMember] = nextMembers;
    const nextProject: Project = {
      id: `project-${Date.now()}`,
      name: input.teamName,
      courseName: input.courseName,
      deadlineLabel,
      inviteCode: generatedInviteCode,
      description: input.description.trim() || undefined,
      startDate: input.startDate.trim() || undefined,
      endDate: input.endDate.trim() || undefined,
    };

    let starterTasks: Task[] = [
      {
        id: `task-${Date.now()}-0`,
        title: "역할 분담 먼저 정리하기",
        assigneeId: leader?.id ?? null,
        status: "todo",
        priority: "high",
        dueLabel: "오늘",
        dueAt: getTaskDueAt(0, 18),
        aiSuggestedRole: "팀장이 먼저 정리하면 팀 흐름이 빨라져요.",
      },
      {
        id: `task-${Date.now()}-1`,
        title: "과제 요구사항 한 줄로 요약하기",
        assigneeId: secondMember?.id ?? leader?.id ?? null,
        status: "inProgress",
        priority: "medium",
        dueLabel: "오늘",
        dueAt: getTaskDueAt(0, 20),
        aiSuggestedRole: "정리형 팀원이 맡으면 좋아요.",
      },
      {
        id: `task-${Date.now()}-2`,
        title: "발표용 자료 폴더 만들기",
        assigneeId: thirdMember?.id ?? leader?.id ?? null,
        status: "todo",
        priority: "medium",
        dueLabel: "내일",
        dueAt: getTaskDueAt(1, 15),
      },
    ];

    const saveResult = await saveTeamToSupabase({
      teamName: input.teamName.trim(),
      courseName: input.courseName.trim(),
      inviteCode: generatedInviteCode,
      deadlineLabel,
      memberNames: allMemberNames,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    if (!saveResult.ok) {
      setTeamSaveMessage(saveResult.message);
      return false;
    }

    let createdMembers = nextMembers;
    let nextSaveMessage = saveResult.message;

    if (saveResult.team?.id) {
      const memberCreateResult = await createTeamMembers(
        saveResult.team.id,
        teamMemberSeeds,
      );

      if (!memberCreateResult.ok || !memberCreateResult.data) {
        console.error(memberCreateResult.message);
        setMemberSyncMessage(memberCreateResult.message);
        nextSaveMessage = `${saveResult.message} team_members 생성은 실패했습니다.`;
      } else {
        createdMembers = mapTeamMemberRowsToTeamMembers(memberCreateResult.data);
        starterTasks = starterTasks.map((task, index) => ({
          ...task,
          assigneeId: createdMembers[Math.min(index, createdMembers.length - 1)]?.id ?? null,
        }));
        setCurrentMember(
          authenticatedUser?.id
            ? createdMembers.find((member) => member.isLeader) ?? null
            : null,
        );
        setMemberSyncMessage("");
      }
    }

    setProject({
      ...nextProject,
      id: saveResult.team?.id ?? nextProject.id,
      inviteCode: saveResult.team?.invite_code ?? generatedInviteCode,
    });
    setMembers(createdMembers);
    setTasks(starterTasks);
    setScheduleSlots([]);
    setConfirmedMeetings([]);
    setFiles([]);
    setActiveTab("home");
    setViewMode("onboarding");
    setOnboardingSheetMode("shareInvite");
    setInviteError("");
    setCopyFeedback("");
    setTeamSaveMessage(nextSaveMessage);
    setTaskSyncMessage("");
    return true;
  };

  const handleJoinWithCode = (code: string) => {
    const normalizedCode = normalizeInviteCode(code);

    if (normalizedCode === DEMO_INVITE_CODE) {
      loadDemoWorkspace();
      return true;
    }

    if (!normalizedCode) {
      setInviteError("초대 코드를 입력해 주세요.");
      return false;
    }

    setInviteError("");
    void router.push(`/join/${normalizedCode}`);
    return false;
  };

  const openSheet = (mode: WorkspaceSheetMode) => setSheetMode(mode);
  const closeSheet = () => setSheetMode(null);

  const handleAddTask = (title: string) => {
    // 새 업무 추가 시 현재 active 멤버 중 한 명에게 바로 배정해
    // 홈/업무 탭이 즉시 연결되어 보이도록 한다.
    const assignee = activeMembers[tasks.length % Math.max(activeMembers.length, 1)];
    const dueAt = getTaskDueAt(0, 18);
    const nextTask: Task = {
      id: `task-${Date.now()}`,
      title,
      assigneeId: assignee?.id ?? null,
      status: "todo",
      priority: "medium",
      dueLabel: "오늘",
      dueAt,
      aiSuggestedRole: assignee
        ? `${assignee.name}(${assignee.skillTag})에게 추천`
        : "담당자를 정해 주세요.",
    };

    setTasks((current) => [nextTask, ...current]);
    setActiveTab("tasks");
    closeSheet();

    if (!hasPersistentProjectId || isTaskCreating) {
      return;
    }

    setIsTaskCreating(true);

    void (async () => {
      const result = await createTask({
        teamId: project.id,
        title,
        description: nextTask.description,
        assigneeId: assignee?.id && isUuid(assignee.id) ? assignee.id : null,
        status: "todo",
        priority: "medium",
        dueAt,
        aiSuggestedRole: nextTask.aiSuggestedRole,
      });

      setIsTaskCreating(false);

      if (!result.ok || !result.data) {
        console.error(result.message);
        setTaskSyncMessage(result.message);
        return;
      }

      const [persistedTask] = mapTaskRowsToTasks([result.data]);
      setTasks((current) =>
        current.map((task) =>
          task.id === nextTask.id
            ? {
                ...persistedTask,
                assigneeId: nextTask.assigneeId,
              }
            : task,
        ),
      );
      setTaskSyncMessage("");
    })();
  };

  const handleAdvanceTask = (taskId: string) => {
    // 업무 카드를 탭할 때마다 To Do -> In Progress -> Done 순으로 순환한다.
    if (pendingTaskIds.includes(taskId)) {
      return;
    }

    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask) {
      return;
    }

    const nextStatusMap: Record<TaskStatus, TaskStatus> = {
      todo: "inProgress",
      inProgress: "done",
      done: "todo",
    };

    const nextStatus = nextStatusMap[currentTask.status];
    const optimisticTask: Task = {
      ...currentTask,
      status: nextStatus,
      completedAt: nextStatus === "done" ? new Date().toISOString() : null,
      dueLabel: formatTaskDueLabel(currentTask.dueAt, nextStatus === "done" ? new Date().toISOString() : null),
    };

    setTasks((current) =>
      current.map((task) => (task.id === taskId ? optimisticTask : task)),
    );

    if (!hasPersistentProjectId || !isUuid(taskId)) {
      return;
    }

    setPendingTaskIds((current) => [...current, taskId]);

    void (async () => {
      const result = await updateTaskFields(taskId, { status: nextStatus });

      setPendingTaskIds((current) => current.filter((id) => id !== taskId));

      if (!result.ok || !result.data) {
        console.error(result.message);
        setTaskSyncMessage(result.message);
        setTasks((current) =>
          current.map((task) => (task.id === taskId ? currentTask : task)),
        );
        return;
      }

      const [persistedTask] = mapTaskRowsToTasks([result.data]);
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...persistedTask,
                assigneeId: currentTask.assigneeId,
              }
            : task,
        ),
      );
      setTaskSyncMessage("");
    })();
  };

  const handleAddSchedule = (title: string) => {
    // 일정 추가는 추천 슬롯 목록에 바로 삽입해
    // "추가 후 확정" 흐름을 짧게 시연할 수 있도록 구성한다.
    const nextSlot: ScheduleSlot = {
      id: `slot-${Date.now()}`,
      label: title,
      dateLabel: "7월 11일 토요일",
      timeRange: "16:00 - 16:30",
      memberIds: activeMembers.slice(0, 3).map((member) => member.id),
      recommended: false,
    };

    setScheduleSlots((current) => [nextSlot, ...current]);
    setActiveTab("schedule");
    closeSheet();
  };

  const handleCreateMeeting = async (input: {
    title: string;
    startsAt: string;
    endsAt: string;
  }) => {
    const trimmedTitle = input.title.trim();
    const startsAtInput = input.startsAt.trim();
    const endsAtInput = input.endsAt.trim();

    if (!trimmedTitle || !startsAtInput) {
      setMeetingSyncMessage("회의 제목과 시작 시각을 입력해 주세요.");
      return false;
    }

    const startsAtDate = new Date(startsAtInput);
    const endsAtDate = endsAtInput ? new Date(endsAtInput) : null;

    if (
      Number.isNaN(startsAtDate.getTime()) ||
      (endsAtDate && Number.isNaN(endsAtDate.getTime()))
    ) {
      setMeetingSyncMessage("회의 시각 형식이 올바르지 않습니다.");
      return false;
    }

    const startsAt = startsAtDate.toISOString();
    const endsAt = endsAtDate ? endsAtDate.toISOString() : "";

    const nextMeeting: ConfirmedMeeting = {
      id: `meeting-${Date.now()}`,
      title: trimmedTitle,
      dateLabel: formatMeetingDateLabel(startsAt),
      timeRange: formatMeetingTimeRange(startsAt, endsAt || null),
      attendeeCount: activeMembers.length,
      status: getMeetingStatus({
        startsAt,
        endsAt: endsAt || null,
      }),
      createdByMemberId: currentMember?.id ?? null,
      startsAt,
      endsAt: endsAt || null,
      teamId: hasPersistentProjectId ? project.id : undefined,
      isEnded: getMeetingStatus({
        startsAt,
        endsAt: endsAt || null,
      }) === "ended",
    };

    if (!hasPersistentProjectId) {
      setConfirmedMeetings((current) => [nextMeeting, ...current]);
      setMeetingSyncMessage("데모 회의를 로컬 상태에 추가했습니다.");
      setActiveTab("schedule");
      closeSheet();
      return true;
    }

    const result = await createMeeting({
      teamId: project.id,
      title: trimmedTitle,
      startsAt,
      endsAt: endsAt || null,
      createdBy: currentMember?.id ?? null,
    });

    if (!result.ok || !result.data) {
      setMeetingSyncMessage(result.message);
      return false;
    }

    const persistedMeeting = mapMeetingRowsToConfirmedMeetings([result.data])[0];
    setConfirmedMeetings((current) => [persistedMeeting, ...current]);
    setMeetingSyncMessage("");
    setActiveTab("schedule");
    closeSheet();
    return true;
  };

  const handleConfirmSlot = (slotId: string) => {
    // 추천 슬롯을 확정 일정으로 이동시키는 상태 전환 로직이다.
    const selectedSlot = scheduleSlots.find((slot) => slot.id === slotId);
    if (!selectedSlot) {
      return;
    }

    const nextMeeting: ConfirmedMeeting = {
      id: `meeting-${Date.now()}`,
      title: selectedSlot.label,
      dateLabel: selectedSlot.dateLabel,
      timeRange: selectedSlot.timeRange,
      attendeeCount: selectedSlot.memberIds.length,
      status: "inProgress",
      createdByMemberId: activeMembers[0]?.id ?? null,
      isEnded: false,
    };

    const startsAt = new Date().toISOString();

    if (!hasPersistentProjectId) {
      setConfirmedMeetings((current) => [nextMeeting, ...current]);
      setScheduleSlots((current) => current.filter((slot) => slot.id !== slotId));
      setActiveTab("schedule");
      return;
    }

    void (async () => {
      const result = await createMeeting({
        teamId: project.id,
        title: selectedSlot.label,
        startsAt,
        endsAt: null,
        createdBy: currentMember?.id ?? null,
      });

      if (!result.ok || !result.data) {
        setMeetingSyncMessage(result.message);
        return;
      }

      const persistedMeeting = mapMeetingRowsToConfirmedMeetings([result.data])[0];
      setConfirmedMeetings((current) => [persistedMeeting, ...current]);
      setScheduleSlots((current) => current.filter((slot) => slot.id !== slotId));
      setMeetingSyncMessage("");
      setActiveTab("schedule");
    })();
  };

  const handleUploadFile = (category: FileCategory) => {
    // 파일 업로드는 실제 스토리지 업로드 대신
    // 파일 목록 state에 더미 항목을 삽입하는 방식으로 처리한다.
    const categoryLabelMap: Record<FileCategory, string> = {
      minutes: "회의록",
      materials: "과제자료",
      links: "참고링크",
    };
    const uploader = activeMembers[0];

    const nextFile: FileItem = {
      id: `file-${Date.now()}`,
      name: `${categoryLabelMap[category]}_${files.length + 1}`,
      category,
      uploadedBy: uploader?.name ?? "팀원",
      uploadedByMemberId: uploader?.id ?? null,
      uploadedAt: "방금 전",
      statusLabel: "초안",
      isFinal: false,
    };

    setFiles((current) => [nextFile, ...current]);
    setActiveTab("files");
    closeSheet();
  };

  const handleMarkFinal = (fileId: string) => {
    // 최종본은 하나만 유지되어야 하므로
    // materials 카테고리 안에서 기존 최종본을 해제하고 새 파일을 지정한다.
    setFiles((current) =>
      current.map((file) => {
        if (file.category !== "materials") {
          return file;
        }

        if (file.id === fileId) {
          return { ...file, isFinal: true, statusLabel: "최종본" };
        }

        if (file.isFinal) {
          return { ...file, isFinal: false, statusLabel: "검토중" };
        }

        return file;
      }),
    );
  };

  const handleMeetingUpdated = (updatedMeeting: ConfirmedMeeting) => {
    setConfirmedMeetings((current) =>
      current.map((meeting) =>
        meeting.id === updatedMeeting.id ? updatedMeeting : meeting,
      ),
    );
  };

  const handleImportMeetingActionItems = async (
    meeting: ConfirmedMeeting,
    items: Array<{ key: string; item: MeetingActionItem }>,
  ) => {
    if (items.length === 0) {
      return {
        ok: false,
        message: "선택한 할 일 후보가 없습니다.",
        imported: [],
        failed: [],
      };
    }

    if (!hasPersistentProjectId) {
      const demoTasks = items.map(({ item }, index) => {
        const assignee = members.find((member) => member.name === item.assigneeName);
        const dueAt = new Date();
        dueAt.setDate(dueAt.getDate() + item.dueDateOffsetDays);

        return {
          id: `task-${Date.now()}-${index}`,
          title: item.title,
          assigneeId: assignee?.id ?? null,
          status: "todo" as const,
          priority: "medium" as const,
          dueLabel: formatTaskDueLabel(dueAt.toISOString(), null),
          dueAt: dueAt.toISOString(),
          aiSuggestedRole: "회의 AI 추천 업무",
        };
      });

      setTasks((current) => [...demoTasks, ...current]);
      setActiveTab("tasks");

      return {
        ok: true,
        message: `${demoTasks.length}개의 데모 업무를 Tasks에 추가했습니다.`,
        imported: items.map(({ key }) => ({
          key,
          taskId: null,
        })),
        failed: [],
      };
    }

    const createdTasks: Task[] = [];
    const imported: Array<{ key: string; taskId: string | null }> = [];
    const failed: Array<{ key: string; message: string }> = [];

    for (const { key, item } of items) {
      const assignee = members.find((member) => member.name === item.assigneeName);
      const dueAt = new Date();
      dueAt.setHours(18, 0, 0, 0);
      dueAt.setDate(dueAt.getDate() + item.dueDateOffsetDays);

      const result = await createTask({
        teamId: project.id,
        title: item.title,
        assigneeId: assignee?.id ?? null,
        status: "todo",
        priority: "medium",
        dueAt: dueAt.toISOString(),
        aiSuggestedRole: `회의 "${meeting.title}" AI 추천 업무`,
      });

      if (!result.ok || !result.data) {
        failed.push({
          key,
          message: result.message,
        });
        continue;
      }

      createdTasks.push(mapTaskRowsToTasks([result.data])[0]);
      imported.push({
        key,
        taskId: result.data.id,
      });
    }

    if (createdTasks.length > 0) {
      setTasks((current) => [...createdTasks, ...current]);
      setTaskSyncMessage("");
      setActiveTab("tasks");
    }

    const message =
      failed.length === 0
        ? `${createdTasks.length}개의 업무를 실제 Tasks 보드에 등록했습니다.`
        : createdTasks.length === 0
          ? `업무 등록에 실패했습니다. ${failed[0]?.message ?? ""}`.trim()
          : `${createdTasks.length}개 등록, ${failed.length}개 실패했습니다. 실패한 항목은 다시 시도해 주세요.`;

    return {
      ok: failed.length === 0 && createdTasks.length > 0,
      message,
      imported,
      failed,
    };
  };

  const handleConfirmMemberExit = () => {
    // 팀원 이탈 승인 시 멤버는 former 상태로 바꾸고,
    // 그 멤버가 맡던 업무는 담당자 미정(null)으로 바꿔 후속 재분배를 유도한다.
    if (!pendingMemberExitId) {
      return;
    }

    setMembers((current) =>
      current.map((member) =>
        member.id === pendingMemberExitId ? { ...member, status: "former" } : member,
      ),
    );
    setTasks((current) =>
      current.map((task) =>
        task.assigneeId === pendingMemberExitId
          ? {
              ...task,
              assigneeId: null,
              aiSuggestedRole: "담당자 미정 · 자동 재분배가 필요해요.",
            }
          : task,
      ),
    );
    setPendingMemberExitId(null);
    setActiveTab("tasks");
  };

  const handleAutoRedistribute = () => {
    // 재분배는 "남아 있는 active 멤버 중 미완료 업무가 가장 적은 사람"에게 배정한다.
    // 발표용 MVP에서는 단순한 규칙이 동작 설명에 가장 유리하다.
    const availableMembers = activeMembers;
    if (availableMembers.length === 0) {
      return;
    }

    const getOpenTaskLoad = (memberId: string) =>
      tasks.filter(
        (task) =>
          task.assigneeId === memberId &&
          task.status !== "done",
      ).length;

    const bestAssignee = [...availableMembers].sort((left, right) => {
      const loadGap = getOpenTaskLoad(left.id) - getOpenTaskLoad(right.id);
      if (loadGap !== 0) {
        return loadGap;
      }

      return left.id.localeCompare(right.id);
    })[0];

    setTasks((current) =>
      current.map((task) =>
        task.assigneeId === null
          ? {
              ...task,
              assigneeId: bestAssignee.id,
              aiSuggestedRole: `${bestAssignee.name}(${bestAssignee.skillTag})에게 자동 재배정됨`,
            }
          : task,
      ),
    );
    setActiveTab("home");
  };

  const pendingExitMember = members.find(
    (member) => member.id === pendingMemberExitId,
  );
  const activeMeeting =
    confirmedMeetings.find((meeting) => meeting.id === activeMeetingId) ?? null;

  const renderWorkspaceSheet = () => {
    // 현재 탭에 따라 빠른 추가 바텀시트 내용을 바꿔 재사용한다.
    if (!sheetMode) {
      return null;
    }

    if (sheetMode === "task") {
      return (
        <QuickActionSheet
          title="업무 빠르게 추가"
          description="발표 전에 바로 시연할 수 있도록 제목만 입력하면 오늘 업무로 추가됩니다."
          actionLabel="업무 추가"
          placeholder="예: 발표 결론 슬라이드 다듬기"
          onClose={closeSheet}
          onSubmit={handleAddTask}
        />
      );
    }

    if (sheetMode === "schedule") {
      return (
        <QuickActionSheet
          title="일정 빠르게 추가"
          description="간단한 회의 이름만 입력하면 추천 슬롯 목록에 새 일정이 추가됩니다."
          actionLabel="일정 추가"
          placeholder="예: 발표 리허설 점검"
          onClose={closeSheet}
          onSubmit={handleAddSchedule}
        />
      );
    }

    if (sheetMode === "meeting") {
      return (
        <MeetingCreateSheet
          onClose={closeSheet}
          onSubmit={handleCreateMeeting}
        />
      );
    }

    return <UploadSheet onClose={closeSheet} onUpload={handleUploadFile} />;
  };

  const renderOnboardingSheet = () => {
    // 온보딩은 참여 방식별 모달이 다르므로
    // 현재 모드에 맞는 시트를 조건부로 렌더링한다.
    if (onboardingSheetMode === "createTeam") {
      return (
        <CreateTeamSheet
          onClose={() => setOnboardingSheetMode(null)}
          onSubmit={createWorkspaceFromForm}
          submitMessage={teamSaveMessage}
          creatorName={authenticatedUser ? userNickname || authenticatedUser.email?.split("@")[0] || "" : ""}
        />
      );
    }

    if (onboardingSheetMode === "joinTeam") {
      return (
        <JoinTeamSheet
          errorMessage={inviteError}
          onClose={() => {
            setOnboardingSheetMode(null);
            setInviteError("");
          }}
          onSubmit={handleJoinWithCode}
        />
      );
    }

    if (onboardingSheetMode === "joinLink") {
      return (
        <InviteLinkModal
          onClose={() => setOnboardingSheetMode(null)}
          onConfirm={() => {
            void router.push(`/join/${DEMO_INVITE_CODE}`);
          }}
        />
      );
    }

    if (onboardingSheetMode === "joinQr") {
      return (
        <QrScannerModal
          onClose={() => setOnboardingSheetMode(null)}
          onScanSuccess={() => {
            void router.push(`/join/${DEMO_INVITE_CODE}`);
          }}
        />
      );
    }

    if (onboardingSheetMode === "shareInvite") {
      return (
        <ShareInviteModal
          copyFeedback={copyFeedback}
          inviteCode={inviteCode || DEMO_INVITE_CODE}
          inviteLink={inviteLink || buildInviteLink(DEMO_INVITE_CODE)}
          noticeMessage={teamSaveMessage}
          onClose={() => {
            setOnboardingSheetMode(null);
            setViewMode("workspace");
            setTeamSaveMessage("");
          }}
          onCopy={() => {
            void handleCopyInviteInfo();
          }}
        />
      );
    }

    return null;
  };

  const renderMemberLinkSheet = () => {
    if (!isMemberLinkSheetOpen) {
      return null;
    }

    return (
      <MemberLinkSheet
        creatorName={userNickname || authenticatedUser?.email?.split("@")[0] || "팀원"}
        isLoading={isMemberLinkLoading}
        members={unlinkedMemberRows}
        message={memberLinkMessage}
        onClose={closeMemberLinkSheet}
        onClaim={handleClaimMember}
        onCreateNew={handleCreateLinkedMember}
      />
    );
  };

  const renderAuthSheet = () => {
    if (!isAuthSheetOpen) {
      return null;
    }

    return (
      <AuthSheet
        mode={authMode}
        message={authMessage}
        isSubmitting={isAuthSubmitting}
        onClose={closeAuthSheet}
        onChangeMode={setAuthMode}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
      />
    );
  };

  if (isRestoringWorkspace) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10 pt-7">
        <div className="rounded-[2rem] border border-line bg-white p-6 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand">
            CarryMate
          </p>
          <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.02em] text-ink">
            마지막 팀을 확인하는 중입니다
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            로그인 계정과 저장된 팀 정보를 대조한 뒤 워크스페이스를 복원합니다.
          </p>
        </div>
      </main>
    );
  }

  if (viewMode === "onboarding") {
    return (
      <>
        <OnboardingScreen
          authLoading={authLoading}
          isAuthenticated={isAuthenticated}
          userLabel={userNickname || authenticatedUser?.email || ""}
          onCreateTeam={() => {
            setTeamSaveMessage("");
            setOnboardingSheetMode("createTeam");
          }}
          onJoinCode={() => {
            setInviteError("");
            setOnboardingSheetMode("joinTeam");
          }}
          onJoinLink={() => setOnboardingSheetMode("joinLink")}
          onJoinQr={() => setOnboardingSheetMode("joinQr")}
          onOpenAuthSignIn={() => openAuthSheet("signIn")}
          onOpenAuthSignUp={() => openAuthSheet("signUp")}
          onSignOut={handleSignOut}
          onTryDemo={loadDemoWorkspace}
        />
        <MyTeamsSection
          isAuthenticated={isAuthenticated}
          isLoading={myTeamsLoading || isWorkspaceLoading}
          message={workspaceLoadMessage || myTeamsMessage}
          teams={myTeams}
          onEnterTeam={(summary) => {
            void loadWorkspaceFromTeamId({
              source: "card",
              teamId: summary.team.id,
              memberRow: summary.member,
            });
          }}
        />
        {renderOnboardingSheet()}
        {renderAuthSheet()}
      </>
    );
  }

  return (
    <>
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-28 pt-7">
        <div className="mb-5 rounded-[2rem] border border-line bg-white/92 p-5 shadow-soft backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand">
            CarryMate
          </p>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[25px] font-semibold tracking-[-0.02em] text-ink">{project.name}</h1>
              <p className="mt-1 text-[13px] text-muted">
                {project.courseName} · {project.deadlineLabel}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {authLoading ? (
                  <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
                    계정 확인 중
                  </span>
                ) : isAuthenticated ? (
                  <>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-brand">
                      {userNickname || authenticatedUser?.email}
                    </span>
                    <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
                      {isTeamLeader
                        ? "팀장 연결됨"
                        : isTeamMember
                          ? "팀원 연결됨"
                          : "팀원 연결 대기"}
                    </span>
                    {!isTeamMember && hasPersistentProjectId ? (
                      <button
                        type="button"
                        onClick={() => {
                          void openMemberLinkSheet();
                        }}
                        className="rounded-full border border-line bg-white px-3 py-1 text-[11px] font-semibold text-ink"
                      >
                        내 팀원 정보 연결
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAuthSheet("signIn")}
                    className="rounded-full border border-line bg-white px-3 py-1 text-[11px] font-semibold text-ink"
                  >
                    로그인 / 회원가입
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-full border border-line bg-white px-3 py-1 text-[11px] font-semibold text-muted"
                >
                  로그아웃
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setViewMode("onboarding")}
                className="rounded-full border border-line bg-white px-3 py-1 text-[11px] font-semibold text-ink"
              >
                팀 전환
              </button>
              <button
                type="button"
                onClick={openInviteModal}
                className="rounded-full border border-line bg-white px-3 py-1 text-[11px] font-semibold text-ink"
              >
                팀원 초대
              </button>
              <button
                type="button"
                onClick={() =>
                  openSheet(
                    activeTab === "tasks"
                      ? "task"
                      : activeTab === "schedule"
                        ? "schedule"
                        : "file",
                  )
                }
                className="rounded-2xl bg-brand px-4 py-3 text-[13px] font-semibold text-white shadow-brand"
              >
                빠른 추가
              </button>
            </div>
          </div>
          {authMessage ? (
            <p className="mt-3 rounded-2xl bg-canvas px-4 py-3 text-[12px] font-medium text-muted">
              {authMessage}
            </p>
          ) : null}
          {taskSyncMessage ? (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[12px] font-medium text-warning">
              {taskSyncMessage}
            </p>
          ) : null}
          {memberSyncMessage ? (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[12px] font-medium text-warning">
              {memberSyncMessage}
            </p>
          ) : null}
          {meetingSyncMessage ? (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[12px] font-medium text-warning">
              {meetingSyncMessage}
            </p>
          ) : null}
          {memberLinkMessage && !isMemberLinkSheetOpen ? (
            <p className="mt-3 rounded-2xl bg-canvas px-4 py-3 text-[12px] font-medium text-muted">
              {memberLinkMessage}
            </p>
          ) : null}
        </div>

        <section className="flex-1 space-y-4">
          {activeTab === "home" && (
            <HomeTab
              summary={summary}
              tasks={tasks}
              todayMeetings={todayMeetings}
              upcomingMeetings={upcomingMeetings}
              onJumpToTasks={() => setActiveTab("tasks")}
              onJumpToSchedule={() => setActiveTab("schedule")}
            />
          )}
          {activeTab === "tasks" && (
            <TaskTab
              members={members}
              tasks={tasks}
              hasUnassignedTasks={hasUnassignedTasks}
              onAddTask={() => openSheet("task")}
              onAdvanceTask={handleAdvanceTask}
              onRequestMemberExit={setPendingMemberExitId}
              onAutoRedistribute={handleAutoRedistribute}
            />
          )}
          {activeTab === "schedule" && (
            <ScheduleTab
              members={members}
              slots={scheduleSlots}
              meetings={confirmedMeetings}
              onAddSchedule={() => openSheet("schedule")}
              onCreateMeeting={() => openSheet("meeting")}
              onConfirmSlot={handleConfirmSlot}
              onOpenMeeting={setActiveMeetingId}
            />
          )}
          {activeTab === "files" && (
            <FileTab
              files={files}
              members={members}
              onUpload={() => openSheet("file")}
              onMarkFinal={handleMarkFinal}
            />
          )}
        </section>

        <BottomTabBar activeTab={activeTab} onChange={setActiveTab} />
      </main>

      {renderWorkspaceSheet()}
      {isInviteModalOpen ? (
        <ShareInviteModal
          copyFeedback={copyFeedback}
          inviteCode={inviteCode || DEMO_INVITE_CODE}
          inviteLink={inviteLink || buildInviteLink(DEMO_INVITE_CODE)}
          noticeMessage=""
          onClose={closeInviteModal}
          onCopy={() => {
            void handleCopyInviteInfo();
          }}
        />
      ) : null}
      {activeMeeting ? (
        <MeetingRoomSheet
          currentMember={currentMember}
          isDemo={!hasPersistentProjectId}
          meeting={activeMeeting}
          members={members}
          onClose={() => setActiveMeetingId(null)}
          onImportActionItems={handleImportMeetingActionItems}
          onMeetingUpdated={handleMeetingUpdated}
          projectId={project.id}
        />
      ) : null}
      {renderMemberLinkSheet()}
      {renderAuthSheet()}
      {pendingExitMember ? (
        <ConfirmModal
          memberName={pendingExitMember.name}
          onCancel={() => setPendingMemberExitId(null)}
          onConfirm={handleConfirmMemberExit}
        />
      ) : null}
    </>
  );
}

function OnboardingScreen({
  authLoading,
  isAuthenticated,
  userLabel,
  onCreateTeam,
  onJoinCode,
  onJoinLink,
  onJoinQr,
  onOpenAuthSignIn,
  onOpenAuthSignUp,
  onSignOut,
  onTryDemo,
}: {
  authLoading: boolean;
  isAuthenticated: boolean;
  userLabel: string;
  onCreateTeam: () => void;
  onJoinCode: () => void;
  onJoinLink: () => void;
  onJoinQr: () => void;
  onOpenAuthSignIn: () => void;
  onOpenAuthSignUp: () => void;
  onSignOut: () => void;
  onTryDemo: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
      <section className="rounded-[2rem] border border-line bg-white/92 p-6 shadow-soft">
        <div className="rounded-[1.75rem] border border-line bg-white p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
            CarryMate
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-ink">캐리메이트</h1>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            신입생 팀플을 더 쉽게 정리하는 AI 협업 도우미
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-canvas px-4 py-3">
          {authLoading ? (
            <p className="text-[13px] font-medium text-muted">계정 상태를 확인하고 있어요.</p>
          ) : isAuthenticated ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-brand">로그인됨</p>
                <p className="mt-1 text-[13px] text-ink">{userLabel}</p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-full border border-line bg-white px-3 py-2 text-[12px] font-semibold text-muted"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-brand">선택 로그인</p>
                <p className="mt-1 text-[13px] leading-6 text-muted">
                  로그인 없이 데모와 팀 참여는 그대로 사용할 수 있어요.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onOpenAuthSignIn}
                  className="rounded-full border border-line bg-white px-3 py-2 text-[12px] font-semibold text-ink"
                >
                  로그인
                </button>
                <button
                  type="button"
                  onClick={onOpenAuthSignUp}
                  className="rounded-full bg-brand px-3 py-2 text-[12px] font-semibold text-white shadow-brand"
                >
                  회원가입
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-7 space-y-3">
          <PrimaryButton label="새 팀 만들기" onClick={onCreateTeam} />
          <button
            type="button"
            onClick={onJoinCode}
            className="flex w-full items-center justify-between rounded-2xl border border-line bg-white px-4 py-4 text-left shadow-soft"
          >
            <span className="text-sm font-semibold text-ink">초대 코드로 참여하기</span>
            <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
              CODE
            </span>
          </button>
          <button
            type="button"
            onClick={onJoinLink}
            className="flex w-full items-center justify-between rounded-2xl border border-line bg-white px-4 py-4 text-left shadow-soft"
          >
            <span className="text-sm font-semibold text-ink">초대 링크로 참여하기</span>
            <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
              LINK
            </span>
          </button>
          <button
            type="button"
            onClick={onJoinQr}
            className="flex w-full items-center justify-between rounded-2xl border border-line bg-white px-4 py-4 text-left shadow-soft"
          >
            <span className="text-sm font-semibold text-ink">QR 스캔으로 팀 참여하기</span>
            <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
              QR
            </span>
          </button>
          <button
            type="button"
            onClick={onTryDemo}
            className="w-full rounded-2xl border border-line bg-white px-4 py-4 text-sm font-semibold text-ink shadow-soft"
          >
            데모 팀으로 바로 체험하기
          </button>
        </div>
      </section>
    </main>
  );
}

function MyTeamsSection({
  isAuthenticated,
  isLoading,
  message,
  onEnterTeam,
  teams,
}: {
  isAuthenticated: boolean;
  isLoading: boolean;
  message: string;
  onEnterTeam: (summary: ProfileTeamSummary) => void;
  teams: ProfileTeamSummary[];
}) {
  if (!isAuthenticated) {
    return null;
  }

  return (
    <section className="mx-auto mt-4 w-full max-w-md px-4 pb-6">
      <div className="rounded-[2rem] border border-line bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              My Teams
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink">내 팀</h2>
          </div>
          <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
            {teams.length}개 팀
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            <div className="rounded-2xl border border-line bg-canvas px-4 py-4 text-sm text-muted">
              {message || "내 팀 조회 중"}
            </div>
          ) : teams.length > 0 ? (
            teams.map((summary) => (
              <div
                key={summary.member.id}
                className="rounded-2xl border border-line bg-white px-4 py-4 shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{summary.team.team_name}</p>
                    <p className="mt-1 text-[12px] text-muted">
                      {summary.team.course_name} · {summary.team.deadline_label}
                    </p>
                    <p className="mt-2 text-[12px] text-muted">
                      내 역할: {summary.member.role}
                      {summary.member.is_leader ? " · 팀장" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEnterTeam(summary)}
                    className="rounded-xl bg-brand px-3 py-2 text-[12px] font-semibold text-white shadow-brand"
                  >
                    들어가기
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-white px-4 py-4 text-sm text-muted">
              {message || "아직 소속된 실제 팀이 없습니다."}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AuthSheet({
  mode,
  message,
  isSubmitting,
  onClose,
  onChangeMode,
  onSignIn,
  onSignUp,
}: {
  mode: AuthMode;
  message: string;
  isSubmitting: boolean;
  onClose: () => void;
  onChangeMode: (mode: AuthMode) => void;
  onSignIn: (input: { email: string; password: string }) => Promise<boolean>;
  onSignUp: (input: {
    email: string;
    password: string;
    nickname: string;
  }) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [localMessage, setLocalMessage] = useState("");

  return (
    <SheetShell title={mode === "signIn" ? "로그인" : "회원가입"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-canvas p-1">
        <button
          type="button"
          onClick={() => {
            setLocalMessage("");
            onChangeMode("signIn");
          }}
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            mode === "signIn" ? "bg-white text-ink shadow-soft" : "text-muted"
          }`}
        >
          로그인
        </button>
        <button
          type="button"
          onClick={() => {
            setLocalMessage("");
            onChangeMode("signUp");
          }}
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            mode === "signUp" ? "bg-white text-ink shadow-soft" : "text-muted"
          }`}
        >
          회원가입
        </button>
      </div>

      <div className="space-y-3">
        <SheetInput
          label="이메일"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="예: carrymate@example.com"
        />
        <SheetInput
          label="비밀번호"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="6자 이상 입력해 주세요"
        />
        {mode === "signUp" ? (
          <SheetInput
            label="닉네임 (선택)"
            value={nickname}
            onChange={setNickname}
            placeholder="예: 민지"
          />
        ) : null}
      </div>

      {localMessage || message ? (
        <p className="rounded-2xl bg-canvas px-4 py-3 text-sm leading-6 text-muted">
          {localMessage || message}
        </p>
      ) : null}

      <PrimaryButton
        label={
          isSubmitting
            ? mode === "signIn"
              ? "로그인 중..."
              : "가입 중..."
            : mode === "signIn"
              ? "로그인"
              : "회원가입"
        }
        onClick={async () => {
          if (isSubmitting) {
            return;
          }

          if (!email.trim() || !password.trim()) {
            setLocalMessage("이메일과 비밀번호를 모두 입력해 주세요.");
            return;
          }

          if (password.trim().length < 6) {
            setLocalMessage("비밀번호는 6자 이상 입력해 주세요.");
            return;
          }

          setLocalMessage("");

          if (mode === "signIn") {
            await onSignIn({
              email,
              password,
            });
            return;
          }

          await onSignUp({
            email,
            password,
            nickname,
          });
        }}
      />
    </SheetShell>
  );
}

function InviteLinkModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <SheetShell title="초대 링크로 참여하기" onClose={onClose}>
      <div className="rounded-2xl border border-line bg-canvas p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          초대 링크 확인
        </p>
        <p className="mt-3 break-all text-[13px] font-semibold text-ink">
          carrymate.app/join/CARRY2026
        </p>
        <p className="mt-3 text-[13px] leading-6 text-muted">
          초대 링크가 확인되었습니다. 확인 버튼을 누르면 데모 팀으로 바로 입장합니다.
        </p>
      </div>
      <PrimaryButton label="확인" onClick={onConfirm} />
    </SheetShell>
  );
}

function QrScannerModal({
  onClose,
  onScanSuccess,
}: {
  onClose: () => void;
  onScanSuccess: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 bg-slate-950/50 px-4 pb-6 pt-16">
      <div className="mx-auto max-w-md rounded-[2rem] border border-white/15 bg-slate-950 p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200">
              QR Scanner
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">QR 스캔으로 팀 참여하기</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white"
          >
            닫기
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          아래 스캔 프레임을 눌러 데모 QR을 스캔하세요.
        </p>

        <button
          type="button"
          onClick={onScanSuccess}
          className="relative mt-5 flex aspect-square w-full items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/15 bg-[linear-gradient(180deg,#0f172a,#111c31)]"
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="absolute inset-x-8 top-1/2 h-px -translate-y-1/2 bg-brand/70 shadow-[0_0_12px_rgba(0,113,227,0.18)]" />
          <div className="relative h-56 w-56 rounded-[1.5rem] border border-white/25 bg-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
            <Corner className="left-0 top-0 border-l-4 border-t-4" />
            <Corner className="right-0 top-0 border-r-4 border-t-4" />
            <Corner className="bottom-0 left-0 border-b-4 border-l-4" />
            <Corner className="bottom-0 right-0 border-b-4 border-r-4" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white">
                탭해서 CARRY2026 스캔
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

function ShareInviteModal({
  copyFeedback,
  inviteCode,
  inviteLink,
  noticeMessage,
  onCopy,
  onClose,
}: {
  copyFeedback: string;
  inviteCode: string;
  inviteLink: string;
  noticeMessage: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 bg-slate-950/30 px-4 pb-6 pt-16">
      <div className="mx-auto max-w-md rounded-[2rem] border border-line bg-white p-5 shadow-soft">
        <div className="rounded-[1.75rem] border border-line bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            팀 생성 완료
          </p>
          <h2 className="mt-2 text-xl font-semibold text-ink">팀원 초대 공유</h2>
          <p className="mt-2 text-[13px] leading-6 text-muted">
            발표 전에 코드, 링크, QR 중 편한 방식으로 바로 공유할 수 있어요.
          </p>
          {noticeMessage ? (
            <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-success">
              {noticeMessage}
            </p>
          ) : null}
        </div>

        <div className="mt-4 space-y-3">
          <InviteInfoCard label="초대 코드" value={inviteCode} />
          <InviteInfoCard label="초대 링크" value={inviteLink} />
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <p className="text-[13px] font-semibold text-ink">초대 QR</p>
            <FakeQrCode value={inviteLink} />
          </div>
        </div>

        {copyFeedback ? (
          <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-success">
            {copyFeedback}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-2xl border border-line bg-white px-4 py-3 font-semibold text-ink"
          >
            복사하기
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-brand px-4 py-3 font-semibold text-white shadow-brand"
          >
            닫고 입장하기
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberLinkSheet({
  creatorName,
  isLoading,
  members,
  message,
  onClose,
  onClaim,
  onCreateNew,
}: {
  creatorName: string;
  isLoading: boolean;
  members: TeamMemberRow[];
  message: string;
  onClose: () => void;
  onClaim: (memberId: string) => void;
  onCreateNew: () => void;
}) {
  return (
    <SheetShell title="내 팀원 정보 연결" onClose={onClose}>
      <p className="text-sm leading-6 text-muted">
        이름이 같다는 이유만으로 자동 연결하지 않습니다. 아래 미연결 팀원 중 내 항목을 선택하거나, 없으면 새 팀원으로 참여해 주세요.
      </p>
      <div className="space-y-3">
        {members.length > 0 ? (
          members.map((member) => (
            <button
              key={member.id}
              type="button"
              disabled={isLoading}
              onClick={() => onClaim(member.id)}
              className="flex w-full items-center justify-between rounded-2xl border border-line bg-white px-4 py-4 text-left shadow-soft disabled:opacity-60"
            >
              <div>
                <p className="text-sm font-semibold text-ink">{member.name}</p>
                <p className="mt-1 text-[12px] text-muted">
                  {member.role} · {member.skill_tag}
                </p>
              </div>
              <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
                선택
              </span>
            </button>
          ))
        ) : (
          <div className="rounded-2xl border border-line bg-canvas px-4 py-4 text-sm leading-6 text-muted">
            아직 연결 가능한 초대 대상 팀원이 없습니다. 내 이름으로 새 팀원 참여를 만들 수 있어요.
          </div>
        )}
      </div>
      {message ? (
        <p className="rounded-2xl bg-canvas px-4 py-3 text-sm leading-6 text-muted">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        disabled={isLoading}
        onClick={onCreateNew}
        className="w-full rounded-2xl border border-line bg-white px-4 py-4 text-sm font-semibold text-ink shadow-soft disabled:opacity-60"
      >
        {isLoading ? "연결 중..." : `${creatorName} 이름으로 새 팀원 참여`}
      </button>
    </SheetShell>
  );
}

function CreateTeamSheet({
  creatorName,
  onClose,
  onSubmit,
  submitMessage,
}: {
  creatorName: string;
  onClose: () => void;
  onSubmit: (input: {
    teamName: string;
    courseName: string;
    memberNames: string;
    description: string;
    startDate: string;
    endDate: string;
  }) => Promise<boolean>;
  submitMessage: string;
}) {
  // TODO: Supabase 연동 시 이 폼 상태는 react-hook-form + 서버 submit 로직으로 대체 가능
  const [teamName, setTeamName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [memberNames, setMemberNames] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localMessage, setLocalMessage] = useState("");

  return (
    <SheetShell title="새 팀 만들기" onClose={onClose}>
      {creatorName ? (
        <div className="rounded-2xl border border-line bg-canvas px-4 py-3">
          <p className="text-[12px] font-semibold text-brand">로그인 팀장 자동 추가</p>
          <p className="mt-1 text-[13px] leading-6 text-muted">
            {creatorName}님은 자동으로 팀장으로 추가됩니다. 아래에는 초대할 팀원 이름만 입력해 주세요.
          </p>
        </div>
      ) : null}
      <div className="space-y-3">
        <SheetInput
          label="팀명"
          value={teamName}
          onChange={setTeamName}
          placeholder="예: HCI 발표 3팀"
        />
        <SheetInput
          label="과목명"
          value={courseName}
          onChange={setCourseName}
          placeholder="예: 인간컴퓨터상호작용"
        />
        <SheetInput
          label="프로젝트 설명 (선택)"
          value={description}
          onChange={setDescription}
          placeholder="예: 발표 준비 목표를 간단히 적어주세요"
        />
        <SheetInput
          label="프로젝트 시작일 (선택)"
          type="date"
          value={startDate}
          onChange={setStartDate}
          placeholder=""
        />
        <SheetInput
          label="프로젝트 마감일"
          type="date"
          value={endDate}
          onChange={setEndDate}
          placeholder=""
        />
        <SheetInput
          label={creatorName ? "초대할 팀원 이름" : "초기 팀원 이름"}
          value={memberNames}
          onChange={setMemberNames}
          placeholder="예: 민지, 준호, 서연"
        />
      </div>
      {localMessage || submitMessage ? (
        <p className="rounded-2xl bg-canvas px-4 py-3 text-sm leading-6 text-muted">
          {localMessage || submitMessage}
        </p>
      ) : null}
      <PrimaryButton
        label={isSubmitting ? "저장 중..." : "생성하기"}
        onClick={async () => {
          if (isSubmitting) {
            return;
          }
          if (!teamName.trim() || !courseName.trim() || !endDate.trim()) {
            setLocalMessage("팀명, 과목명, 프로젝트 마감일을 모두 입력해 주세요.");
            return;
          }
          if (startDate && startDate > endDate) {
            setLocalMessage("프로젝트 마감일은 시작일보다 빠를 수 없어요.");
            return;
          }
          setLocalMessage("");
          setIsSubmitting(true);
          const ok = await onSubmit({
            teamName,
            courseName,
            memberNames,
            description,
            startDate,
            endDate,
          });
          if (!ok) {
            setLocalMessage(
              "Supabase 저장에 실패했습니다. 환경변수와 teams 테이블 정책을 확인해 주세요.",
            );
          }
          setIsSubmitting(false);
        }}
      />
    </SheetShell>
  );
}

function JoinTeamSheet({
  errorMessage,
  onClose,
  onSubmit,
}: {
  errorMessage: string;
  onClose: () => void;
  onSubmit: (code: string) => boolean;
}) {
  // TODO: Supabase 연동 시 inviteCode는 서버 검증 요청 payload로 사용 가능
  const [inviteCode, setInviteCode] = useState("");

  return (
    <SheetShell title="초대 코드로 참여하기" onClose={onClose}>
      <SheetInput
        label="초대 코드"
        value={inviteCode}
        onChange={setInviteCode}
        placeholder="예: CARRY2026"
      />
      {errorMessage ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </p>
      ) : (
        <p className="rounded-2xl bg-canvas px-4 py-3 text-sm text-muted">
          데모 코드는 CARRY2026입니다.
        </p>
      )}
      <PrimaryButton
        label="참여하기"
        onClick={() => {
          onSubmit(inviteCode);
        }}
      />
    </SheetShell>
  );
}

function ConfirmModal({
  memberName,
  onCancel,
  onConfirm,
}: {
  memberName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/35 px-4 py-24">
      <div className="mx-auto max-w-md rounded-[2rem] border border-line bg-white p-6 shadow-soft">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          팀원 변경
        </p>
        <h2 className="mt-3 text-xl font-semibold text-ink">{memberName}님 나가기</h2>
        <p className="mt-3 text-[13px] leading-7 text-muted">
          정말로 이 팀원이 나가나요? 해당 팀원의 업무가 담당자 미정 상태로 전환됩니다.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border border-line bg-white px-4 py-3 font-semibold text-muted"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-2xl bg-brand px-4 py-3 font-semibold text-white shadow-brand"
          >
            승인
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickActionSheet({
  title,
  description,
  actionLabel,
  placeholder,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  actionLabel: string;
  placeholder: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  // TODO: Supabase 연동 시 이 입력값은 생성 API mutation payload로 대체 가능
  const [value, setValue] = useState("");

  return (
    <SheetShell title={title} onClose={onClose}>
      <p className="text-sm leading-6 text-muted">{description}</p>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="mt-4 w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none transition focus:border-brand"
      />
      <PrimaryButton
        label={actionLabel}
        onClick={() => {
          const trimmedValue = value.trim();
          if (!trimmedValue) {
            return;
          }
          onSubmit(trimmedValue);
        }}
      />
    </SheetShell>
  );
}

function MeetingCreateSheet({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    startsAt: string;
    endsAt: string;
  }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <SheetShell title="회의 만들기" onClose={onClose}>
      <p className="text-sm leading-6 text-muted">
        실제 UUID 팀에서는 회의가 DB에 저장되고, 종료 후 채팅 요약과 할 일 전송까지 연결됩니다.
      </p>
      <div className="space-y-3">
        <SheetInput
          label="회의 제목"
          value={title}
          onChange={setTitle}
          placeholder="예: 발표 리허설 회의"
        />
        <SheetInput
          label="시작 시각"
          type="datetime-local"
          value={startsAt}
          onChange={setStartsAt}
          placeholder=""
        />
        <SheetInput
          label="종료 시각 (선택)"
          type="datetime-local"
          value={endsAt}
          onChange={setEndsAt}
          placeholder=""
        />
      </div>
      {message ? (
        <p className="rounded-2xl bg-canvas px-4 py-3 text-sm leading-6 text-muted">
          {message}
        </p>
      ) : null}
      <PrimaryButton
        label={isSubmitting ? "회의 생성 중..." : "회의 생성"}
        onClick={async () => {
          if (isSubmitting) {
            return;
          }

          if (!title.trim() || !startsAt.trim()) {
            setMessage("회의 제목과 시작 시각을 입력해 주세요.");
            return;
          }

          if (endsAt && endsAt < startsAt) {
            setMessage("종료 시각은 시작 시각보다 빠를 수 없습니다.");
            return;
          }

          setMessage("");
          setIsSubmitting(true);
          const ok = await onSubmit({ title, startsAt, endsAt });
          if (!ok) {
            setMessage("회의 생성에 실패했습니다. Supabase 정책과 환경변수를 확인해 주세요.");
          }
          setIsSubmitting(false);
        }}
      />
    </SheetShell>
  );
}

function UploadSheet({
  onClose,
  onUpload,
}: {
  onClose: () => void;
  onUpload: (category: FileCategory) => void;
}) {
  const categories: { id: FileCategory; title: string; description: string }[] = [
    {
      id: "minutes",
      title: "회의록",
      description: "오늘 논의 내용을 바로 추가합니다.",
    },
    {
      id: "materials",
      title: "과제 자료",
      description: "발표 자료나 산출물을 추가합니다.",
    },
    {
      id: "links",
      title: "참고 링크",
      description: "조사 링크나 레퍼런스를 정리합니다.",
    },
  ];

  return (
    <SheetShell title="파일 더미 업로드" onClose={onClose}>
      <p className="text-sm leading-6 text-muted">
        발표 시연용으로 선택한 카테고리에 새 파일이 바로 추가됩니다.
      </p>
      <div className="mt-4 space-y-3">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onUpload(category.id)}
            className="flex w-full items-start justify-between rounded-2xl border border-line bg-white px-4 py-4 text-left shadow-soft transition hover:border-brand"
          >
            <div>
              <p className="font-semibold text-ink">{category.title}</p>
              <p className="mt-1 text-sm text-muted">{category.description}</p>
            </div>
            <span className="text-lg text-brand">+</span>
          </button>
        ))}
      </div>
    </SheetShell>
  );
}

function SheetShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-30 bg-slate-950/30 px-4 pb-6 pt-24">
      <div className="mx-auto max-w-md rounded-[2rem] border border-line bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-canvas px-3 py-1 text-sm font-medium text-muted"
          >
            닫기
          </button>
        </div>
        <div className="mt-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function SheetInput({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: "text" | "date" | "datetime-local" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-semibold text-ink">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none transition focus:border-brand"
      />
    </label>
  );
}

function PrimaryButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white shadow-brand"
    >
      {label}
    </button>
  );
}

function InviteInfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-canvas p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
        {label}
      </p>
      <p className="mt-2 break-all text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function FakeQrCode({ value }: { value: string }) {
  const cells = Array.from({ length: 64 }, (_, index) => {
    const sourceChar = value.charCodeAt(index % Math.max(value.length, 1)) || 0;
    return (sourceChar + index * 7) % 3 === 0 ? 1 : 0;
  });

  return (
    <div className="mt-3 flex justify-center">
      <div className="grid grid-cols-8 gap-1 rounded-2xl bg-white p-3 shadow-soft">
        {cells.map((cell, index) => (
          <span
            key={`${cell}-${index}`}
            className={`h-4 w-4 rounded-[4px] ${cell ? "bg-ink" : "bg-white"}`}
          />
        ))}
      </div>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return <span className={`absolute h-8 w-8 border-brand ${className}`} />;
}

