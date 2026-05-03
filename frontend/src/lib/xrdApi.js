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
