#!/usr/bin/env python3
"""
Erzeugt die App-Symbole fuer den Homebildschirm aus assets/appicon.jpg.

Motiv: gekreuzte Runenschwerter mit Krone (das vom Spieler gelieferte
Icon). Frueher wurde hier eine Arena gezeichnet — jetzt wird nur noch
das Quellbild auf die gebrauchten Groessen gerechnet.

Zwei Fassungen:
  icon-<n>.png            normal, Bild fuellt das ganze Feld
  icon-512-maskable.png   fuer Android: dort schneidet das System das
                          Symbol in eine beliebige Form. Alles Wichtige
                          muss in den mittleren ~80 % liegen, also wird
                          das Bild hier verkleinert auf einen Hintergrund
                          gesetzt, damit Krone und Schwertspitzen nicht
                          abgeschnitten werden.

Aufruf:  python3 tools/icons.py
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "appicon.jpg"
OUT = ROOT / "site"


def square(img):
    """Mittig auf ein Quadrat beschneiden, falls noetig."""
    w, h = img.size
    if w == h:
        return img
    s = min(w, h)
    return img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))


def bg_color(img):
    """Hintergrundfarbe fuer die maskable-Fassung: Mittel der vier Ecken."""
    px = img.load()
    w, h = img.size
    pts = [px[3, 3], px[w - 4, 3], px[3, h - 4], px[w - 4, h - 4]]
    n = len(pts)
    return tuple(sum(c[i] for c in pts) // n for i in range(3))


def full(img, px):
    return img.resize((px, px), Image.LANCZOS)


def maskable(img, px, inner=0.80):
    """Bild verkleinert auf einen vollflaechigen Hintergrund setzen."""
    canvas = Image.new("RGB", (px, px), bg_color(img))
    inner_px = round(px * inner)
    small = img.resize((inner_px, inner_px), Image.LANCZOS)
    off = (px - inner_px) // 2
    canvas.paste(small, (off, off))
    return canvas


def main():
    if not SRC.is_file():
        raise SystemExit(f"Quellbild fehlt: {SRC.relative_to(ROOT)}")
    OUT.mkdir(parents=True, exist_ok=True)
    src = square(Image.open(SRC).convert("RGB"))

    jobs = [
        ("icon-180.png", lambda: full(src, 180)),     # Apple: Homebildschirm iPhone
        ("icon-192.png", lambda: full(src, 192)),
        ("icon-512.png", lambda: full(src, 512)),
        ("icon-512-maskable.png", lambda: maskable(src, 512)),
        ("favicon-32.png", lambda: full(src, 32)),
    ]
    for name, make in jobs:
        img = make()
        dest = OUT / name
        img.save(dest, "PNG", optimize=True)
        print(f"{dest.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}  "
              f"{dest.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
