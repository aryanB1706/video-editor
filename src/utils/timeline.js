export const IMAGE_DEFAULT_DURATION = 5;

/**
 * Effective duration respects trimStart/trimEnd.
 * For images duration defaults to IMAGE_DEFAULT_DURATION.
 */
export function getEffectiveDuration(clip) {
  if (!clip) return 0;
  // For images, default duration is 5; for video unknown duration, fallback to 5 until metadata loads
  const fallback = clip.type === "image" ? IMAGE_DEFAULT_DURATION : 5;
  const durationRaw = clip.duration ?? fallback;
  const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : fallback;
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? duration;
  const eff = trimEnd - trimStart;
  if (!Number.isFinite(eff) || eff <= 0) {
    return duration;
  }
  // clamp minimum 0.2s to avoid zero-length timeline (prevents 1-sec loop bug when duration unknown)
  return Math.max(0.2, eff);
}

export function getTotalDuration(clips) {
  if (!Array.isArray(clips) || clips.length === 0) return 0;
  return clips.reduce((sum, c) => sum + getEffectiveDuration(c), 0);
}

/**
 * Build timeline segments with global start/end.
 * @returns Array<{clip, index, start, end, duration}>
 */
export function getTimelineSegments(clips) {
  const segs = [];
  let t = 0;
  (clips || []).forEach((clip, i) => {
    const d = getEffectiveDuration(clip);
    const start = t;
    const end = t + d;
    segs.push({ clip, index: i, start, end, duration: d });
    t = end;
  });
  return segs;
}

/**
 * Find clip at global time.
 * Returns { clip, index, localTime, start, end, segments } or null if empty
 * Clamps time to [0, totalDuration)
 * If at exact totalDuration, returns last clip at its end.
 */
export function findClipAtTime(clips, globalTime) {
  if (!clips || clips.length === 0) return null;
  const total = getTotalDuration(clips);
  if (total <= 0) return null;
  // clamp
  let t = Math.max(0, Math.min(globalTime, total));
  // handle end edge: stay on last clip
  if (t >= total) {
    const lastIdx = clips.length - 1;
    const last = clips[lastIdx];
    const segs = getTimelineSegments(clips);
    const seg = segs[lastIdx];
    return {
      clip: last,
      index: lastIdx,
      localTime: getEffectiveDuration(last),
      start: seg.start,
      end: seg.end,
      duration: seg.duration,
    };
  }
  const segs = getTimelineSegments(clips);
  for (const seg of segs) {
    if (t >= seg.start && t < seg.end) {
      return {
        clip: seg.clip,
        index: seg.index,
        localTime: t - seg.start,
        start: seg.start,
        end: seg.end,
        duration: seg.duration,
      };
    }
  }
  // fallback last
  const lastSeg = segs[segs.length - 1];
  return {
    clip: lastSeg.clip,
    index: lastSeg.index,
    localTime: t - lastSeg.start,
    start: lastSeg.start,
    end: lastSeg.end,
    duration: lastSeg.duration,
  };
}

export function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) return "00:00";
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
