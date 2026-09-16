import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  {
    to: "/",
    label: "Upload",
    icon: (active) => (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    to: "/editor",
    label: "Editor",
    icon: (active) => (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="20" height="20" rx="2.18" />
        <path d="M7 2v20" />
        <path d="M17 2v20" />
        <path d="M2 12h20" />
        <path d="M2 7h5" />
        <path d="M2 17h5" />
        <path d="M17 17h5" />
        <path d="M17 7h5" />
      </svg>
    ),
  },
  {
    to: "/preview",
    label: "Preview",
    icon: (active) => (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
];

export default function MobileLayout() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 flex justify-center">
      {/* Mobile container */}
      <div className="w-full max-w-[480px] min-h-dvh bg-zinc-900 flex flex-col relative border-x border-zinc-800 shadow-2xl">
        {/* Top bar — clean, no BETA */}
        <header className="sticky top-0 z-20 bg-zinc-900/85 backdrop-blur-xl border-b border-zinc-800 px-4 h-[56px] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-600/20 shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="font-semibold text-[15px] tracking-tight truncate">ClipCraft</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          </div>
        </header>

        {/* Page content - leaves space for bottom nav */}
        <main className="flex-1 overflow-y-auto pb-[76px]">
          <Outlet />
        </main>

        {/* Bottom Navigation — thumb-friendly 375px */}
        <nav className="absolute bottom-0 left-0 right-0 z-20 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-around h-[64px] px-2 pb-[env(safe-area-inset-bottom)] gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-2 rounded-xl transition-all active:scale-[0.96] ${
                    isActive ? "text-rose-400" : "text-zinc-500 hover:text-zinc-300"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`p-1.5 rounded-xl transition-colors ${isActive ? "bg-rose-500/15 text-rose-400" : ""}`}
                    >
                      {item.icon(isActive)}
                    </span>
                    <span className={`text-[11px] leading-none tracking-wide truncate ${isActive ? "font-semibold" : "font-medium"}`}>
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
