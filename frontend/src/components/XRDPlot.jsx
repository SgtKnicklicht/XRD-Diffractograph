import { useEffect, useRef } from "react";
import Plotly from "plotly.js-basic-dist-min";

/* Builds traces. Reference / dropline patterns are rendered as a single
   scatter trace with NaN-separated segments, one vertical line per peak. */
function buildTraces(patterns) {
    const traces = [];
    for (const p of patterns) {
        if (!p.visible) continue;
        const yShown = (p.processed?.y ?? p.y).map(
            (v) => v * p.scale + p.offset
        );
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

const DARK_LAYOUT = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "JetBrains Mono, monospace", color: "#c9d1de", size: 12 },
    margin: { l: 70, r: 30, t: 30, b: 60 },
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
    dragmode: "zoom",
};

const PLOT_CONFIG = {
    displaylogo: false,
    responsive: true,
    scrollZoom: true,
    toImageButtonOptions: {
        format: "png",
        filename: "xrd-pattern",
        height: 720,
        width: 1280,
        scale: 2,
    },
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
};

export default function XRDPlot({ patterns, plotRef }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const traces = buildTraces(patterns);
        Plotly.react(containerRef.current, traces, DARK_LAYOUT, PLOT_CONFIG);
        if (plotRef) plotRef.current = containerRef.current;
    }, [patterns, plotRef]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(() => Plotly.Plots.resize(el));
        ro.observe(el);

        // middle-mouse-button → reset zoom (autoscale both axes)
        const onMouseDown = (e) => {
            if (e.button === 1) {
                e.preventDefault();
                Plotly.relayout(el, {
                    "xaxis.autorange": true,
                    "yaxis.autorange": true,
                });
            }
        };
        // prevent the browser's default middle-click scroll-anchor behaviour
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

    return (
        <div
            data-testid="xrd-plot"
            ref={containerRef}
            className="w-full h-full"
            style={{ minHeight: 480 }}
        />
    );
}
