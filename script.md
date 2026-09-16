# ClipCraft — Screen Record Script (4:00, Phone Vertical)

> Record on phone at 375px. Keep phone vertical, DND on, mic close. Read exactly. These 3 sections are now detailed in simple words for a human evaluator.

---

### [0:00-0:20] INTRO — [ACTION: Show Upload screen, no interaction]
Hi, I'm [Your Name]. This is ClipCraft — a mobile-first video editor built for 375px.
The flow is simple: Upload → Edit → Preview. Everything runs in the browser, no server upload.
I'll show the full app in 3 minutes.

### [0:20-0:45] UPLOAD — [ACTION: Tap "Choose files"]
[ACTION: Tap "Choose files" → pick 1 video + 1 image from gallery]
I’m picking a video and an image. You see instant previews with size and type badges.
[ACTION: Tap cross X on one card to remove it]
I can remove any file before confirming.
[ACTION: Tap "Continue to editor (2)"]
This goes to the Editor with the timeline ready.

### [0:45-1:55] EDITOR — Core Functionality (Do not rush)

**Preview & Aspect — [ACTION: Toggle 9:16 → 16:9 → back to 9:16]**
Top has Preview. Toggling 9:16 and 16:9 keeps the timeline and toolbar visible — fixed for mobile. The preview resizes but never hides the bottom sections.
[ACTION: Tap "Preview" button top-right, then immediately "Back to Editor" to show navigation works, return to Editor]

**Global Playback — [ACTION: Hit Play, then drag the bottom scrubber across the whole timeline]**
This is the global timeline scrubber — not per-clip. I’ll drag from the middle of clip 1 to clip 3. Notice the selected clip auto-advances and continues playing seamlessly. It respects each clip’s trimmed length.

**Timeline — [ACTION: Swipe timeline left-right, drag a clip to reorder, tap cross X on a clip]**
Timeline scrolls horizontally. I can drag to reorder and tap the cross on any clip to delete — thumb-friendly at 375px. Empty state shows if no clips.

**Trim — Video & Image — [ACTION: Select a clip → Tap Trim → drag white handles → tap Done]**
Trim works for both video and image. I’ll drag the white handles — the badge updates live to 2.3 seconds.
[ACTION: Tap Done]
After Done, the clip card still shows 2.3 seconds — not the old duration. Minimum 0.2 seconds prevents zero-length bugs.

**Text — [ACTION: Tap Text → type "Hello" → Add]**
Text appears transparent — no black box.
[ACTION: Touch-drag the text on preview to move it]
I move it with one finger.
[ACTION: Drag the FONT SIZE slider 18 → 36]
Size changes only with the slider above — I removed the two-finger pinch that was zooming the whole screen.
[ACTION: Tap a color dot, e.g., yellow]
Color updates live.
[ACTION: Tap text to select → tap small red X on text to delete if needed]

**Filters — [ACTION: Tap Filters → tap Grayscale → tap X to close]**
Filters apply instantly on the preview.

### [1:55-2:20] PREVIEW — Final Result — [ACTION: Tap "Preview" top-right]
This is the full-screen final playback — no editing controls, just clean playback.
[ACTION: Let it play 5s — show video trimmed part → image 3s → next clip with filter+text]
It plays back-to-back in order with all trims, filters and text.
[ACTION: Tap Pause → drag progress bar → tap Restart icon]
Controls are play/pause, restart, global progress, and clip badge 1/3. Back button keeps clips.
[ACTION: Tap "Back" → return to Editor]

---

### [2:20-3:05] TECH STACK & HIGH-LEVEL ARCHITECTURE — [ACTION: Just speak, stay on Editor screen, no code needed]
> Speak slowly, simple words — evaluator is human, not just checking buzzwords.

**Tech Stack — Why these?**

I used **React 19 with Vite** — Vite gives super-fast dev and build, React lets me make reusable UI pieces like the preview, timeline cards, and sheets. For styling I used **Tailwind CSS 4** — it keeps spacing and colors consistent at 375px without writing custom CSS, and it’s perfect for mobile-first design.

For navigation I used **React Router** — simple pages: `/` for Upload, `/editor` for Edit, `/preview` for Final. No page reload.

For state I chose **Zustand** instead of Redux — because my app state is small and simple: just the list of clips, which clip is selected, current time, and isPlaying. Zustand is like a tiny box that any component can read/write without passing props everywhere. Much lighter than Redux and no boilerplate.

For drag-reorder I used **dnd-kit** — it handles touch drag smoothly on mobile. For sheet animations I used **framer-motion** — the Text/Trim panels slide up with spring, feels native on phone. Icons are **lucide-react**.

**High-Level Architecture — How it fits together (in simple words):**

Think of 3 layers:

1.  **Store (Single Source of Truth) — `src/store/editorStore.js`:** One place holds everything: `mediaClips` array — each clip has `url, type, duration, trimStart, trimEnd, filter, textOverlays`. Also `selectedClipId`, `currentTime` which is *global* time across all clips, and `isPlaying`. Both Editor and Preview read from this same box, so they never go out of sync.

2.  **Pure Logic — `src/utils/timeline.js`:** This is the brain, with no UI. Three small functions: `getEffectiveDuration` (for image default 5s, for video trimmed length, minimum 0.2s), `getTotalDuration` (sum of all clips), `findClipAtTime` (given global time 4.5s, tells you "you are in clip 2 at local time 0.5s"). Because it’s pure, I can test it without rendering.

3.  **UI Layers — `pages` and `components`:** `Upload` only collects files and creates ObjectURLs. `Editor` shows `MediaPreview` (the video/image with filters and draggable text) + `PlaybackControls` (the single global player) + `Timeline` (SortableClip) + `Toolbar` (Trim/Text/Filters). `Preview` reuses the same timeline helpers but with its own local player for a clean final screen — no edit buttons.

Data flow is one-way: User trims → `updateClip` updates store → timeline helpers recalculate total → both preview and scrubber re-render. No duplicate state.

---

### [3:05-3:35] KEY DECISIONS — 5 Short Points — [ACTION: Stay still, speak clearly - 30 sec, simple words]

**1. Global timeline:** Earlier time was per-clip. I made it global (0 to total). Now one scrubber controls the whole final video and auto-switches clips — feels like CapCut, easy for user.

**2. Single clock:** Video and my timer were fighting, so video looped at 1 sec. I kept only one clock (`requestAnimationFrame`) — video just follows it. Fixed the bug for both video and image.

**3. Mobile-first layout:** Fixed 375px so preview never hides timeline when you switch 9:16/16:9, sheets slide above the bottom nav, and timeline is scrollbar-none — thumb-friendly.

**4. Clean, predictable UX:** I removed duplicate player (kept only one global scrubber), made text background transparent by default (no ugly black box), and added a cross `X` on each timeline clip for one-tap delete — all reachable with thumb. Also added a slider-only resize for text after removing the two-finger pinch that was zooming the whole screen.

**5. Empty-state & first-time help:** Product-wise, empty timeline shows friendly message + `Load sample video` one-tap, and Upload shows grid preview before confirming — so a new user never sees a blank scary screen and can test instantly without uploading.

---

### [3:35-3:55] WHAT I’D IMPROVE / BUILD NEXT — [ACTION: Speak to camera, sincere]

If I had more time, in priority order:

1.  **Real Export — Most important:** Right now Preview is *playback* of the final sequence. I’d add `ffmpeg.wasm` in browser to actually stitch the trimmed videos, apply filters and burn text overlays into a downloadable mp4 — no server needed.

2.  **Undo/Redo + Persistence:** Save `mediaClips` to IndexedDB + thumbnail cache (I already generate 5 canvas thumbnails per video), and add `Ctrl+Z` / shake-to-undo on mobile.

3.  **Audio & Transitions:** Add an audio track (trim + volume), and simple cross-fade between clips — currently it’s hard cut.

4.  **Polish & Scale:** Virtualize timeline for 50+ clips, keyboard shortcuts (space, arrows), and proper accessibility labels. I’d also code-split Preview to keep bundle under 500kB.

These are not excuses — the current app already covers the core spec: upload, trim (video & image), reorder, filters, text with drag+slider, global playback and final preview, all responsive at 375px.

### [3:55-4:00] CLOSE — [ACTION: Hold on final Preview playing for 3 seconds, then stop recording]
Thanks for watching — happy to answer any questions.

---

**Phone Tips:**
- Vertical only, brightness 80%, volume up for tap sounds.
- Do one dry run. Tap slowly so sheet animations (Trim/Text) are visible.
- If you stumble, pause 2 seconds then continue — easy to cut.
- No need to show GitHub, terminal, or links — they only evaluate the video.
