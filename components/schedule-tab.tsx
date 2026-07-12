import { useMemo, useState } from "react";
import { ConfirmedMeeting, ScheduleSlot, TeamMember } from "@/types/carrymate";

type AttendanceStatus = "attending" | "late" | "absent";

const ATTENDANCE_ORDER: AttendanceStatus[] = ["attending", "late", "absent"];
const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; className: string }
> = {
  attending: { label: "참석", className: "bg-emerald-50 text-emerald-600" },
  late: { label: "지각", className: "bg-amber-50 text-amber-600" },
  absent: { label: "불참", className: "bg-rose-50 text-rose-600" },
};

const INITIAL_RULES = [
  { id: "r1", text: "회의 시작 10분 전까지 입장하기", checked: true },
  { id: "r2", text: "핵심 안건은 짧고 명확하게 정리하기", checked: true },
  { id: "r3", text: "종료 전에 바로 다음 할 일을 확정하기", checked: false },
];

export function ScheduleTab({
  meetings,
  members,
  onAddSchedule,
  onConfirmSlot,
  onCreateMeeting,
  onOpenMeeting,
  slots,
}: {
  meetings: ConfirmedMeeting[];
  members: TeamMember[];
  onAddSchedule: () => void;
  onConfirmSlot: (slotId: string) => void;
  onCreateMeeting: () => void;
  onOpenMeeting: (meetingId: string) => void;
  slots: ScheduleSlot[];
}) {
  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  );
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>(
    {},
  );
  const [rules, setRules] = useState(INITIAL_RULES);

  const cycleAttendance = (meetingId: string, memberId: string) => {
    const key = `${meetingId}-${memberId}`;
    const current = attendanceMap[key] ?? "attending";
    const next =
      ATTENDANCE_ORDER[
        (ATTENDANCE_ORDER.indexOf(current) + 1) % ATTENDANCE_ORDER.length
      ];
    setAttendanceMap((prev) => ({ ...prev, [key]: next }));
  };

  return (
    <div className="space-y-4 pb-4">
      <section className="rounded-[26px] border-l-4 border-[#6259e8] bg-white p-5 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-[#7b74ee]">이번 주 회의 플랜</p>
            <h2 className="mt-2 text-[23px] font-extrabold leading-7 text-[#262236]">
              일정과 회의를 한 곳에서 정리
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={onCreateMeeting}
              className="rounded-full bg-[#6259e8] px-3 py-2 text-[11px] font-bold text-white"
            >
              + 회의
            </button>
            <button
              onClick={onAddSchedule}
              className="rounded-full border border-[#dcd6ff] bg-white px-3 py-2 text-[11px] font-bold text-[#6259e8]"
            >
              + 일정
            </button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <MiniStat label="남은 일정" value={`${slots.length + meetings.length}개`} />
          <MiniStat label="참여 대상" value={`${activeMembers.length}명`} />
        </div>
      </section>

      <section className="rounded-[26px] bg-white p-6 text-center shadow-panel">
        <Ring value={Math.min(100, 65 + meetings.length * 5)} />
        <h3 className="mt-4 text-[16px] font-extrabold text-[#2d293b]">회의 준비도</h3>
        <p className="mt-2 text-[11px] leading-5 text-[#938ca1]">
          확정된 일정과 회의 수를 기준으로 현재 준비 상태를 보여줍니다.
        </p>
      </section>

      <SectionTitle title="AI 추천 시간대" action="추가" onClick={onAddSchedule} />
      <div className="space-y-3">
        {slots.length > 0 ? (
          slots.map((slot) => (
            <article
              key={slot.id}
              className="rounded-[22px] border border-[#eeeaf7] bg-white p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-extrabold text-[#332f42]">{slot.label}</p>
                  <p className="mt-1 text-[11px] text-[#958fa1]">
                    {slot.dateLabel} · {slot.timeRange}
                  </p>
                </div>
                {slot.recommended ? (
                  <span className="rounded-full bg-[#efedff] px-2.5 py-1 text-[9px] font-bold text-[#6259e8]">
                    추천
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex -space-x-1.5">
                {slot.memberIds.slice(0, 4).map((memberId, index) => (
                  <Avatar
                    key={memberId}
                    index={index}
                    name={activeMembers.find((member) => member.id === memberId)?.name ?? "팀"}
                  />
                ))}
              </div>
              <button
                onClick={() => onConfirmSlot(slot.id)}
                className="mt-4 w-full rounded-xl bg-[#6259e8] py-2.5 text-[11px] font-bold text-white"
              >
                이 시간으로 확정
              </button>
            </article>
          ))
        ) : (
          <Empty text="추천 가능한 시간대가 아직 없습니다." />
        )}
      </div>

      <SectionTitle title="프로젝트 타임라인" action="회의 만들기" onClick={onCreateMeeting} />
      <div className="space-y-3">
        {meetings.length > 0 ? (
          meetings.map((meeting, index) => (
            <article
              key={meeting.id}
              className="rounded-[22px] border border-[#eeeaf7] bg-white p-4 shadow-card"
            >
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0eeff] text-[11px] font-extrabold text-[#6259e8]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-extrabold text-[#332f42]">
                      {meeting.title}
                    </p>
                    {meeting.isEnded ? (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">
                        종료됨
                      </span>
                    ) : (
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold text-brand">
                        진행 가능
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-[#958fa1]">
                    {meeting.dateLabel} · {meeting.timeRange}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {activeMembers.map((member) => {
                  const key = `${meeting.id}-${member.id}`;
                  const status = attendanceMap[key] ?? "attending";

                  return (
                    <button
                      key={key}
                      onClick={() => cycleAttendance(meeting.id, member.id)}
                      className={`rounded-full px-3 py-1.5 text-[9px] font-bold ${ATTENDANCE_META[status].className}`}
                    >
                      {member.name} · {ATTENDANCE_META[status].label}
                    </button>
                  );
                })}
              </div>

              {meeting.aiSummary ? (
                <div className="mt-4 rounded-2xl bg-[#faf9ff] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6259e8]">
                    AI 요약
                  </p>
                  <p className="mt-2 text-[12px] leading-6 text-[#625c6d]">
                    {meeting.aiSummary}
                  </p>
                </div>
              ) : null}

              <button
                onClick={() => onOpenMeeting(meeting.id)}
                className="mt-4 w-full rounded-xl border border-[#dcd6ff] bg-white py-2.5 text-[11px] font-bold text-[#6259e8]"
              >
                회의 채팅 열기
              </button>
            </article>
          ))
        ) : (
          <Empty text="확정된 회의가 아직 없습니다." />
        )}
      </div>

      <SectionTitle title="팀 회의 규칙" />
      <section className="space-y-2 rounded-[22px] bg-white p-4 shadow-card">
        {rules.map((rule) => (
          <button
            key={rule.id}
            onClick={() =>
              setRules((prev) =>
                prev.map((item) =>
                  item.id === rule.id ? { ...item, checked: !item.checked } : item,
                ),
              )
            }
            className="flex w-full items-center gap-3 rounded-2xl bg-[#faf9ff] px-3 py-3 text-left"
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] ${
                rule.checked
                  ? "bg-[#6259e8] text-white"
                  : "border border-[#dcd7e8] text-transparent"
              }`}
            >
              ✓
            </span>
            <span className="text-[11px] font-semibold text-[#5d5768]">{rule.text}</span>
          </button>
        ))}
      </section>
    </div>
  );
}

function SectionTitle({
  action,
  onClick,
  title,
}: {
  action?: string;
  onClick?: () => void;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <h3 className="text-[16px] font-extrabold text-[#282438]">{title}</h3>
      {action ? (
        <button onClick={onClick} className="text-[11px] font-bold text-[#6259e8]">
          {action}
        </button>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#faf9ff] p-3">
      <p className="text-[9px] font-semibold text-[#9a94a8]">{label}</p>
      <p className="mt-1 text-[13px] font-extrabold text-[#4b4558]">{value}</p>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative mx-auto h-28 w-28">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1edf6" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#d6257d"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="7"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[22px] font-extrabold text-[#c72272]">
        {value}%
      </div>
    </div>
  );
}

function Avatar({ index, name }: { index: number; name: string }) {
  const classes = ["bg-[#f8d9c0]", "bg-[#d8e8ff]", "bg-[#eadcff]", "bg-[#d8f3e8]"];

  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[9px] font-bold ${classes[index % classes.length]}`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#ddd8e9] bg-white px-4 py-7 text-center text-[11px] text-[#948da1]">
      {text}
    </div>
  );
}
