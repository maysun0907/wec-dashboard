"""Download a car-model image, optionally remove the background, and save
to ``frontend/public/cars/{slug}.png``.

Usage::

    .venv/bin/python -m app.fetch_car_image <slug> <url>
    .venv/bin/python -m app.fetch_car_image ferrari-499p https://...

Background removal uses the optional ``rembg`` package — install with
``pip install rembg onnxruntime`` (heavy: pulls a ~170MB model on first
run). Without it, the image is saved as-is.

Skips download if the destination already exists; pass ``--force`` to
overwrite.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import httpx

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_OUT_DIR = _REPO_ROOT / "frontend" / "public" / "cars"


def _try_rembg(data: bytes) -> bytes | None:
    """Run rembg on the image bytes if the package is available, else None."""
    try:
        from rembg import remove  # type: ignore[import-not-found]
    except ImportError:
        return None
    return remove(data)


def fetch(slug: str, url: str, force: bool = False) -> Path:
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("Invalid car-model slug")
    out = _OUT_DIR / f"{slug}.png"
    if out.exists() and not force:
        raise FileExistsError(f"{out} exists — pass --force to overwrite")
    out.parent.mkdir(parents=True, exist_ok=True)

    print(f"GET {url}")
    with httpx.Client(follow_redirects=True, timeout=30.0) as client:
        resp = client.get(url, headers={"User-Agent": "wec-dashboard/0.1"})
        resp.raise_for_status()
    raw = resp.content

    cut = _try_rembg(raw)
    if cut is None:
        print("rembg not installed — saving original (no background removal)")
        out.write_bytes(raw)
    else:
        print(f"rembg removed background ({len(raw)} → {len(cut)} bytes)")
        out.write_bytes(cut)
    print(f"wrote {out}")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.fetch_car_image")
    parser.add_argument("slug", help="car-model slug, e.g. ferrari-499p")
    parser.add_argument("url", help="source image URL")
    parser.add_argument(
        "--force", action="store_true", help="overwrite existing file"
    )
    args = parser.parse_args()
    try:
        fetch(args.slug, args.url, force=args.force)
    except FileExistsError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
