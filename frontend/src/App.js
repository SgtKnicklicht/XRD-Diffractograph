import { useMemo, useRef, useState } from "react";
import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Activity, Download, Github, FileText } from "lucide-react";
import Plotly from "plotly.js-basic-dist-min";
import XRDPlot from "./components/XRDPlot";
import PatternRow from "./components/PatternRow";
import Dropzone, { UploadButton } from "./components/Dropzone";
import { PATTERN_COLORS } from "./lib/xrdApi";

let _id = 0;
const nextId = () => `p${++_id}`;

function makePattern(data, index) {
    return {
        id: nextId(),
        name: data.name,
        x: data.x,
        y: data.y,
        points: data.points,
        x_min: data.x_min,
        x_max: data.x_max,
        y_max: data.y_max,
        color: PATTERN_COLORS[index % PATTERN_COLORS.length],
        visible: true,
        mode: "line", // 'line' | 'droplines'
        offset: 0,
        scale: 1,
        processed: null,
        smoothWindow: 11,
        bgIterations: 40,
    };
}

export default function App() {
    const [patterns, setPatterns] = useState([]);
    const plotRef = useRef(null);

    const addPattern = (data) =>
        setPatterns((prev) => [...prev, makePattern(data, prev.length)]);

    const updatePattern = (id, next) =>
        setPatterns((prev) => prev.map((p) => (p.id === id ? next : p)));

    const removePattern = (id) =>
        setPatterns((prev) => prev.filter((p) => p.id !== id));

    const totalPoints = useMemo(
        () => patterns.reduce((s, p) => s + p.points, 0),
        [patterns]
    );

    const handleExportPng = async () => {
        if (!plotRef.current) return;
        try {
            await Plotly.downloadImage(plotRef.current, {
                format: "png",
                filename: "xrd-pattern",
                width: 1600,
                height: 900,
                scale: 2,
            });
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
        const lines = ["pattern,2theta,intensity"];
        for (const p of patterns) {
            const ys = p.processed?.y ?? p.y;
            for (let i = 0; i < p.x.length; i++) {
                lines.push(`${p.name},${p.x[i]},${ys[i]}`);
            }
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
            <Toaster
                richColors
                theme="dark"
                position="top-right"
                toastOptions={{
                    style: {
                        background: "var(--bg-1)",
                        border: "1px solid var(--line)",
                        color: "var(--ink-0)",
                        fontFamily: "Manrope, sans-serif",
                    },
                }}
            />

            {/* header */}
            <header className="border-b border-[var(--line-soft)] backdrop-blur-md bg-[rgba(10,13,20,0.7)] sticky top-0 z-30">
                <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[var(--bg-2)] border border-[var(--line)] flex items-center justify-center">
                            <Activity size={18} className="text-[var(--amber)]" />
                        </div>
                        <div>
                            <div className="font-extrabold text-[15px] tracking-tight leading-tight">
                                Diffractograph
                            </div>
                            <div className="mono text-[10px] text-[var(--ink-3)] uppercase tracking-[0.16em]">
                                powder · xrd · viewer
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="chip" data-testid="patterns-count">
                            {patterns.length} pattern{patterns.length !== 1 ? "s" : ""}
                        </span>
                        <span className="chip hidden md:inline-block" data-testid="points-count">
                            {totalPoints.toLocaleString()} pts
                        </span>
                        <button
                            data-testid="export-csv"
                            onClick={handleExportCsv}
                            className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs mono rounded-lg border border-[var(--line)] text-[var(--ink-1)] hover:text-[var(--ink-0)] hover:border-[var(--ink-3)] transition-all"
                        >
                            <FileText size={13} /> csv
                        </button>
                        <button
                            data-testid="export-png"
                            onClick={handleExportPng}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs mono rounded-lg border border-[var(--line)] text-[var(--ink-1)] hover:text-[var(--ink-0)] hover:border-[var(--ink-3)] transition-all"
                        >
                            <Download size={13} /> png
                        </button>
                        <UploadButton onParsed={addPattern} />
                    </div>
                </div>
            </header>

            {/* main */}
            <main className="max-w-[1600px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
                {/* sidebar */}
                <aside className="space-y-4">
                    <Dropzone onParsed={addPattern} />

                    {patterns.length === 0 ? (
                        <div className="surface p-5 text-center text-sm text-[var(--ink-2)]">
                            <div className="mono text-[11px] uppercase tracking-widest text-[var(--ink-3)] mb-2">
                                no patterns
                            </div>
                            Drop a <span className="mono text-[var(--amber)]">.xy</span>{" "}
                            file to begin. Mark reference patterns as{" "}
                            <span className="mono text-[var(--teal)]">sticks</span>{" "}
                            to display them as droplines.
                        </div>
                    ) : (
                        <div className="space-y-3" data-testid="pattern-list">
                            {patterns.map((p) => (
                                <PatternRow
                                    key={p.id}
                                    pattern={p}
                                    onChange={(next) => updatePattern(p.id, next)}
                                    onRemove={() => removePattern(p.id)}
                                />
                            ))}
                        </div>
                    )}

                    <Legend />
                </aside>

                {/* plot area */}
                <section className="surface p-3 lg:p-5 min-h-[560px] flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <div className="text-[11px] mono uppercase tracking-[0.16em] text-[var(--ink-3)]">
                                Diffractogram
                            </div>
                            <div className="text-[15px] font-semibold">
                                Intensity vs 2θ
                            </div>
                        </div>
                        {patterns.length > 0 && (
                            <div className="mono text-[11px] text-[var(--ink-3)] hidden md:block">
                                scroll-to-zoom · drag-to-pan · double-click to reset
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-h-0">
                        <XRDPlot patterns={patterns} plotRef={plotRef} />
                    </div>
                </section>
            </main>

            <footer className="border-t border-[var(--line-soft)] mt-4">
                <div className="max-w-[1600px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-[11px] mono text-[var(--ink-3)]">
                    <span>
                        savitzky-golay smoothing · snip background ·{" "}
                        <span className="text-[var(--ink-1)]">scipy</span> +{" "}
                        <span className="text-[var(--ink-1)]">plotly</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Github size={11} /> open-source XRD tool
                    </span>
                </div>
            </footer>
        </div>
    );
}

function Legend() {
    return (
        <div className="surface p-4 space-y-2">
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
                quick reference
            </div>
            <ul className="text-xs text-[var(--ink-2)] space-y-1.5 leading-relaxed">
                <li>
                    <span className="text-[var(--amber)] mono">line</span> — continuous
                    measured pattern
                </li>
                <li>
                    <span className="text-[var(--teal)] mono">sticks</span> — reference
                    pattern as droplines
                </li>
                <li>
                    <span className="text-[var(--violet)] mono">y-offset</span> — stack
                    patterns vertically
                </li>
                <li>
                    <span className="text-[var(--coral)] mono">scale</span> — normalise
                    intensities
                </li>
            </ul>
        </div>
    );
}
