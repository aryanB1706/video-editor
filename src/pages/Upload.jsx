import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload as UploadIcon, Image as ImageIcon, Film, Trash2, Loader2, Check, Sparkles } from "lucide-react";
import useEditorStore from "../store/editorStore";

function genLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Upload() {
  const navigate = useNavigate();
  const addClips = useEditorStore((s) => s.addClips);
  const fileInputRef = useRef(null);

  const [pending, setPending] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = useCallback((fileList) => {
    const files = Array.from(fileList ?? []).filter(
      (f) => f.type.startsWith("video/") || f.type.startsWith("image/")
    );
    if (files.length === 0) return;
    const next = files.map((file) => ({
      id: genLocalId(),
      file,
      url: URL.createObjectURL(file),
      type: file.type.startsWith("image/") ? "image" : "video",
    }));
    setPending((prev) => [...prev, ...next]);
  }, []);

  const onInputChange = (e) => {
    handleFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const removePending = (id) => {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleConfirm = async () => {
    if (pending.length === 0 || isProcessing) return;
    setIsProcessing(true);
    const probes = pending.map(
      (p) =>
        new Promise((resolve) => {
          if (p.type === "image") {
            resolve({ file: p.file, url: p.url, type: "image", duration: 5 });
            return;
          }
          const video = document.createElement("video");
          video.preload = "metadata";
          video.muted = true;
          video.src = p.url;
          const done = (duration) => resolve({ file: p.file, url: p.url, type: "video", duration });
          video.onloadedmetadata = () => {
            const d = Number.isFinite(video.duration) ? video.duration : 0;
            done(d);
          };
          video.onerror = () => done(0);
          setTimeout(() => done(0), 2500);
        })
    );

    const clips = await Promise.all(probes);
    addClips(clips);
    setPending([]);
    setIsProcessing(false);
    navigate("/editor");
  };

  const openPicker = () => !isProcessing && fileInputRef.current?.click();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="p-4 flex flex-col gap-4 max-w-[375px] mx-auto w-full overflow-x-hidden"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        multiple
        className="hidden"
        onChange={onInputChange}
        disabled={isProcessing}
      />

      {/* Header */}
      <div className="flex items-center gap-2 -mb-1">
        <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-900/20">
          <UploadIcon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-semibold text-zinc-100 leading-none tracking-tight">Upload media</h1>
          <p className="text-[11px] text-zinc-500 leading-none mt-1">Add videos & images to your timeline</p>
        </div>
        {pending.length > 0 && (
          <span className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full bg-violet-500/15 border border-violet-500/20 text-violet-300">
            {pending.length} ready
          </span>
        )}
      </div>

      {/* Drop zone */}
      <motion.div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openPicker()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDragEnd={onDragLeave}
        whileTap={{ scale: 0.98 }}
        animate={isDragging ? { scale: 1.01 } : { scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`rounded-2xl border-2 border-dashed p-5 flex flex-col items-center text-center gap-3 cursor-pointer select-none min-h-[176px] justify-center
          ${isProcessing ? "opacity-60 pointer-events-none" : ""}
          ${
            isDragging
              ? "border-violet-500 bg-violet-500/10"
              : "border-zinc-700 bg-zinc-800/40 hover:bg-zinc-800/60 hover:border-zinc-600 active:bg-zinc-800"
          }`}
      >
        <motion.div
          animate={isDragging ? { scale: 1.08, rotate: 2 } : { scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 20 }}
          className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-sm ${
            isDragging ? "bg-violet-600 text-white border-violet-500 shadow-violet-900/20" : "bg-violet-600/20 border-violet-500/30 text-violet-400"
          }`}
        >
          <UploadIcon size={26} strokeWidth={1.7} />
        </motion.div>

        <div className="space-y-1">
          <h2 className="text-[15px] font-semibold text-zinc-100 leading-none">
            {isDragging ? "Drop to upload" : "Upload photos or videos"}
          </h2>
          <p className="text-[13px] text-zinc-400 leading-relaxed max-w-[28ch] mx-auto">
            Drag & drop or tap to browse. Supports video & image, multiple at once.
          </p>
        </div>

        <div
          onClick={(e) => {
            e.stopPropagation();
            openPicker();
          }}
          className="mt-1 w-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-sm font-semibold py-3.5 rounded-xl transition-colors text-center shadow-lg shadow-violet-900/20 flex items-center justify-center gap-2"
        >
          {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {isProcessing ? "Processing..." : "Choose files"}
        </div>
        <p className="text-[11px] text-zinc-500">MP4, MOV, WEBM, JPG, PNG — up to 500 MB each</p>
      </motion.div>

      {/* Selected / Empty */}
      <AnimatePresence mode="wait">
        {pending.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl bg-zinc-800/30 border border-zinc-800 p-6 flex flex-col items-center justify-center text-center gap-3 py-10"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500">
              <ImageIcon size={18} />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-zinc-300 font-medium">No files selected yet</p>
              <p className="text-xs text-zinc-500 max-w-[26ch]">Your previews will appear here in a tidy grid — ready for the timeline</p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Film size={12} /> <span>Up to 10 files at once</span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs">
                  <Check size={12} strokeWidth={3} />
                </span>
                Selected <span className="font-normal text-zinc-500">({pending.length})</span>
              </h3>
              <button
                onClick={() => {
                  pending.forEach((p) => URL.revokeObjectURL(p.url));
                  setPending([]);
                }}
                disabled={isProcessing}
                className="text-xs font-medium text-zinc-400 hover:text-zinc-200 py-2 px-2 -mr-2 rounded-lg active:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                Clear all
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <AnimatePresence>
                {pending.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.2 }}
                    className="group relative rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/70 flex flex-col"
                  >
                    <div className="aspect-[4/3] bg-black relative overflow-hidden">
                      {item.type === "image" ? (
                        <img src={item.url} alt={item.file.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <video src={item.url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                      )}
                      <span
                        className={`absolute top-2 left-2 text-[10px] font-bold tracking-widest px-1.5 py-0.5 rounded-md border backdrop-blur
                          ${item.type === "video" ? "bg-violet-600/90 border-violet-500 text-white" : "bg-zinc-900/80 border-zinc-700 text-zinc-200"}`}
                      >
                        {item.type.toUpperCase()}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removePending(item.id);
                        }}
                        disabled={isProcessing}
                        aria-label={`Remove ${item.file.name}`}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 backdrop-blur border border-white/15 text-white flex items-center justify-center hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                      {isProcessing && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
                          <Loader2 size={18} className="animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <div className="p-2.5 flex flex-col gap-0.5 min-w-0">
                      <p className="text-xs font-medium text-zinc-100 truncate" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <p className="text-[11px] text-zinc-500">{formatBytes(item.file.size)} • {item.type}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleConfirm}
              disabled={isProcessing}
              className="w-full mt-1 py-4 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[15px] flex items-center justify-center gap-2 shadow-lg shadow-violet-900/20"
            >
              {isProcessing ? <Loader2 size={18} className="animate-spin" /> : null}
              {isProcessing ? "Preparing timeline..." : "Continue to editor"}
              {!isProcessing && (
                <span className="bg-white/15 rounded-full w-6 h-6 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </span>
              )}
              <span className="text-xs font-normal opacity-80">({pending.length})</span>
            </motion.button>
            <p className="text-center text-xs text-zinc-500 -mt-1">You can add more files later in the editor</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
