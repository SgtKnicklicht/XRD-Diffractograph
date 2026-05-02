"""XRD pattern viewer backend.

Endpoints:
- POST /api/xrd/parse   : upload .xy text, return parsed (x, y) arrays
- POST /api/xrd/smooth  : Savitzky-Golay smoothing
- POST /api/xrd/background : SNIP background subtraction
"""
from __future__ import annotations

import io
import logging
import os
import re
from pathlib import Path
from typing import List, Optional

import numpy as np
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from scipy.signal import savgol_filter
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

app = FastAPI(title="XRD Viewer API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("xrd")


# ------------- models -------------
class ParsedPattern(BaseModel):
    name: str
    x: List[float]
    y: List[float]
    points: int
    x_min: float
    x_max: float
    y_max: float
    is_reference: bool = False
    source_format: str = "xy"


class SmoothRequest(BaseModel):
    y: List[float]
    window: int = Field(11, ge=3, le=501)
    polyorder: int = Field(3, ge=1, le=6)


class BackgroundRequest(BaseModel):
    y: List[float]
    iterations: int = Field(40, ge=1, le=500)


class ProcessedResponse(BaseModel):
    y: List[float]
    background: Optional[List[float]] = None


# ------------- helpers -------------
_NUM_RE = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


def parse_xy_text(text: str) -> tuple[list[float], list[float]]:
    """Parse a .xy / .xye / two-column text file.

    Skips comments (starting with #, %, ; or non-numeric lines). Accepts
    whitespace, comma or tab separators. If a line has more than 2 numeric
    columns we take the first two.
    """
    xs: list[float] = []
    ys: list[float] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line[0] in "#%;!*/" or line.lower().startswith(("xydata", "data", "name", "x", "2theta")):
            # skip header lines that don't start with a digit/sign
            if not (line[0].isdigit() or line[0] in "+-."):
                continue
        nums = _NUM_RE.findall(line)
        if len(nums) < 2:
            continue
        try:
            x = float(nums[0])
            y = float(nums[1])
        except ValueError:
            continue
        xs.append(x)
        ys.append(y)
    return xs, ys


def parse_pks(text: str) -> tuple[list[float], list[float]]:
    """STOE/Match! Peak File (.pks).

    Data rows have six numeric columns: D  2Theta  I(rel)  I(abs)  I(int)  FWHM.
    We take 2Theta (col 2) and I(rel) (col 3). Data rows always start with a
    digit (after trimming); anything else is treated as header/comment.
    """
    xs: list[float] = []
    ys: list[float] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if not (line[0].isdigit() or line[0] in "+-."):
            continue
        nums = _NUM_RE.findall(line)
        if len(nums) < 6:  # real data rows have exactly 6 columns
            continue
        try:
            two_theta = float(nums[1])
            i_rel = float(nums[2])
        except ValueError:
            continue
        if not (0 < two_theta < 180) or i_rel < 0:
            continue
        xs.append(two_theta)
        ys.append(i_rel)
    return xs, ys


def parse_stoe_theo(text: str) -> tuple[list[float], list[float]]:
    """STOE WinXPOW Theo output.

    Data rows: D  2Theta  H  K  L  Mult  I/Imax  F  LP  Absc
    Some rows contain 'absent' and must be skipped.
    We take 2Theta (col 2) and I/Imax (col 7).
    """
    xs: list[float] = []
    ys: list[float] = []
    in_data = False
    for raw in text.splitlines():
        line = raw.strip()
        if "2Theta" in line and "H" in line and "K" in line and "L" in line and "I/Imax" in line:
            in_data = True
            continue
        if not in_data or not line or "absent" in line.lower():
            continue
        if not (line[0].isdigit() or line[0] in "+-."):
            continue
        parts = line.split()
        if len(parts) < 10:  # real rows have 10 columns
            continue
        try:
            two_theta = float(parts[1])
            i_rel = float(parts[6])
        except ValueError:
            continue
        if not (0 < two_theta < 180) or i_rel < 0:
            continue
        xs.append(two_theta)
        ys.append(i_rel)
    return xs, ys


def parse_semicolon_csv(text: str) -> tuple[list[float], list[float]]:
    """European-locale CSV (; delimited, comma as decimal separator)."""
    xs: list[float] = []
    ys: list[float] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or ";" not in line:
            continue
        a, _, b = line.partition(";")
        a = a.strip().replace(",", ".")
        b = b.split(";")[0].strip().replace(",", ".")
        try:
            x = float(a)
            y = float(b)
        except ValueError:
            continue
        if not (-10 < x < 200):
            continue
        xs.append(x)
        ys.append(y)
    return xs, ys


def detect_and_parse(filename: str, text: str) -> tuple[list[float], list[float], str, bool]:
    """Auto-detect format. Returns (x, y, format_label, is_reference).

    Reference files are peak lists (usually sparse, discrete 2θ values).
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    head = text[:8192].lower()

    # 1) STOE / Match! peak file
    if ext == "pks" or "pks_" in head or "match!" in head:
        xs, ys = parse_pks(text)
        if len(xs) >= 2:
            return xs, ys, "pks", True

    # 2) STOE WinXPOW Theo
    if "winxpow" in head or "stoe powder" in head:
        xs, ys = parse_stoe_theo(text)
        if len(xs) >= 2:
            return xs, ys, "stoe-theo", True

    # 3) Semicolon CSV (European)
    if ext == "csv" or (";" in text[:512] and "," in text[:512]):
        xs, ys = parse_semicolon_csv(text)
        if len(xs) >= 2:
            is_ref = len(xs) <= 200  # sparse list → reference
            return xs, ys, "csv", is_ref

    # 4) default .xy / two-column
    xs, ys = parse_xy_text(text)
    # If few points, treat as reference
    is_ref = 0 < len(xs) <= 150
    return xs, ys, "xy", is_ref


def snip_background(y: np.ndarray, iterations: int = 40) -> np.ndarray:
    """SNIP (Statistics-sensitive Non-linear Iterative Peak-clipping) algorithm.

    Standard XRD background estimator. Operates on log-log-square transformed
    intensity then transforms back.
    """
    y = np.asarray(y, dtype=float)
    # avoid log of non-positive
    offset = max(0.0, -y.min() + 1.0)
    v = np.log(np.log(np.sqrt(y + offset) + 1.0) + 1.0)
    n = len(v)
    w = v.copy()
    max_p = min(iterations, (n - 1) // 2)
    for p in range(1, max_p + 1):
        a = w[p:n - p]
        b = (w[: n - 2 * p] + w[2 * p:]) / 2.0
        w[p:n - p] = np.minimum(a, b)
    bg = (np.exp(np.exp(w) - 1.0) - 1.0) ** 2 - offset
    return bg


# ------------- routes -------------
@api.get("/")
async def root():
    return {"service": "xrd-viewer", "status": "ok"}


@api.post("/xrd/parse", response_model=ParsedPattern)
async def parse_file(file: UploadFile = File(...)):
    try:
        raw = await file.read()
        text = raw.decode("utf-8", errors="ignore")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"could not read file: {exc}")

    filename = file.filename or "pattern"
    xs, ys, fmt, is_ref = detect_and_parse(filename, text)
    if len(xs) < 2:
        raise HTTPException(
            status_code=400,
            detail=(
                "No numeric two-column data found. Supported: .xy, .xye, .txt, "
                ".csv, .pks (STOE/Match!), WinXPOW Theo output."
            ),
        )

    name = filename.rsplit(".", 1)[0]
    return ParsedPattern(
        name=name,
        x=xs,
        y=ys,
        points=len(xs),
        x_min=min(xs),
        x_max=max(xs),
        y_max=max(ys),
        is_reference=is_ref,
        source_format=fmt,
    )


@api.post("/xrd/smooth", response_model=ProcessedResponse)
async def smooth(req: SmoothRequest):
    y = np.asarray(req.y, dtype=float)
    if len(y) < req.window:
        raise HTTPException(
            status_code=400,
            detail=f"window ({req.window}) larger than data ({len(y)})",
        )
    window = req.window if req.window % 2 == 1 else req.window + 1
    polyorder = min(req.polyorder, window - 1)
    try:
        ys = savgol_filter(y, window_length=window, polyorder=polyorder)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc))
    return ProcessedResponse(y=ys.tolist())


@api.post("/xrd/background", response_model=ProcessedResponse)
async def background(req: BackgroundRequest):
    y = np.asarray(req.y, dtype=float)
    if len(y) < 5:
        raise HTTPException(status_code=400, detail="not enough points")
    bg = snip_background(y, iterations=req.iterations)
    corrected = y - bg
    return ProcessedResponse(y=corrected.tolist(), background=bg.tolist())


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
