import { create } from "zustand";

/**
 * mediaClip shape:
 * {
 *   id: string,
 *   type: 'video' | 'image',
 *   file: File | null,
 *   url: string,            // ObjectURL or remote url
 *   duration: number,       // seconds (for image, default 5)
 *   trimStart: number,      // seconds
 *   trimEnd: number,        // seconds  (effective duration = trimEnd - trimStart)
 *   filter: string | null,  // e.g. 'grayscale', 'sepia', null
 *   textOverlays: Array<{ id: string, text: string, x: number, y: number, style?: object }>,
 *   crop: string | null,    // e.g. '1:1', '9:16', '16:9', null (object-fit preview)
 * }
 */

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const useEditorStore = create((set, get) => ({
  // --- state ---
  mediaClips: [],
  selectedClipId: null,
  currentTime: 0,
  isPlaying: false,

  // --- actions ---

  /**
   * Add one or more clips.
   * Accepts array of raw descriptors: { file, url, type, duration }
   * Normalizes to full clip shape with defaults.
   */
  addClips: (clips) =>
    set((state) => {
      const normalized = (Array.isArray(clips) ? clips : [clips]).map((c) => {
        const type = c.type ?? (c.file?.type?.startsWith("image/") ? "image" : "video");
        // For video with unknown duration (0), fallback to 5 so timeline not collapsed (fixes 1-sec repeat loop)
        const rawDuration = c.duration ?? (type === "image" ? 5 : 0);
        const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : type === "image" ? 5 : 5;
        const url = c.url ?? (c.file ? URL.createObjectURL(c.file) : "");
        const trimStart = c.trimStart ?? 0;
        const trimEnd = c.trimEnd ?? duration;
        // ensure trimEnd > trimStart with at least 0.2s
        const safeTrimEnd = Number.isFinite(trimEnd) && trimEnd > trimStart ? trimEnd : duration;
        const safeTrimStart = Number.isFinite(trimStart) ? Math.max(0, trimStart) : 0;
        return {
          id: c.id ?? genId(),
          type,
          file: c.file ?? null,
          url,
          duration,
          trimStart: safeTrimStart,
          trimEnd: Math.max(safeTrimStart + 0.2, safeTrimEnd),
          filter: c.filter ?? null,
          textOverlays: c.textOverlays ?? [],
          crop: c.crop ?? null,
        };
      });
      return { mediaClips: [...state.mediaClips, ...normalized] };
    }),

  removeClip: (id) =>
    set((state) => ({
      mediaClips: state.mediaClips.filter((c) => c.id !== id),
      // clear selection if removed clip was selected
      selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
    })),

  reorderClips: (fromIndex, toIndex) =>
    set((state) => {
      const clips = [...state.mediaClips];
      if (
        fromIndex < 0 ||
        fromIndex >= clips.length ||
        toIndex < 0 ||
        toIndex >= clips.length
      )
        return state;
      const [moved] = clips.splice(fromIndex, 1);
      clips.splice(toIndex, 0, moved);
      return { mediaClips: clips };
    }),

  updateClip: (id, patch) =>
    set((state) => ({
      mediaClips: state.mediaClips.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      ),
    })),

  setSelectedClip: (id) => set({ selectedClipId: id }),

  setCurrentTime: (time) => set({ currentTime: time }),

  togglePlay: () =>
    set((state) => ({
      isPlaying: !state.isPlaying,
    })),

  // optional helpers
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  clearAll: () =>
    set({
      mediaClips: [],
      selectedClipId: null,
      currentTime: 0,
      isPlaying: false,
    }),
}));

export default useEditorStore;
