import { useMemo, useState } from "react";
import { ConfirmedMeeting, ScheduleSlot, TeamMember } from "@/types/carrymate";

type AttendanceStatus = "attending" | "late" | "absent";

const attendanceOrder: AttendanceStatus[] = ["attending", "late", "absent"];
const attendanceMeta: Record<
  AttendanceStatus,
  { label: string; className: string }
> = {
  attending: {
    label: "참석",
    className: "bg-emerald-50 text-success",
  },
  late: {
    label: "지각",
    className: "bg-amber-50 text-warning",
  },
  absent: {
    label: "불참",
    className: "bg-rose-50 text-danger",
  },
};

const initialRules = [
  // TODO: Supabase 연동 시 `ground_rules` 테이블 fetch 결과로 대체 가능
  { id: "rule-1", text: "회의 시간 10분 전 오기", checked: true },
  { id: "rule-2", text: "의견 제안 시 긍정적으로 리액션하기", checked: true },
  { id: "rule-3", text: "회의 후 해야 할 일 바로 정리하기", checked: false },
];

const initialQuestions = [
  // TODO: Supabase 연동 시 `questions` 테이블 fetch 결과로 대체 가능
  "PPT 마지막 장에 데모 흐름을 한 줄로 더 넣을까요?",
  "발표 역할 분담은 오늘 회의 끝나고 확정해도 괜찮을까요?",
];

export function ScheduleTab({
  members,
  slots,
  meetings,
  onAddSchedule,
  onConfirmSlot,
}: {
  members: TeamMember[];
  slots: ScheduleSlot[];
  meetings: ConfirmedMeeting[];
  onAddSchedule: () => void;
  onConfirmSlot: (slotId: string) => void;
}) {
  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  );

  // TODO: Supabase 연동 시 출석 상태는 `meeting_attendance` 조회/업데이트로 대체 가능
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, AttendanceStatus>
  >(() => {
    const initialMap: Record<string, AttendanceStatus> = {};

    meetings.forEach((meeting) => {
      activeMembers.forEach((member, index) => {
        initialMap[`${meeting.id}-${member.id}`] = index === 0 ? "late" : "attending";
      });
    });

    return initialMap;
  });
  // TODO: Supabase 연동 시 팀 규칙/투표/질문은 각각 별도 테이블 fetch 결과로 대체 가능
  const [rules, setRules] = useState(initialRules);
  const [voteCounts, setVoteCounts] = useState({ optionA: 4, optionB: 3 });
  const [questionInput, setQuestionInput] = useState("");
  const [questions, setQuestions] = useState(initialQuestions);

  const totalVotes = voteCounts.optionA + voteCounts.optionB;
  const optionAPercent =
    totalVotes === 0 ? 0 : Math.round((voteCounts.optionA / totalVotes) * 100);
  const optionBPercent = 100 - optionAPercent;

  const cycleAttendance = (meetingId: string, memberId: string) => {
    // 한 버튼으로 출석 상태가 순환되도록 해
    // 발표 중 빠르게 참석 -> 지각 -> 불참 변화를 보여준다.
    const key = `${meetingId}-${memberId}`;
    const current = attendanceMap[key] ?? "attending";
    const next =
      attendanceOrder[(attendanceOrder.indexOf(current) + 1) % attendanceOrder.length];

    setAttendanceMap((currentMap) => ({
      ...currentMap,
      [key]: next,
    }));
  };

  const toggleRule = (ruleId: string) => {
    // 규칙 체크 여부는 서버 저장 없이 로컬에서 즉시 토글한다.
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId ? { ...rule, checked: !rule.checked } : rule,
      ),
    );
  };

  const vote = (option: "A" | "B") => {
    // 투표는 버튼을 누를 때마다 해당 안의 표 수만 1 증가시킨다.
    setVoteCounts((current) =>
      option === "A"
        ? { ...current, optionA: current.optionA + 1 }
        : { ...current, optionB: current.optionB + 1 },
    );
  };

  const submitQuestion = () => {
    // 질문 입력은 빈 문자열을 막고, 최신 질문이 위로 오도록 prepend 한다.
    const trimmed = questionInput.trim();
    if (!trimmed) {
      return;
    }

    setQuestions((current) => [trimmed, ...current]);
    setQuestionInput("");
  };

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">일정 조율</h2>
            <p className="mt-1 text-[13px] text-muted">
              팀원 가용 시간과 추천 슬롯을 바로 확정해요.
            </p>
          </div>
          <button
            type="button"
            onClick={onAddSchedule}
            className="rounded-2xl bg-brand px-4 py-3 text-[13px] font-semibold text-white shadow-brand"
          >
            일정 추가
          </button>
        </div>
      </section>

      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">팀원 가용 시간</h3>
          <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
            시연용 더미 데이터
          </span>
        </div>
        <div className="space-y-3">
          {activeMembers.map((member) => (
            <div
              key={member.id}
              className="rounded-2xl border border-line px-4 py-4"
            >
              <p className="text-[15px] font-semibold text-ink">{member.name}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {member.availability.map((slot) => (
                  <span
                    key={slot}
                    className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted"
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">팀 규칙</h3>
          <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
            Ground Rules
          </span>
        </div>
        <div className="space-y-3">
          {rules.map((rule) => (
            <button
              key={rule.id}
              type="button"
              onClick={() => toggleRule(rule.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-4 text-left"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-semibold ${
                  rule.checked
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-white text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="text-[13px] text-ink">{rule.text}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">AI 회의 시간 추천</h3>
          <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
            겹치는 시간 우선
          </span>
        </div>
        <div className="space-y-3">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className="rounded-2xl border border-line px-4 py-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[15px] font-semibold text-ink">{slot.label}</p>
                  <p className="mt-1 text-[13px] text-muted">
                    {slot.dateLabel} · {slot.timeRange}
                  </p>
                  <p className="mt-2 text-[13px] leading-6 text-muted">
                    참여 가능:{" "}
                    {slot.memberIds
                      .map((memberId) => activeMembers.find((member) => member.id === memberId)?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
                {slot.recommended ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-success">
                    추천
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onConfirmSlot(slot.id)}
                className="mt-4 w-full rounded-2xl bg-brand px-4 py-3 text-[13px] font-semibold text-white shadow-brand"
              >
                슬롯 확정하기
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">확정된 일정</h3>
          <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
            {meetings.length}개
          </span>
        </div>
        <div className="space-y-3">
          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              className="rounded-2xl border border-line px-4 py-4"
            >
              <p className="text-[15px] font-semibold text-ink">{meeting.title}</p>
              <p className="mt-1 text-[13px] text-muted">
                {meeting.dateLabel} · {meeting.timeRange}
              </p>
              <p className="mt-2 text-[13px] text-muted">
                참석 인원 {meeting.attendeeCount}명
              </p>

              <div className="mt-4 rounded-2xl bg-canvas px-4 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-ink">팀원 출석 체크</p>
                  <span className="text-[11px] text-muted">이름을 눌러 상태 변경</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeMembers.map((member) => {
                    const status =
                      attendanceMap[`${meeting.id}-${member.id}`] ?? "attending";
                    const meta = attendanceMeta[status];

                    return (
                      <button
                        key={`${meeting.id}-${member.id}`}
                        type="button"
                        onClick={() => cycleAttendance(meeting.id, member.id)}
                        className={`rounded-full px-3 py-2 text-[11px] font-semibold ${meta.className}`}
                      >
                        {member.name} · {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {meeting.createdByMemberId &&
              members.find(
                (member) =>
                  member.id === meeting.createdByMemberId &&
                  member.status === "former",
              ) ? (
                <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-muted">
                  이전 팀원 이력 포함
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">투표 및 질문</h3>
          <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
            Live
          </span>
        </div>

        <div className="rounded-2xl border border-line px-4 py-4">
          <p className="text-[14px] font-semibold text-ink">
            이번 주 발표 자료 PPT 디자인 컨셉 투표
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => vote("A")}
              className="rounded-2xl border border-line bg-white px-4 py-3 text-[13px] font-semibold text-ink"
            >
              A안
            </button>
            <button
              type="button"
              onClick={() => vote("B")}
              className="rounded-2xl border border-line bg-white px-4 py-3 text-[13px] font-semibold text-ink"
            >
              B안
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <VoteMeter label="A안" percent={optionAPercent} count={voteCounts.optionA} />
            <VoteMeter label="B안" percent={optionBPercent} count={voteCounts.optionB} />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-line px-4 py-4">
          <p className="text-[14px] font-semibold text-ink">질문 게시판</p>
          <div className="mt-3 space-y-2">
            {questions.map((question) => (
              <div
                key={question}
                className="rounded-2xl bg-canvas px-4 py-3 text-[13px] text-ink"
              >
                {question}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <input
              value={questionInput}
              onChange={(event) => setQuestionInput(event.target.value)}
              placeholder="질문 남기기"
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-[13px] text-ink outline-none"
            />
            <button
              type="button"
              onClick={submitQuestion}
              className="rounded-2xl bg-brand px-4 py-3 text-[13px] font-semibold text-white shadow-brand"
            >
              등록
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function VoteMeter({
  label,
  percent,
  count,
}: {
  label: string;
  percent: number;
  count: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] text-muted">
        <span>{label}</span>
        <span>
          {percent}% · {count}표
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-brand transition-all duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
