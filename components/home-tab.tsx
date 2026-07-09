import { useState } from "react";
import {
  ConfirmedMeeting,
  Task,
} from "@/types/carrymate";

type Summary = {
  todayTaskCount: number;
  inProgressCount: number;
  doneCount: number;
  unassignedCount: number;
  urgentTask?: Task;
  progress: number;
  healthStatus: "safe" | "warning" | "risk";
  briefing: string;
};

const healthStatusMap = {
  safe: {
    title: "안전",
    className: "bg-emerald-50 text-success",
    detail: "지금 흐름이면 큰 문제 없이 마감 가능해요.",
  },
  warning: {
    title: "주의",
    className: "bg-amber-50 text-warning",
    detail: "핵심 업무 하나만 더 밀리면 발표 준비가 급해져요.",
  },
  risk: {
    title: "위험",
    className: "bg-rose-50 text-danger",
    detail: "담당자 미정 업무나 급한 일정이 있어 바로 정리가 필요해요.",
  },
};

const analysisPresets = [
  // TODO: Supabase 연동 시 AI 분석 결과는 `analysis_results` 조회값이나
  // Edge Function 응답으로 대체 가능
  {
    status: "safe" as const,
    summary:
      "🟢 안전: 현재 흐름이 안정적입니다. 오늘 일정과 진행률 모두 목표 범위 안에 있어요.",
  },
  {
    status: "warning" as const,
    summary:
      "🟡 유의: 현재 진행률이 목표 대비 약간 느립니다. 오늘 할 일 1개만 더 끝내면 다시 안정권으로 돌아와요.",
  },
  {
    status: "risk" as const,
    summary:
      "⚠️ 경고: 현재 진행률이 목표 대비 15% 지연 중입니다. 서연 님의 피드백 응답 속도가 평소보다 느립니다.",
  },
];

export function HomeTab({
  summary,
  tasks,
  todayMeetings,
  upcomingMeetings,
  onJumpToTasks,
  onJumpToSchedule,
}: {
  summary: Summary;
  tasks: Task[];
  todayMeetings: ConfirmedMeeting[];
  upcomingMeetings: ConfirmedMeeting[];
  onJumpToTasks: () => void;
  onJumpToSchedule: () => void;
}) {
  const healthCard = healthStatusMap[summary.healthStatus];
  const todayItems = tasks
    .filter((task) => task.dueLabel === "오늘" && task.status !== "done")
    .slice(0, 3);

  // TODO: Supabase 연동 시 홈 상단 AI 분석 카드 상태는
  // 실시간 분석 API 응답 또는 background job 결과값으로 대체 가능
  const [analysisState, setAnalysisState] = useState(() =>
    summary.healthStatus === "risk"
      ? analysisPresets[2]
      : summary.healthStatus === "warning"
        ? analysisPresets[1]
        : analysisPresets[0],
  );
  const [updatedAt, setUpdatedAt] = useState("방금 전");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshAnalysis = () => {
    // 새로고침은 실제 API 호출 대신 짧은 지연 후 랜덤 상태를 보여줘
    // 팀원이 "분석이 다시 도는 느낌"을 바로 확인할 수 있게 한다.
    setIsRefreshing(true);

    window.setTimeout(() => {
      const nextPreset =
        analysisPresets[Math.floor(Math.random() * analysisPresets.length)];
      const nextMinute = Math.floor(Math.random() * 8) + 1;

      setAnalysisState(nextPreset);
      setUpdatedAt(`${nextMinute}분 전 업데이트`);
      setIsRefreshing(false);
    }, 700);
  };

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle title="AI 프로젝트 상태 분석" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <TrafficSignal status={analysisState.status} />
            <div>
              <p className="text-[15px] font-medium leading-7 text-ink">
                {analysisState.summary}
              </p>
              <p className="mt-3 text-[12px] text-muted">{updatedAt}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefreshAnalysis}
            disabled={isRefreshing}
            className="shrink-0 rounded-2xl border border-line bg-canvas px-4 py-3 text-[13px] font-semibold text-ink transition hover:bg-white disabled:opacity-60"
          >
            {isRefreshing ? "분석 중..." : "새로고침"}
          </button>
        </div>
      </Card>

      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Today
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{summary.progress}%</h2>
            <p className="mt-1 text-[13px] text-muted">
              진행률 · {summary.doneCount}개 완료
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-canvas px-4 py-3 text-right">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">남은 업무</p>
            <p className="mt-1 text-lg font-semibold text-ink">{summary.todayTaskCount}개</p>
          </div>
        </div>
        <div className="mt-5 h-2 rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-brand"
            style={{ width: `${summary.progress}%` }}
          />
        </div>
      </section>

      <Card>
        <SectionTitle title="AI 마감 브리핑" action="업무 보기" onClick={onJumpToTasks} />
        <p className="text-[15px] font-medium leading-7 text-ink">
          {summary.briefing}
        </p>
        {summary.unassignedCount > 0 ? (
          <div className="mt-5 rounded-2xl bg-rose-50 px-4 py-4">
            <p className="text-[13px] font-semibold text-danger">
              담당자 미정 업무 {summary.unassignedCount}개
            </p>
            <p className="mt-1 text-[13px] text-muted">
              업무 탭에서 자동 재분배하기를 눌러 빠르게 복구할 수 있어요.
            </p>
          </div>
        ) : null}
        {summary.urgentTask ? (
          <div className="mt-5 rounded-2xl border border-line bg-canvas px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              지금 가장 급한 일
            </p>
            <p className="mt-2 text-[15px] font-semibold text-ink">{summary.urgentTask.title}</p>
            <p className="mt-1 text-[13px] text-muted">{summary.urgentTask.dueLabel} 마감</p>
          </div>
        ) : null}
      </Card>

      <Card>
        <SectionTitle title="마감 신호등" />
        <div className={`rounded-2xl px-4 py-4 ${healthCard.className}`}>
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold">{healthCard.title}</p>
            <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold">
              실시간 요약
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-6">{healthCard.detail}</p>
        </div>
      </Card>

      <Card>
        <SectionTitle title="오늘 해야 할 일" />
        <div className="space-y-3">
          {todayItems.map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-2xl border border-line px-4 py-4">
              <div>
                <p className="text-[15px] font-semibold text-ink">{task.title}</p>
                <p className="mt-1 text-[13px] text-muted">
                  {task.status === "todo" ? "시작 전" : "진행 중"}
                </p>
              </div>
              <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
                오늘
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle title="오늘 일정" action="일정 보기" onClick={onJumpToSchedule} />
        <div className="space-y-3">
          {todayMeetings.length === 0 ? (
            <EmptyState text="아직 확정된 오늘 일정이 없어요." />
          ) : (
            todayMeetings.map((meeting) => (
              <MeetingRow key={meeting.id} meeting={meeting} />
            ))
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle title="다가오는 회의" />
        <div className="space-y-3">
          {upcomingMeetings.length === 0 ? (
            <EmptyState text="다가오는 회의가 아직 없어요." />
          ) : (
            upcomingMeetings.map((meeting) => (
              <MeetingRow key={meeting.id} meeting={meeting} />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-card border border-line bg-white p-6 shadow-soft">{children}</section>;
}

function SectionTitle({
  title,
  action,
  onClick,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {action && onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="text-[13px] font-medium text-muted"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

function MeetingRow({ meeting }: { meeting: ConfirmedMeeting }) {
  return (
    <div className="rounded-2xl border border-line px-4 py-4">
      <p className="text-[15px] font-semibold text-ink">{meeting.title}</p>
      <p className="mt-1 text-[13px] text-muted">
        {meeting.dateLabel} · {meeting.timeRange}
      </p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-[13px] text-muted">
      {text}
    </div>
  );
}

function TrafficSignal({
  status,
}: {
  status: "safe" | "warning" | "risk";
}) {
  const activeClassMap = {
    safe: "bg-emerald-400 shadow-[0_0_0_3px_rgba(74,222,128,0.12)]",
    warning: "bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.12)]",
    risk: "bg-rose-400 shadow-[0_0_0_3px_rgba(251,113,133,0.12)]",
  };

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-2xl border border-line bg-canvas px-3 py-3">
      {(["safe", "warning", "risk"] as const).map((light) => (
        <span
          key={light}
          className={`h-4 w-4 rounded-full ${
            status === light ? activeClassMap[light] : "bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}
