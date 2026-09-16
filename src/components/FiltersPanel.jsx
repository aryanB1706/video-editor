import { useEffect, useState } from "react";
import useEditorStore from "../store/editorStore";

const PRESETS = [
  { id: "original", label: "Original", filter: "none" },
  { id: "vivid", label: "Vivid", filter: "saturate(1.5) contrast(1.1)" },
  { id: "bw", label: "B&W", filter: "grayscale(1)" },
  { id: "warm", label: "Warm", filter: "sepia(0.3) saturate(1.2)" },
  { id: "cool", label: "Cool", filter: "hue-rotate(180deg) saturate(1.1)" },
  { id: "vintage", label: "Vintage", filter: "sepia(0.4) contrast(0.9) brightness(0.9)" },
];

export default function FiltersPanel({ clip }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const [thumb, setThumb] = useState(null);

  useEffect(() => {
    if (!clip) return;
    if (clip.type === "image") {
      setThumb(clip.url);
      return;
    }
    // video: generate thumbnail via canvas (first frame at trimStart)
    let cancelled = false;
    const video = document.createElement("video");
    video.src = clip.url;
    video.muted = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 68;
    const ctx = canvas.getContext("2d");

    const generate = async () => {
      await new Promise((res) => {
        if (video.readyState >= 1) res();
        else {
          video.onloadedmetadata = () => res();
          video.onerror = () => res();
          setTimeout(res, 1500);
        }
      });
      if (cancelled) return;
      const t = clip.trimStart ?? 0.3;
      const target = Math.min(t, Math.max(0, (video.duration || 2) - 0.1));
      await new Promise((res) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          res();
        };
        video.addEventListener("seeked", onSeeked);
        try {
          video.currentTime = target;
        } catch {
          res();
        }
        setTimeout(() => {
          video.removeEventListener("seeked", onSeeked);
          res();
        }, 800);
      });
      if (cancelled || !ctx) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL();
        if (!cancelled) setThumb(data);
      } catch {
        if (!cancelled) setThumb(null);
      }
    };
    // For image we already set, for video generate
    if (clip.type === "video") generate();
    return () => {
      cancelled = true;
      video.pause();
      video.src = "";
    };
  }, [clip?.id, clip?.url, clip?.type, clip?.trimStart]);

  if (!clip) return <p className="text-sm text-zinc-500 text-center py-6">No clip selected</p>;

  const activeFilter = clip.filter ?? "none";

  const handleSelect = (preset) => {
    // Store exact filter string; "none" maps to null for clean store but both work
    const val = preset.filter === "none" ? null : preset.filter;
    updateClip(clip.id, { filter: val });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400">Tap a look — preview updates instantly in the player above</p>
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-2 -mx-1 px-1">
        {PRESETS.map((preset) => {
          const isActive = (activeFilter === preset.filter) || (activeFilter === "none" && preset.filter === "none") || (activeFilter == null && preset.filter === "none");
          const filterStyle = preset.filter === "none" ? "none" : preset.filter;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelect(preset)}
              className={`snap-start shrink-0 flex flex-col items-center gap-1.5 ${isActive ? "" : "opacity-90"}`}
            >
              <div
                className={`w-[80px] h-[56px] rounded-xl overflow-hidden border-2 relative bg-zinc-800 flex items-center justify-center ${isActive ? "border-violet-500 shadow-lg shadow-violet-900/20 scale-[1.02]" : "border-zinc-700"}`}
              >
                {thumb ? (
                  <img src={thumb} alt={preset.label} className="w-full h-full object-cover" style={{ filter: filterStyle }} loading="lazy" />
                ) : clip.type === "video" ? (
                  <video src={clip.url} muted playsInline preload="metadata" className="w-full h-full object-cover" style={{ filter: filterStyle }} />
                ) : (
                  <img src={clip.url} alt={preset.label} className="w-full h-full object-cover" style={{ filter: filterStyle }} />
                )}
                {isActive && (
                  <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 12l5 5l10-10" />
                    </svg>
                  </span>
                )}
                {/* subtle label overlay */}
                <span className="absolute bottom-0 inset-x-0 text-center text-[9px] font-bold tracking-widest py-0.5 bg-black/60 text-white backdrop-blur">
                  {preset.label}
                </span>
              </div>
              <span className={`text-[11px] font-medium ${isActive ? "text-violet-300" : "text-zinc-400"}`}>{preset.label}</span>
            </button>
          );
        })}
      </div>
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-200">Selected: <span className="text-violet-300">{PRESETS.find((p) => (p.filter === activeFilter) || (activeFilter == null && p.filter === "none"))?.label ?? "Original"}</span></p>
          <p className="text-[11px] font-mono text-zinc-500 truncate max-w-[200px]">{activeFilter === "none" || activeFilter == null ? "none" : activeFilter}</p>
        </div>
        {activeFilter !== "none" && activeFilter != null && (
          <button onClick={() => updateClip(clip.id, { filter: null })} className="px-3 py-1.5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-xs font-medium text-zinc-300 border border-zinc-600">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
