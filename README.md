# Diffractograph

A hostable powder XRD viewer for measured patterns and reference peak lists.

The app parses `.xy`, `.xye`, `.txt`, `.dat`, `.csv`, `.pks`, WinXPOW text exports, and STOE `RAW_1.06` files. It plots measurements and reference sticks, supports smoothing, vertical stacking, palette changes, radiation conversion, and PNG/CSV export.

## Deploy

This repository is structured as one web service. The React frontend is built once and copied into the FastAPI backend, so production hosting only needs one running process.

### Render

1. Create a new Render Web Service from this GitHub repository.
2. Render will detect `render.yaml`.
3. Deploy.

### Docker

```bash
docker build -t diffractograph .
docker run --rm -p 8000:8000 diffractograph
```

Open `http://localhost:8000`.

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --reload
```

Frontend:

```bash
cd frontend
corepack enable
corepack yarn install --frozen-lockfile
$env:REACT_APP_BACKEND_URL = "http://localhost:8000"
corepack yarn start
```

## Environment

- `PORT`: service port in production. Defaults to `8000` in the Docker image.
- `CORS_ORIGINS`: comma-separated allowed origins for split frontend/backend development. Defaults to `*`.
