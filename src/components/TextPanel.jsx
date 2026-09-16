import { useEffect, useState } from "react";
import useEditorStore from "../store/editorStore";

const PRESET_COLORS = [
  "#ffffff",
  "#000000",
  "#ef4444",
  "#f59e0b",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a78bfa",
  "#ec4899",
];



function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function TextPanel({ clip, selectedTextId, onSelectText }) {
  const updateClip = useEditorStore((s) => s.updateClip);

  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(18);
  const [color, setColor] = useState("#ffffff");

  // Sync when selected overlay changes
  useEffect(() => {
    if (!clip || !selectedTextId) {
      setText("");
      setFontSize(18);
      setColor("#ffffff");
      return;
    }
    const ov = clip.textOverlays.find((o) => o.id === selectedTextId);
    if (ov) {
      setText(ov.text);
      setFontSize(ov.fontSize ?? 18);
      setColor(ov.color ?? "#ffffff");
    }
  }, [clip, selectedTextId]);

  if (!clip) {
    return <p className="text-sm text-zinc-500 text-center py-6">No clip selected</p>;
  }

  const handleAdd = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (selectedTextId) {
      // Update existing
      updateClip(clip.id, {
        textOverlays: clip.textOverlays.map((ov) =>
          ov.id === selectedTextId ? { ...ov, text: trimmed, fontSize, color } : ov
        ),
      });
    } else {
      // Add new
      const newOv = {
        id: genId(),
        text: trimmed,
        x: 50,
        y: 50,
        fontSize,
        color,
      };
      updateClip(clip.id, { textOverlays: [...(clip.textOverlays || []), newOv] });
      if (onSelectText) onSelectText(newOv.id);
    }
    // keep text for multi-add? clear only if adding new? keep for edit
    if (!selectedTextId) setText("");
  };

  const handleDelete = (id) => {
    updateClip(clip.id, { textOverlays: clip.textOverlays.filter((ov) => ov.id !== id) });
    if (selectedTextId === id && onSelectText) onSelectText(null);
  };



  const handleFontSize = (val) => {
    const v = parseInt(val, 10);
    setFontSize(v);
    if (selectedTextId) {
      updateClip(clip.id, {
        textOverlays: clip.textOverlays.map((ov) => (ov.id === selectedTextId ? { ...ov, fontSize: v } : ov)),
      });
    }
  };

  const handleColor = (c) => {
    setColor(c);
    if (selectedTextId) {
      updateClip(clip.id, {
        textOverlays: clip.textOverlays.map((ov) => (ov.id === selectedTextId ? { ...ov, color: c } : ov)),
      });
    }
  };

  const selectedOv = selectedTextId ? clip.textOverlays.find((o) => o.id === selectedTextId) : null;

  return (
    <div className="space-y-4">
      {/* Input + Add/Update */}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={selectedTextId ? "Edit text…" : "Enter text…"}
          className="flex-1 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
          maxLength={48}
        />
        <button
          onClick={handleAdd}
          disabled={!text.trim()}
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${text.trim() ? "bg-violet-600 hover:bg-violet-500 text-white" : "bg-zinc-800 text-zinc-500 border border-zinc-700"}`}
        >
          {selectedTextId ? "Update" : "Add"}
        </button>
      </div>
      {selectedOv && (
        <button onClick={() => onSelectText && onSelectText(null)} className="text-xs text-zinc-500 hover:text-zinc-300">
          + New text (clear selection)
        </button>
      )}

      {/* Font size slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold tracking-widest text-zinc-500">FONT SIZE</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">{fontSize}px</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">A</span>
          <input type="range" min={12} max={48} value={fontSize} onChange={(e) => handleFontSize(e.target.value)} className="flex-1 accent-violet-600" />
          <span className="text-lg text-zinc-300">A</span>
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">Live preview updates — drag text on canvas too</p>
      </div>

      {/* Color picker */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-zinc-500 mb-2">COLOR</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => handleColor(c)}
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${color === c ? "border-violet-500 scale-110 ring-2 ring-violet-400" : "border-zinc-700"}`}
              style={{ background: c }}
              aria-label={c}
            >
              {color === c && <span className="w-2 h-2 rounded-full bg-white shadow" style={{ background: c === "#ffffff" ? "#000" : "#fff" }} />}
            </button>
          ))}
          {/* custom color input */}
          <label className="w-8 h-8 rounded-full border-2 border-zinc-700 overflow-hidden cursor-pointer">
            <input type="color" value={color} onChange={(e) => handleColor(e.target.value)} className="w-full h-full cursor-pointer" />
          </label>
        </div>
      </div>

      {/* Position hint - direct touch/mouse */}
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-3 flex gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300 shrink-0">✋</div>
        <div>
          <p className="text-xs font-medium text-zinc-200">Move & resize on preview</p>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Phone: <span className="text-zinc-300">touch drag</span> to move • <span className="text-zinc-300">pinch 2 fingers</span> to resize • Laptop: <span className="text-zinc-300">mouse drag</span> • tap text to select/delete
          </p>
        </div>
      </div>

      {/* List of overlays */}
      {clip.textOverlays.length > 0 && (
        <div>
          <p className="text-xs font-semibold tracking-widest text-zinc-500 mb-2">OVERLAYS ({clip.textOverlays.length})</p>
          <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
            {clip.textOverlays.map((ov) => {
              const isSel = ov.id === selectedTextId;
              return (
                <div
                  key={ov.id}
                  onClick={() => onSelectText && onSelectText(ov.id)}
                  className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-colors ${isSel ? "bg-violet-600/20 border-violet-500/40" : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700/60"}`}
                >
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: ov.color ?? "#fff", color: ov.color === "#ffffff" || ov.color === "#ffff00" ? "#000" : "#fff", fontSize: "10px" }}>
                    T
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-100 truncate" style={{ color: ov.color }}>
                      {ov.text}
                    </p>
                    <p className="text-[11px] text-zinc-500">{ov.fontSize ?? 18}px • {Math.round(ov.x)},{Math.round(ov.y)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(ov.id);
                    }}
                    className="w-7 h-7 rounded-full bg-zinc-700 hover:bg-red-600 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
