import { useEffect, useRef } from "react";
import Plotly from "plotly.js-basic-dist-min";

function buildTraces(patterns) {
    const traces = [];
    for (const p of patterns) {
        if (!p.visible) continue;
        const yShown = (p.processed?.y ?? p.y).map((v) => v * p.scale + p.offset);
        if (p.mode === "droplines") {
            const xs = [];
            const ys = [];
            const baseline = p.offset;
            for (let i = 0; i < p.x.length; i++) {
                xs.push(p.x[i], p.x[i], NaN);
                ys.push(baseline, yShown[i], NaN);
            }
            traces.push({
                type: "scatter",
                mode: "lines",
                name: p.name,
                x: xs,
                y: ys,
                line: { color: p.color, width: 1.4 },
                hovertemplate: `${p.name}<br>2θ = %{x:.3f}°<br>I = %{y:.2f}<extra></extra>`,
                connectgaps: false,
            });
        } else {
            traces.push({
                type: "scatter",
                mode: "lines",
                name: p.name,
                x: p.x,
                y: yShown,
                line: { color: p.color, width: 1.4, shape: "spline", smoothing: 0.3 },
                hovertemplate: `${p.name}<br>2θ = %{x:.3f}°<br>I = %{y:.2f}<extra></extra>`,
            });
        }
    }
    return traces;
}

const COMMON_LAYOUT = {
    margin: { l: 70, r: 30, t: 30, b: 60 },
    dragmode: "zoom",
};

const THEME_LAYOUTS = {
    dark: {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { family: "JetBrains Mono, monospace", color: "#c9d1de", size: 12 },
        xaxis: {
            title: { text: "2θ  /  degrees", font: { size: 13, color: "#8e98ac" } },
            gridcolor: "rgba(255,255,255,0.05)",
            zerolinecolor: "rgba(255,255,255,0.08)",
            linecolor: "#2a3142",
            ticks: "outside",
            tickcolor: "#3a4256",
            mirror: true,
            showline: true,
        },
        yaxis: {
            title: { text: "Intensity  /  a.u.", font: { size: 13, color: "#8e98ac" } },
            gridcolor: "rgba(255,255,255,0.05)",
            zerolinecolor: "rgba(255,255,255,0.08)",
            linecolor: "#2a3142",
            ticks: "outside",
            tickcolor: "#3a4256",
            mirror: true,
            showline: true,
        },
        legend: {
            bgcolor: "rgba(17,21,31,0.85)",
            bordercolor: "#2a3142",
            borderwidth: 1,
            font: { color: "#f1f4fb", size: 11 },
        },
        hoverlabel: {
            bgcolor: "#11151f",
            bordercolor: "#3a4256",
            font: { color: "#f1f4fb", family: "JetBrains Mono, monospace" },
        },
    },
    light: {
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        font: { family: "JetBrains Mono, monospace", color: "#1f2937", size: 12 },
        xaxis: {
            title: { text: "2θ  /  degrees", font: { size: 13, color: "#4b5563" } },
            gridcolor: "rgba(15,23,42,0.09)",
            zerolinecolor: "rgba(15,23,42,0.18)",
            linecolor: "#94a3b8",
            ticks: "outside",
            tickcolor: "#94a3b8",
            mirror: true,
            showline: true,
        },
        yaxis: {
            title: { text: "Intensity  /  a.u.", font: { size: 13, color: "#4b5563" } },
            gridcolor: "rgba(15,23,42,0.09)",
            zerolinecolor: "rgba(15,23,42,0.18)",
            linecolor: "#94a3b8",
            ticks: "outside",
            tickcolor: "#94a3b8",
            mirror: true,
            showline: true,
        },
        legend: {
            bgcolor: "rgba(255,255,255,0.9)",
            bordercolor: "#cbd5e1",
            borderwidth: 1,
            font: { color: "#111827", size: 11 },
        },
        hoverlabel: {
            bgcolor: "#ffffff",
            bordercolor: "#94a3b8",
            font: { color: "#111827", family: "JetBrains Mono, monospace" },
        },
    },
};

const PLOT_CONFIG = {
    displaylogo: false,
    responsive: true,
    scrollZoom: true,
    toImageButtonOptions: { format: "png", filename: "xrd-pattern", height: 720, width: 1280, scale: 2 },
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
};

const ASPECT_RATIOS = { "21:9": 21 / 9, "16:9": 16 / 9, "4:3": 4 / 3 };

export default function XRDPlot({ patterns, plotRef, aspect = "16:9", plotTheme = "dark" }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const traces = buildTraces(patterns);
        const layout = { ...COMMON_LAYOUT, ...(THEME_LAYOUTS[plotTheme] || THEME_LAYOUTS.dark) };
        Plotly.react(containerRef.current, traces, layout, PLOT_CONFIG);
        if (plotRef) plotRef.current = containerRef.current;
    }, [patterns, plotRef, plotTheme]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(() => Plotly.Plots.resize(el));
        ro.observe(el);
        const onMouseDown = (e) => {
            if (e.button === 1) {
                e.preventDefault();
                Plotly.relayout(el, { "xaxis.autorange": true, "yaxis.autorange": true });
            }
        };
        const onAuxClick = (e) => {
            if (e.button === 1) e.preventDefault();
        };
        el.addEventListener("mousedown", onMouseDown);
        el.addEventListener("auxclick", onAuxClick);
        return () => {
            ro.disconnect();
            el.removeEventListener("mousedown", onMouseDown);
            el.removeEventListener("auxclick", onAuxClick);
        };
    }, []);

    useEffect(() => {
        if (containerRef.current) Plotly.Plots.resize(containerRef.current);
    }, [aspect]);

    const style = aspect in ASPECT_RATIOS ? { aspectRatio: ASPECT_RATIOS[aspect], width: "100%" } : { width: "100%", height: "100%", minHeight: 480 };
    return <div data-testid="xrd-plot" ref={containerRef} className="w-full" style={style} />;
}
