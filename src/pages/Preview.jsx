import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, RotateCcw, ArrowLeft, Film, Loader2, Sparkles } from "lucide-react";
import useEditorStore from "../store/editorStore";
import { getTotalDuration, findClipAtTime, getTimelineSegments, formatTime } from "../utils/timeline";

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

export default function Preview() {
  const navigate = useNavigate();
  const mediaClips = useEditorStore((s) => s.mediaClips);

  const totalDuration = getTotalDuration(mediaClips);
  const isEmpty = mediaClips.length === 0 || totalDuration === 0;

  const [globalTime, setGlobalTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragVal, setDragVal] = useState(null);
  const [videoError, setVideoError] = useState(null);
  const [isBuffering, setIsBuffering] = useState(false);

  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const isMetadataLoadedRef = useRef(false);

  const displayTime = isDragging && dragVal !== null ? dragVal : globalTime;
  const seg = !isEmpty ? findClipAtTime(mediaClips, globalTime) : null;
  const clip = seg?.clip ?? null;
  const localTime = seg ? seg.localTime : 0;

  useEffect(() => {
    if (globalTime > totalDuration) {
      setGlobalTime(totalDuration);
      setIsPlaying(false);
    }
  }, [totalDuration, globalTime]);

  useEffect(() => {
    isMetadataLoadedRef.current = false;
    setVideoError(null);
    setIsBuffering(clip?.type === "video");
  }, [clip?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!clip || clip.type !== "video" || !video) return;
    if (!isMetadataLoadedRef.current) return;
    if (video.readyState < 1) return;
    if (!Number.isFinite(video.duration) || video.duration === 0) return;
    const target = (clip.trimStart ?? 0) + localTime;
    const safe = Math.max(0, Math.min(target, video.duration - 0.05));
    if (Math.abs(video.currentTime - safe) > 0.35) {
      try {
        video.currentTime = safe;
      } catch {}
    }
  }, [localTime, clip]);

  useEffect(() => {
    const video = videoRef.current;
    if (!clip || clip.type !== "video" || !video) return;
    if (videoError) return;
    if (isPlaying) {
      const p = video.play();
      if (p?.catch) p.catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, clip, videoError]);

  useEffect(() => {
    if (!isPlaying || isEmpty || isDragging) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (!isPlaying) startRef.current = null;
      return;
    }
    if (!startRef.current) {
      startRef.current = { perfStart: performance.now(), globalStart: globalTime };
    }
    const tick = (now) => {
      const s = startRef.current;
      if (!s) return;
      const elapsed = (now - s.perfStart) / 1000;
      let next = s.globalStart + elapsed;
      if (next >= totalDuration) {
        next = totalDuration;
        setGlobalTime(next);
        setIsPlaying(false);
        rafRef.current = null;
        startRef.current = null;
        return;
      }
      setGlobalTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, isEmpty, isDragging, totalDuration]);

  const handlePlayPause = useCallback(() => {
    if (isEmpty) return;
    if (globalTime >= totalDuration - 0.05) {
      setGlobalTime(0);
      setIsPlaying(true);
      startRef.current = null;
      return;
    }
    setIsPlaying((p) => !p);
  }, [isEmpty, globalTime, totalDuration]);

  const handleRestart = useCallback(() => {
    setGlobalTime(0);
    setIsPlaying(true);
    startRef.current = null;
    if (videoRef.current && clip?.type === "video") {
      try {
        videoRef.current.currentTime = clip.trimStart ?? 0;
      } catch {}
    }
  }, [clip]);

  const handleSeekStart = () => setIsDragging(true);
  const handleSeekChange = (e) => {
    const val = parseFloat(e.target.value);
    setDragVal(val);
    const clamped = Math.max(0, Math.min(val, totalDuration));
    setGlobalTime(clamped);
    if (isPlaying) {
      startRef.current = { perfStart: performance.now(), globalStart: clamped };
    } else {
      startRef.current = null;
    }
  };
  const handleSeekEnd = () => {
    setIsDragging(false);
    setDragVal(null);
    // anchor already set in handleSeekChange if playing
  };

  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v || !clip) return;
    isMetadataLoadedRef.current = true;
    setVideoError(null);
    setIsBuffering(false);
    const d = v.duration;
    const target = (clip.trimStart ?? 0) + localTime;
    const safe = Math.max(0, Math.min(target, d - 0.05));
    if (Math.abs(v.currentTime - safe) > 0.3) {
      try {
        v.currentTime = safe;
      } catch {}
    }
    if (isPlaying) {
      const p = v.play();
      if (p?.catch) p.catch(() => {});
    }
  }, [clip, localTime, isPlaying]);

  const handleVideoError = useCallback(() => {
    const err = videoRef.current?.error;
    let msg = err?.message || "Unknown error";
    if (err?.code === 2) msg = "Demuxer failed — HEVC/H.265 not supported on this browser.";
    if (err?.code === 4) msg = "Format not supported — convert to H.264/AAC mp4.";
    setVideoError({ code: err?.code, message: msg });
    setIsBuffering(false);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!clip || clip.type !== "video" || !video) return;
    const trimStart = clip.trimStart ?? 0;
    const trimEnd = clip.trimEnd ?? clip.duration ?? video.duration ?? 0;
    if (video.currentTime >= trimEnd - 0.03) {
      const segs = getTimelineSegments(mediaClips);
      const idx = segs.findIndex((s) => s.clip.id === clip.id);
      if (idx !== -1 && idx < segs.length - 1) {
        const nextStart = segs[idx + 1].start;
        if (globalTime < nextStart - 0.05) {
          setGlobalTime(nextStart);
          startRef.current = null;
        }
      }
    }
    if (video.currentTime < trimStart - 0.1) {
      try {
        video.currentTime = trimStart;
      } catch {}
    }
  }, [clip, mediaClips, globalTime]);

  const progress = totalDuration > 0 ? (displayTime / totalDuration) * 100 : 0;

  if (isEmpty) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full bg-zinc-950 max-w-[375px] mx-auto w-full overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900">
          <button onClick={() => navigate("/editor")} className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:bg-zinc-700 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-zinc-100">Preview</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500">No clips</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 shadow-lg">
            <Film size={28} />
          </motion.div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-300">No clips to preview</p>
            <p className="text-xs text-zinc-500 max-w-[28ch] leading-relaxed">Add clips in the Editor — your final sequence will play here back-to-back with trims, filters & text overlays.</p>
          </div>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => navigate("/editor")} className="mt-1 px-5 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-rose-900/20">
            <ArrowLeft size={16} /> Back to Editor
          </motion.button>
          <p className="text-[11px] text-zinc-600">375px mobile • clean final result</p>
        </div>
      </motion.div>
    );
  }

  const filterStyle = clip ? resolveFilter(clip.filter) : "none";
  const cropAspect = clip?.crop ? clip.crop.replace(":", " / ") : null;
  const mediaObjectFit = clip?.crop ? "cover" : "contain";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="flex flex-col h-full bg-black relative max-w-[375px] mx-auto w-full overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-zinc-900/90 backdrop-blur border-b border-zinc-800 gap-2 min-w-0">
        <button onClick={() => { setIsPlaying(false); navigate("/editor"); }} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors shrink-0">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold tracking-widest px-2 py-1 rounded-full bg-rose-600 text-white flex items-center gap-1 shrink-0">
            <Sparkles size={10} /> FINAL
          </span>
          <span className="hidden sm:inline text-[11px] font-mono text-zinc-400 truncate">{mediaClips.length} clips • {totalDuration.toFixed(1)}s</span>
          <span className="sm:hidden text-[11px] font-mono text-zinc-400 shrink-0">{mediaClips.length}c • {totalDuration.toFixed(1)}s</span>
        </div>
        <div className="w-[56px] shrink-0" />
      </div>

      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        <AnimatePresence mode="wait">
          {clip && (
            <motion.div
              key={clip.id}
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.01 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="absolute inset-0 flex items-center justify-center bg-black"
            >
              {clip.type === "image" ? (
                <div className="w-full h-full flex items-center justify-center overflow-hidden" style={cropAspect ? { aspectRatio: cropAspect } : undefined}>
                  <img src={clip.url} alt="" className="w-full h-full" style={{ filter: filterStyle, objectFit: mediaObjectFit, aspectRatio: cropAspect || undefined }} draggable={false} />
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center overflow-hidden relative" style={cropAspect ? { aspectRatio: cropAspect, maxWidth: "100%", maxHeight: "100%" } : undefined}>
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
                    onLoadStart={() => setIsBuffering(true)}
                    onCanPlay={() => setIsBuffering(false)}
                    onWaiting={() => setIsBuffering(true)}
                    onPlaying={() => setIsBuffering(false)}
                    onError={handleVideoError}
                    onClick={handlePlayPause}
                  />
                  {isBuffering && !videoError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
                      <Loader2 size={22} className="animate-spin text-white/80" />
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {clip?.textOverlays?.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {clip.textOverlays.map((ov) => {
              const x = ov.x > 1 ? ov.x : ov.x * 100;
              const y = ov.y > 1 ? ov.y : ov.y * 100;
              return (
                <div key={ov.id} className="absolute select-none" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}>
                  <span className="px-2 py-0.5 rounded whitespace-nowrap inline-block" style={{ background: "transparent", border: "none", color: ov.color || "#ffffff", fontSize: `${ov.fontSize ?? 18}px`, lineHeight: 1.2, fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,0.6), 0 0 8px rgba(0,0,0,0.4)" }}>
                    {ov.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {!isPlaying && !videoError && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 350, damping: 20 }}
              onClick={handlePlayPause}
              aria-label="Play"
              className="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[0.5px]"
            >
              <span className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-2xl active:scale-95 transition-transform">
                <Play size={24} className="ml-1" fill="currentColor" />
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {videoError && clip?.type === "video" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center gap-3">
            <p className="text-sm font-semibold text-white">Video can’t be played</p>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-[28ch]">{videoError.message}</p>
            <button onClick={handleRestart} className="mt-2 px-4 py-2 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-200">Skip • Restart</button>
          </motion.div>
        )}

        {clip && (
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-mono px-2 py-1 rounded-full bg-black/70 backdrop-blur border border-white/10 text-white shrink-0">
                {mediaClips.findIndex((c) => c.id === clip.id) + 1} / {mediaClips.length}
              </span>
              {clip.filter && clip.filter !== "none" && (
                <span className="text-[11px] px-2 py-1 rounded-full bg-rose-600 text-white font-medium truncate">{clip.filter}</span>
              )}
            </div>
            <span className="hidden sm:inline text-[10px] font-medium px-2 py-1 rounded-full bg-black/60 text-zinc-300 border border-white/10 truncate max-w-[16ch]">{clip.file?.name ?? clip.type}</span>
          </div>
        )}
      </div>

      <div className="shrink-0 bg-zinc-900 border-t border-zinc-800 px-3 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <motion.button whileTap={{ scale: 0.92 }} onClick={handlePlayPause} aria-label={isPlaying ? "Pause" : "Play"} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-white text-black shadow">
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} className="ml-0.5" fill="currentColor" />}
          </motion.button>
          <motion.button whileTap={{ scale: 0.92 }} onClick={handleRestart} aria-label="Restart" className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300">
            <RotateCcw size={16} />
          </motion.button>
          <span className="text-[11px] font-mono text-white tabular-nums min-w-[38px]">{formatTime(displayTime)}</span>
          <div className="flex-1 relative flex items-center h-5 min-w-0">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-white/20 overflow-hidden pointer-events-none">
              <motion.div className="h-full bg-rose-500 rounded-full" style={{ width: `${progress}%` }} transition={{ duration: 0.1 }} />
            </div>
            <input
              type="range"
              min={0}
              max={totalDuration || 0}
              step={0.01}
              value={isDragging && dragVal !== null ? dragVal : globalTime}
              onChange={handleSeekChange}
              onPointerDown={handleSeekStart}
              onPointerUp={handleSeekEnd}
              onTouchStart={handleSeekStart}
              onTouchEnd={handleSeekEnd}
              className="relative w-full h-5 appearance-none bg-transparent cursor-pointer [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-zinc-300 [&::-webkit-slider-thumb]:mt-[-3px] [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:bg-transparent"
              aria-label="Seek timeline"
            />
          </div>
          <span className="text-[11px] font-mono text-zinc-400 tabular-nums min-w-[38px]">{formatTime(totalDuration)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-[11px] text-zinc-500 truncate flex-1 min-w-0">{clip ? `${clip.file?.name ?? clip.type} • ${clip.textOverlays.length} text • ${clip.filter && clip.filter !== "none" ? clip.filter : "no filter"}` : ""}</span>
          <span className="text-[11px] font-mono text-zinc-600 shrink-0">{isPlaying ? "Playing" : displayTime >= totalDuration - 0.05 ? "Ended" : "Paused"}</span>
        </div>
      </div>
    </motion.div>
  );
}
