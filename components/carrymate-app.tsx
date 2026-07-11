"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { FileTab } from "@/components/file-tab";
import { HomeTab } from "@/components/home-tab";
import { ScheduleTab } from "@/components/schedule-tab";
import { TaskTab } from "@/components/task-tab";
import { getDemoWorkspace } from "@/data/carrymate";
import {
  formatTaskDueLabel,
  isUuid,
  mapTaskRowsToTasks,
  mapTeamMemberRowsToTeamMembers,
} from "@/lib/mappers/carrymate";
import { formatDeadlineLabel } from "@/lib/carrymate/project-dates";
import {
  createTask,
  getTasksByTeam,
  updateTaskFields,
} from "@/lib/supabase/tasks";
import {
  createTeamMembers,
  getTeamMembersByTeam,
} from "@/lib/supabase/team-members";
import { saveTeamToSupabase } from "@/lib/supabase/teams";
import {
  ConfirmedMeeting,
  FileCategory,
  FileItem,
  HealthStatus,
  Project,
  ScheduleSlot,
  TabId,
  Task,
  TaskStatus,
  TeamMember,
} from "@/types/carrymate";

type ViewMode = "onboarding" | "workspace";
type WorkspaceSheetMode = "task" | "schedule" | "file" | null;
type OnboardingSheetMode =
  | "createTeam"
  | "joinTeam"
  | "joinLink"
  | "joinQr"
  | "shareInvite"
  | null;

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

export function CarryMateApp() {
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
  const [isTaskCreating, setIsTaskCreating] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const tasksRef = useRef(tasks);
  const membersRef = useRef(members);

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

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  );
  const hasPersistentProjectId = isUuid(project.id);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

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
    setPendingMemberExitId(null);
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

    // 새 팀 생성은 백엔드가 없는 MVP이므로
    // 입력값을 현재 화면 상태에 즉시 반영하는 방식으로 시뮬레이션한다.
    const names = input.memberNames
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const normalizedMemberNames = names.length > 0 ? names : ["팀장"];

    const nextMembers: TeamMember[] =
      names.length > 0
        ? names.map((name, index) => ({
            id: `member-${Date.now()}-${index}`,
            name,
            role: ROLE_POOL[index % ROLE_POOL.length],
            skillTag: SKILL_POOL[index % SKILL_POOL.length],
            availability: DEFAULT_AVAILABILITY,
            status: "active" as const,
          }))
        : [
            {
              id: `member-${Date.now()}-0`,
              name: "팀장",
              role: ROLE_POOL[0],
              skillTag: SKILL_POOL[0],
              availability: DEFAULT_AVAILABILITY,
              status: "active" as const,
            },
          ];

    const [leader, secondMember, thirdMember] = nextMembers;
    const nextProject: Project = {
      id: `project-${Date.now()}`,
      name: input.teamName,
      courseName: input.courseName,
      deadlineLabel,
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
      deadlineLabel,
      memberNames: names,
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
        normalizedMemberNames,
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
        setMemberSyncMessage("");
      }
    }

    setProject({
      ...nextProject,
      id: saveResult.team?.id ?? nextProject.id,
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
    // 실제 서버 검증 대신 데모 코드만 성공 처리한다.
    if (code.trim() === "CARRY2026") {
      loadDemoWorkspace();
      return true;
    }

    setInviteError("초대 코드가 맞지 않아요. 데모 코드는 CARRY2026입니다.");
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
      createdByMemberId: activeMembers[0]?.id ?? null,
    };

    setConfirmedMeetings((current) => [nextMeeting, ...current]);
    setScheduleSlots((current) => current.filter((slot) => slot.id !== slotId));
    setActiveTab("schedule");
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
          onConfirm={loadDemoWorkspace}
        />
      );
    }

    if (onboardingSheetMode === "joinQr") {
      return (
        <QrScannerModal
          onClose={() => setOnboardingSheetMode(null)}
          onScanSuccess={loadDemoWorkspace}
        />
      );
    }

    if (onboardingSheetMode === "shareInvite") {
      return (
        <ShareInviteModal
          copyFeedback={copyFeedback}
          noticeMessage={teamSaveMessage}
          onClose={() => {
            setOnboardingSheetMode(null);
            setViewMode("workspace");
            setTeamSaveMessage("");
          }}
          onCopy={() => setCopyFeedback("초대 정보 복사 완료!")}
        />
      );
    }

    return null;
  };

  if (viewMode === "onboarding") {
    return (
      <>
        <OnboardingScreen
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
          onTryDemo={loadDemoWorkspace}
        />
        {renderOnboardingSheet()}
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
            </div>
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
              onConfirmSlot={handleConfirmSlot}
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
  onCreateTeam,
  onJoinCode,
  onJoinLink,
  onJoinQr,
  onTryDemo,
}: {
  onCreateTeam: () => void;
  onJoinCode: () => void;
  onJoinLink: () => void;
  onJoinQr: () => void;
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
  noticeMessage,
  onCopy,
  onClose,
}: {
  copyFeedback: string;
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
          <InviteInfoCard label="초대 코드" value="CARRY2026" />
          <InviteInfoCard label="초대 링크" value="carrymate.app/join/CARRY2026" />
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <p className="text-[13px] font-semibold text-ink">가짜 QR 코드</p>
            <FakeQrCode />
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

function CreateTeamSheet({
  onClose,
  onSubmit,
  submitMessage,
}: {
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
          label="초기 팀원 이름"
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
  type?: "text" | "date";
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
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

function FakeQrCode() {
  const cells = [
    1, 1, 1, 0, 1, 0, 1, 1,
    1, 0, 1, 0, 0, 1, 0, 1,
    1, 1, 1, 0, 1, 1, 1, 1,
    0, 0, 0, 1, 0, 0, 1, 0,
    1, 1, 0, 1, 1, 0, 1, 1,
    0, 1, 0, 0, 1, 0, 0, 1,
    1, 1, 1, 0, 1, 1, 0, 1,
    1, 0, 1, 0, 0, 1, 1, 1,
  ];

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

