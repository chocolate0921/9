"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  isUuid,
  mapMeetingMessageRowsToMeetingMessages,
  mapMeetingNoteRowToMeetingNote,
} from "@/lib/mappers/carrymate";
import {
  createMeetingMessage,
  createMeetingNote,
  endMeeting,
  getMeetingMessages,
  getMeetingNoteByMeetingId,
} from "@/lib/supabase/meetings";
import {
  ConfirmedMeeting,
  MeetingActionItem,
  MeetingMessage,
  MeetingNote,
  TeamMember,
} from "@/types/carrymate";

type ImportResult = {
  ok: boolean;
  message: string;
};

const DEMO_MESSAGES: MeetingMessage[] = [
  {
    id: "demo-message-1",
    meetingId: "demo-meeting",
    memberId: "member-1",
    senderName: "민지",
    message: "오늘 발표 흐름 먼저 정리하고 역할 분담까지 확정할게요.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-message-2",
    meetingId: "demo-meeting",
    memberId: "member-2",
    senderName: "준호",
    message: "제가 경쟁 서비스 비교와 참고 사례를 오늘 안에 마무리하겠습니다.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-message-3",
    meetingId: "demo-meeting",
    memberId: "member-3",
    senderName: "서연",
    message: "메인 화면 시안은 내일 오전까지 1차 버전으로 공유할게요.",
    createdAt: new Date().toISOString(),
  },
];

function buildActionKey(item: MeetingActionItem, index: number) {
  return `${index}:${item.title}:${item.assigneeName}:${item.dueDateOffsetDays}`;
}

function dedupeMessages(messages: MeetingMessage[]) {
  const seen = new Set<string>();

  return messages.filter((message) => {
    if (seen.has(message.id)) {
      return false;
    }

    seen.add(message.id);
    return true;
  });
}

function createDemoSummary(messages: MeetingMessage[]) {
  const senders = Array.from(new Set(messages.map((message) => message.senderName)));

  return {
    summary:
      "회의에서 발표 준비 우선순위와 각자 맡을 역할을 정리했습니다. 자료 조사, 화면 시안, 발표 흐름 정리가 핵심 축으로 정리되었습니다.",
    decisions: [
      "오늘 안에 발표 전체 흐름을 한 번 더 검토한다.",
      "경쟁 서비스 조사와 화면 시안을 분리해서 진행한다.",
      "내일 오전까지 1차 결과물을 공유한다.",
    ],
    actionItems: [
      {
        title: "발표 흐름 1차 정리",
        assigneeName: senders[0] ?? "",
        dueDateOffsetDays: 1,
      },
      {
        title: "경쟁 서비스 비교표 정리",
        assigneeName: senders[1] ?? "",
        dueDateOffsetDays: 1,
      },
      {
        title: "메인 화면 시안 공유",
        assigneeName: senders[2] ?? "",
        dueDateOffsetDays: 2,
      },
    ],
  };
}

export function MeetingRoomSheet({
  currentMember,
  isDemo,
  meeting,
  members,
  onClose,
  onImportActionItems,
  onMeetingUpdated,
  projectId,
}: {
  currentMember: TeamMember | null;
  isDemo: boolean;
  meeting: ConfirmedMeeting;
  members: TeamMember[];
  onClose: () => void;
  onImportActionItems: (
    meeting: ConfirmedMeeting,
    items: MeetingActionItem[],
  ) => Promise<ImportResult>;
  onMeetingUpdated: (meeting: ConfirmedMeeting) => void;
  projectId: string;
}) {
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(!isDemo);
  const [isSending, setIsSending] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedActionKeys, setSelectedActionKeys] = useState<string[]>([]);
  const [meetingNote, setMeetingNote] = useState<MeetingNote | null>(null);
  const [noteLoadStatus, setNoteLoadStatus] = useState<
    "idle" | "loading" | "empty" | "error" | "success"
  >("idle");
  const [noteLoadMessage, setNoteLoadMessage] = useState("");
  const channelRef = useRef<{ unsubscribe: () => void } | null>(null);
  const subscribedMeetingIdRef = useRef<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  const actionItems = useMemo(
    () => meetingNote?.aiActionItems ?? meeting.aiActionItems ?? [],
    [meeting.aiActionItems, meetingNote?.aiActionItems],
  );
  const decisions = useMemo(
    () => meetingNote?.aiDecisions ?? meeting.aiDecisions ?? [],
    [meeting.aiDecisions, meetingNote?.aiDecisions],
  );
  const summaryText = meetingNote?.aiSummary ?? meeting.aiSummary ?? null;

  useEffect(() => {
    setSelectedActionKeys(actionItems.map((item, index) => buildActionKey(item, index)));
  }, [meeting.id, actionItems]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (meeting.isEnded || isSending) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    if (!window.matchMedia("(pointer: fine)").matches) {
      return;
    }

    messageInputRef.current?.focus();
  }, [isSending, meeting.id, meeting.isEnded]);

  useEffect(() => {
    if (isDemo || !isUuid(meeting.id)) {
      setMeetingNote(null);
      setNoteLoadStatus("idle");
      setNoteLoadMessage("");
      return;
    }

    let cancelled = false;

    const loadMeetingNote = async () => {
      setNoteLoadStatus("loading");
      setNoteLoadMessage("회의록을 불러오는 중입니다.");

      const result = await getMeetingNoteByMeetingId(meeting.id);

      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setMeetingNote(null);
        setNoteLoadStatus("error");
        setNoteLoadMessage(result.message);
        return;
      }

      if (!result.data) {
        setMeetingNote(null);
        setNoteLoadStatus("empty");
        setNoteLoadMessage("저장된 회의록이 아직 없습니다.");
        return;
      }

      setMeetingNote(mapMeetingNoteRowToMeetingNote(result.data));
      setNoteLoadStatus("success");
      setNoteLoadMessage("저장된 회의록을 복원했습니다.");
    };

    void loadMeetingNote();

    return () => {
      cancelled = true;
    };
  }, [isDemo, meeting.id]);

  useEffect(() => {
    if (isDemo) {
      setMessages(
        DEMO_MESSAGES.map((message, index) => ({
          ...message,
          id: `${meeting.id}-demo-${index}`,
          meetingId: meeting.id,
        })),
      );
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      setIsLoading(true);
      const result = await getMeetingMessages(meeting.id);

      if (cancelled) {
        return;
      }

      setIsLoading(false);

      if (!result.ok || !result.data) {
        setStatusMessage(result.message);
        return;
      }

      setMessages(dedupeMessages(mapMeetingMessageRowsToMeetingMessages(result.data)));
      setStatusMessage("");
    };

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [isDemo, meeting.id]);

  useEffect(() => {
    if (isDemo) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    if (subscribedMeetingIdRef.current === meeting.id && channelRef.current) {
      return;
    }

    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`meeting-messages-${meeting.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_messages",
          filter: `meeting_id=eq.${meeting.id}`,
        },
        (payload) => {
          const incoming = payload.new as {
            id: string;
            meeting_id: string;
            member_id: string | null;
            sender_name: string;
            message: string;
            created_at: string;
          };

          setMessages((current) =>
            dedupeMessages([
              ...current,
              {
                id: incoming.id,
                meetingId: incoming.meeting_id,
                memberId: incoming.member_id,
                senderName: incoming.sender_name,
                message: incoming.message,
                createdAt: incoming.created_at,
              },
            ]),
          );
        },
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(status, error);
          setStatusMessage("회의 채팅 실시간 연결 상태를 확인해 주세요.");
        }
      });

    channelRef.current = channel;
    subscribedMeetingIdRef.current = meeting.id;

    return () => {
      subscribedMeetingIdRef.current = null;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [isDemo, meeting.id]);

  const uniqueSenderNames = useMemo(
    () => Array.from(new Set(messages.map((message) => message.senderName))),
    [messages],
  );

  const selectedActionItems = actionItems.filter((item, index) =>
    selectedActionKeys.includes(buildActionKey(item, index)),
  );

  const focusMessageInput = () => {
    const input = messageInputRef.current;
    if (!input || input.disabled || meeting.isEnded) {
      return;
    }

    input.focus();
  };

  const handleSendMessage = async () => {
    const trimmedMessage = messageInput.trim();
    if (!trimmedMessage || isSending) {
      return;
    }

    if (isDemo) {
      const demoMessage: MeetingMessage = {
        id: `${meeting.id}-demo-${Date.now()}`,
        meetingId: meeting.id,
        memberId: currentMember?.id ?? null,
        senderName: currentMember?.name ?? "데모 팀원",
        message: trimmedMessage,
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, demoMessage]);
      setMessageInput("");
      focusMessageInput();
      return;
    }

    if (!currentMember) {
      setStatusMessage("실제 팀 채팅은 로그인 후 팀원 연결이 완료된 상태에서만 전송할 수 있어요.");
      return;
    }

    setIsSending(true);
    const result = await createMeetingMessage({
      meetingId: meeting.id,
      memberId: currentMember.id,
      senderName: currentMember.name,
      message: trimmedMessage,
    });
    setIsSending(false);

    if (!result.ok || !result.data) {
      setStatusMessage(result.message);
      focusMessageInput();
      return;
    }

    const savedMessage = result.data;

    setMessages((current) =>
      dedupeMessages([
        ...current,
        {
          id: savedMessage.id,
          meetingId: savedMessage.meeting_id,
          memberId: savedMessage.member_id,
          senderName: savedMessage.sender_name,
          message: savedMessage.message,
          createdAt: savedMessage.created_at,
        },
      ]),
    );
    setMessageInput("");
    setStatusMessage("");
    focusMessageInput();
  };

  const handleMessageKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();

    if (isSending || meeting.isEnded || !messageInput.trim()) {
      return;
    }

    void handleSendMessage();
  };

  const handleEndMeeting = async () => {
    if (isEnding || meeting.isEnded) {
      return;
    }

    setIsEnding(true);

    if (isDemo) {
      const demoSummary = createDemoSummary(messages);
      const updatedMeeting: ConfirmedMeeting = {
        ...meeting,
        isEnded: true,
        endsAt: new Date().toISOString(),
        aiSummary: demoSummary.summary,
        aiDecisions: demoSummary.decisions,
        aiActionItems: demoSummary.actionItems,
      };
      onMeetingUpdated(updatedMeeting);
      setStatusMessage("데모 회의를 종료하고 예시 요약을 생성했습니다.");
      setIsEnding(false);
      return;
    }

    const endedAt = new Date().toISOString();
    const endResult = await endMeeting(meeting.id, endedAt);

    if (!endResult.ok) {
      setStatusMessage(endResult.message);
      setIsEnding(false);
      return;
    }

    const messagesResult = await getMeetingMessages(meeting.id);

    if (!messagesResult.ok || !messagesResult.data) {
      setStatusMessage(messagesResult.message);
      setIsEnding(false);
      return;
    }

    const persistedMessages = mapMeetingMessageRowsToMeetingMessages(messagesResult.data);
    setMessages(dedupeMessages(persistedMessages));

    const transcript = persistedMessages
      .map(
        (message) =>
          `[${new Date(message.createdAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}] ${message.senderName}: ${message.message}`,
      )
      .join("\n");

    const aiResponse = await fetch("/api/meeting-ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meetingId: meeting.id,
        title: meeting.title,
        content: transcript,
        members:
          uniqueSenderNames.length > 0
            ? uniqueSenderNames
            : members.map((member) => member.name),
      }),
    });

    const aiPayload = (await aiResponse.json()) as
      | {
          error?: string;
          summary?: string;
          decisions?: string[];
          actionItems?: MeetingActionItem[];
        }
      | undefined;

    if (!aiResponse.ok || !aiPayload?.summary) {
      setStatusMessage(aiPayload?.error ?? "AI 회의 요약 생성에 실패했습니다.");
      setIsEnding(false);
      return;
    }

    const noteResult = await createMeetingNote({
      teamId: projectId,
      meetingId: meeting.id,
      title: `${meeting.title} 회의록`,
      content: transcript,
      aiSummary: aiPayload.summary,
      aiDecisions: aiPayload.decisions ?? [],
      aiActionItems: aiPayload.actionItems ?? [],
    });

    if (!noteResult.ok || !noteResult.data) {
      setStatusMessage(noteResult.message);
      setIsEnding(false);
      return;
    }

    const savedNote = mapMeetingNoteRowToMeetingNote(noteResult.data);
    setMeetingNote(savedNote);
    setNoteLoadStatus("success");
    setNoteLoadMessage("저장된 회의록을 복원했습니다.");

    onMeetingUpdated({
      ...meeting,
      endsAt: endResult.data?.ends_at ?? endedAt,
      isEnded: true,
      aiSummary: savedNote.aiSummary ?? aiPayload.summary,
      aiDecisions: savedNote.aiDecisions,
      aiActionItems: savedNote.aiActionItems,
      noteId: savedNote.id,
    });
    setStatusMessage("회의 종료와 AI 요약 저장이 완료되었습니다.");
    setIsEnding(false);
  };

  const handleImportTasks = async () => {
    if (selectedActionItems.length === 0 || isImporting) {
      return;
    }

    setIsImporting(true);
    const result = await onImportActionItems(meeting, selectedActionItems);
    setIsImporting(false);
    setStatusMessage(result.message);
    if (result.ok) {
      setSelectedActionKeys([]);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/35 px-4 pb-6 pt-10">
      <div className="mx-auto flex max-w-md flex-col rounded-[2rem] border border-line bg-white shadow-soft">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              Team Meeting
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink">{meeting.title}</h2>
            <p className="mt-1 text-[12px] text-muted">
              {meeting.dateLabel} · {meeting.timeRange}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-canvas px-3 py-1 text-sm font-medium text-muted"
          >
            닫기
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
          <div className="rounded-2xl border border-line bg-canvas px-4 py-3 text-[12px] leading-6 text-muted">
            {statusMessage ||
              "채팅 기반 회의 내용을 남기고, 종료 시 AI가 요약과 할 일 후보를 정리합니다."}
          </div>
          {!isDemo ? (
            <div className="mt-3 rounded-2xl border border-line bg-white px-4 py-3 text-[12px] leading-6 text-muted">
              {noteLoadStatus === "loading"
                ? "회의록 조회 중"
                : noteLoadStatus === "success"
                  ? noteLoadMessage
                  : noteLoadStatus === "empty"
                    ? "회의록 없음"
                    : noteLoadStatus === "error"
                      ? `회의록 조회 실패: ${noteLoadMessage}`
                      : "회의록을 아직 확인하지 않았습니다."}
            </div>
          ) : null}

          <section className="mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">회의 채팅</h3>
              <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
                {messages.length}개 메시지
              </span>
            </div>

            <div
              ref={messageListRef}
              className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1"
            >
              {isLoading ? (
                <div className="rounded-2xl border border-line bg-canvas px-4 py-6 text-center text-sm text-muted">
                  메시지를 불러오는 중입니다.
                </div>
              ) : messages.length > 0 ? (
                messages.map((message) => {
                  const isMine = Boolean(
                    currentMember?.id && message.memberId === currentMember.id,
                  );

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl border px-4 py-3 ${
                          isMine
                            ? "border-blue-100 bg-blue-50"
                            : "border-line bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[12px] font-semibold text-ink">
                            {message.senderName}
                          </p>
                          <p className="text-[11px] text-muted">
                            {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </p>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-ink">
                          {message.message}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white px-4 py-6 text-center text-sm text-muted">
                  아직 회의 메시지가 없습니다. 첫 메시지로 회의를 시작해 주세요.
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <textarea
                ref={messageInputRef}
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                onKeyDown={handleMessageKeyDown}
                placeholder={
                  meeting.isEnded
                    ? "종료된 회의입니다"
                    : isDemo || currentMember
                      ? "회의 메시지를 입력하세요"
                      : "팀원 연결 후 채팅을 보낼 수 있어요"
                }
                disabled={meeting.isEnded || isSending}
                rows={2}
                className="min-w-0 flex-1 resize-none rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none transition focus:border-brand disabled:bg-canvas"
              />
              <button
                type="button"
                disabled={meeting.isEnded || isSending}
                onClick={() => {
                  void handleSendMessage();
                }}
                className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-brand disabled:opacity-60"
              >
                {isSending ? "전송 중..." : "전송"}
              </button>
            </div>
          </section>

          <section className="mt-5 rounded-[1.75rem] border border-line bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">회의 종료 및 AI 요약</p>
                <p className="mt-1 text-[12px] leading-5 text-muted">
                  종료 시 회의 메시지를 모아 AI 요약과 결정사항, 할 일 후보를 생성합니다.
                </p>
              </div>
              <button
                type="button"
                disabled={meeting.isEnded || isEnding}
                onClick={() => {
                  void handleEndMeeting();
                }}
                className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-brand disabled:opacity-60"
              >
                {meeting.isEnded ? "종료됨" : isEnding ? "종료 중..." : "회의 종료"}
              </button>
            </div>
          </section>

          {summaryText ? (
            <section className="mt-5 space-y-4">
              <div className="rounded-[1.75rem] border border-line bg-white p-4 shadow-soft">
                <p className="text-sm font-semibold text-ink">AI 요약</p>
                <p className="mt-2 text-[13px] leading-6 text-muted">{summaryText}</p>
                {meetingNote ? (
                  <p className="mt-2 text-[11px] text-muted">
                    생성 시각:{" "}
                    {new Date(meetingNote.createdAt).toLocaleString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </p>
                ) : null}
              </div>

              <div className="rounded-[1.75rem] border border-line bg-white p-4 shadow-soft">
                <p className="text-sm font-semibold text-ink">결정사항</p>
                <div className="mt-3 space-y-2">
                  {decisions.length > 0 ? (
                    decisions.map((decision, index) => (
                      <div
                        key={`${decision}-${index}`}
                        className="rounded-2xl bg-canvas px-4 py-3 text-[13px] leading-6 text-muted"
                      >
                        {decision}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-canvas px-4 py-3 text-[13px] leading-6 text-muted">
                      정리된 결정사항이 없습니다.
                    </div>
                  )}
                </div>
              </div>

              {meetingNote ? (
                <div className="rounded-[1.75rem] border border-line bg-white p-4 shadow-soft">
                  <p className="text-sm font-semibold text-ink">원본 회의 내용</p>
                  <pre className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-muted">
                    {meetingNote.content}
                  </pre>
                </div>
              ) : null}

              <div className="rounded-[1.75rem] border border-line bg-white p-4 shadow-soft">
                <p className="text-sm font-semibold text-ink">할 일 후보</p>
                <p className="mt-1 text-[12px] leading-5 text-muted">
                  체크한 항목만 Tasks 보드로 전송됩니다.
                </p>
                <div className="mt-3 space-y-3">
                  {actionItems.length > 0 ? (
                    actionItems.map((item, index) => {
                      const key = buildActionKey(item, index);
                      const checked = selectedActionKeys.includes(key);

                      return (
                        <label
                          key={key}
                          className="flex gap-3 rounded-2xl border border-line bg-white px-4 py-4 shadow-soft"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setSelectedActionKeys((current) =>
                                event.target.checked
                                  ? [...current, key]
                                  : current.filter((value) => value !== key),
                              );
                            }}
                            className="mt-1 h-4 w-4 rounded border-line text-brand"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-ink">{item.title}</p>
                            <p className="mt-1 text-[12px] text-muted">
                              추천 담당자: {item.assigneeName || "미지정"} · 마감 +
                              {item.dueDateOffsetDays}일
                            </p>
                          </div>
                        </label>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl bg-canvas px-4 py-3 text-[13px] leading-6 text-muted">
                      추천된 할 일 후보가 없습니다.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={selectedActionItems.length === 0 || isImporting}
                  onClick={() => {
                    void handleImportTasks();
                  }}
                  className="mt-4 w-full rounded-2xl border border-line bg-white px-4 py-4 text-sm font-semibold text-ink shadow-soft disabled:opacity-60"
                >
                  {isImporting ? "Tasks 전송 중..." : "선택한 할 일만 Tasks로 전송"}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
