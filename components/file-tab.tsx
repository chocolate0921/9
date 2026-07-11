import { useMemo, useState } from "react";
import { FileCategory, FileItem, TeamMember } from "@/types/carrymate";

const categories: { id: FileCategory; title: string; icon: string }[] = [
  { id: "minutes", title: "문서", icon: "▤" },
  { id: "materials", title: "미디어", icon: "▣" },
  { id: "links", title: "링크", icon: "↗" },
];

type SummaryPreview = { decisions: string[]; nextActions: string[]; agenda: string[] };

export function FileTab({ files, members, onUpload, onMarkFinal }: { files: FileItem[]; members: TeamMember[]; onUpload: () => void; onMarkFinal: (fileId: string) => void; }) {
  const [query, setQuery] = useState("");
  const [audio, setAudio] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryPreview | null>(null);
  const visible = useMemo(() => files.filter(f => [f.name,f.uploadedBy,f.statusLabel].join(" ").toLowerCase().includes(query.trim().toLowerCase())), [files,query]);
  const storage = Math.min(95, 42 + files.length * 6);

  const uploadAudio = () => {
    setAudio("team_meeting_0709.m4a"); setProgress(0); setSummary(null);
    let next=0; const timer=window.setInterval(()=>{next+=20;setProgress(next);if(next>=100)window.clearInterval(timer)},180);
  };
  const generate = () => { setLoading(true); setTimeout(()=>{setSummary({decisions:["발표 흐름을 문제 정의 → 해결 방식 → 데모 순서로 구성"],nextActions:["서연: 홈 카드 문구 수정","도윤: 발표 대본 공유"],agenda:["핵심 기능 시연 순서 확인"]});setLoading(false)},800); };

  return (
    <div className="space-y-4 pb-4">
      <section className="rounded-[26px] bg-white p-5 shadow-panel">
        <div className="flex items-start justify-between"><div><h2 className="text-[18px] font-extrabold text-[#282438]">AI 요약 리포트</h2><p className="mt-2 text-[11px] leading-5 text-[#918a9f]">최근 업로드된 자료를 바탕으로 프로젝트 핵심 내용을 정리했어요.</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f0eeff] text-[#6259e8]">✦</span></div>
        <button className="mt-4 text-[10px] font-bold text-[#6259e8]">전체 리포트 보기 →</button>
      </section>

      <div className="grid grid-cols-2 gap-3">
        {categories.map(c=><button key={c.id} onClick={onUpload} className="rounded-[22px] bg-white p-5 text-center shadow-card"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#faf9ff] text-[#6259e8]">{c.icon}</span><p className="mt-3 text-[11px] font-extrabold text-[#403a4d]">{c.title}</p><p className="mt-1 text-[9px] text-[#9b95a8]">{visible.filter(f=>f.category===c.id).length}개 파일</p></button>)}
        <button onClick={onUpload} className="rounded-[22px] bg-white p-5 text-center shadow-card"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#faf9ff] text-[#6259e8]">＋</span><p className="mt-3 text-[11px] font-extrabold text-[#403a4d]">업로드</p><p className="mt-1 text-[9px] text-[#9b95a8]">새 파일 추가</p></button>
      </div>

      <div className="flex items-center gap-3 rounded-[18px] border border-[#ebe7f3] bg-white px-4 py-3 shadow-card"><span className="text-[#9a94a8]">⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="보관함 검색..." className="w-full bg-transparent text-[11px] outline-none placeholder:text-[#aaa4b5]"/><button onClick={onUpload} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6259e8] text-white">↑</button></div>

      <SectionTitle title="최근 파일" />
      <div className="space-y-2.5">
        {visible.map(file => <article key={file.id} className="flex items-center gap-3 rounded-[20px] bg-white px-4 py-4 shadow-card"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold ${file.category==="materials"?"bg-rose-50 text-rose-500":file.category==="links"?"bg-amber-50 text-amber-600":"bg-blue-50 text-blue-500"}`}>{file.category==="materials"?"PPT":file.category==="links"?"URL":"DOC"}</span><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-extrabold text-[#393445]">{file.name}</p><p className="mt-1 text-[9px] text-[#9a94a7]">{file.uploadedBy} · {file.uploadedAt}</p></div><div className="text-right"><span className={`rounded-full px-2 py-1 text-[8px] font-bold ${file.isFinal?"bg-emerald-50 text-emerald-600":"bg-[#f4f2f8] text-[#8b8498]"}`}>{file.statusLabel}</span>{file.category==="materials"&&<button onClick={()=>onMarkFinal(file.id)} className="mt-2 block text-[8px] font-bold text-[#6259e8]">{file.isFinal?"최종본":"최종 지정"}</button>}</div></article>)}
        {!visible.length&&<Empty text="검색 결과가 없어요."/>}
      </div>

      <section className="rounded-[22px] bg-white p-5 shadow-card">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0eeff] text-[#6259e8]">◉</span><div className="flex-1"><p className="text-[12px] font-extrabold text-[#393445]">녹음 파일 AI 회의록</p><p className="mt-1 text-[10px] leading-5 text-[#938c9f]">녹음본을 업로드하면 결정 사항과 다음 할 일을 자동으로 정리해요.</p><button onClick={uploadAudio} className="mt-3 rounded-xl border border-[#e8e4f1] px-3 py-2 text-[10px] font-bold text-[#6259e8]">녹음 파일 선택</button></div></div>
        {audio&&<div className="mt-4 rounded-xl bg-[#faf9ff] p-3"><div className="flex justify-between text-[9px]"><span>{audio}</span><span>{progress}%</span></div><div className="mt-2 h-1.5 rounded-full bg-[#e9e5f2]"><div className="h-full rounded-full bg-[#6259e8]" style={{width:`${progress}%`}}/></div>{progress===100&&!summary&&<button onClick={generate} className="mt-3 rounded-lg bg-[#6259e8] px-3 py-2 text-[9px] font-bold text-white">{loading?"요약 중...":"AI 요약 생성"}</button>}</div>}
        {summary&&<div className="mt-4 space-y-3">{[["결정 사항",summary.decisions],["다음 할 일",summary.nextActions],["핵심 안건",summary.agenda]].map(([title,items])=><div key={title as string} className="rounded-xl bg-[#faf9ff] p-3"><p className="text-[9px] font-bold text-[#6259e8]">{title as string}</p>{(items as string[]).map(x=><p key={x} className="mt-2 text-[10px] leading-5 text-[#615b6b]">• {x}</p>)}</div>)}</div>}
      </section>

      <section className="rounded-[22px] bg-white p-5 shadow-card"><div className="flex justify-between"><div><p className="text-[13px] font-extrabold text-[#6259e8]">저장 공간 분석</p><p className="mt-2 text-[10px] leading-5 text-[#8f889b]">프로젝트 저장 공간을 효율적으로 관리하고 있어요.</p></div><span className="text-[11px] font-extrabold text-[#6259e8]">{storage}%</span></div><div className="mt-4 h-2 rounded-full bg-[#ece8f4]"><div className="h-full rounded-full bg-[#6259e8]" style={{width:`${storage}%`}}/></div></section>
      <section className="rounded-[22px] bg-white p-5 text-center shadow-card"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">♢</span><p className="mt-3 text-[12px] font-extrabold text-[#393445]">보관함 보안됨</p><p className="mt-2 text-[9px] leading-5 text-[#9992a5]">모든 파일은 {members.filter((member) => member.status === "active").length}명의 팀원과 안전하게 공유됩니다.</p></section>
    </div>
  );
}
function SectionTitle({title}:{title:string}){return <h3 className="px-1 text-[15px] font-extrabold text-[#282438]">{title}</h3>}
function Empty({text}:{text:string}){return <div className="rounded-[20px] border border-dashed border-[#ddd8e9] bg-white px-4 py-7 text-center text-[11px] text-[#948da1]">{text}</div>}