import { TabId } from "@/types/carrymate";

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "home", label: "홈", icon: <HomeIcon /> },
  { id: "tasks", label: "업무", icon: <CheckIcon /> },
  { id: "schedule", label: "일정", icon: <CalendarIcon /> },
  { id: "files", label: "파일", icon: <FolderIcon /> },
];

export function BottomTabBar({ activeTab, onChange }: { activeTab: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="fixed bottom-3 left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-[420px] -translate-x-1/2 rounded-[22px] border border-[#ebe8f5] bg-white/95 px-2 py-2 shadow-[0_12px_34px_rgba(69,55,130,0.16)] backdrop-blur-xl">
      <ul className="grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <li key={tab.id}>
              <button type="button" onClick={() => onChange(tab.id)} className={`flex w-full flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-bold transition ${active ? "bg-[#f0eeff] text-[#5d54e7]" : "text-[#918aa2] hover:bg-[#faf9ff]"}`}>
                <span className="h-5 w-5">{tab.icon}</span>
                {tab.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Icon({ children }: { children: React.ReactNode }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-full w-full">{children}</svg>; }
function HomeIcon(){return <Icon><path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></Icon>}
function CheckIcon(){return <Icon><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></Icon>}
function CalendarIcon(){return <Icon><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></Icon>}
function FolderIcon(){return <Icon><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></Icon>}