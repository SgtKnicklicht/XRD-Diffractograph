import { useMemo, useRef, useState } from "react";
import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Activity, Download, Github, FileText, Layers3, Palette, RotateCcw, ChevronsUpDown } from "lucide-react";
import Plotly from "plotly.js-basic-dist-min";
import XRDPlot from "./components/XRDPlot";
import PatternRow from "./components/PatternRow";
import Dropzone, { UploadButton } from "./components/Dropzone";
import { PATTERN_COLORS, PLOT_PALETTES, XRAY_WAVELENGTHS, convertPatternRadiation } from "./lib/xrdApi";

let _id = 0;
const nextId = () => `p${++_id}`;

const REFERENCE_COLORS = ["#ff5a5f", "#4dd9c8", "#ffd166", "#b08bff", "#ff9f43", "#7fd1ff", "#f368e0", "#a3e635"];

function nextRefColor(patterns, skipId) {
    const used = patterns.filter((p) => p.isReference && p.id !== skipId).length;
    return REFERENCE_COLORS[used % REFERENCE_COLORS.length];
}

function computeRefScale(refYmax, measuredPatterns) {
    const firstMeasured = measuredPatterns.find((p) => !p.isReference);
    if (!firstMeasured || !refYmax) return 1;
    const ratio = firstMeasured.y_max / refYmax;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function getYMax(y) {
    return y.reduce((m, v) => (Number.isFinite(v) ? Math.max(m, v) : m), 0);
}

function makePattern(data, existing) {
    const isRef = !!data.is_reference;
    const measuredIndex = existing.filter((p) => !p.isReference).length;
    const color = isRef ? nextRefColor(existing) : PATTERN_COLORS[measuredIndex % PATTERN_COLORS.length];
    const scale = isRef ? computeRefScale(data.y_max, existing) : 1;
    return {
        id: nextId(),
        name: data.name,
        x: data.x,
        y: data.y,
        points: data.points,
        x_min: data.x_min,
        x_max: data.x_max,
        y_max: data.y_max,
        source_format: data.source_format || "xy",
        color,
        visible: true,
        isReference: isRef,
        mode: isRef ? "droplines" : "line",
        offset: 0,
        scale,
        processed: null,
        smoothWindow: 11,
        bgIterations: 40,
        collapsed: true,
        radiation: "Cu Kα1",
    };
}

export default function App() {
    const [patterns, setPatterns] = useState([]);
    const [aspect, setAspect] = useState("16:9");
    const [stackMode, setStackMode] = useState("normal");
    const [fromRadiation, setFromRadiation] = useState("Cu Kα1");
    const [toRadiation, setToRadiation] = useState("Mo Kα1");
    const [selectedPatternId, setSelectedPatternId] = useState("");
    const plotRef = useRef(null);

    const addPattern = (data) => setPatterns((prev) => [...prev, makePattern(data, prev)]);
    const updatePattern = (id, next) => setPatterns((prev) => prev.map((p) => (p.id === id ? next : p)));
    const removePattern = (id) => setPatterns((prev) => prev.filter((p) => p.id !== id));

    const measurementPatterns = patterns.filter((p) => !p.isReference);
    const referencePatterns = patterns.filter((p) => p.isReference);
    const totalPoints = useMemo(() => patterns.reduce((s, p) => s + p.points, 0), [patterns]);

    const toggleReference = (id) => {
        setPatterns((prev) => {
            const target = prev.find((p) => p.id === id);
            if (!target) return prev;
            const becomesRef = !target.isReference;
            return prev.map((p) => p.id !== id ? p : {
                ...p,
                isReference: becomesRef,
                mode: becomesRef ? "droplines" : "line",
                color: becomesRef ? nextRefColor(prev, id) : p.color,
            });
        });
    };

    const normalizePattern = (id) => {
        setPatterns((prev) => {
            const ref = prev.find((p) => p.id === id);
            if (!ref) return prev;
            const target = prev.find((p) => !p.isReference && p.id !== id);
            if (!target) {
                toast.error("Load a measurement pattern first to normalize against");
                return prev;
            }
            const scale = computeRefScale(ref.y_max, [target]);
            toast.success(`Normalized to "${target.name}" (${scale.toFixed(2)}×)`);
            return prev.map((p) => (p.id === id ? { ...p, scale } : p));
        });
    };

    const handleAutoStack = () => {
        if (!patterns.some((p) => p.visible)) {
            toast.error("No visible patterns to stack");
            return;
        }
        const factors = { compact: 0.65, normal: 1.05, wide: 1.45 };
        const factor = factors[stackMode] ?? factors.normal;
        setPatterns((prev) => {
            const visibleMeasurements = prev.filter((p) => p.visible && !p.isReference);
            const heights = visibleMeasurements.map((p) => Math.max(1, p.y_max * p.scale)).sort((a, b) => a - b);
            const median = heights.length ? heights[Math.floor(heights.length / 2)] : Math.max(...prev.map((p) => p.y_max || 1));
            let measurementIndex = 0;
            let referenceIndex = 0;
            return prev.map((p) => {
                if (!p.visible) return p;
                if (p.isReference) {
                    const offset = visibleMeasurements.length * median * factor + referenceIndex * median * 0.18;
                    referenceIndex += 1;
                    return { ...p, offset };
                }
                const offset = measurementIndex * median * factor;
                measurementIndex += 1;
                return { ...p, offset };
            });
        });
        toast.success(`Auto-stacked patterns (${stackMode})`);
    };

    const handleResetOffsets = () => {
        setPatterns((prev) => prev.map((p) => ({ ...p, offset: 0 })));
        toast("Offsets reset");
    };

    const assignPalette = (paletteKey) => {
        const palette = PLOT_PALETTES[paletteKey];
        if (!palette) return;
        setPatterns((prev) => {
            let i = 0;
            return prev.map((p) => {
                if (!p.visible || p.isReference) return p;
                const color = palette.colors[i % palette.colors.length];
                i += 1;
                return { ...p, color };
            });
        });
        toast.success(`Applied ${palette.label} palette to measurements`);
    };

    const setAllCollapsed = (collapsed) => {
        setPatterns((prev) => prev.map((p) => ({ ...p, collapsed })));
    };

    const duplicateConvertedPattern = () => {
        const source = patterns.find((p) => p.id === selectedPatternId) || patterns[0];
        if (!source) {
            toast.error("Load a pattern first");
            return;
        }
        const fromLambda = XRAY_WAVELENGTHS[fromRadiation];
        const toLambda = XRAY_WAVELENGTHS[toRadiation];
        if (!fromLambda || !toLambda || fromLambda === toLambda) {
            toast.error("Choose two different radiations");
            return;
        }
        const converted = convertPatternRadiation(source, fromLambda, toLambda);
        if (converted.x.length < 2) {
            toast.error("Conversion produced no valid 2θ values");
            return;
        }
        const yMax = getYMax(converted.y);
        const duplicate = {
            ...source,
            id: nextId(),
            name: `${source.name} (${fromRadiation}→${toRadiation})`,
            x: converted.x,
            y: converted.y,
            points: converted.x.length,
            x_min: Math.min(...converted.x),
            x_max: Math.max(...converted.x),
            y_max: yMax,
            processed: null,
            radiation: toRadiation,
            offset: source.offset,
            color: source.isReference ? nextRefColor(patterns) : PATTERN_COLORS[patterns.filter((p) => !p.isReference).length % PATTERN_COLORS.length],
            collapsed: true,
        };
        setPatterns((prev) => [...prev, duplicate]);
        toast.success(`Duplicated converted pattern${converted.dropped ? ` (${converted.dropped} invalid points dropped)` : ""}`);
    };

    const handleExportPng = async () => {
        if (!plotRef.current) return;
        try {
            await Plotly.downloadImage(plotRef.current, { format: "png", filename: "xrd-pattern", width: 1600, height: 900, scale: 2 });
            toast.success("Exported PNG");
        } catch {
            toast.error("Export failed");
        }
    };

    const handleExportCsv = () => {
        if (patterns.length === 0) {
            toast.error("Load a pattern first");
            return;
        }
        const lines = ["pattern,2theta,intensity,radiation"];
        for (const p of patterns) {
            const ys = p.processed?.y ?? p.y;
            for (let i = 0; i < p.x.length; i++) lines.push(`${p.name},${p.x[i]},${ys[i]},${p.radiation || ""}`);
        }
        const blob = new Blob([lines.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "xrd-patterns.csv";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Exported CSV");
    };

    return (
        <div className="App grid-bg" data-testid="xrd-app">
            <Toaster richColors theme="dark" position="top-right" toastOptions={{ style: { background: "var(--bg-1)", border: "1px solid var(--line)", color: "var(--ink-0)", fontFamily: "Manrope, sans-serif" } }} />
            <header className="border-b border-[var(--line-soft)] backdrop-blur-md bg-[rgba(10,13,20,0.7)] sticky top-0 z-30">
                <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[var(--bg-2)] border border-[var(--line)] flex items-center justify-center"><Activity size={18} className="text-[var(--amber)]" /></div>
                        <div><div className="font-extrabold text-[15px] tracking-tight leading-tight">Diffractograph</div><div className="mono text-[10px] text-[var(--ink-3)] uppercase tracking-[0.16em]">powder · xrd · viewer</div></div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="chip" data-testid="patterns-count">{patterns.length} pattern{patterns.length !== 1 ? "s" : ""}</span>
                        <span className="chip hidden md:inline-block" data-testid="points-count">{totalPoints.toLocaleString()} pts</span>
                        <button data-testid="export-csv" onClick={handleExportCsv} className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs mono rounded-lg border border-[var(--line)] text-[var(--ink-1)] hover:text-[var(--ink-0)] hover:border-[var(--ink-3)] transition-all"><FileText size={13} /> csv</button>
                        <button data-testid="export-png" onClick={handleExportPng} className="flex items-center gap-1.5 px-3 py-2 text-xs mono rounded-lg border border-[var(--line)] text-[var(--ink-1)] hover:text-[var(--ink-0)] hover:border-[var(--ink-3)] transition-all"><Download size={13} /> png</button>
                        <UploadButton onParsed={addPattern} />
                    </div>
                </div>
            </header>
            <main className="max-w-[1600px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
                <aside className="space-y-4">
                    <Dropzone onParsed={addPattern} />
                    {patterns.length > 0 && (
                        <WorkflowPanel
                            stackMode={stackMode}
                            setStackMode={setStackMode}
                            onAutoStack={handleAutoStack}
                            onResetOffsets={handleResetOffsets}
                            onPalette={assignPalette}
                            patterns={patterns}
                            selectedPatternId={selectedPatternId || patterns[0]?.id || ""}
                            setSelectedPatternId={setSelectedPatternId}
                            fromRadiation={fromRadiation}
                            setFromRadiation={setFromRadiation}
                            toRadiation={toRadiation}
                            setToRadiation={setToRadiation}
                            onConvert={duplicateConvertedPattern}
                            setAllCollapsed={setAllCollapsed}
                        />
                    )}
                    {patterns.length === 0 ? <EmptyState /> : (
                        <div className="space-y-3" data-testid="pattern-list">
                            <PatternGroup title="Measurements" items={measurementPatterns} patterns={patterns} updatePattern={updatePattern} removePattern={removePattern} normalizePattern={normalizePattern} toggleReference={toggleReference} />
                            <PatternGroup title="References" items={referencePatterns} patterns={patterns} updatePattern={updatePattern} removePattern={removePattern} normalizePattern={normalizePattern} toggleReference={toggleReference} />
                        </div>
                    )}
                    <Legend />
                </aside>
                <section className="surface p-3 lg:p-5 flex flex-col">
                    <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                        <div><div className="text-[11px] mono uppercase tracking-[0.16em] text-[var(--ink-3)]">Diffractogram</div><div className="text-[15px] font-semibold">Intensity vs 2θ</div></div>
                        <div className="flex items-center gap-3">
                            {patterns.length > 0 && <div className="mono text-[11px] text-[var(--ink-3)] hidden xl:block">scroll-to-zoom · drag-to-pan · double-click / middle-click to reset</div>}
                            <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-[var(--bg-2)] border border-[var(--line)]" data-testid="aspect-selector">
                                {["21:9", "16:9", "4:3", "auto"].map((r) => <button key={r} data-testid={`aspect-${r}`} onClick={() => setAspect(r)} className={`mono text-[10px] px-2 py-1 rounded transition-all ${aspect === r ? "bg-[var(--bg-3)] text-[var(--amber)]" : "text-[var(--ink-3)] hover:text-[var(--ink-1)]"}`} title={r === "auto" ? "expand vertically (good for stacked patterns)" : `${r} aspect ratio`}>{r}</button>)}
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0"><XRDPlot patterns={patterns} plotRef={plotRef} aspect={aspect} /></div>
                </section>
            </main>
            <footer className="border-t border-[var(--line-soft)] mt-4"><div className="max-w-[1600px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-[11px] mono text-[var(--ink-3)]"><span>savitzky-golay smoothing · <span className="text-[var(--ink-1)]">browser</span> + <span className="text-[var(--ink-1)]">plotly</span></span><span className="flex items-center gap-1.5"><Github size={11} /> open-source XRD tool</span></div></footer>
        </div>
    );
}

function WorkflowPanel({ stackMode, setStackMode, onAutoStack, onResetOffsets, onPalette, patterns, selectedPatternId, setSelectedPatternId, fromRadiation, setFromRadiation, toRadiation, setToRadiation, onConvert, setAllCollapsed }) {
    return <div className="surface p-3 space-y-3">
        <div className="flex items-center justify-between"><div className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">plot workflow</div><button onClick={() => setAllCollapsed(true)} className="mini-btn"><ChevronsUpDown size={12} /> collapse all</button></div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5"><select value={stackMode} onChange={(e) => setStackMode(e.target.value)} className="control"><option value="compact">compact</option><option value="normal">normal</option><option value="wide">wide</option></select><button onClick={onAutoStack} className="mini-btn text-[var(--violet)]"><Layers3 size={12} /> auto stack</button><button onClick={onResetOffsets} className="mini-btn"><RotateCcw size={12} /> reset</button></div>
        <div><div className="mono text-[10px] text-[var(--ink-3)] mb-1">quick palette</div><div className="flex flex-wrap gap-1.5">{Object.entries(PLOT_PALETTES).map(([key, palette]) => <button key={key} onClick={() => onPalette(key)} className="mini-btn"><Palette size={12} /> {palette.label}</button>)}</div></div>
        <div className="border-t border-[var(--line-soft)] pt-3 space-y-2"><div className="mono text-[10px] text-[var(--ink-3)]">radiation conversion · duplicate pattern</div><select value={selectedPatternId} onChange={(e) => setSelectedPatternId(e.target.value)} className="control w-full">{patterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5"><select value={fromRadiation} onChange={(e) => setFromRadiation(e.target.value)} className="control">{Object.keys(XRAY_WAVELENGTHS).map((r) => <option key={r}>{r}</option>)}</select><select value={toRadiation} onChange={(e) => setToRadiation(e.target.value)} className="control">{Object.keys(XRAY_WAVELENGTHS).map((r) => <option key={r}>{r}</option>)}</select><button onClick={onConvert} className="mini-btn text-[var(--amber)]">convert</button></div></div>
    </div>;
}

function PatternGroup({ title, items, patterns, updatePattern, removePattern, normalizePattern, toggleReference }) {
    const [open, setOpen] = useState(true);
    if (!items.length) return null;
    return <div className="surface p-2 space-y-2"><button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-2 py-1 mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)] hover:text-[var(--ink-1)]"><span>{title}</span><span>{items.length} · {open ? "hide" : "show"}</span></button>{open && items.map((p) => <PatternRow key={p.id} pattern={p} hasMeasurement={patterns.some((q) => !q.isReference && q.id !== p.id)} onChange={(next) => updatePattern(p.id, next)} onRemove={() => removePattern(p.id)} onNormalize={() => normalizePattern(p.id)} onToggleReference={() => toggleReference(p.id)} />)}</div>;
}

function EmptyState() {
    return <div className="surface p-5 text-center text-sm text-[var(--ink-2)]"><div className="mono text-[11px] uppercase tracking-widest text-[var(--ink-3)] mb-2">no patterns</div>Drop a measurement (<span className="mono text-[var(--amber)]">.xy</span>, <span className="mono text-[var(--amber)]">.raw</span>) or a reference (<span className="mono text-[var(--teal)]">.pks</span>, <span className="mono text-[var(--teal)]">.txt</span>, <span className="mono text-[var(--teal)]">.csv</span>) — references auto-plot as droplines.</div>;
}

function Legend() {
    return <div className="surface p-4 space-y-2"><div className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">quick reference</div><ul className="text-xs text-[var(--ink-2)] space-y-1.5 leading-relaxed"><li><span className="text-[var(--amber)] mono">auto stack</span> — offsets visible patterns vertically</li><li><span className="mono" style={{ color: "#ff5a5f" }}>sticks</span> — reference pattern as droplines</li><li><span className="text-[var(--teal)] mono">convert</span> — duplicate Cu/Mo/Co 2θ via Bragg law</li><li><span className="text-[var(--violet)] mono">expand row</span> — sliders and processing controls</li></ul></div>;
}
