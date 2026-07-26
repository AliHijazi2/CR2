#!/usr/bin/env python3
"""
Erzeugt die App-Symbole fuer den Homebildschirm.

Motiv: die Arena von oben — gruenes Feld, blauer Fluss quer, zwei
Bruecken darueber. Das ist der Name des Spiels als Bild und bleibt auch
bei 60 Punkten Kantenlaenge lesbar, weil es nur drei Formen sind.

Zwei Fassungen:
  icon-<n>.png            normal, Motiv fuellt das Feld
  icon-512-maskable.png   fuer Android: dort schneidet das System das
                          Symbol in eine beliebige Form. Alles Wichtige
                          muss in den mittleren 80 % liegen, also ist das
                          Motiv hier kleiner und der Rand breiter.

Aufruf:  python3 tools/icons.py
"""
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "site"

BG_TOP, BG_BOT = (18, 38, 33), (9, 20, 18)
FIELD_TOP, FIELD_BOT = (126, 186, 84), (86, 148, 60)
RIVER_TOP, RIVER_BOT = (62, 122, 200), (36, 78, 152)
BRIDGE = (137, 92, 52)
BRIDGE_HI = (176, 126, 74)
WALL = (108, 120, 106)
RED, BLUE = (255, 90, 60), (76, 125, 255)


def vgrad(size, box, c0, c1, radius):
    """Senkrechter Verlauf, auf eine abgerundete Form beschnitten."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    strip = Image.new("RGB", (1, h))
    sp = strip.load()
    for y in range(h):
        t = y / max(1, h - 1)
        sp[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(c0, c1))
    grad = strip.resize((w, h), Image.BILINEAR)

    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)

    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer.paste(grad, (x0, y0), mask)
    return layer


def build(px, pad_frac):
    """pad_frac: Anteil des Randes. Groesser = mehr Luft (maskable)."""
    S = 1024
    img = vgrad((S, S), (0, 0, S, S), BG_TOP, BG_BOT, 0).convert("RGBA")

    pad = round(S * pad_frac)
    # Arena: hochkant, aber gedrungener als im Spiel (dort 18 zu 32).
    # Bei echtem Spielverhaeltnis bleibt im Quadrat links und rechts zu
    # viel tote Flaeche und das Symbol wirkt bei 60 Punkten verloren.
    ah = S - 2 * pad
    aw = round(ah * 23 / 32)
    ax = (S - aw) // 2
    ay = pad
    r = round(aw * 0.13)

    d = ImageDraw.Draw(img)
    # Bande: ein Rahmen knapp ausserhalb des Feldes
    br = round(aw * 0.055)
    d.rounded_rectangle((ax - br, ay - br, ax + aw + br, ay + ah + br),
                        radius=r + br, fill=WALL + (255,))

    img.alpha_composite(vgrad((S, S), (ax, ay, ax + aw, ay + ah),
                              FIELD_TOP, FIELD_BOT, r))

    # Fluss quer durch die Mitte
    rh = round(ah * 0.115)
    ry = ay + (ah - rh) // 2
    img.alpha_composite(vgrad((S, S), (ax, ry, ax + aw, ry + rh),
                              RIVER_TOP, RIVER_BOT, round(rh * 0.18)))

    # Zwei Bruecken, etwas hoeher als der Fluss breit ist
    d = ImageDraw.Draw(img)
    bw = round(aw * 0.20)
    bh = round(rh * 1.5)
    by = ay + (ah - bh) // 2
    for cx in (ax + round(aw * 0.27), ax + round(aw * 0.73)):
        x0 = cx - bw // 2
        d.rounded_rectangle((x0, by, x0 + bw, by + bh),
                            radius=round(bw * 0.16), fill=BRIDGE + (255,))
        d.rounded_rectangle((x0, by, x0 + bw, by + round(bh * 0.26)),
                            radius=round(bw * 0.12), fill=BRIDGE_HI + (255,))

    # Turmpunkte: drei oben in Gegnerrot, drei unten in Spielerblau.
    # Sie tragen die Lesbarkeit nicht, geben dem Symbol aber Tiefe.
    tr = round(aw * 0.088)
    for side, col in ((0, RED), (1, BLUE)):
        cy_k = ay + round(ah * (0.115 if side == 0 else 0.885))
        cy_s = ay + round(ah * (0.235 if side == 0 else 0.765))
        for cx, cy in ((ax + aw // 2, cy_k),
                       (ax + round(aw * 0.24), cy_s),
                       (ax + round(aw * 0.76), cy_s)):
            d.ellipse((cx - tr, cy - tr, cx + tr, cy + tr), fill=(214, 210, 198, 255))
            d.ellipse((cx - tr, cy - tr, cx + tr, cy + tr), outline=col + (255,),
                      width=max(2, round(tr * 0.34)))

    return img.resize((px, px), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("icon-180.png", 180, 0.085),   # Apple: Homebildschirm iPhone
        ("icon-192.png", 192, 0.085),
        ("icon-512.png", 512, 0.085),
        ("icon-512-maskable.png", 512, 0.20),
        ("favicon-32.png", 32, 0.06),
    ]
    for name, px, pad in jobs:
        img = build(px, pad)
        # Apple mag keine Transparenz im Homebildschirm-Symbol
        flat = Image.new("RGB", img.size, BG_BOT)
        flat.paste(img, (0, 0), img)
        dest = OUT / name
        flat.save(dest, "PNG", optimize=True)
        print(f"{dest.relative_to(ROOT)}  {px}x{px}  {dest.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()
