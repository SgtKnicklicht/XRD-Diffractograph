const NUM_RE = /[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g;

function parseXYText(text) {
    const x = [];
    const y = [];

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if ("#%;!*/".includes(line[0]) && !(line[0] >= "0" && line[0] <= "9") && !"+-.".includes(line[0])) {
            continue;
        }

        const nums = line.match(NUM_RE);
        if (!nums || nums.length < 2) continue;

        const xx = Number(nums[0]);
        const yy = Number(nums[1]);
        if (!Number.isFinite(xx) || !Number.isFinite(yy)) continue;

        x.push(xx);
        y.push(yy);
    }

    return { x, y };
}

function parsePKS(text) {
    const x = [];
    const y = [];

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || (!/^[+\-.0-9]/.test(line))) continue;

        const nums = line.match(NUM_RE);
        if (!nums || nums.length < 6) continue;

        const twoTheta = Number(nums[1]);
        const intensity = Number(nums[2]);
        if (!Number.isFinite(twoTheta) || !Number.isFinite(intensity)) continue;
        if (twoTheta <= 0 || twoTheta >= 180 || intensity < 0) continue;

        x.push(twoTheta);
        y.push(intensity);
    }

    return { x, y };
}

function parseStoeTheo(text) {
    const x = [];
    const y = [];
    let inData = false;

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.includes("2Theta") && line.includes("H") && line.includes("K") && line.includes("L") && line.includes("I/Imax")) {
            inData = true;
            continue;
        }
        if (!inData || !line || line.toLowerCase().includes("absent") || !/^[+\-.0-9]/.test(line)) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 10) continue;

        const twoTheta = Number(parts[1]);
        const intensity = Number(parts[6]);
        if (!Number.isFinite(twoTheta) || !Number.isFinite(intensity)) continue;
        if (twoTheta <= 0 || twoTheta >= 180 || intensity < 0) continue;

        x.push(twoTheta);
        y.push(intensity);
    }

    return { x, y };
}

function parseSemicolonCSV(text) {
    const x = [];
    const y = [];

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || !line.includes(";")) continue;

        const [a, b] = line.split(";");
        const xx = Number((a || "").trim().replace(",", "."));
        const yy = Number((b || "").trim().replace(",", "."));
        if (!Number.isFinite(xx) || !Number.isFinite(yy)) continue;
        if (xx <= -10 || xx >= 200) continue;

        x.push(xx);
        y.push(yy);
    }

    return { x, y };
}

function parseStoeRaw(buffer) {
    const bytes = new Uint8Array(buffer);
    const magic = new TextDecoder("ascii").decode(bytes.slice(0, 8));
    if (bytes.length < 32 || magic !== "RAW_1.06") return { x: [], y: [] };

    const view = new DataView(buffer);
    const readF32 = (offset) => {
        if (offset < 0 || offset + 4 > bytes.length) return null;
        const value = view.getFloat32(offset, true);
        return Number.isFinite(value) ? value : null;
    };

    let step = readF32(342);
    if (!step || step <= 0.001 || step >= 1.0) {
        step = null;
        for (let offset = 256; offset < Math.min(2000, bytes.length) - 4; offset += 1) {
            const value = readF32(offset);
            if (value && value > 0.001 && value < 1.0 && Math.abs(value - Number(value.toFixed(4))) < 1e-7) {
                step = value;
                break;
            }
        }
    }
    if (!step) step = 0.015;

    let endAngle = readF32(0x218);
    if (!endAngle || endAngle <= 1.0 || endAngle >= 180.0) {
        endAngle = null;
        for (let offset = 0x200; offset < Math.min(0x400, bytes.length) - 4; offset += 4) {
            const value = readF32(offset);
            if (value && value > 5.0 && value <= 180.0 && Math.abs(value - Number(value.toFixed(3))) < 1e-5) {
                endAngle = value;
                break;
            }
        }
    }
    if (!endAngle) endAngle = 60.0;

    let data = [];
    for (const headerSize of [2948, 2944, 2048, 1024]) {
        if (headerSize >= bytes.length) continue;
        const nbytes = bytes.length - headerSize;
        if (nbytes % 4 !== 0) continue;

        const values = [];
        let min = Infinity;
        let max = -Infinity;
        for (let offset = headerSize; offset < bytes.length; offset += 4) {
            const value = view.getInt32(offset, true);
            values.push(value);
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
        if (values.length < 100 || min < -10 || max > 1_000_000_000) continue;
        data = values;
        break;
    }

    let last = data.length - 1;
    while (last >= 0 && data[last] === 0) last -= 1;
    data = data.slice(0, last + 1);
    if (!data.length) return { x: [], y: [] };

    const startAngle = endAngle - data.length * step;
    return {
        x: data.map((_, index) => startAngle + index * step),
        y: data.map((value) => Number(value)),
    };
}

function detectAndParse(filename, buffer) {
    const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
    const bytes = new Uint8Array(buffer);

    if (ext === "raw" || new TextDecoder("ascii").decode(bytes.slice(0, 8)) === "RAW_1.06") {
        const parsed = parseStoeRaw(buffer);
        if (parsed.x.length >= 2) return { ...parsed, source_format: "stoe-raw", is_reference: false };
    }

    const text = new TextDecoder("utf-8").decode(bytes);
    const head = text.slice(0, 8192).toLowerCase();

    if (ext === "pks" || head.includes("pks_") || head.includes("match!")) {
        const parsed = parsePKS(text);
        if (parsed.x.length >= 2) return { ...parsed, source_format: "pks", is_reference: true };
    }

    if (head.includes("winxpow") || head.includes("stoe powder")) {
        const parsed = parseStoeTheo(text);
        if (parsed.x.length >= 2) return { ...parsed, source_format: "stoe-theo", is_reference: true };
    }

    if (ext === "csv" || (text.slice(0, 512).includes(";") && text.slice(0, 512).includes(","))) {
        const parsed = parseSemicolonCSV(text);
        if (parsed.x.length >= 2) return { ...parsed, source_format: "csv", is_reference: parsed.x.length <= 200 };
    }

    const parsed = parseXYText(text);
    return { ...parsed, source_format: "xy", is_reference: parsed.x.length > 0 && parsed.x.length <= 150 };
}

export async function parseFile(file) {
    const buffer = await file.arrayBuffer();
    const parsed = detectAndParse(file.name || "pattern", buffer);

    if (parsed.x.length < 2) {
        throw new Error("No numeric XRD data found. Supported: .xy, .xye, .txt, .csv, .pks, .raw, WinXPOW Theo output.");
    }

    const name = (file.name || "pattern").replace(/\.[^.]+$/, "");
    const yMax = Math.max(...parsed.y);

    return {
        name,
        x: parsed.x,
        y: parsed.y,
        points: parsed.x.length,
        x_min: Math.min(...parsed.x),
        x_max: Math.max(...parsed.x),
        y_max: yMax,
        is_reference: parsed.is_reference,
        source_format: parsed.source_format,
    };
}

function solveLinearSystem(matrix, vector) {
    const n = vector.length;
    const a = matrix.map((row, index) => [...row, vector[index]]);

    for (let col = 0; col < n; col += 1) {
        let pivot = col;
        for (let row = col + 1; row < n; row += 1) {
            if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
        }
        if (Math.abs(a[pivot][col]) < 1e-12) throw new Error("smoothing matrix is singular");
        [a[col], a[pivot]] = [a[pivot], a[col]];

        const div = a[col][col];
        for (let j = col; j <= n; j += 1) a[col][j] /= div;

        for (let row = 0; row < n; row += 1) {
            if (row === col) continue;
            const factor = a[row][col];
            for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
        }
    }

    return a.map((row) => row[n]);
}

function savitzkyGolayWeights(window, polyorder) {
    const half = Math.floor(window / 2);
    const powers = Array.from({ length: polyorder + 1 }, (_, power) => power);
    const normal = powers.map((rowPower) =>
        powers.map((colPower) => {
            let sum = 0;
            for (let x = -half; x <= half; x += 1) sum += x ** (rowPower + colPower);
            return sum;
        })
    );

    const rhs = [1, ...Array(polyorder).fill(0)];
    const coeffs = solveLinearSystem(normal, rhs);
    return Array.from({ length: window }, (_, index) => {
        const x = index - half;
        return coeffs.reduce((sum, coeff, power) => sum + coeff * x ** power, 0);
    });
}

export async function smoothPattern(y, window = 11, polyorder = 3) {
    if (!Array.isArray(y) || y.length === 0) throw new Error("no data to smooth");

    let actualWindow = window % 2 === 1 ? window : window + 1;
    actualWindow = Math.max(3, Math.min(actualWindow, y.length % 2 === 1 ? y.length : y.length - 1));
    if (actualWindow < 3) throw new Error(`window (${window}) larger than data (${y.length})`);

    const actualPolyorder = Math.min(polyorder, actualWindow - 1);
    const half = Math.floor(actualWindow / 2);
    const weights = savitzkyGolayWeights(actualWindow, actualPolyorder);

    return y.map((_, index) => {
        let sum = 0;
        for (let offset = -half; offset <= half; offset += 1) {
            const sourceIndex = Math.max(0, Math.min(y.length - 1, index + offset));
            sum += Number(y[sourceIndex]) * weights[offset + half];
        }
        return sum;
    });
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
    for (let i = 0; i < pattern.x.length; i += 1) {
        const converted = convertTwoTheta(pattern.x[i], fromLambda, toLambda);
        if (converted === null) continue;
        x.push(converted);
        y.push(sourceY[i]);
    }
    return { x, y, dropped: pattern.x.length - x.length };
}
