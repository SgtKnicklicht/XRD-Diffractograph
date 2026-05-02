import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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

export async function subtractBackground(y, iterations = 40) {
    const { data } = await axios.post(`${API}/xrd/background`, { y, iterations });
    return data; // { y, background }
}

// 8-color palette tuned for dark backgrounds
export const PATTERN_COLORS = [
    "#f5b94a", // amber
    "#4dd9c8", // teal
    "#ff7a6b", // coral
    "#b08bff", // violet
    "#7fd1ff", // sky
    "#a3e635", // lime
    "#f5a3d4", // pink
    "#ffd166", // sand
];
