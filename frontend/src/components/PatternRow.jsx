import { useState } from "react";
import {
    Eye,
    EyeOff,
    Trash2,
    Wand2,
    LineChart as LineIcon,
    BarChart3,
    Undo2,
    Loader2,
    CheckCircle2,
    Circle,
    ChevronDown,
    ChevronRight,
    GripVertical,
} from "lucide-react";
import { smoothPattern } from "../lib/xrdApi";
import { toast } from "sonner";

const FORMAT_LABEL = { pks: "pks", "stoe-theo": "winxpow", "stoe-raw": "raw", csv: "csv", xy: "xy" };

export default function PatternRow({ pattern, index, onChange, onRemove, onToggleReference, dragActive = false, onDragStart, onDragOver, onDrop }) {
    const [busy, setBusy] = useState(null);
    const update = (patch) => onChange({ ...pattern, ...patch });
    const collapsed = pattern.collapsed ?? true;
    const isReference = pattern.isReference;

    const handleSmooth = async () => {
        try {
            setBusy("smooth");
            const ys = await smoothPattern(pattern.processed?.y ?? pattern.y, pattern.smoothWindow ?? 11, 3);
            update({ processed: { ...(pattern.processed || {}), y: ys, smoothed: true } });
            toast.success(`Smoothed "${pattern.name}"`);
        } catch (e) {
            toast.error(e.response?.data?.detail || "Smoothing failed");
        } finally {
            setBusy(null);
        }
    };
    const handleReset = () => { update({ processed: null }); toast("Reset to raw data"); };

    return <div data-testid={`pattern-row-${pattern.id}`} draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} className={`surface fade-up p-2.5 space-y-2 transition-all ${dragActive ? "ring-1 ring-[var(--amber)]" : ""}`} style={{ borderLeft: `3px solid ${pattern.color}`, opacity: pattern.visible ? 1 : 0.6 }}>
        <div className="flex items-center gap-2 min-w-0">
            <span className="text-[var(--ink-3)] cursor-grab active:cursor-grabbing shrink-0" title="Drag to reorder"><GripVertical size={14} /></span>
            <span className="mono text-[9px] text-[var(--ink-3)] w-4 text-right shrink-0">{index}</span>
            <button onClick={() => update({ collapsed: !collapsed })} className="text-[var(--ink-3)] hover:text-[var(--ink-0)] shrink-0">{collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
            <button data-testid={`toggle-visible-${pattern.id}`} onClick={() => update({ visible: !pattern.visible })} className="text-[var(--ink-2)] hover:text-[var(--ink-0)] transition-colors shrink-0">{pattern.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: pattern.color }} />
            <input data-testid={`pattern-name-${pattern.id}`} value={pattern.name} onChange={(e) => update({ name: e.target.value })} className="bg-transparent flex-1 min-w-0 text-[13px] font-semibold focus:outline-none truncate" />
            <span className={`mono text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${isReference ? "border-[var(--teal)] text-[var(--teal)]" : "border-[var(--line)] text-[var(--ink-3)]"}`}>{isReference ? "ref" : "meas"}</span>
            <span className="mono text-[9px] text-[var(--ink-3)] shrink-0">{FORMAT_LABEL[pattern.source_format] || pattern.source_format}</span>
            <input data-testid={`pattern-color-${pattern.id}`} type="color" value={pattern.color} onChange={(e) => update({ color: e.target.value })} className="w-5 h-5 rounded cursor-pointer bg-transparent border border-[var(--line)] shrink-0" />
            <button data-testid={`remove-pattern-${pattern.id}`} onClick={onRemove} className="text-[var(--ink-3)] hover:text-[var(--coral)] transition-colors shrink-0"><Trash2 size={14} /></button>
        </div>
        <div className="flex items-center justify-between text-[10px] mono text-[var(--ink-3)] px-1 pl-9"><span>{pattern.points} pts</span><span>{pattern.x_min.toFixed(1)}–{pattern.x_max.toFixed(1)}°</span><span>{pattern.radiation || "Cu Kα1"}</span></div>
        {!collapsed && <>
            <button data-testid={`reference-toggle-${pattern.id}`} onClick={onToggleReference} className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border transition-all ${isReference ? "border-[var(--teal)] bg-[rgba(77,217,200,0.08)] text-[var(--teal)]" : "border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink-0)] hover:border-[var(--ink-3)]"}`}><span className="flex items-center gap-1.5 mono text-[10px]">{isReference ? <CheckCircle2 size={12} /> : <Circle size={12} />}reference pattern</span><span className="mono text-[10px] opacity-70">{FORMAT_LABEL[pattern.source_format] || pattern.source_format}</span></button>
            <div className="flex gap-1"><button data-testid={`mode-line-${pattern.id}`} onClick={() => update({ mode: "line" })} className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[10px] transition-all ${pattern.mode === "line" ? "bg-[var(--bg-3)] text-[var(--ink-0)]" : "bg-transparent text-[var(--ink-2)] hover:text-[var(--ink-0)]"}`}><LineIcon size={12} />line</button><button data-testid={`mode-droplines-${pattern.id}`} onClick={() => update({ mode: "droplines" })} className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[10px] transition-all ${pattern.mode === "droplines" ? "bg-[var(--bg-3)] text-[var(--ink-0)]" : "bg-transparent text-[var(--ink-2)] hover:text-[var(--ink-0)]"}`}><BarChart3 size={12} />sticks</button></div>
            <div className="space-y-1"><Slider label="y-offset" value={pattern.offset} onChange={(v) => update({ offset: v })} onReset={() => update({ offset: 0 })} min={-pattern.y_max * 0.5} max={pattern.y_max * 4} step={Math.max(pattern.y_max / 4000, 0.001)} format={(v) => v.toFixed(2)} testId={`offset-${pattern.id}`} /><Slider label="scale" value={pattern.scale} onChange={(v) => update({ scale: v })} onReset={() => update({ scale: 1 })} min={0.1} max={5} step={0.002} format={(v) => v.toFixed(3) + "×"} testId={`scale-${pattern.id}`} /></div>
            <div className="flex gap-1.5 flex-wrap"><ProcessButton onClick={handleSmooth} busy={busy === "smooth"} icon={<Wand2 size={11} />} label="smooth" active={pattern.processed?.smoothed} testId={`smooth-${pattern.id}`} />{pattern.processed && <button data-testid={`reset-${pattern.id}`} onClick={handleReset} className="flex items-center gap-1 px-2 py-1 text-[10px] mono rounded-md text-[var(--ink-2)] hover:text-[var(--ink-0)] hover:bg-[var(--bg-3)] transition-all"><Undo2 size={10} />raw</button>}</div>
        </>}
    </div>;
}
function ProcessButton({ onClick, busy, icon, label, active, testId }) { return <button data-testid={testId} disabled={busy} onClick={onClick} className={`flex items-center gap-1.5 px-2 py-1 text-[10px] mono rounded-md transition-all border ${active ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(245,185,74,0.08)]" : "border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink-0)] hover:border-[var(--ink-3)]"} ${busy ? "opacity-60 cursor-wait" : ""}`}>{busy ? <Loader2 size={11} className="animate-spin" /> : icon}{label}</button>; }
function Slider({ label, value, onChange, onReset, min, max, step, format, testId }) { return <div><div className="flex justify-between mono text-[9px] text-[var(--ink-3)] mb-0.5"><span onDoubleClick={onReset} className={onReset ? "cursor-pointer hover:text-[var(--amber)] transition-colors select-none" : ""}>{label}</span><span className="text-[var(--ink-1)]">{format(value)}</span></div><input data-testid={testId} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} onDoubleClick={onReset} className="w-full accent-[var(--amber)] cursor-pointer" /></div>; }
