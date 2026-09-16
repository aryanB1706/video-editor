import { useEffect, useRef, useCallback, useState } from "react";
import { Play, Pause, AlertTriangle } from "lucide-react";
import useEditorStore from "../store/editorStore";
import {
  getEffectiveDuration,
  getTimelineSegments,
  getTotalDuration,
} from "../utils/timeline";

const FILTER_MAP = {
  none: "none",
  vivid: "saturate(1.5) contrast(1.1)",
  grayscale: "grayscale(1)",
  sepia: "sepia(1)",
  warm: "sepia(0.3) saturate(1.2)",
  cool: "hue-rotate(180deg) saturate(1.1)",
  vintage: "sepia(0.4) contrast(0.9) brightness(0.9)",
  mono: "grayscale(1) contrast(1.1)",
  invert: "invert(1)",
  blur: "blur(4px)",
};

function resolveFilter(filter) {
  if (!filter || filter === "none") return "none";
  if (FILTER_MAP[filter]) return FILTER_MAP[filter];
  if (filter.includes("(")) return filter;
  return "none";
}

export default function MediaPreview({ clip: propClip, selectedTextId, onSelectText }) {
  const {
    mediaClips,
    selectedClipId,
    currentTime,
    isPlaying,
    setCurrentTime,
    setIsPlaying,
    setSelectedClip,
    updateClip,
  } = useEditorStore();

  const clip = propClip ?? mediaClips.find((c) => c.id === selectedClipId) ?? mediaClips[0] ?? null;

  const videoRef = useRef(null);
  const isMetadataLoadedRef = useRef(false);
  const [videoError, setVideoError] = useState(null);
  const lastClipIdRef = useRef(null);
  const previewRef = useRef(null);
  const [draggingText, setDraggingText] = useState(null);
  const dragOffsetRef = useRef({ dx: 0, dy: 0 });

  // ---- timeline derived values (global) ----
  const segments = getTimelineSegments(mediaClips);
  const totalDuration = getTotalDuration(mediaClips);
  const segForClip = clip ? segments.find((s) => s.clip.id === clip.id) : null;
  const clipStart = segForClip ? segForClip.start : 0;
  const effectiveDuration = clip ? getEffectiveDuration(clip) : 0;

  // local time derived from global currentTime
  const localTimeRaw = clip ? currentTime - clipStart : 0;
  const clampedLocal = clip ? Math.max(0, Math.min(localTimeRaw, effectiveDuration || 0)) : 0;

  // When selected clip changes, don't reset global to 0. Instead seek to clip start if global is outside.
  useEffect(() => {
    if (!clip) return;
    if (lastClipIdRef.current !== clip.id) {
      lastClipIdRef.current = clip.id;
      isMetadataLoadedRef.current = false;
      setVideoError(null);
      // If this is initial mount, prevId is null -> don't seek unnecessarily? Keep global 0.
      // For auto-advance, global already at seg start, so no seek needed.
      // For manual selection, if global outside new clip, seek to its start.
      const segs = getTimelineSegments(useEditorStore.getState().mediaClips);
      const seg = segs.find((s) => s.clip.id === clip.id);
      if (seg) {
        const global = useEditorStore.getState().currentTime;
        const isInside = global >= seg.start - 0.001 && global < seg.end + 0.001;
        const isAtStart = Math.abs(global - seg.start) < 0.08;
        // Only seek if not inside and not already at start (to avoid jump on auto-advance)
        // Also if prevId is null (first load) and global is 0, it's already inside first clip.
        if (!isInside && !isAtStart) {
          // manual click: jump to clip start; keep playing state as is? Pause for precision?
          // We keep isPlaying unchanged for now, but ensure video will seek.
          setCurrentTime(seg.start);
        }
      }
    }
  }, [clip?.id, setCurrentTime]);

  // Video: sync seek to global-derived local time (only after metadata)
  useEffect(() => {
    const video = videoRef.current;
    if (!clip || clip.type !== "video" || !video) return;
    if (!isMetadataLoadedRef.current) return;
    if (video.readyState < 1) return;
    if (!Number.isFinite(video.duration) || video.duration === 0) return;
    const targetVideoTime = (clip.trimStart ?? 0) + clampedLocal;
    const safeTarget = Math.max(0, Math.min(targetVideoTime, video.duration - 0.05));
    if (Math.abs(video.currentTime - safeTarget) > 0.35) {
      try {
        video.currentTime = safeTarget;
      } catch (e) {
        console.warn("seek failed", e);
      }
    }
  }, [clampedLocal, clip]);

  // Video: sync play/pause (global isPlaying)
  useEffect(() => {
    const video = videoRef.current;
    if (!clip || clip.type !== "video" || !video) return;
    if (videoError) return;
    if (isPlaying) {
      const p = video.play();
      if (p && typeof p.catch === "function")
        p.catch((err) => {
          console.warn("video.play() failed:", err?.message);
        });
    } else {
      video.pause();
    }
  }, [isPlaying, clip, videoError]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!clip || clip.type !== "video" || !video) return;
    const trimStart = clip.trimStart ?? 0;
    const trimEnd = clip.trimEnd ?? clip.duration ?? video.duration ?? effectiveDuration;
    // If video reached trimEnd, auto-advance to next clip if exists, else pause at end
    // This handles the case where video drives time near boundary before RAF advances.
    if (video.currentTime >= trimEnd - 0.03) {
      const state = useEditorStore.getState();
      const segs = getTimelineSegments(state.mediaClips);
      const idx = segs.findIndex((s) => s.clip.id === clip.id);
      const isLast = idx === segs.length - 1;
      if (!isLast && idx !== -1) {
        const nextSeg = segs[idx + 1];
        state.setSelectedClip(nextSeg.clip.id);
        state.setCurrentTime(nextSeg.start);
        state.setIsPlaying(true);
      } else {
        const total = getTotalDuration(state.mediaClips);
        state.setCurrentTime(total);
        state.setIsPlaying(false);
        video.pause();
        try {
          video.currentTime = trimEnd;
        } catch {}
      }
      return;
    }
    if (video.currentTime < trimStart - 0.1) {
      try {
        video.currentTime = trimStart;
      } catch {}
      return;
    }
    // For continuous playback, PlaybackControls RAF is the single source of truth for global time
    // to avoid fighting between video time and RAF. We do not update global here on every tick.
    // Auto-advance seamlessness is handled both by RAF (global clock) and this boundary check.
  }, [clip, effectiveDuration]);

  const handleVideoEnded = useCallback(() => {
    // In trimmed playback, ended shouldn't fire before trimEnd; treat as auto-advance
    const state = useEditorStore.getState();
    const segs = getTimelineSegments(state.mediaClips);
    const idx = segs.findIndex((s) => s.clip.id === clip?.id);
    if (idx !== -1 && idx < segs.length - 1) {
      state.setSelectedClip(segs[idx + 1].clip.id);
      state.setCurrentTime(segs[idx + 1].start);
      state.setIsPlaying(true);
    } else {
      const total = getTotalDuration(state.mediaClips);
      state.setCurrentTime(total);
      state.setIsPlaying(false);
    }
  }, [clip]);

  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v || !clip) return;
    isMetadataLoadedRef.current = true;
    setVideoError(null);
    const d = v.duration;
    if (Number.isFinite(d) && d > 0 && Math.abs(d - (clip.duration || 0)) > 0.1) {
      updateClip(clip.id, { duration: d, trimEnd: d, trimStart: 0 });
    }
    // After metadata, ensure video is at correct local position for current global
    const target = (clip.trimStart ?? 0) + clampedLocal;
    const safe = Math.max(0, Math.min(target, d - 0.05));
    if (Math.abs(v.currentTime - safe) > 0.3) {
      try {
        v.currentTime = safe;
      } catch {}
    }
    if (isPlaying) {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    }
  }, [clip, updateClip, clampedLocal, isPlaying]);

  const handleVideoError = useCallback(() => {
    const err = videoRef.current?.error;
    console.error("Video failed to load:", clip?.url, err);
    isMetadataLoadedRef.current = false;
    let msg = err?.message || "Unknown error";
    if (err?.code === 2) msg = "Demuxer failed — file may be corrupted or HEVC/H.265 from iPhone (not supported on this Chrome/Linux). Try H.264 mp4.";
    if (err?.code === 4) msg = "Format not supported in this browser. Convert to H.264/AAC mp4.";
    setVideoError({ code: err?.code, message: msg });
  }, [clip]);



  const handleTextPointerDown = (e, ov) => {
    e.stopPropagation();
    if (onSelectText) onSelectText(ov.id);
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPct = ov.x > 1 ? ov.x : ov.x * 100;
    const yPct = ov.y > 1 ? ov.y : ov.y * 100;
    const cx = rect.left + (xPct / 100) * rect.width;
    const cy = rect.top + (yPct / 100) * rect.height;
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    dragOffsetRef.current = { dx: clientX - cx, dy: clientY - cy };
    setDraggingText(ov.id);
  };

  const handlePreviewPointerMove = useCallback(
    (e) => {
      if (!draggingText || !clip) return;
      const rect = previewRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      const x = ((clientX - dragOffsetRef.current.dx - rect.left) / rect.width) * 100;
      const y = ((clientY - dragOffsetRef.current.dy - rect.top) / rect.height) * 100;
      const clampedX = Math.max(5, Math.min(95, x));
      const clampedY = Math.max(8, Math.min(92, y));
      updateClip(clip.id, {
        textOverlays: clip.textOverlays.map((ov) => (ov.id === draggingText ? { ...ov, x: clampedX, y: clampedY } : ov)),
      });
    },
    [draggingText, clip, updateClip]
  );

  const handlePreviewPointerUp = useCallback(() => {
    if (draggingText) setDraggingText(null);
  }, [draggingText]);

  useEffect(() => {
    if (!draggingText) return;
    const move = (e) => handlePreviewPointerMove(e);
    const up = () => handlePreviewPointerUp();
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
  }, [draggingText, handlePreviewPointerMove, handlePreviewPointerUp]);

  const handleDeleteText = (id) => {
    if (!clip) return;
    updateClip(clip.id, { textOverlays: clip.textOverlays.filter((ov) => ov.id !== id) });
    if (onSelectText) onSelectText(null);
  };

  const togglePlay = () => {
    if (!clip) return;
    if (draggingText) return;
    if (videoError) return;
    // If at global end, restart
    if (currentTime >= totalDuration - 0.05) {
      const first = mediaClips[0];
      if (first) setSelectedClip(first.id);
      setCurrentTime(0);
      setIsPlaying(true);
      return;
    }
    // If local at end of this clip but global not at end, PlaybackControls will auto-advance via its RAF,
    // but clicking play here should just resume globally
    setIsPlaying(!isPlaying);
  };

  if (!clip) return null;
  const filterStyle = resolveFilter(clip.filter);
  const cropAspect = clip.crop ? clip.crop.replace(":", " / ") : null;
  const mediaObjectFit = clip.crop ? "cover" : "contain";

  return (
    <div className="absolute inset-0 flex flex-col">
      <div
        ref={previewRef}
        className="relative flex-1 overflow-hidden bg-black flex items-center justify-center touch-none"
        style={{ touchAction: "none" }}
        onClick={(e) => {
          if (e.target === e.currentTarget && onSelectText) onSelectText(null);
        }}
      >
        {clip.type === "image" ? (
          <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden" style={cropAspect ? { aspectRatio: cropAspect } : undefined}>
            <img
              src={clip.url}
              alt=""
              className="w-full h-full"
              style={{ filter: filterStyle, objectFit: mediaObjectFit, aspectRatio: cropAspect || undefined }}
              draggable={false}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden" style={cropAspect ? { aspectRatio: cropAspect, maxWidth: "100%", maxHeight: "100%" } : undefined}>
            <video
              ref={videoRef}
              key={clip.url}
              src={clip.url}
              className="w-full h-full"
              style={{ filter: filterStyle, objectFit: mediaObjectFit, aspectRatio: cropAspect || undefined }}
              muted
              playsInline
              preload="metadata"
              controls={false}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnded}
              onError={handleVideoError}
              onClick={togglePlay}
            />
          </div>
        )}

        {!videoError && (
          <button onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"} className="absolute inset-0 flex items-center justify-center group z-10">
            <span
              className={`w-12 h-12 rounded-full backdrop-blur border flex items-center justify-center transition-all ${
                isPlaying ? "bg-black/30 border-white/20 opacity-0 group-hover:opacity-100" : "bg-white text-black border-white shadow-xl opacity-90 hover:scale-105"
              }`}
            >
              {isPlaying ? <Pause size={18} className="text-white" /> : <Play size={18} className="ml-0.5" fill="currentColor" />}
            </span>
          </button>
        )}

        {clip.textOverlays?.length > 0 && (
          <div className="absolute inset-0 z-20">
            {clip.textOverlays.map((ov) => {
              const x = ov.x > 1 ? ov.x : ov.x * 100;
              const y = ov.y > 1 ? ov.y : ov.y * 100;
              const isSelected = ov.id === selectedTextId;
              const isDragging = draggingText === ov.id;
              return (
                <div
                  key={ov.id}
                  onPointerDown={(e) => handleTextPointerDown(e, ov)}
                  onTouchStart={(e) => handleTextPointerDown(e, ov)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectText) onSelectText(ov.id);
                  }}
                  className={`absolute select-none touch-none cursor-grab active:cursor-grabbing ${isDragging ? "z-30" : ""} ${isSelected ? "ring-2 ring-violet-500 ring-offset-1 ring-offset-black" : ""}`}
                  style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
                >
                  <span
                    className="px-2 py-0.5 rounded whitespace-nowrap max-w-[160px] truncate inline-block"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: ov.color || "#ffffff",
                      fontSize: `${ov.fontSize ?? 18}px`,
                      lineHeight: 1.2,
                      fontWeight: 700,
                      textShadow: "0 1px 3px rgba(0,0,0,0.6), 0 0 8px rgba(0,0,0,0.4)",
                    }}
                  >
                    {ov.text}
                  </span>
                  {isSelected && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteText(ov.id);
                      }}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] leading-none shadow border border-white/20 hover:bg-red-500"
                      aria-label="Delete"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {videoError && clip.type === "video" && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center gap-3 z-30">
            <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
              <AlertTriangle size={18} />
            </div>
            <p className="text-sm font-semibold text-white">Video can't be played</p>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-[28ch]">
              {videoError.message} (code {videoError.code})
            </p>
            <p className="text-[11px] text-zinc-500 max-w-[32ch]">
              Try the sample video below to verify playback, or convert your file to H.264/AAC mp4 (yuv420p) — iPhone HEVC/H.265 often fails on Linux Chrome.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
