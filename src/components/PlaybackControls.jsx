import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import useEditorStore from "../store/editorStore";
import {
  getTotalDuration,
  findClipAtTime,
  formatTime,
} from "../utils/timeline";

/**
 * PlaybackControls below preview:
 * - play/pause button
 * - current time / total duration text
 * - scrubber across WHOLE timeline (respecting trim ranges)
 * - auto-advance selectedClipId seamlessly when playback crosses clip boundary
 */
export default function PlaybackControls() {
  const mediaClips = useEditorStore((s) => s.mediaClips);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const currentTime = useEditorStore((s) => s.currentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const setSelectedClip = useEditorStore((s) => s.setSelectedClip);

  const totalDuration = getTotalDuration(mediaClips);
  const globalTime = Math.max(0, Math.min(currentTime, totalDuration || 0));
  const isEmpty = mediaClips.length === 0 || totalDuration === 0;

  // local dragging state to avoid fighting with RAF
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(null);

  const displayTime = isDragging && dragValue !== null ? dragValue : globalTime;

  // keep dragValue in sync when not dragging
  useEffect(() => {
    if (!isDragging) setDragValue(null);
  }, [isDragging]);

  const handleSeekStart = () => setIsDragging(true);

  const handleSeekChange = (e) => {
    const val = parseFloat(e.target.value);
    setDragValue(val);
    const clamped = Math.max(0, Math.min(val, totalDuration));
    const found = findClipAtTime(mediaClips, clamped);
    if (found && found.clip.id !== selectedClipId) {
      setSelectedClip(found.clip.id);
    }
    setCurrentTime(clamped);
    // re-anchor RAF to new position if playing (fixes jump after seek)
    if (isPlaying) {
      startRef.current = {
        perfStart: performance.now(),
        globalStart: clamped,
      };
    }
  };

  const handleSeekEnd = () => {
    setIsDragging(false);
    setDragValue(null);
    // anchor already set in handleSeekChange
  };

  const togglePlay = useCallback(() => {
    if (isEmpty) return;
    if (globalTime >= totalDuration - 0.05) {
      // restart from beginning
      const first = mediaClips[0];
      if (first) setSelectedClip(first.id);
      setCurrentTime(0);
      setIsPlaying(true);
      return;
    }
    setIsPlaying(!isPlaying);
  }, [isEmpty, globalTime, totalDuration, mediaClips, setSelectedClip, setCurrentTime, setIsPlaying, isPlaying]);

  // ---------- Playback tick ----------
  // For image clips we drive via RAF. For video clips we let MediaPreview drive via video timeUpdate,
  // but we also keep a fallback global advancement to ensure seamless auto-advance even if video stalls.
  // To keep unified logic simple: Use RAF always when isPlaying, but read current clip type each frame.
  // If current clip is video, we still advance globalTime at wall-clock speed (1x) – MediaPreview will keep video synced.
  // This avoids dual clocks drift: we make PlaybackControls the single global clock.
  const rafRef = useRef(null);
  const startRef = useRef(null); // { perfStart, globalStart, clipIdAtStart }

  // Cancel RAF on unmount / pause
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying || isEmpty) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startRef.current = null;
      return;
    }
    if (isDragging) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Use store's current global at the moment playback resumes (fixes 1-sec repeat loop)
    const currentGlobal = useEditorStore.getState().currentTime;
    const found = findClipAtTime(mediaClips, currentGlobal);
    if (!found) {
      setIsPlaying(false);
      return;
    }

    // Anchor RAF to current global — only set once per play session, not on every tick
    if (!startRef.current) {
      startRef.current = {
        perfStart: performance.now(),
        globalStart: currentGlobal,
      };
    }
    const tick = (now) => {
      const s = startRef.current;
      if (!s) return;
      const elapsed = (now - s.perfStart) / 1000;
      let next = s.globalStart + elapsed;

      const state = useEditorStore.getState();
      const clips = state.mediaClips;
      const total = getTotalDuration(clips);

      if (next >= total) {
        state.setCurrentTime(total);
        state.setIsPlaying(false);
        rafRef.current = null;
        startRef.current = null;
        return;
      }
      next = Math.max(0, Math.min(next, total));
      const nextFound = findClipAtTime(clips, next);
      if (nextFound && nextFound.clip.id !== state.selectedClipId) {
        state.setSelectedClip(nextFound.clip.id);
      }
      state.setCurrentTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, isEmpty, isDragging, mediaClips, totalDuration, setIsPlaying]);

  // When currentTime is updated externally (e.g., MediaPreview video driving), reset RAF start anchor
  // to prevent jump. Do this by syncing startRef if not playing? Already handled.
  // Also watch for clip changes due to trim that may affect totalDuration and cause globalTime > total
  useEffect(() => {
    if (globalTime > totalDuration) {
      setCurrentTime(totalDuration);
      setIsPlaying(false);
    }
  }, [totalDuration, globalTime, setCurrentTime, setIsPlaying]);

  // Also react to seek via MediaPreview updating globalTime while playing: reset start anchor
  useEffect(() => {
    if (isPlaying && startRef.current) {
      const drift = Math.abs(startRef.current.globalStart - globalTime + (performance.now() - startRef.current.perfStart) / 1000);
      // if drift > 0.4 caused by external seek (e.g., video timeUpdate), reset anchor
      if (drift > 0.5 && !isDragging) {
        startRef.current = {
          perfStart: performance.now(),
          globalStart: globalTime,
        };
      }
    }
  }, [globalTime, isPlaying, isDragging]);

  const progressPercent = totalDuration > 0 ? (displayTime / totalDuration) * 100 : 0;

  return (
    <div className="shrink-0 bg-zinc-900 border-t border-zinc-800 px-3 py-2.5 flex items-center gap-3">
      <button
        onClick={togglePlay}
        disabled={isEmpty}
        aria-label={isPlaying ? "Pause" : "Play"}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-all border ${
          isEmpty
            ? "bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed"
            : isPlaying
            ? "bg-violet-600 border-violet-500 text-white shadow"
            : "bg-white border-white text-black hover:bg-zinc-100"
        }`}
      >
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} className="ml-0.5" fill="currentColor" />}
      </button>

      <span className="text-[11px] font-mono text-white tabular-nums min-w-[42px]">{formatTime(displayTime)}</span>

      <div className="flex-1 relative flex items-center h-5">
        {/* background track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-white/20 overflow-hidden pointer-events-none">
          <div className="h-full bg-violet-500 rounded-full transition-none" style={{ width: `${progressPercent}%` }} />
        </div>

        {/* scrubber */}
        <input
          type="range"
          min={0}
          max={totalDuration || 0}
          step={0.01}
          value={isDragging && dragValue !== null ? dragValue : globalTime}
          onChange={handleSeekChange}
          onPointerDown={handleSeekStart}
          onPointerUp={handleSeekEnd}
          onTouchStart={handleSeekStart}
          onTouchEnd={handleSeekEnd}
          disabled={isEmpty}
          className="relative w-full h-5 appearance-none bg-transparent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
            [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-transparent
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-zinc-300 [&::-webkit-slider-thumb]:mt-[-3px]
            [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0
            [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:bg-transparent"
          aria-label="Seek timeline"
        />
      </div>

      <span className="text-[11px] font-mono text-zinc-400 tabular-nums min-w-[42px]">{formatTime(totalDuration)}</span>
    </div>
  );
}
