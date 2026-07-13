import { useMemo, useState } from "react";
import { FileItem, TeamMember } from "@/types/carrymate";

type FileTabProps = {
  files: FileItem[];
  members: TeamMember[];
  onMarkFinal: (fileId: string) => void;
};

const CATEGORY_META = {
  minutes: {
    title: "회의록",
    icon: "DOC",
    tone: "bg-blue-50 text-blue-600",
  },
  materials: {
    title: "발표자료",
    icon: "PPT",
    tone: "bg-rose-50 text-rose-600",
  },
  links: {
    title: "링크",
    icon: "URL",
    tone: "bg-amber-50 text-amber-700",
  },
} as const;

const SUPPORTED_ITEMS = [
  "회의록",
  "발표자료",
  "참고자료",
  "링크",
  "AI 회의록 PDF",
];

export function FileTab({ files, members, onMarkFinal }: FileTabProps) {
  const [query, setQuery] = useState("");

  const visibleFiles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return files;
    }

    return files.filter((file) =>
      [file.name, file.uploadedBy, file.statusLabel].join(" ").toLowerCase().includes(keyword),
    );
  }, [files, query]);

  const counts = useMemo(
    () => ({
      minutes: files.filter((file) => file.category === "minutes").length,
      materials: files.filter((file) => file.category === "materials").length,
      links: files.filter((file) => file.category === "links").length,
    }),
    [files],
  );

  const activeMemberCount = members.filter((member) => member.status === "active").length;

  return (
    <div className="space-y-4 pb-4">
      <section className="rounded-[26px] bg-white p-5 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-[#7b74ee]">파일 탭 정리 완료</p>
            <h2 className="mt-2 text-[20px] font-extrabold text-[#282438]">
              실제 지원하는 자료만 표시합니다
            </h2>
            <p className="mt-2 text-[12px] leading-6 text-[#7a7387]">
              업로드 UI와 음성 회의 관련 기능은 발표 화면에서 제거했습니다.
            </p>
          </div>
          <span className="rounded-full bg-[#f3f7ff] px-3 py-1 text-[11px] font-bold text-[#1e70e6]">
            {files.length}개 자료
          </span>
        </div>
      </section>

      <section className="rounded-[24px] bg-white p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-extrabold text-[#282438]">지원 항목</p>
            <p className="mt-1 text-[11px] leading-5 text-[#8f889b]">
              발표 자료 보관에 실제 사용하는 항목만 남겼습니다.
            </p>
          </div>
          <span className="rounded-full bg-canvas px-3 py-1 text-[10px] font-bold text-muted">
            팀원 {activeMemberCount}명 공유
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SUPPORTED_ITEMS.map((item) => (
            <span
              key={item}
              className="rounded-full border border-[#e5e9f2] bg-[#fafcff] px-3 py-2 text-[11px] font-semibold text-[#445066]"
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3">
        {Object.entries(CATEGORY_META).map(([category, meta]) => (
          <div key={category} className="rounded-[22px] bg-white p-4 text-center shadow-card">
            <span
              className={`mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-[11px] font-extrabold ${meta.tone}`}
            >
              {meta.icon}
            </span>
            <p className="mt-3 text-[11px] font-extrabold text-[#403a4d]">{meta.title}</p>
            <p className="mt-1 text-[10px] text-[#8f889b]">
              {counts[category as keyof typeof counts]}개
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-[18px] border border-[#ebe7f3] bg-white px-4 py-3 shadow-card">
        <div className="flex items-center gap-3">
          <span className="text-[#9a94a8]">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="자료 검색..."
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-[#aaa4b5]"
          />
        </div>
      </div>

      <SectionTitle title="자료 목록" />
      <div className="space-y-2.5">
        {visibleFiles.length > 0 ? (
          visibleFiles.map((file) => {
            const meta = CATEGORY_META[file.category];

            return (
              <article
                key={file.id}
                className="flex items-center gap-3 rounded-[20px] bg-white px-4 py-4 shadow-card"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold ${meta.tone}`}
                >
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-extrabold text-[#393445]">
                    {file.name}
                  </p>
                  <p className="mt-1 text-[10px] text-[#9a94a7]">
                    {file.uploadedBy} · {file.uploadedAt}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`rounded-full px-2 py-1 text-[9px] font-bold ${
                      file.isFinal
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-[#f4f2f8] text-[#8b8498]"
                    }`}
                  >
                    {file.statusLabel}
                  </span>
                  {file.category === "materials" ? (
                    <button
                      type="button"
                      onClick={() => onMarkFinal(file.id)}
                      className="mt-2 block text-[9px] font-bold text-[#6259e8]"
                    >
                      {file.isFinal ? "최종본 유지" : "최종 지정"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <Empty text="아직 업로드된 자료가 없습니다." />
        )}
      </div>

      <section className="rounded-[22px] bg-white p-5 shadow-card">
        <p className="text-[13px] font-extrabold text-[#282438]">AI 회의록 PDF</p>
        <p className="mt-2 text-[11px] leading-6 text-[#8f889b]">
          회의 상세 화면에서 생성된 AI 회의록을 PDF로 다운로드할 수 있습니다.
        </p>
      </section>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="px-1 text-[15px] font-extrabold text-[#282438]">{title}</h3>;
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#ddd8e9] bg-white px-4 py-7 text-center text-[11px] text-[#948da1]">
      {text}
    </div>
  );
}
