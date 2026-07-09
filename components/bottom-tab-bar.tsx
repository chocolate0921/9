import { TabId } from "@/types/carrymate";

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: "home", label: "홈", icon: "⌂" },
  { id: "tasks", label: "업무", icon: "✓" },
  { id: "schedule", label: "일정", icon: "◷" },
  { id: "files", label: "파일", icon: "▣" },
];

export function BottomTabBar({
  activeTab,
  onChange,
}: {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}) {
  return (
    <nav className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[2rem] border border-white/80 bg-white/94 p-2 shadow-soft backdrop-blur">
      <ul className="grid grid-cols-4 gap-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onChange(tab.id)}
                className={`flex w-full flex-col items-center rounded-[1.25rem] px-3 py-3 text-[11px] font-medium transition ${
                  isActive
                    ? "bg-canvas text-ink"
                    : "text-muted hover:bg-canvas/80"
                }`}
              >
                <span className={`text-[15px] ${isActive ? "text-brand" : ""}`}>{tab.icon}</span>
                <span className="mt-1">{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
