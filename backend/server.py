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

    xs, ys = parse_xy_text(text)
    if len(xs) < 2:
        raise HTTPException(
            status_code=400,
            detail=(
                "No numeric two-column data found. Expected lines like "
                "`<2theta> <intensity>`."
            ),
        )

    name = (file.filename or "pattern").rsplit(".", 1)[0]
    return ParsedPattern(
        name=name,
        x=xs,
        y=ys,
        points=len(xs),
        x_min=min(xs),
        x_max=max(xs),
        y_max=max(ys),
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
