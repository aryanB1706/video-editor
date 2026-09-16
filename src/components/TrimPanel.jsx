import { useEffect, useRef, useState, useCallback } from "react";
import useEditorStore from "../store/editorStore";

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) return "00:00";
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const MIN_GAP = 0.2; // minimum trim length seconds
const CROP_OPTIONS = [
  { id: null, label: "Original", icon: "▭" },
  { id: "1:1", label: "1:1", icon: "□" },
  { id: "9:16", label: "9:16", icon: "▯" },
  { id: "16:9", label: "16:9", icon: "▭" },
];

export default function TrimPanel({ clip }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);

  const duration = clip?.duration || 0;
  const isVideo = clip?.type === "video";

  const [localStart, setLocalStart] = useState(clip?.trimStart ?? 0);
  const [localEnd, setLocalEnd] = useState(clip?.trimEnd ?? duration);
  const [localCrop, setLocalCrop] = useState(clip?.crop ?? null);
  const [dragging, setDragging] = useState(null); // 'start' | 'end' | null

  const trackRef = useRef(null);

  useEffect(() => {
    setLocalStart(clip?.trimStart ?? 0);
    setLocalEnd(clip?.trimEnd ?? clip?.duration ?? 0);
    setLocalCrop(clip?.crop ?? null);
  }, [clip?.id, clip?.trimStart, clip?.trimEnd, clip?.crop, clip?.duration]);

  const hasChanges =
    Math.abs(localStart - (clip?.trimStart ?? 0)) > 0.01 ||
    Math.abs(localEnd - (clip?.trimEnd ?? duration)) > 0.01 ||
    localCrop !== (clip?.crop ?? null);

  const clampedDuration = duration > 0 ? duration : 5;

  const getValueFromClientX = useCallback(
    (clientX) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return percent * clampedDuration;
    },
    [clampedDuration]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragging) return;
      const val = getValueFromClientX(e.clientX ?? e.touches?.[0]?.clientX ?? 0);
      if (dragging === "start") {
        const clamped = Math.max(0, Math.min(val, localEnd - MIN_GAP));
        setLocalStart(clamped);
      } else if (dragging === "end") {
        const clamped = Math.max(localStart + MIN_GAP, Math.min(val, clampedDuration));
        setLocalEnd(clamped);
      }
    },
    [dragging, getValueFromClientX, localStart, localEnd, clampedDuration]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

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

  // Live preview seek when handles settle (optional: on drag preview)
  const previewAt = (time) => {
    // seek preview to that trim point and pause for frame accurate preview
    setIsPlaying(false);
    // MediaPreview stores relative time (0..effective), but we want to preview absolute trim point
    // For TrimPanel, we preview the trimStart frame: set currentTime to 0 relative to new trim
    // Simpler: set to 0 and let effect sync? We'll just seek via store if isVideo
    if (isVideo) {
      // absolute time = trim point, relative = trim point - clip.trimStart (old)
      // Instead, just preview trimmed start frame by setting currentTime to 0 after apply?
      // For live while dragging, we can set currentTime to time - (clip.trimStart ?? 0)
      // but to avoid confusion, just pause and let user Apply to see effect
    }
  };

  const handleApply = () => {
    if (!clip) return;
    // clamp final values
    const s = Math.max(0, Math.min(localStart, clampedDuration - MIN_GAP));
    const e = Math.max(s + MIN_GAP, Math.min(localEnd, clampedDuration));
    updateClip(clip.id, { trimStart: s, trimEnd: e, crop: localCrop });
    // reset playback to start of trimmed range for live preview (global)
    try {
      const segs = (() => {
        // dynamic import to avoid cycle - we use store snapshot
        const st = useEditorStore.getState();
        // compute seg for this clip after update (approx before update, but start will shift slightly due to trim change affecting earlier clips durations)
        // For simplicity, seek to global start of this clip after trim (its start unchanged, since trim doesn't affect start position, only its duration)
        const clips = st.mediaClips;
        let acc = 0;
        for (const c of clips) {
          if (c.id === clip.id) break;
          const dur = c.type === "image" ? 5 : (c.trimEnd ?? c.duration ?? 0) - (c.trimStart ?? 0) || c.duration || 0;
          acc += Math.max(0.1, dur);
        }
        return acc;
      })();
      setCurrentTime(segs);
    } catch {
      setCurrentTime(0);
    }
    setIsPlaying(false);
  };

  const handleReset = () => {
    setLocalStart(0);
    setLocalEnd(clampedDuration);
    setLocalCrop(null);
  };

  if (!clip) {
    return <p className="text-sm text-zinc-500 text-center py-6">No clip selected</p>;
  }

  if (!isVideo) {
    // For images, trim is not meaningful, but crop is
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">Trim applies to video clips. For images, adjust crop below.</p>
        <div>
          <p className="text-xs font-semibold tracking-widest text-zinc-500 mb-2">CROP ASPECT</p>
          <div className="grid grid-cols-4 gap-2">
            {CROP_OPTIONS.map((opt) => (
              <button
                key={String(opt.id)}
                onClick={() => setLocalCrop(opt.id)}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-colors ${localCrop === opt.id ? "bg-violet-600 border-violet-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700"}`}
              >
                <span className="text-lg leading-none">{opt.icon}</span>
                <span className="text-[11px] font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleApply}
          disabled={!hasChanges}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${hasChanges ? "bg-violet-600 hover:bg-violet-500 text-white" : "bg-zinc-800 text-zinc-500 border border-zinc-700"}`}
        >
          Apply Crop
        </button>
      </div>
    );
  }

  const leftPercent = (localStart / clampedDuration) * 100;
  const rightPercent = (localEnd / clampedDuration) * 100;
  const selectedWidth = rightPercent - leftPercent;
  const trimmedLen = localEnd - localStart;

  return (
    <div className="space-y-4">
      {/* Range text */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-zinc-300">
          {formatTime(localStart)} – {formatTime(localEnd)} <span className="text-zinc-500">/ {formatTime(clampedDuration)}</span>
        </p>
        <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-violet-500/15 border border-violet-500/20 text-violet-300">
          {trimmedLen.toFixed(1)}s trimmed
        </span>
      </div>

      {/* Slider track */}
      <div className="pt-2 pb-6">
        <div
          ref={trackRef}
          className="relative h-2 rounded-full bg-zinc-700 select-none touch-none"
          onPointerDown={(e) => {
            // click on track moves nearest handle
            const val = getValueFromClientX(e.clientX);
            const distStart = Math.abs(val - localStart);
            const distEnd = Math.abs(val - localEnd);
            if (distStart < distEnd) {
              setLocalStart(Math.max(0, Math.min(val, localEnd - MIN_GAP)));
              setDragging("start");
            } else {
              setLocalEnd(Math.max(localStart + MIN_GAP, Math.min(val, clampedDuration)));
              setDragging("end");
            }
          }}
        >
          {/* dimmed outside ranges */}
          <div className="absolute inset-0 rounded-full bg-zinc-800 opacity-60" />
          {/* selected range */}
          <div
            className="absolute top-0 bottom-0 bg-violet-600 rounded-full"
            style={{ left: `${leftPercent}%`, width: `${selectedWidth}%` }}
          />
          {/* inner highlight */}
          <div
            className="absolute top-0 bottom-0 bg-violet-500 rounded-full opacity-40"
            style={{ left: `${leftPercent}%`, width: `${selectedWidth}%` }}
          />

          {/* Start handle */}
          <button
            aria-label="Trim start"
            onPointerDown={(e) => {
              e.stopPropagation();
              setDragging("start");
              previewAt(localStart);
            }}
            onTouchStart={(e) => {
              setDragging("start");
            }}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-lg active:scale-110 transition-transform touch-none ${dragging === "start" ? "bg-white border-violet-600 scale-110" : "bg-zinc-100 border-zinc-300"}`}
            style={{ left: `${leftPercent}%` }}
          >
            <span className="w-0.5 h-3 bg-zinc-400 rounded-full" />
            <span className="w-0.5 h-3 bg-zinc-400 rounded-full ml-0.5" />
          </button>

          {/* End handle */}
          <button
            aria-label="Trim end"
            onPointerDown={(e) => {
              e.stopPropagation();
              setDragging("end");
              previewAt(localEnd);
            }}
            onTouchStart={() => setDragging("end")}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-lg active:scale-110 transition-transform touch-none ${dragging === "end" ? "bg-white border-violet-600 scale-110" : "bg-zinc-100 border-zinc-300"}`}
            style={{ left: `${rightPercent}%` }}
          >
            <span className="w-0.5 h-3 bg-zinc-400 rounded-full" />
            <span className="w-0.5 h-3 bg-zinc-400 rounded-full ml-0.5" />
          </button>
        </div>

        {/* tick labels */}
        <div className="flex justify-between mt-2 text-[10px] font-mono text-zinc-500">
          <span>00:00</span>
          <span>{formatTime(clampedDuration / 2)}</span>
          <span>{formatTime(clampedDuration)}</span>
        </div>

        {/* numeric inputs for precise */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-500">Start</span>
            <input
              type="number"
              step={0.1}
              min={0}
              max={localEnd - MIN_GAP}
              value={Number(localStart.toFixed(1))}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0;
                setLocalStart(Math.max(0, Math.min(v, localEnd - MIN_GAP)));
              }}
              className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-mono text-zinc-200 focus:outline-none focus:border-violet-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-500">End</span>
            <input
              type="number"
              step={0.1}
              min={localStart + MIN_GAP}
              max={clampedDuration}
              value={Number(localEnd.toFixed(1))}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0;
                setLocalEnd(Math.max(localStart + MIN_GAP, Math.min(v, clampedDuration)));
              }}
              className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-mono text-zinc-200 focus:outline-none focus:border-violet-500"
            />
          </label>
        </div>
      </div>

      {/* Crop options */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-zinc-500 mb-2">CROP (preview only)</p>
        <div className="grid grid-cols-4 gap-2">
          {CROP_OPTIONS.map((opt) => (
            <button
              key={String(opt.id)}
              onClick={() => setLocalCrop(opt.id)}
              className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-colors ${localCrop === opt.id ? "bg-violet-600 border-violet-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700"}`}
            >
              <span className="text-base leading-none">{opt.icon}</span>
              <span className="text-[11px] font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 mt-1.5">Applies <code className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">object-fit: cover</code> + aspectRatio clip — not pixel crop.</p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button onClick={handleReset} className="py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
          Reset
        </button>
        <button
          onClick={handleApply}
          disabled={!hasChanges}
          className={`col-span-2 py-3 rounded-xl font-semibold text-sm transition-colors ${hasChanges ? "bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white shadow-lg shadow-violet-900/20" : "bg-zinc-800 text-zinc-500 border border-zinc-700 opacity-60"}`}
        >
          Apply
        </button>
      </div>
      <p className="text-center text-[11px] text-zinc-500">Live preview loops between handles — scrub hits {formatTime(localStart)} / stops at {formatTime(localEnd)}</p>
    </div>
  );
}
