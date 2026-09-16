import { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scissors,
  Type,
  Wand2,
  Plus,
  Trash2,
  X,
  Image as ImageIcon,
  Film,
  Loader2,
  Eye,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  DragOverlay,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import useEditorStore from "../store/editorStore";
import MediaPreview from "../components/MediaPreview";
import PlaybackControls from "../components/PlaybackControls";
import TextPanel from "../components/TextPanel";
import FiltersPanel from "../components/FiltersPanel";
import { getTotalDuration, getTimelineSegments } from "../utils/timeline";

function Filmstrip({ clip }) {
  const [frames, setFrames] = useState([]);
  const duration = clip.duration || 5;
  const isVideo = clip.type === "video";

  useEffect(() => {
    if (!isVideo || !clip.url) return;
    let cancelled = false;
    const N = 5;
    const video = document.createElement("video");
    video.src = clip.url;
    video.muted = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";

    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 45;
    const ctx = canvas.getContext("2d");

    const captureAt = (time) =>
      new Promise((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          if (cancelled || !ctx) return resolve(null);
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL());
          } catch {
            resolve(null);
          }
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
        setTimeout(() => {
          video.removeEventListener("seeked", onSeeked);
          resolve(null);
        }, 800);
      });

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
      const out = [];
      for (let i = 0; i < N; i++) {
        const t = (clip.trimStart ?? 0) + (i / (N - 1)) * Math.max(0.2, (clip.trimEnd ?? duration) - (clip.trimStart ?? 0));
        const data = await captureAt(t);
        if (data) out.push(data);
        else out.push(clip.url);
      }
      if (!cancelled) setFrames(out);
    };
    generate();
    return () => {
      cancelled = true;
      video.pause();
      video.src = "";
    };
  }, [clip.url, clip.id, clip.trimStart, clip.trimEnd, duration, isVideo]);

  if (!isVideo) {
    return <img src={clip.url} alt="" className="w-full h-full object-cover pointer-events-none" loading="lazy" />;
  }

  if (frames.length === 0) {
    return <video src={clip.url} muted playsInline preload="metadata" className="w-full h-full object-cover pointer-events-none" />;
  }

  return (
    <div className="w-full h-full flex">
      {frames.map((src, i) => (
        <img key={i} src={src} alt="" className="flex-1 h-full object-cover pointer-events-none" loading="lazy" />
      ))}
    </div>
  );
}

function SortableClip({ clip, isSelected, onSelect, isTrimMode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: clip.id,
    disabled: isTrimMode && isSelected,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 0,
    // Allow native scroll (pan) until hold-to-drag activates.
    // dnd-kit TouchSensor with delay takes over after hold.
    touchAction: "pan-x pan-y",
    WebkitUserSelect: "none",
    userSelect: "none",
    WebkitTouchCallout: "none",
  };

  const updateClip = useEditorStore((s) => s.updateClip);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const removeClip = useEditorStore((s) => s.removeClip);
  const setSelectedClipStore = useEditorStore((s) => s.setSelectedClip);
  const mediaClips = useEditorStore((s) => s.mediaClips);

  const duration = clip.duration || 5;
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? duration;
  const effectiveLen = Math.max(0.2, trimEnd - trimStart);
  const totalDuration = duration;

  const clipRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const startXRef = useRef(0);
  const startTrimRef = useRef({ start: 0, end: 0 });

  const handlePointerDown = (e, side) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(side);
    startXRef.current = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    startTrimRef.current = { start: trimStart, end: trimEnd };
    setIsPlaying(false);
    if (e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragging) return;
      const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      const rect = clipRef.current?.getBoundingClientRect();
      if (!rect) return;
      const deltaPx = clientX - startXRef.current;
      const deltaSec = (deltaPx / rect.width) * totalDuration;

      if (dragging === "start") {
        const next = Math.max(0, Math.min(startTrimRef.current.start + deltaSec, trimEnd - 0.2));
        updateClip(clip.id, { trimStart: next });
        const segs = getTimelineSegments(useEditorStore.getState().mediaClips);
        const seg = segs.find((s) => s.clip.id === clip.id);
        if (seg) setCurrentTime(seg.start);
      } else if (dragging === "end") {
        const next = Math.max(startTrimRef.current.start + 0.2, Math.min(startTrimRef.current.end + deltaSec, totalDuration));
        updateClip(clip.id, { trimEnd: next });
      }
    },
    [dragging, clip.id, trimEnd, totalDuration, updateClip, setCurrentTime]
  );

  const handlePointerUp = useCallback(() => {
    if (dragging) {
      setDragging(null);
      const segs = getTimelineSegments(useEditorStore.getState().mediaClips);
      const seg = segs.find((s) => s.clip.id === clip.id);
      if (seg) setCurrentTime(seg.start);
    }
  }, [dragging, setCurrentTime, clip.id]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => handlePointerMove(e);
    const up = () => handlePointerUp();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [dragging, handlePointerMove, handlePointerUp]);

  const leftPct = (trimStart / totalDuration) * 100;
  const rightPct = (trimEnd / totalDuration) * 100;
  const widthPct = rightPct - leftPct;

  const showTrimUI = isSelected && isTrimMode;

  const handleDelete = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const state = useEditorStore.getState();
    const clips = state.mediaClips;
    const idx = clips.findIndex((c) => c.id === clip.id);
    const url = clip.url;
    removeClip(clip.id);
    // auto-select next/prev if this was selected
    if (state.selectedClipId === clip.id) {
      const remaining = clips.filter((c) => c.id !== clip.id);
      let nextId = null;
      if (remaining.length > 0) {
        if (idx < remaining.length) nextId = remaining[idx].id;
        else nextId = remaining[remaining.length - 1].id;
      }
      if (nextId) setSelectedClipStore(nextId);
    }
    if (url?.startsWith("blob:")) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 400);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`snap-start shrink-0 relative pt-6 select-none ${isDragging ? "z-10" : ""}`}
      {...(!showTrimUI ? attributes : {})}
      {...(!showTrimUI ? listeners : {})}
    >
      {/* cross delete button — always visible on each timeline clip */}
      <button
        onClick={handleDelete}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        aria-label={`Delete ${clip.file?.name ?? clip.type}`}
        className="absolute -top-1.5 -right-1.5 z-30 w-6 h-6 rounded-full bg-zinc-800 border border-zinc-600 text-zinc-300 hover:bg-red-600 hover:border-red-500 hover:text-white active:bg-red-700 flex items-center justify-center shadow-lg transition-colors"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
      {showTrimUI && (
        <>
          <span className="absolute -top-1 left-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black text-white border border-white/20 whitespace-nowrap z-10" style={{ left: `calc(${leftPct}% - 18px)` }}>
            {Math.floor(trimStart / 60)}:{String(Math.floor(trimStart % 60)).padStart(2, "0")}
          </span>
          <span className="absolute -top-1 right-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black text-white border border-white/20 whitespace-nowrap z-10" style={{ right: `calc(${100 - rightPct}% - 18px)` }}>
            {Math.floor(trimEnd / 60)}:{String(Math.floor(trimEnd % 60)).padStart(2, "0")}
          </span>
        </>
      )}
      <div
        className={`relative rounded-xl border-2 bg-zinc-900 flex flex-col transition-all text-left overflow-visible
          ${isSelected ? "border-rose-500 shadow-lg shadow-rose-900/20 scale-[1.02]" : "border-zinc-700 hover:border-zinc-600"}
          ${showTrimUI ? "w-[180px]" : "w-[108px]"}`}
      >
        <button
          onClick={() => onSelect(clip.id)}
          ref={clipRef}
          className="relative rounded-xl overflow-hidden flex flex-col text-left w-full"
        >
          <div className="h-[64px] bg-black relative overflow-hidden rounded-t-[10px]">
            <Filmstrip clip={clip} />
            {showTrimUI && (
              <>
                <div className="absolute inset-y-0 left-0 bg-black/60 backdrop-blur-[0.5px]" style={{ width: `${leftPct}%` }} />
                <div className="absolute inset-y-0 right-0 bg-black/60 backdrop-blur-[0.5px]" style={{ width: `${100 - rightPct}%` }} />
                <div className="absolute inset-y-0 border-y-2 border-rose-500 pointer-events-none" style={{ left: `${leftPct}%`, width: `${widthPct}%` }} />
              </>
            )}
            {isSelected && !showTrimUI && (
              <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 12l5 5l10-10" />
                </svg>
              </span>
            )}
            <span className={`absolute bottom-1 left-1 text-[9px] font-bold tracking-widest px-1 py-0.5 rounded border backdrop-blur ${showTrimUI || Math.abs(trimStart) > 0.01 || Math.abs(trimEnd - totalDuration) > 0.01 ? "bg-rose-600/90 border-rose-500 text-white" : "bg-black/70 border-white/10 text-white"}`}>
              {effectiveLen.toFixed(1)}s
            </span>
            {!showTrimUI && (
              <span className="absolute top-1 left-1 w-5 h-5 rounded bg-black/60 backdrop-blur flex items-center justify-center text-white/70">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="5" r="1" />
                  <circle cx="9" cy="12" r="1" />
                  <circle cx="9" cy="19" r="1" />
                  <circle cx="15" cy="5" r="1" />
                  <circle cx="15" cy="12" r="1" />
                  <circle cx="15" cy="19" r="1" />
                </svg>
              </span>
            )}
          </div>
          <div className="px-2 py-1.5 bg-zinc-800 min-w-0 rounded-b-[10px]">
            <p className="text-[11px] font-medium text-zinc-200 truncate">{clip.file?.name ?? `${clip.type}-${clip.id.slice(0, 4)}`}</p>
            <p className="text-[10px] text-zinc-500 truncate">
              {showTrimUI
                ? `${trimStart.toFixed(1)}s → ${trimEnd.toFixed(1)}s`
                : Math.abs(trimStart) > 0.01 || Math.abs(trimEnd - totalDuration) > 0.01
                ? `${trimStart.toFixed(1)}s → ${trimEnd.toFixed(1)}s • trimmed`
                : clip.filter
                ? `Filter: ${clip.filter}`
                : "No filter"}{" "}
              • {clip.textOverlays.length} text
            </p>
          </div>
        </button>
        {showTrimUI && (
          <>
            <div
              onPointerDown={(e) => handlePointerDown(e, "start")}
              onTouchStart={(e) => handlePointerDown(e, "start")}
              className="absolute top-0 bottom-[34px] w-7 flex items-center justify-center cursor-ew-resize touch-none select-none z-20"
              style={{ left: `calc(${leftPct}% - 14px)` }}
            >
              <div className={`w-[14px] h-[68px] rounded-md bg-white shadow-xl border border-zinc-300 flex flex-col items-center justify-center gap-1 ${dragging === "start" ? "scale-105 bg-rose-50 ring-2 ring-rose-400" : ""}`}>
                <span className="w-0.5 h-3 bg-zinc-500 rounded-full" />
                <span className="w-0.5 h-3 bg-zinc-500 rounded-full" />
                <span className="text-[8px] font-bold text-zinc-600 -rotate-90 whitespace-nowrap mt-1">TRIM</span>
              </div>
            </div>
            <div
              onPointerDown={(e) => handlePointerDown(e, "end")}
              onTouchStart={(e) => handlePointerDown(e, "end")}
              className="absolute top-0 bottom-[34px] w-7 flex items-center justify-center cursor-ew-resize touch-none select-none z-20"
              style={{ left: `calc(${rightPct}% - 14px)` }}
            >
              <div className={`w-[14px] h-[68px] rounded-md bg-white shadow-xl border border-zinc-300 flex flex-col items-center justify-center gap-1 ${dragging === "end" ? "scale-105 bg-rose-50 ring-2 ring-rose-400" : ""}`}>
                <span className="w-0.5 h-3 bg-zinc-500 rounded-full" />
                <span className="w-0.5 h-3 bg-zinc-500 rounded-full" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Editor() {
  const navigate = useNavigate();
  const { mediaClips, selectedClipId, setSelectedClip, addClips, removeClip, reorderClips } = useEditorStore();

  const [aspect, setAspect] = useState("9:16");
  const [activeTool, setActiveTool] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const fileInputRef = useRef(null);

  // Mobile fix: MouseSensor for desktop (touch never triggers it),
  // TouchSensor with hold-delay for mobile so:
  // - normal swipe = horizontal scroll
  // - hold (~300ms) + move = reorder drag
  // PointerSensor removed because it hijacks touch scroll after 6px.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const selectedClip = mediaClips.find((c) => c.id === selectedClipId) ?? mediaClips[0] ?? null;
  const isTrimMode = activeTool === "trim";

  useEffect(() => {
    setSelectedTextId(null);
  }, [selectedClip?.id]);

  useEffect(() => {
    if (activeTool !== "text") setSelectedTextId(null);
  }, [activeTool]);

  const handleToolClick = (tool) => {
    if (activeTool === tool) setActiveTool(null);
    else setActiveTool(tool);
  };

  const handleAddClipClick = () => {
    if (isAdding) return;
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("video/") || f.type.startsWith("image/"));
    if (files.length === 0) return;
    setIsAdding(true);
    const pending = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      type: file.type.startsWith("image/") ? "image" : "video",
    }));
    const probes = pending.map(
      (p) =>
        new Promise((resolve) => {
          if (p.type === "image") {
            resolve({ ...p, duration: 5 });
            return;
          }
          const v = document.createElement("video");
          v.preload = "metadata";
          v.muted = true;
          v.src = p.url;
          const done = (d) => resolve({ ...p, duration: d });
          v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0);
          v.onerror = () => done(0);
          setTimeout(() => done(0), 2500);
        })
    );
    const clips = await Promise.all(probes);
    addClips(clips);
    e.target.value = "";
    setIsAdding(false);
    setActiveTool(null);
  };

  const confirmDelete = () => {
    if (!selectedClip) return;
    const idx = mediaClips.findIndex((c) => c.id === selectedClip.id);
    const url = selectedClip.url;
    removeClip(selectedClip.id);
    const remaining = mediaClips.filter((c) => c.id !== selectedClip.id);
    let nextId = null;
    if (remaining.length > 0) {
      if (idx < remaining.length) nextId = remaining[idx].id;
      else nextId = remaining[remaining.length - 1].id;
    }
    if (nextId) setSelectedClip(nextId);
    setShowDeleteConfirm(false);
    if (url?.startsWith("blob:")) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 500);
    }
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
    // light haptic on mobile when hold-to-drag activates
    try {
      navigator.vibrate?.(15);
    } catch {}
  };

  const handleDragEnd = (event) => {
    setActiveId(null);
    if (isTrimMode) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = mediaClips.findIndex((c) => c.id === active.id);
    const newIndex = mediaClips.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderClips(oldIndex, newIndex);
  };

  const handleDragCancel = () => setActiveId(null);

  const activeClip = activeId ? mediaClips.find((c) => c.id === activeId) ?? null : null;

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full max-w-full relative overflow-x-hidden overscroll-contain">
      <input ref={fileInputRef} type="file" accept="video/*,image/*" multiple className="hidden" onChange={handleFilesSelected} />

      {/* Preview — fixed stage so aspect toggle never moves timeline/toolbar */}
      <section className="shrink-0 p-3 pb-2 flex flex-col gap-2 bg-zinc-900 w-full max-w-full overflow-x-hidden">
        <div className="flex items-center justify-between gap-2 min-w-0 h-[32px]">
          <span className="text-[11px] font-semibold tracking-widest text-zinc-500 shrink-0">PREVIEW</span>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center rounded-full bg-zinc-800 border border-zinc-700 p-0.5 gap-0.5">
              {[
                { id: "9:16", label: "9:16" },
                { id: "16:9", label: "16:9" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setAspect(opt.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${aspect === opt.id ? "bg-rose-600 text-white shadow" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => navigate("/preview")}
              className="px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow shadow-rose-900/20 shrink-0"
            >
              <Eye size={12} />
              Preview
            </button>
          </div>
        </div>
        {/* Fixed-height letterboxed stage — outer size NEVER changes with aspect */}
        <div className="mx-auto w-full rounded-2xl bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-center overflow-hidden h-[36dvh] min-h-[300px] max-h-[380px] sm:h-[340px]">
          <motion.div
            key={aspect}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            className={`bg-black rounded-xl border border-zinc-800 overflow-hidden relative flex items-center justify-center max-w-full max-h-full ${
              aspect === "9:16" ? "h-full aspect-[9/16] w-auto" : "w-full aspect-video max-w-[440px] h-auto max-h-full"
            }`}
          >
          {selectedClip ? (
            <MediaPreview clip={selectedClip} selectedTextId={selectedTextId} onSelectText={setSelectedTextId} />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-black flex flex-col items-center justify-center gap-3 text-zinc-500 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                <Film size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-300">No clips yet</p>
                <p className="text-xs text-zinc-500 mt-1 max-w-[24ch]">Add clips from the Upload tab or tap + Add Clip below</p>
              </div>
              <button onClick={() => navigate("/")} className="mt-1 px-4 py-2 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
                Go to Upload
              </button>
            </div>
          )}
          </motion.div>
        </div>
        {mediaClips.length > 0 && (
          <div className="min-h-[56px]">
            <PlaybackControls />
          </div>
        )}
        {mediaClips.length > 0 ? (
          <p className="text-center text-[11px] text-zinc-500 px-3 leading-relaxed min-h-[18px] truncate">
            {mediaClips.length} clip{mediaClips.length !== 1 ? "s" : ""} • {selectedClip ? `${selectedClip.file?.name ?? selectedClip.type}` : "Tap a clip below"} • {getTotalDuration(mediaClips).toFixed(1)}s total
            {isTrimMode && selectedClip ? " • Drag handles to trim (video & image)" : ""}
          </p>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={async () => {
              try {
                const res = await fetch("/sample.mp4");
                if (!res.ok) throw new Error("sample not found");
                const blob = await res.blob();
                const file = new File([blob], "sample.mp4", { type: "video/mp4" });
                const url = URL.createObjectURL(file);
                const v = document.createElement("video");
                v.preload = "metadata";
                v.muted = true;
                v.src = url;
                const done = (d) => addClips([{ file, url, type: "video", duration: d }]);
                v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 5);
                v.onerror = () => done(5);
                setTimeout(() => done(5), 2000);
              } catch (e) {
                console.error(e);
              }
            }}
            className="mx-auto flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-full bg-rose-600 text-white hover:bg-rose-500 transition-colors shadow"
          >
            <Film size={12} /> Load sample video
          </motion.button>
        )}
      </section>

      {/* Timeline */}
      <section className="shrink-0 border-y border-zinc-800 bg-zinc-800/30 w-full max-w-full overflow-hidden">
        <div className="px-3 py-2 flex items-center justify-between gap-2 min-w-0">
          <span className="text-[11px] font-semibold tracking-widest text-zinc-500 shrink-0">TIMELINE</span>
          <span className="text-[11px] font-mono text-zinc-500 truncate">
            {mediaClips.length > 0 ? `${getTotalDuration(mediaClips).toFixed(1)}s total ${isTrimMode ? "• Trim mode" : "• hold to drag"}` : "Empty"}
          </span>
        </div>
        <div className="pb-3 overflow-hidden">
          {mediaClips.length === 0 ? (
            <div className="mx-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 shrink-0">
                <ImageIcon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-300">Your timeline is empty</p>
                <p className="text-[11px] text-zinc-500 truncate">Clips you add will appear here horizontally — scroll →</p>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext items={mediaClips.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
                <div
                  className="flex gap-2.5 overflow-x-auto overflow-y-hidden scrollbar-none px-3 snap-x snap-proximity scroll-smooth pt-6 pb-1 w-full max-w-full"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none", touchAction: "pan-x pan-y", overscrollBehaviorX: "contain" }}
                >
                  {mediaClips.map((clip) => (
                      <SortableClip
                        key={clip.id}
                        clip={clip}
                        isSelected={clip.id === (selectedClip?.id ?? null)}
                        onSelect={(id) => {
                          // ignore tap that was actually a drag
                          if (activeId) return;
                          const segs = getTimelineSegments(mediaClips);
                          const seg = segs.find((s) => s.clip.id === id);
                          if (seg) useEditorStore.getState().setCurrentTime(seg.start);
                          setSelectedClip(id);
                        }}
                        isTrimMode={isTrimMode}
                      />
                  ))}
                  <div className="snap-start shrink-0 relative pt-6 flex self-stretch">
                    <button
                      onClick={handleAddClipClick}
                      disabled={isAdding}
                      className="flex-1 w-[108px] min-h-[104px] rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/40 flex flex-col items-center justify-center gap-1.5 hover:bg-zinc-800 hover:border-zinc-600 transition-colors disabled:opacity-50"
                    >
                      <span className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
                        {isAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      </span>
                      <span className="text-xs font-medium text-zinc-400">{isAdding ? "Adding..." : "Add"}</span>
                    </button>
                  </div>
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeClip ? (
                  <div className="w-[108px] rounded-xl border-2 border-rose-500 bg-zinc-900 shadow-2xl shadow-rose-900/40 overflow-hidden opacity-95 rotate-2 scale-105 pointer-events-none">
                    <div className="h-[64px] bg-black relative overflow-hidden">
                      {activeClip.type === "image" ? (
                        <img src={activeClip.url} alt="" className="w-full h-full object-cover pointer-events-none" />
                      ) : (
                        <video src={activeClip.url} muted playsInline preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                      )}
                      <span className="absolute bottom-1 left-1 text-[9px] font-bold px-1 py-0.5 rounded bg-rose-600 text-white">
                        {(activeClip.trimEnd - activeClip.trimStart).toFixed(1)}s
                      </span>
                    </div>
                    <div className="px-2 py-1.5 bg-zinc-800">
                      <p className="text-[11px] font-medium text-zinc-200 truncate">{activeClip.file?.name ?? activeClip.type}</p>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </section>

      {/* Toolbar */}
      <section className="shrink-0 bg-zinc-900 border-t border-zinc-800 px-2 py-2 w-full max-w-full overflow-hidden">
        <div className="flex items-center gap-1 min-w-0">
          {[
            { id: "trim", label: "Trim", icon: Scissors },
            { id: "text", label: "Text", icon: Type },
            { id: "filters", label: "Filters", icon: Wand2 },
            { id: "add", label: "Add Clip", icon: Plus, action: true },
            { id: "delete", label: "Delete", icon: Trash2, action: true, danger: true },
          ].map((btn) => {
            const Icon = btn.icon;
            const isActive = activeTool === btn.id;
            const isDisabled = btn.id === "delete" && !selectedClip;
            if (btn.action) {
              return (
                <button
                  key={btn.id}
                  onClick={btn.id === "add" ? handleAddClipClick : () => setShowDeleteConfirm(true)}
                  disabled={isDisabled || (btn.id === "add" && isAdding)}
                  className={`flex-1 min-w-0 flex flex-col items-center gap-1 py-2 rounded-xl transition-colors ${isDisabled ? "opacity-30 pointer-events-none" : ""} ${btn.danger ? "text-red-400 hover:bg-red-500/10" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${btn.danger ? "bg-red-500/10 border-red-500/20" : "bg-zinc-800 border-zinc-700"}`}>
                    {btn.id === "add" && isAdding ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
                  </span>
                  <span className="text-[11px] font-medium leading-none truncate w-full text-center">{btn.label}</span>
                </button>
              );
            }
            return (
              <button
                key={btn.id}
                onClick={() => handleToolClick(btn.id)}
                className={`flex-1 min-w-0 flex flex-col items-center gap-1 py-2 rounded-xl transition-colors ${isActive ? "text-rose-300 bg-rose-500/10" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}
              >
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors shrink-0 ${isActive ? "bg-rose-600 text-white border-rose-500 shadow" : "bg-zinc-800 border-zinc-700"}`}>
                  <Icon size={18} />
                </span>
                <span className="text-[11px] font-medium leading-none truncate w-full text-center">{btn.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-center text-[10px] text-zinc-600 mt-1 px-2 leading-relaxed">Tap a tool to open • Hold clip to drag & reorder • Tap × to delete</p>
      </section>

      {/* Delete confirm — motion */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <motion.button aria-label="Close" onClick={() => setShowDeleteConfirm(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div
              initial={{ y: 24, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-5 shadow-2xl"
            >
              <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
                <Trash2 size={18} />
              </div>
              <h3 className="text-center text-sm font-semibold text-zinc-100 mt-3">Delete clip?</h3>
              <p className="text-center text-xs text-zinc-400 mt-1 leading-relaxed px-2">
                Remove <span className="text-zinc-200 font-medium">“{selectedClip?.file?.name ?? selectedClip?.type}”</span> from timeline.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-5">
                <button onClick={() => setShowDeleteConfirm(false)} className="py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-colors">
                  Cancel
                </button>
                <button onClick={confirmDelete} className="py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors">
                  Delete
                </button>
              </div>
              <p className="text-center text-[11px] text-zinc-500 mt-3">Next clip will be auto-selected</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trim inline bar */}
      <AnimatePresence>
        {isTrimMode && selectedClip && (
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="shrink-0 bg-zinc-900 border-y border-zinc-700 px-3 py-2.5 flex flex-col gap-2"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold tracking-widest text-zinc-500">
                  TRIM • LIVE PREVIEW {selectedClip.type === "image" ? "• IMAGE" : ""}
                </p>
                <p className="text-xs font-mono text-zinc-200 truncate">
                  {`${(selectedClip.trimStart ?? 0).toFixed(1)}s → ${(selectedClip.trimEnd ?? selectedClip.duration).toFixed(1)}s`} <span className="text-zinc-500">/ {(selectedClip.duration || 0).toFixed(1)}s</span>
                  <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-rose-600 text-white">{Math.max(0, (selectedClip.trimEnd ?? selectedClip.duration) - (selectedClip.trimStart ?? 0)).toFixed(1)}s</span>
                </p>
              </div>
              <button onClick={() => setActiveTool(null)} className="shrink-0 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold">
                Done
              </button>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
              <span className="text-[10px] font-semibold tracking-widest text-zinc-500 mr-1 shrink-0">CROP:</span>
              {[
                { id: null, label: "Original" },
                { id: "1:1", label: "1:1" },
                { id: "9:16", label: "9:16" },
                { id: "16:9", label: "16:9" },
              ].map((opt) => (
                <button
                  key={String(opt.id)}
                  onClick={() => useEditorStore.getState().updateClip(selectedClip.id, { crop: opt.id })}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 transition-colors ${selectedClip.crop === opt.id || (!selectedClip.crop && opt.id === null) ? "bg-rose-600 border-rose-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom sheets — framer-motion slide-up */}
      <AnimatePresence>
        {activeTool && activeTool !== "trim" && (
          <>
            <motion.button
              aria-label="Close panel"
              onClick={() => setActiveTool(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              key={activeTool}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.15}
              onDragEnd={(_, info) => {
                if (info.offset.y > 80) setActiveTool(null);
              }}
              className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-40 bg-zinc-900 border-t border-zinc-700 rounded-t-2xl shadow-2xl flex flex-col ${activeTool === "text" ? "max-h-[68vh]" : "max-h-[45vh]"}`}
            >
              <div className="flex justify-center pt-2 pb-1 shrink-0">
                <div className="w-9 h-1 rounded-full bg-zinc-700" />
              </div>
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0 gap-2 min-w-0">
                <h3 className="text-sm font-semibold text-zinc-100 capitalize flex items-center gap-2 min-w-0">
                  {activeTool === "text" && <Type size={16} className="text-rose-400 shrink-0" />}
                  {activeTool === "filters" && <Wand2 size={16} className="text-rose-400 shrink-0" />}
                  <span className="truncate">{activeTool} Tool</span>
                  <span className="text-xs font-normal text-zinc-500 hidden sm:inline truncate">{activeTool === "text" ? "• Add & drag on preview" : "— Coming soon"}</span>
                </h3>
                <button onClick={() => setActiveTool(null)} className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-200 shrink-0">
                  <X size={16} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
                {activeTool === "text" && <TextPanel clip={selectedClip} selectedTextId={selectedTextId} onSelectText={setSelectedTextId} />}
                {activeTool === "filters" && <FiltersPanel clip={selectedClip} />}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
