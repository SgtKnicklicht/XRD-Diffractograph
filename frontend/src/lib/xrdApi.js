import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;

export async function parseFile(file) {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await axios.post(`${API}/xrd/parse`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
}

export async function smoothPattern(y, window = 11, polyorder = 3) {
    const { data } = await axios.post(`${API}/xrd/smooth`, { y, window, polyorder });
    return data.y;
}

export const PATTERN_COLORS = ["#f5b94a", "#ffffff", "#c9d1de", "#ff7a6b", "#b08bff", "#a3e635", "#7fd1ff", "#ffd166"];

export const THEMED_PLOT_PALETTES = {
    dark: {
        independent: {
            dark: { label: "dark", colors: ["#f5b94a", "#7fd1ff", "#ff7a6b", "#b08bff", "#a3e635", "#ffd166", "#f368e0", "#ffffff"] },
            paper: { label: "paper", colors: ["#f8fafc", "#f97316", "#38bdf8", "#22c55e", "#f43f5e", "#a78bfa", "#facc15", "#2dd4bf"] },
            vivid: { label: "vivid", colors: ["#00e5ff", "#ffea00", "#ff4081", "#76ff03", "#ff9100", "#b388ff", "#64ffda", "#eeeeee"] },
            warm: { label: "warm", colors: ["#fff7ad", "#ffd166", "#f59e0b", "#f97316", "#ef4444", "#fb7185", "#fdba74", "#ffffff"] },
        },
        gradient: {
            plasma: { label: "plasma", colors: ["#0d0887", "#4c02a1", "#7e03a8", "#a82296", "#cb4679", "#e56b5d", "#f89441", "#fdc328", "#f0f921"] },
            viridis: { label: "viridis", colors: ["#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"] },
            blueYellow: { label: "blue→yellow", colors: ["#1d4ed8", "#2563eb", "#0284c7", "#0891b2", "#0d9488", "#65a30d", "#ca8a04", "#facc15"] },
        },
    },
    light: {
        independent: {
            paper: { label: "paper", colors: ["#111827", "#dc2626", "#2563eb", "#059669", "#d97706", "#7c3aed", "#4b5563", "#0891b2"] },
            clean: { label: "clean", colors: ["#1f2937", "#e11d48", "#2563eb", "#16a34a", "#ea580c", "#9333ea", "#0f766e", "#ca8a04"] },
            muted: { label: "muted", colors: ["#334155", "#991b1b", "#1e40af", "#166534", "#9a3412", "#581c87", "#155e75", "#854d0e"] },
            origin: { label: "origin", colors: ["#000000", "#ff0000", "#0000ff", "#008000", "#ff00ff", "#00a0a0", "#ffa500", "#666666"] },
        },
        gradient: {
            plasma: { label: "plasma", colors: ["#0d0887", "#4c02a1", "#7e03a8", "#a82296", "#cb4679", "#e56b5d", "#f89441", "#fdc328", "#f0f921"] },
            viridis: { label: "viridis", colors: ["#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"] },
            blueYellow: { label: "blue→yellow", colors: ["#1d4ed8", "#2563eb", "#0284c7", "#0891b2", "#0d9488", "#65a30d", "#ca8a04", "#facc15"] },
        },
    },
};

export const PLOT_PALETTES = THEMED_PLOT_PALETTES.dark.independent;

function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function rgbToHex([r, g, b]) {
    return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

export function samplePalette(colors, count) {
    if (count <= 0) return [];
    if (count === 1) return [colors[0]];
    const rgbs = colors.map(hexToRgb);
    return Array.from({ length: count }, (_, i) => {
        const t = i / (count - 1);
        const scaled = t * (rgbs.length - 1);
        const left = Math.floor(scaled);
        const right = Math.min(rgbs.length - 1, left + 1);
        const f = scaled - left;
        return rgbToHex(rgbs[left].map((v, c) => v + (rgbs[right][c] - v) * f));
    });
}

export const XRAY_WAVELENGTHS = {
    "Cu Kα1": 1.5406,
    "Cu Kα avg": 1.5418,
    "Mo Kα1": 0.7093,
    "Co Kα1": 1.78897,
};

export function convertTwoTheta(twoTheta, fromLambda, toLambda) {
    const thetaRad = (twoTheta * Math.PI) / 360;
    const sinTheta = Math.sin(thetaRad);
    if (!Number.isFinite(sinTheta) || sinTheta <= 0) return null;
    const dSpacing = fromLambda / (2 * sinTheta);
    const nextSinTheta = toLambda / (2 * dSpacing);
    if (!Number.isFinite(nextSinTheta) || nextSinTheta <= 0 || nextSinTheta > 1) return null;
    return (2 * Math.asin(nextSinTheta) * 180) / Math.PI;
}

export function convertPatternRadiation(pattern, fromLambda, toLambda) {
    const x = [];
    const y = [];
    const sourceY = pattern.processed?.y ?? pattern.y;
    for (let i = 0; i < pattern.x.length; i++) {
        const converted = convertTwoTheta(pattern.x[i], fromLambda, toLambda);
        if (converted === null) continue;
        x.push(converted);
        y.push(sourceY[i]);
    }
    return { x, y, dropped: pattern.x.length - x.length };
}
