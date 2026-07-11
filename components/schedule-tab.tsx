import { useMemo, useState } from "react";
import { ConfirmedMeeting, ScheduleSlot, TeamMember } from "@/types/carrymate";

type AttendanceStatus = "attending" | "late" | "absent";
const order: AttendanceStatus[] = ["attending", "late", "absent"];
const attendance = {
  attending: { label: "참석", cls: "bg-emerald-50 text-emerald-600" },
  late: { label: "지각", cls: "bg-amber-50 text-amber-600" },
  absent: { label: "불참", cls: "bg-rose-50 text-rose-600" },
};
const initialRules = [
  { id: "r1", text: "회의 시간 10분 전 오기", checked: true },
  { id: "r2", text: "의견 제안 시 긍정적으로 반응하기", checked: true },
  { id: "r3", text: "회의 후 할 일 바로 정리하기", checked: false },
];

export function ScheduleTab({ members, slots, meetings, onAddSchedule, onConfirmSlot }: { members: TeamMember[]; slots: ScheduleSlot[]; meetings: ConfirmedMeeting[]; onAddSchedule: () => void; onConfirmSlot: (slotId: string) => void; }) {
  const activeMembers = useMemo(() => members.filter((m) => m.status === "active"), [members]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [rules, setRules] = useState(initialRules);
  const [votes, setVotes] = useState({ a: 4, b: 3 });
  const [question, setQuestion] = useState("");
  const [questions, setQuestions] = useState(["PPT 마지막 장에 데모 흐름을 더 넣을까요?", "발표 역할은 오늘 확정할까요?"]);
  const total = votes.a + votes.b;
  const aPercent = total ? Math.round((votes.a / total) * 100) : 0;

  const cycle = (meetingId: string, memberId: string) => {
    const key = `${meetingId}-${memberId}`;
    const current = attendanceMap[key] ?? "attending";
    setAttendanceMap((prev) => ({ ...prev, [key]: order[(order.indexOf(current) + 1) % order.length] }));
  };

  return (
    <div className="space-y-4 pb-4">
      <section className="rounded-[26px] border-l-4 border-[#6259e8] bg-white p-5 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[11px] font-bold text-[#7b74ee]">이번 주의 중요 계획</p><h2 className="mt-2 text-[23px] font-extrabold leading-7 text-[#262236]">런칭 캠페인 전략 수립</h2></div>
          <button onClick={onAddSchedule} className="rounded-full bg-[#6259e8] px-3 py-2 text-[11px] font-bold text-white">+ 일정</button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <MiniStat label="남은 일정" value={`${slots.length + meetings.length}개`} />
          <MiniStat label="참여 팀원" value={`${activeMembers.length}명`} />
        </div>
      </section>

      <section className="rounded-[26px] bg-white p-6 text-center shadow-panel">
        <Ring value={Math.min(100, 65 + meetings.length * 5)} />
        <h3 className="mt-4 text-[16px] font-extrabold text-[#2d293b]">준비 완료</h3>
        <p className="mt-2 text-[11px] leading-5 text-[#938ca1]">확정된 일정을 기준으로 프로젝트 준비 상태를 계산했어요.</p>
      </section>

      <SectionTitle title="AI 추천 시간대" action="추가" onClick={onAddSchedule} />
      <div className="space-y-3">
        {slots.length ? slots.map((slot) => (
          <article key={slot.id} className="rounded-[22px] border border-[#eeeaf7] bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[13px] font-extrabold text-[#332f42]">{slot.label}</p><p className="mt-1 text-[11px] text-[#958fa1]">{slot.dateLabel} · {slot.timeRange}</p></div>{slot.recommended && <span className="rounded-full bg-[#efedff] px-2.5 py-1 text-[9px] font-bold text-[#6259e8]">추천</span>}</div>
            <div className="mt-3 flex -space-x-1.5">{slot.memberIds.slice(0,4).map((id, i) => <Avatar key={id} name={activeMembers.find(m=>m.id===id)?.name ?? "팀"} index={i}/>)}</div>
            <button onClick={() => onConfirmSlot(slot.id)} className="mt-4 w-full rounded-xl bg-[#6259e8] py-2.5 text-[11px] font-bold text-white">이 시간으로 확정</button>
          </article>
        )) : <Empty text="추천 가능한 시간이 아직 없어요." />}
      </div>

      <SectionTitle title="프로젝트 타임라인" />
      <div className="space-y-3">
        {meetings.length ? meetings.map((meeting, index) => (
          <article key={meeting.id} className="rounded-[22px] border border-[#eeeaf7] bg-white p-4 shadow-card">
            <div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0eeff] text-[11px] font-extrabold text-[#6259e8]">{index + 1}</span><div className="flex-1"><p className="text-[13px] font-extrabold text-[#332f42]">{meeting.title}</p><p className="mt-1 text-[11px] text-[#958fa1]">{meeting.dateLabel} · {meeting.timeRange}</p></div></div>
            <div className="mt-4 flex flex-wrap gap-2">{activeMembers.map((member) => { const key=`${meeting.id}-${member.id}`; const status=attendanceMap[key]??"attending"; return <button key={key} onClick={()=>cycle(meeting.id,member.id)} className={`rounded-full px-3 py-1.5 text-[9px] font-bold ${attendance[status].cls}`}>{member.name} · {attendance[status].label}</button>; })}</div>
          </article>
        )) : <Empty text="확정된 일정이 아직 없어요." />}
      </div>

      <SectionTitle title="팀 규칙" />
      <section className="rounded-[22px] bg-white p-4 shadow-card space-y-2">
        {rules.map(rule => <button key={rule.id} onClick={()=>setRules(prev=>prev.map(r=>r.id===rule.id?{...r,checked:!r.checked}:r))} className="flex w-full items-center gap-3 rounded-2xl bg-[#faf9ff] px-3 py-3 text-left"><span className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] ${rule.checked?"bg-[#6259e8] text-white":"border border-[#dcd7e8] text-transparent"}`}>✓</span><span className="text-[11px] font-semibold text-[#5d5768]">{rule.text}</span></button>)}
      </section>

      <SectionTitle title="투표 및 질문" />
      <section className="rounded-[22px] bg-white p-4 shadow-card">
        <p className="text-[12px] font-extrabold text-[#332f42]">발표 자료 디자인 컨셉</p>
        <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={()=>setVotes(v=>({...v,a:v.a+1}))} className="rounded-xl border border-[#e9e5f3] py-2 text-[11px] font-bold">A안</button><button onClick={()=>setVotes(v=>({...v,b:v.b+1}))} className="rounded-xl border border-[#e9e5f3] py-2 text-[11px] font-bold">B안</button></div>
        <Vote label="A안" value={aPercent}/><Vote label="B안" value={100-aPercent}/>
        <div className="mt-5 space-y-2">{questions.map((q,i)=><p key={`${q}-${i}`} className="rounded-xl bg-[#faf9ff] px-3 py-3 text-[11px] text-[#625c6d]">{q}</p>)}</div>
        <div className="mt-3 flex gap-2"><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="질문 남기기" className="min-w-0 flex-1 rounded-xl border border-[#e9e5f3] px-3 py-2 text-[11px] outline-none"/><button onClick={()=>{if(question.trim()){setQuestions(q=>[question.trim(),...q]);setQuestion("")}}} className="rounded-xl bg-[#6259e8] px-4 text-[11px] font-bold text-white">등록</button></div>
      </section>
    </div>
  );
}

function SectionTitle({title,action,onClick}:{title:string;action?:string;onClick?:()=>void}){return <div className="flex items-center justify-between px-1"><h3 className="text-[16px] font-extrabold text-[#282438]">{title}</h3>{action&&<button onClick={onClick} className="text-[11px] font-bold text-[#6259e8]">{action}</button>}</div>}
function MiniStat({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-[#faf9ff] p-3"><p className="text-[9px] font-semibold text-[#9a94a8]">{label}</p><p className="mt-1 text-[13px] font-extrabold text-[#4b4558]">{value}</p></div>}
function Ring({value}:{value:number}){const r=38,c=2*Math.PI*r,o=c-(value/100)*c;return <div className="relative mx-auto h-28 w-28"><svg viewBox="0 0 100 100" className="h-full w-full -rotate-90"><circle cx="50" cy="50" r={r} fill="none" stroke="#f1edf6" strokeWidth="7"/><circle cx="50" cy="50" r={r} fill="none" stroke="#d6257d" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={o}/></svg><div className="absolute inset-0 flex items-center justify-center text-[22px] font-extrabold text-[#c72272]">{value}%</div></div>}
function Avatar({name,index}:{name:string;index:number}){const cls=["bg-[#f8d9c0]","bg-[#d8e8ff]","bg-[#eadcff]","bg-[#d8f3e8]"][index%4];return <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[9px] font-bold ${cls}`}>{name.slice(0,1)}</span>}
function Vote({label,value}:{label:string;value:number}){return <div className="mt-3"><div className="flex justify-between text-[9px] text-[#918a9f]"><span>{label}</span><span>{value}%</span></div><div className="mt-1 h-1.5 rounded-full bg-[#eeeaf4]"><div className="h-full rounded-full bg-[#6259e8]" style={{width:`${value}%`}}/></div></div>}
function Empty({text}:{text:string}){return <div className="rounded-[20px] border border-dashed border-[#ddd8e9] bg-white px-4 py-7 text-center text-[11px] text-[#948da1]">{text}</div>}