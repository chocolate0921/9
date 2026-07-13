import { useState } from "react";
import { ConfirmedMeeting, Task } from "@/types/carrymate";

type Summary = {
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
  healthStatus: "safe" | "warning" | "risk";
  briefing: string;
};

const analysisPresets = [
  {
    status: "safe" as const,
    summary:
      "현재 프로젝트 흐름이 안정적이에요. 오늘 예정된 업무를 순서대로 진행해 주세요.",
  },
  {
    status: "warning" as const,
    summary:
      "오늘 마감 업무가 남아 있어요. 우선순위가 높은 업무부터 확인해 주세요.",
  },
  {
    status: "risk" as const,
    summary:
      "담당자가 정해지지 않았거나 진행이 지연된 업무가 있어 빠른 확인이 필요해요.",
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
  const todayItems = tasks
    .filter((task) => task.dueLabel === "오늘" && task.status !== "done")
    .slice(0, 3);

  const [analysisState, setAnalysisState] = useState(() =>
    summary.healthStatus === "risk"
      ? analysisPresets[2]
      : summary.healthStatus === "warning"
        ? analysisPresets[1]
        : analysisPresets[0],
  );

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshAnalysis = () => {
    setIsRefreshing(true);

    window.setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * analysisPresets.length);
      setAnalysisState(analysisPresets[randomIndex]);
      setIsRefreshing(false);
    }, 700);
  };

  return (
    <div className="space-y-4 pb-4">
      {/* 전체 진행률 */}
      <section className="rounded-[28px] border border-[#eeeaf8] bg-white px-5 py-7 shadow-[0_10px_30px_rgba(80,63,155,0.08)]">
        <p className="text-center text-[12px] font-semibold text-[#77718a] sm:text-sm lg:text-base">
          오늘의 진행률
        </p>

        <div className="mt-5 flex justify-center">
          <ProgressCircle progress={summary.progress} />
        </div>
      </section>

      {/* 가장 중요한 업무 */}
      <section className="overflow-hidden rounded-[26px] bg-gradient-to-br from-[#7469f4] to-[#5148df] p-5 text-white shadow-[0_16px_32px_rgba(83,72,220,0.28)]">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold">
            다음 우선순위
          </span>

          <button
            type="button"
            onClick={onJumpToTasks}
            className="text-[12px] font-semibold text-white/80"
          >
            업무 보기
          </button>
        </div>

          <h2 className="mt-5 text-[21px] font-bold leading-8 sm:text-[24px] lg:text-[30px]">
          {summary.urgentTask?.title ?? "오늘의 핵심 업무를 확인해 주세요"}
        </h2>

        <p className="mt-3 text-[13px] leading-6 text-white/75">
          {summary.urgentTask
            ? `${summary.urgentTask.dueLabel}까지 완료해야 하는 중요한 업무입니다.`
            : "모든 긴급 업무를 완료했어요. 다음 업무를 확인해 보세요."}
        </p>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex -space-x-2">
            <Avatar label="민" />
            <Avatar label="준" />
            <Avatar label="서" />
          </div>

          <button
            type="button"
            onClick={onJumpToTasks}
            className="rounded-xl bg-white px-4 py-2.5 text-[12px] font-bold text-[#5148df] shadow-lg"
          >
            지금 시작
          </button>
        </div>
      </section>

      {/* AI 브리핑 */}
      <section className="rounded-[22px] border-l-4 border-[#665cf0] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(67,55,120,0.08)]">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0eeff] text-lg">
            ✦
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-bold text-[#4f46d8] sm:text-base lg:text-lg">
                AI 브리핑
              </h3>

              <button
                type="button"
                onClick={handleRefreshAnalysis}
                disabled={isRefreshing}
                className="text-[11px] font-semibold text-[#8b86a0] disabled:opacity-50"
              >
                {isRefreshing ? "분석 중..." : "새로 분석"}
              </button>
            </div>

            <p className="mt-2 break-keep text-[13px] leading-6 text-[#625d70] sm:text-sm lg:text-base">
              {analysisState.summary}
            </p>
          </div>
        </div>
      </section>

      {/* 위험 알림 */}
      {summary.unassignedCount > 0 && (
        <AlertCard
          icon="△"
          title="AI 리스크 분석"
          description={`담당자가 지정되지 않은 업무가 ${summary.unassignedCount}개 있습니다. 업무 탭에서 자동 재분배해 주세요.`}
          tone="pink"
          onClick={onJumpToTasks}
        />
      )}

      {summary.todayTaskCount >= 2 && (
        <AlertCard
          icon="♧"
          title="중요 마감기한"
          description={`오늘 처리해야 할 업무가 ${summary.todayTaskCount}개 남았습니다. 중요한 업무부터 진행해 주세요.`}
          tone="red"
          onClick={onJumpToTasks}
        />
      )}

      {/* 오늘 할 일 */}
      <section>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-[16px] font-bold text-[#252236] sm:text-lg lg:text-xl">
            오늘의 할 일
          </h3>

          <button
            type="button"
            onClick={onJumpToTasks}
            className="text-[12px] font-semibold text-[#6259e8]"
          >
            모두 보기
          </button>
        </div>

        <div className="space-y-2.5">
          {todayItems.length === 0 ? (
            <EmptyState text="오늘 예정된 업무를 모두 완료했어요." />
          ) : (
            todayItems.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={onJumpToTasks}
                className="flex w-full items-center gap-3 rounded-[20px] border border-[#eeeaf7] bg-white px-4 py-4 text-left shadow-[0_7px_20px_rgba(64,52,115,0.07)]"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    task.status === "inProgress"
                      ? "bg-[#eeeaff] text-[#6259e8]"
                      : "bg-[#f6f4fb] text-[#aaa5b8]"
                  }`}
                >
                  {task.status === "inProgress" ? "◔" : "✓"}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-[13px] font-bold text-[#343044] sm:text-sm lg:text-base">
                    {task.title}
                  </p>

                  <p className="mt-1 whitespace-nowrap text-[11px] text-[#9993a7] sm:text-xs">
                    {task.status === "inProgress" ? "진행 중" : "오늘 마감"}
                  </p>
                </div>

                <span className="text-lg text-[#aba5bb]">⋮</span>
              </button>
            ))
          )}
        </div>
      </section>

      {/* 오늘 일정 */}
      {todayMeetings.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-[16px] font-bold text-[#252236] sm:text-lg lg:text-xl">
              오늘의 일정
            </h3>

            <button
              type="button"
              onClick={onJumpToSchedule}
              className="text-[12px] font-semibold text-[#6259e8]"
            >
              일정 보기
            </button>
          </div>

          <div className="space-y-2.5">
            {todayMeetings.slice(0, 2).map((meeting) => (
              <MeetingRow key={meeting.id} meeting={meeting} />
            ))}
          </div>
        </section>
      )}

      {/* 진행 중인 프로젝트 */}
      <section>
        <h3 className="mb-3 px-1 text-[16px] font-bold text-[#252236] sm:text-lg lg:text-xl">
          진행 중인 프로젝트
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <QuickMenu
            icon="♧"
            title="프로젝트 현황"
            description={`${summary.inProgressCount}개 진행 중`}
            onClick={onJumpToTasks}
          />

          <QuickMenu
            icon="↗"
            title="업무 현황"
            description={`${summary.doneCount}개 완료`}
            onClick={onJumpToTasks}
          />

          <QuickMenu
            icon="◷"
            title="팀 일정"
            description={`${todayMeetings.length + upcomingMeetings.length}개 일정`}
            onClick={onJumpToSchedule}
          />

        </div>
      </section>
    </div>
  );
}

function ProgressCircle({ progress }: { progress: number }) {
  const safeProgress = Math.max(0, Math.min(progress, 100));
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeProgress / 100) * circumference;

  return (
    <div className="relative h-32 w-32">
      <svg
        viewBox="0 0 120 120"
        className="h-full w-full -rotate-90"
        aria-label={`프로젝트 진행률 ${safeProgress}%`}
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#efedf7"
          strokeWidth="9"
        />

        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#5b52e8"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <strong className="text-[28px] font-extrabold text-[#5148df]">
          {safeProgress}%
        </strong>
        <span className="mt-0.5 text-[10px] font-semibold text-[#9892a8]">
          진행 상태
        </span>
      </div>
    </div>
  );
}

function Avatar({ label }: { label: string }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#665cf0] bg-[#f6d9bd] text-[10px] font-bold text-[#4f423b]">
      {label}
    </span>
  );
}

function AlertCard({
  icon,
  title,
  description,
  tone,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  tone: "pink" | "red";
  onClick: () => void;
}) {
  const toneClass =
    tone === "pink"
      ? "border-l-[#f0549a] bg-[#fffafd] text-[#d93b83]"
      : "border-l-[#ef4d58] bg-[#fffafa] text-[#dc3845]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[22px] border-l-4 px-4 py-4 text-left shadow-[0_8px_24px_rgba(67,55,120,0.07)] ${toneClass}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg">{icon}</span>

        <div>
          <h3 className="text-[13px] font-bold">{title}</h3>
          <p className="mt-2 text-[12px] leading-5 text-[#686272]">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}

function MeetingRow({ meeting }: { meeting: ConfirmedMeeting }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-[20px] border border-[#eeeaf7] bg-white px-4 py-4 text-left shadow-[0_7px_20px_rgba(64,52,115,0.07)]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f1efff] text-[#6259e8]">
        ◷
      </span>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-[13px] font-bold text-[#343044] sm:text-sm lg:text-base">
          {meeting.title}
        </p>
        <p className="mt-1 whitespace-nowrap text-[11px] text-[#9993a7] sm:text-xs">
          {meeting.dateLabel} · {meeting.timeRange}
        </p>
      </div>

      <span className="text-[#aaa5b8]">›</span>
    </button>
  );
}

function QuickMenu({
  icon,
  title,
  description,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-28 items-center gap-3 rounded-[22px] border border-[#eeeaf7] bg-white p-4 text-left shadow-[0_8px_24px_rgba(64,52,115,0.08)] transition active:scale-[0.98] sm:p-5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1efff] text-[17px] font-bold text-[#6259e8]">
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-[#322e40] sm:text-sm lg:text-base">
          {title}
        </p>
        <p className="mt-1 break-keep text-[10px] text-[#9a94a8] sm:text-xs lg:text-sm">
          {description}
        </p>
      </div>
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#ddd8ea] bg-white px-4 py-7 text-center text-[12px] text-[#9690a5]">
      {text}
    </div>
  );
}
