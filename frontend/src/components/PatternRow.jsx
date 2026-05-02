import { useState } from "react";
import {
    Eye,
    EyeOff,
    Trash2,
    Wand2,
    Layers3,
    LineChart as LineIcon,
    BarChart3,
    Undo2,
    Loader2,
    CheckCircle2,
    Circle,
    Scaling,
} from "lucide-react";
import { smoothPattern, subtractBackground } from "../lib/xrdApi";
import { toast } from "sonner";

const FORMAT_LABEL = {
    pks: "stoe · pks",
    "stoe-theo": "winxpow",
    csv: "csv",
    xy: "xy",
};

export default function PatternRow({
    pattern,
    onChange,
    onRemove,
    onNormalize,
    onToggleReference,
    hasMeasurement = false,
}) {
    const [busy, setBusy] = useState(null); // 'smooth' | 'bg' | null

    const update = (patch) => onChange({ ...pattern, ...patch });

    const handleSmooth = async () => {
        try {
            setBusy("smooth");
            const ys = await smoothPattern(
                pattern.processed?.y ?? pattern.y,
                pattern.smoothWindow ?? 11,
                3
            );
            update({ processed: { ...(pattern.processed || {}), y: ys, smoothed: true } });
            toast.success(`Smoothed "${pattern.name}"`);
        } catch (e) {
            toast.error(e.response?.data?.detail || "Smoothing failed");
        } finally {
            setBusy(null);
        }
    };

    const handleBg = async () => {
        try {
            setBusy("bg");
            const { y } = await subtractBackground(
                pattern.processed?.y ?? pattern.y,
                pattern.bgIterations ?? 40
            );
            update({ processed: { ...(pattern.processed || {}), y, bgRemoved: true } });
            toast.success(`Background removed from "${pattern.name}"`);
        } catch (e) {
            toast.error(e.response?.data?.detail || "Background subtraction failed");
        } finally {
            setBusy(null);
        }
    };

    const handleReset = () => {
        update({ processed: null });
        toast("Reset to raw data");
    };

    return (
        <div
            data-testid={`pattern-row-${pattern.id}`}
            className="surface fade-up p-3 space-y-3"
            style={{ borderLeft: `3px solid ${pattern.color}` }}
        >
            <div className="flex items-center gap-2">
                <button
                    data-testid={`toggle-visible-${pattern.id}`}
                    onClick={() => update({ visible: !pattern.visible })}
                    className="text-[var(--ink-2)] hover:text-[var(--ink-0)] transition-colors"
                    title={pattern.visible ? "Hide" : "Show"}
                >
                    {pattern.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <input
                    data-testid={`pattern-name-${pattern.id}`}
                    value={pattern.name}
                    onChange={(e) => update({ name: e.target.value })}
                    className="bg-transparent flex-1 text-sm font-semibold focus:outline-none truncate"
                />
                <input
                    data-testid={`pattern-color-${pattern.id}`}
                    type="color"
                    value={pattern.color}
                    onChange={(e) => update({ color: e.target.value })}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border border-[var(--line)]"
                    title="Pattern color"
                />
                <button
                    data-testid={`remove-pattern-${pattern.id}`}
                    onClick={onRemove}
                    className="text-[var(--ink-3)] hover:text-[var(--coral)] transition-colors"
                    title="Remove"
                >
                    <Trash2 size={15} />
                </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] mono text-[var(--ink-2)]">
                <div>
                    pts <span className="text-[var(--ink-0)]">{pattern.points}</span>
                </div>
                <div>
                    range{" "}
                    <span className="text-[var(--ink-0)]">
                        {pattern.x_min.toFixed(2)}–{pattern.x_max.toFixed(2)}°
                    </span>
                </div>
            </div>

            <button
                data-testid={`reference-toggle-${pattern.id}`}
                onClick={onToggleReference}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border transition-all ${
                    pattern.isReference
                        ? "border-[var(--teal)] bg-[rgba(77,217,200,0.08)] text-[var(--teal)]"
                        : "border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink-0)] hover:border-[var(--ink-3)]"
                }`}
                title="Mark this pattern as a reference (droplines)"
            >
                <span className="flex items-center gap-1.5 mono text-[11px]">
                    {pattern.isReference ? (
                        <CheckCircle2 size={13} />
                    ) : (
                        <Circle size={13} />
                    )}
                    reference pattern
                </span>
                <span className="mono text-[10px] opacity-70">
                    {FORMAT_LABEL[pattern.source_format] || pattern.source_format}
                </span>
            </button>

            {pattern.isReference && hasMeasurement && onNormalize && (
                <button
                    data-testid={`normalize-${pattern.id}`}
                    onClick={onNormalize}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] mono text-[var(--ink-2)] hover:text-[var(--ink-0)] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] border border-[var(--line)] transition-all"
                    title="Scale reference peaks to match the measurement's maximum"
                >
                    <Scaling size={12} />
                    normalize to measurement
                </button>
            )}

            <div className="flex gap-1">
                <button
                    data-testid={`mode-line-${pattern.id}`}
                    onClick={() => update({ mode: "line" })}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-all ${
                        pattern.mode === "line"
                            ? "bg-[var(--bg-3)] text-[var(--ink-0)]"
                            : "bg-transparent text-[var(--ink-2)] hover:text-[var(--ink-0)]"
                    }`}
                >
                    <LineIcon size={13} /> line
                </button>
                <button
                    data-testid={`mode-droplines-${pattern.id}`}
                    onClick={() => update({ mode: "droplines" })}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-all ${
                        pattern.mode === "droplines"
                            ? "bg-[var(--bg-3)] text-[var(--ink-0)]"
                            : "bg-transparent text-[var(--ink-2)] hover:text-[var(--ink-0)]"
                    }`}
                >
                    <BarChart3 size={13} /> sticks
                </button>
            </div>

            <div className="space-y-1.5">
                <Slider
                    label="y-offset"
                    value={pattern.offset}
                    onChange={(v) => update({ offset: v })}
                    onReset={() => update({ offset: 0 })}
                    min={-pattern.y_max}
                    max={pattern.y_max * 1.5}
                    step={pattern.y_max / 1000}
                    format={(v) => v.toFixed(1)}
                    testId={`offset-${pattern.id}`}
                />
                <Slider
                    label="scale"
                    value={pattern.scale}
                    onChange={(v) => update({ scale: v })}
                    onReset={() => update({ scale: 1 })}
                    min={0.05}
                    max={5}
                    step={0.01}
                    format={(v) => v.toFixed(2) + "×"}
                    testId={`scale-${pattern.id}`}
                />
            </div>

            <div className="flex gap-1.5 flex-wrap">
                <ProcessButton
                    onClick={handleSmooth}
                    busy={busy === "smooth"}
                    icon={<Wand2 size={12} />}
                    label="smooth"
                    active={pattern.processed?.smoothed}
                    testId={`smooth-${pattern.id}`}
                />
                <ProcessButton
                    onClick={handleBg}
                    busy={busy === "bg"}
                    icon={<Layers3 size={12} />}
                    label="bg subtract"
                    active={pattern.processed?.bgRemoved}
                    testId={`bg-${pattern.id}`}
                />
                {pattern.processed && (
                    <button
                        data-testid={`reset-${pattern.id}`}
                        onClick={handleReset}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] mono rounded-md text-[var(--ink-2)] hover:text-[var(--ink-0)] hover:bg-[var(--bg-3)] transition-all"
                    >
                        <Undo2 size={11} /> raw
                    </button>
                )}
            </div>
        </div>
    );
}

function ProcessButton({ onClick, busy, icon, label, active, testId }) {
    return (
        <button
            data-testid={testId}
            disabled={busy}
            onClick={onClick}
            className={`flex items-center gap-1.5 px-2 py-1 text-[11px] mono rounded-md transition-all border ${
                active
                    ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(245,185,74,0.08)]"
                    : "border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink-0)] hover:border-[var(--ink-3)]"
            } ${busy ? "opacity-60 cursor-wait" : ""}`}
        >
            {busy ? <Loader2 size={12} className="animate-spin" /> : icon}
            {label}
        </button>
    );
}

function Slider({ label, value, onChange, onReset, min, max, step, format, testId }) {
    return (
        <div>
            <div className="flex justify-between mono text-[10px] text-[var(--ink-3)] mb-0.5">
                <span
                    onDoubleClick={onReset}
                    className={onReset ? "cursor-pointer hover:text-[var(--amber)] transition-colors select-none" : ""}
                    title={onReset ? "double-click to reset" : undefined}
                >
                    {label}
                </span>
                <span className="text-[var(--ink-1)]">{format(value)}</span>
            </div>
            <input
                data-testid={testId}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                onDoubleClick={onReset}
                className="w-full accent-[var(--amber)] cursor-pointer"
            />
        </div>
    );
}
