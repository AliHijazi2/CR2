#!/usr/bin/env python3
"""
Schneidet ein gezeichnetes Kartenbild auf das Handkarten-Format zu.

Warum das noetig ist: Die Vorlagen sind hochkant, etwa 0.52 breit wie hoch.
So schmal passt keine Karte in eine Reihe aus fuenf Plaetzen — die Hand
wuerde das halbe Spielfeld fressen. Die Karte im Spiel hat 0.72.

Einfach oben abschneiden geht nicht: dann endet der Goldrahmen unten offen
und die Karte sieht abgerissen aus. Das Skript nimmt deshalb den oberen
Teil (Titelband und Figur) und setzt die untere Rahmenleiste des Originals
wieder an. Der Uebergang liegt im Hintergrund und faellt bei der Groesse
im Spiel nicht auf.

Aufruf:
    python3 tools/karte-zuschneiden.py vorlage.jpeg abdu
    python3 tools/karte-zuschneiden.py vorlage.jpeg abdu --aspect 0.72

Ergebnis: assets/cards/<name>.jpg
"""
import argparse
import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    print("Pillow fehlt:  pip install Pillow", file=sys.stderr)
    raise SystemExit(1)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "cards"

ASPECT = 0.72     # Breite / Hoehe, muss zur .card-Regel in index.html passen
WIDTH = 224       # reicht: die Karte ist im Spiel rund 110 Punkte breit
FOOT = 0.045      # Hoehe der unteren Rahmenleiste, Anteil der Bildbreite
QUALITY = 88


def zuschneiden(src: pathlib.Path, name: str, aspect: float, width: int) -> pathlib.Path:
    im = Image.open(src).convert("RGB")
    w, h = im.size

    ziel_h = int(round(w / aspect))
    if ziel_h >= h:
        # Vorlage ist schon breit genug, nichts abzuschneiden.
        karte = im
    else:
        foot = max(8, int(round(w * FOOT)))
        karte = Image.new("RGB", (w, ziel_h))
        karte.paste(im.crop((0, 0, w, ziel_h - foot)), (0, 0))
        karte.paste(im.crop((0, h - foot, w, h)), (0, ziel_h - foot))

    karte = karte.resize((width, int(round(width / aspect))), Image.LANCZOS)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dest = OUT_DIR / f"{name}.jpg"
    karte.save(dest, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return dest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("vorlage", help="Pfad zum gezeichneten Kartenbild")
    ap.add_argument("name", help="Karten-Id, zum Beispiel abdu")
    ap.add_argument("--aspect", type=float, default=ASPECT)
    ap.add_argument("--width", type=int, default=WIDTH)
    a = ap.parse_args()

    src = pathlib.Path(a.vorlage)
    if not src.is_file():
        print(f"nicht gefunden: {src}", file=sys.stderr)
        return 1

    dest = zuschneiden(src, a.name, a.aspect, a.width)
    kb = dest.stat().st_size / 1024
    print(f"{dest.relative_to(ROOT)}  {Image.open(dest).size}  {kb:.0f} KB")
    print(f'Jetzt in index.html eintragen:  card:"assets/cards/{a.name}.jpg"')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
