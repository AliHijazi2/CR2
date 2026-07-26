#!/usr/bin/env python3
"""
Baut aus index.html die Fassung fuer den geteilten Web-Link.

Warum das noetig ist: Eine geteilte Seite darf aus Sicherheitsgruenden
keine Dateien von aussen nachladen. Alles aus assets/ muss also direkt
in die Seite hinein. Lokal bleibt index.html unveraendert und laedt die
Bilder ganz normal als Dateien.

Aufruf:   python3 tools/build-web.py [ziel.html]
Standard: build/brueckenkrieg.html
"""
import base64
import mimetypes
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "index.html"


def inline_assets(html: str) -> tuple[str, int, int]:
    """Ersetzt jeden Pfad "assets/..." durch eine eingebettete data:-URI."""
    count = 0
    total = 0

    def repl(m: re.Match) -> str:
        nonlocal count, total
        rel = m.group(1)
        path = ROOT / rel
        if not path.is_file():
            print(f"  ! fehlt, bleibt als Pfad stehen: {rel}", file=sys.stderr)
            return m.group(0)
        raw = path.read_bytes()
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        count += 1
        total += len(raw)
        print(f"  + {rel}  {len(raw)/1024:.0f} KB")
        return '"data:%s;base64,%s"' % (mime, base64.b64encode(raw).decode())

    return re.sub(r'"(assets/[^"]+)"', repl, html), count, total


def main() -> int:
    if not SRC.is_file():
        print("index.html nicht gefunden", file=sys.stderr)
        return 1

    html = SRC.read_text(encoding="utf-8")

    # Nur den Seiteninhalt uebernehmen: das Web-Ziel liefert
    # <!doctype>, <html>, <head> und <body> selbst.
    inner = html.split("<body>", 1)[1].rsplit("</body>", 1)[0]

    title = re.search(r"<title>(.*?)</title>", html)
    page = "<title>%s</title>\n%s" % (title.group(1) if title else "Spiel", inner)

    print("Bilder einbetten:")
    page, n, raw_bytes = inline_assets(page)
    if n == 0:
        print("  (keine)")

    dest = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "build" / "brueckenkrieg.html"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(page, encoding="utf-8")

    size = dest.stat().st_size / 1024
    print(f"\n{dest}  {size:.0f} KB  ({n} Bilder, {raw_bytes/1024:.0f} KB roh)")
    if size > 4096:
        print("Achtung: ueber 4 MB. Bilder kleiner rechnen, sonst laedt die Seite traege.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
