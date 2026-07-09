import { useMemo, useState } from "react";
import { FileCategory, FileItem, TeamMember } from "@/types/carrymate";

const categoryLabels: { id: FileCategory; title: string }[] = [
  { id: "minutes", title: "회의록" },
  { id: "materials", title: "과제 자료" },
  { id: "links", title: "참고 링크" },
];

type SummaryPreview = {
  decisions: string[];
  nextActions: string[];
  agenda: string[];
};

export function FileTab({
  files,
  members,
  onUpload,
  onMarkFinal,
}: {
  files: FileItem[];
  members: TeamMember[];
  onUpload: () => void;
  onMarkFinal: (fileId: string) => void;
}) {
  // TODO: Supabase 연동 시 검색어/업로드 진행/AI 회의록 상태는
  // 필요 시 URL query, 업로드 task 상태, Edge Function 결과와 연결 가능
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAudioName, setSelectedAudioName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  // TODO: Supabase 연동 시 summaryPreview는 `meeting_summaries` fetch 결과나
  // AI 요약 생성 RPC/Edge Function 응답으로 대체 가능
  const [summaryPreview, setSummaryPreview] = useState<SummaryPreview | null>(null);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  // 검색은 서버 round-trip 없이 즉시 필터링되도록 클라이언트 메모이제이션으로 처리한다.
  const visibleFiles = useMemo(() => {
    if (!normalizedSearch) {
      return files;
    }

    return files.filter((file) =>
      [file.name, file.uploadedBy, file.statusLabel]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [files, normalizedSearch]);

  const handleSelectAudio = () => {
    // 실제 파일 선택/업로드 대신 업로드 진행률만 시뮬레이션한다.
    setSelectedAudioName("team_meeting_0709.m4a");
    setUploadProgress(0);
    setIsUploadingAudio(true);
    setSummaryPreview(null);

    let nextProgress = 0;
    const timer = window.setInterval(() => {
      nextProgress += 20;
      setUploadProgress(nextProgress);

      if (nextProgress >= 100) {
        window.clearInterval(timer);
        setUploadProgress(100);
        setIsUploadingAudio(false);
      }
    }, 180);
  };

  const handleGenerateSummary = () => {
    // 실제 AI 호출 없이 미리 준비한 요약 결과를 잠깐의 로딩 뒤 보여준다.
    setIsGeneratingSummary(true);
    setSummaryPreview(null);

    window.setTimeout(() => {
      setSummaryPreview({
        decisions: [
          "발표 흐름을 문제 정의 → 해결 방식 → 데모 순서로 정리하기",
          "최종 발표 자료는 민지가 오늘 저녁까지 하나로 합치기",
        ],
        nextActions: [
          "서연: 홈 탭 최종 카드 문구 다듬기",
          "도윤: 발표 대본 1차 정리 후 팀방 공유",
        ],
        agenda: [
          "신입생 팀플의 불편한 협업 경험 정리",
          "CarryMate 핵심 시연 순서와 역할 분배 확인",
        ],
      });
      setIsGeneratingSummary(false);
    }, 900);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">파일 정리</h2>
            <p className="mt-1 text-[13px] text-muted">
              회의록, 자료, 링크를 한눈에 보고 최종본 혼선을 줄여요.
            </p>
          </div>
          <button
            type="button"
            onClick={onUpload}
            className="rounded-2xl bg-brand px-4 py-3 text-[13px] font-semibold text-white shadow-brand"
          >
            업로드
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-canvas px-4 py-3">
          <MagnifierIcon />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="파일명, 업로더, 상태로 검색"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
          />
        </div>
      </section>

      {categoryLabels.map((category) => {
        const categoryFiles = visibleFiles.filter((file) => file.category === category.id);
        return (
          <section key={category.id} className="rounded-card border border-line bg-white p-6 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink">{category.title}</h3>
              <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
                {categoryFiles.length}개
              </span>
            </div>

            {category.id === "minutes" ? (
              <div className="mb-5 rounded-2xl border border-line bg-canvas px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-white px-3 py-3 shadow-soft">
                    <MicIcon />
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-ink">
                      녹음 파일 업로드 및 AI 회의록 자동 생성
                    </p>
                    <p className="mt-1 text-[13px] leading-6 text-muted">
                      회의 녹음본(.mp3, .m4a)을 올리면 AI가 회의록을 요약합니다.
                    </p>
                    <button
                      type="button"
                      onClick={handleSelectAudio}
                      className="mt-4 rounded-2xl border border-line bg-white px-4 py-3 text-[13px] font-semibold text-ink shadow-soft"
                    >
                      파일 선택
                    </button>
                  </div>
                </div>

                {selectedAudioName ? (
                  <div className="mt-4 rounded-2xl border border-line bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[14px] font-semibold text-ink">{selectedAudioName}</p>
                        <p className="mt-1 text-[12px] text-muted">
                          {isUploadingAudio ? "업로드 진행 중" : "업로드 완료"}
                        </p>
                      </div>
                      <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
                        {uploadProgress}%
                      </span>
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-brand transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                {selectedAudioName && !isUploadingAudio && uploadProgress === 100 ? (
                  <button
                    type="button"
                    onClick={handleGenerateSummary}
                    className="mt-4 rounded-2xl bg-brand px-4 py-3 text-[13px] font-semibold text-white shadow-brand"
                  >
                    AI 요약 생성
                  </button>
                ) : null}

                {isGeneratingSummary ? (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-4">
                    <Spinner />
                    <p className="text-[13px] font-medium text-ink">
                      AI가 회의록을 요약 중입니다...
                    </p>
                  </div>
                ) : null}

                {summaryPreview ? (
                  <div className="mt-4 rounded-2xl border border-line bg-white px-4 py-4">
                    <p className="text-[14px] font-semibold text-ink">생성된 회의록 미리보기</p>
                    <SummaryBlock title="결정된 사항" items={summaryPreview.decisions} />
                    <SummaryBlock title="다음 할 일" items={summaryPreview.nextActions} />
                    <SummaryBlock title="핵심 안건" items={summaryPreview.agenda} />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-3">
              {categoryFiles.map((file) => (
                <div key={file.id} className="rounded-2xl border border-line px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[15px] font-semibold text-ink">{file.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                        {file.uploadedBy} · {file.uploadedAt}
                        {members.find(
                          (member) =>
                            member.id === file.uploadedByMemberId &&
                            member.status === "former",
                        ) ? (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-muted">
                            이전 팀원
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        file.isFinal
                          ? "bg-emerald-50 text-success"
                          : "bg-canvas text-muted"
                      }`}
                    >
                      {file.statusLabel}
                    </span>
                  </div>
                  {file.category === "materials" ? (
                    <button
                      type="button"
                      onClick={() => onMarkFinal(file.id)}
                      className="mt-4 rounded-2xl border border-line bg-white px-4 py-3 text-[13px] font-semibold text-ink"
                    >
                      {file.isFinal ? "현재 최종본" : "팀장 인증 최종본으로 지정"}
                    </button>
                  ) : null}
                </div>
              ))}

              {categoryFiles.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-[13px] text-muted">
                  검색 결과가 없어요.
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SummaryBlock({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="mt-4 rounded-2xl bg-canvas px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        {title}
      </p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p key={item} className="text-[13px] leading-6 text-ink">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function MagnifierIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 text-brand"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
    </svg>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
  );
}
