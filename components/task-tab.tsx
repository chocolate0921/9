import { Task, TeamMember } from "@/types/carrymate";

const columns = [
  { id: "todo", label: "To Do" },
  { id: "inProgress", label: "In Progress" },
  { id: "done", label: "Done" },
] as const;

export function TaskTab({
  members,
  tasks,
  hasUnassignedTasks,
  onAddTask,
  onAdvanceTask,
  onRequestMemberExit,
  onAutoRedistribute,
}: {
  members: TeamMember[];
  tasks: Task[];
  hasUnassignedTasks: boolean;
  onAddTask: () => void;
  onAdvanceTask: (taskId: string) => void;
  onRequestMemberExit: (memberId: string) => void;
  onAutoRedistribute: () => void;
}) {
  const activeMembers = members.filter((member) => member.status === "active");
  const formerMembers = members.filter((member) => member.status === "former");

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">업무 보드</h2>
            <p className="mt-1 text-[13px] text-muted">
              역할 분담과 상태 변경을 한 번에 관리해요.
            </p>
          </div>
          <button
            type="button"
            onClick={onAddTask}
            className="rounded-2xl bg-brand px-4 py-3 text-[13px] font-semibold text-white shadow-brand"
          >
            업무 추가
          </button>
        </div>
      </section>

      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">팀원 역할</h3>
          <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
            AI 추천 포함
          </span>
        </div>

        {hasUnassignedTasks ? (
          <div className="mb-5 rounded-2xl bg-amber-50 p-4">
            <p className="text-[13px] font-semibold text-warning">
              담당자 미정 업무가 생겼어요.
            </p>
            <p className="mt-2 text-[13px] leading-6 text-muted">
              자동 재분배하기를 누르면 남아 있는 팀원 중 가장 여유 있는 사람에게 다시 배정합니다.
            </p>
            <button
              type="button"
              onClick={onAutoRedistribute}
              className="mt-4 rounded-2xl bg-brand px-4 py-3 text-[13px] font-semibold text-white shadow-brand"
            >
              자동 재분배하기
            </button>
          </div>
        ) : null}

        <div className="space-y-3">
          {activeMembers.map((member) => (
            <div
              key={member.id}
              className="rounded-2xl border border-line px-4 py-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[15px] font-semibold text-ink">{member.name}</p>
                  <p className="mt-1 text-[13px] text-muted">{member.role}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
                    {member.skillTag}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRequestMemberExit(member.id)}
                    className="rounded-full bg-rose-50 px-3 py-2 text-[11px] font-semibold text-danger"
                  >
                    나가기
                  </button>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-muted">
                AI 추천: {member.name}님은 {member.skillTag} 성향이라 정리와 연결이 필요한 업무에 잘 맞아요.
              </p>
            </div>
          ))}
        </div>

        {formerMembers.length > 0 ? (
          <div className="mt-5 border-t border-line pt-5">
            <h4 className="text-[13px] font-semibold text-muted">이전 팀원</h4>
            <div className="mt-3 space-y-3">
              {formerMembers.map((member) => (
                <div
                  key={member.id}
                  className="rounded-2xl border border-dashed border-line px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[15px] font-semibold text-ink">{member.name}</p>
                      <p className="mt-1 text-[13px] text-muted">{member.role}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-muted">
                      이전 팀원
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {columns.map((column) => {
        const filteredTasks = tasks.filter((task) => task.status === column.id);
        return (
          <section key={column.id} className="rounded-card border border-line bg-white p-6 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink">{column.label}</h3>
              <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
                {filteredTasks.length}개
              </span>
            </div>
            <div className="space-y-3">
              {filteredTasks.map((task) => {
                const assignee = members.find((member) => member.id === task.assigneeId);
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onAdvanceTask(task.id)}
                    className="w-full rounded-2xl border border-line px-4 py-4 text-left transition hover:border-slate-300"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[15px] font-semibold text-ink">{task.title}</p>
                        <p className="mt-2 text-[13px] text-muted">
                          담당자: {assignee?.name ?? "미지정"} · {task.dueLabel}
                        </p>
                        {task.aiSuggestedRole ? (
                          <p className="mt-2 text-[13px] leading-6 text-muted">
                            {task.aiSuggestedRole}
                          </p>
                        ) : null}
                      </div>
                      <span className="rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-muted">
                        탭해서 상태 변경
                      </span>
                    </div>
                  </button>
                );
              })}
              {filteredTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-[13px] text-muted">
                  이 칸의 업무가 아직 없어요.
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
