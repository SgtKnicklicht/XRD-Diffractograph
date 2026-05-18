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

// 8-color palette tuned for dark backgrounds — amber primary for measurements,
// then distinct hues avoiding the reference palette start (red/teal)
export const PATTERN_COLORS = [
    "#f5b94a", // amber
    "#ffffff", // bright white
    "#c9d1de", // warm grey
    "#ff7a6b", // coral
    "#b08bff", // violet
    "#a3e635", // lime
    "#7fd1ff", // sky
    "#ffd166", // sand
];

export const PLOT_PALETTES = {
    dark: {
        label: "dark",
        colors: ["#f5b94a", "#7fd1ff", "#ff7a6b", "#b08bff", "#a3e635", "#ffd166", "#f368e0", "#ffffff"],
    },
    publication: {
        label: "paper",
        colors: ["#111827", "#dc2626", "#2563eb", "#059669", "#d97706", "#7c3aed", "#4b5563", "#0891b2"],
    },
    sequential: {
        label: "series",
        colors: ["#7dd3fc", "#38bdf8", "#0ea5e9", "#2563eb", "#4f46e5", "#7c3aed", "#c026d3", "#e11d48"],
    },
    warm: {
        label: "warm",
        colors: ["#fff7ad", "#ffd166", "#f59e0b", "#f97316", "#ef4444", "#be123c", "#9f1239", "#ffffff"],
    },
};

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
