#!/usr/bin/env python3
"""
Baut aus index.html die Fassung fuer den geteilten Web-Link.

Warum das noetig ist: Eine geteilte Seite darf aus Sicherheitsgruenden
keine Dateien von aussen nachladen. Alles aus assets/ muss also direkt
in die Seite hinein. Lokal bleibt index.html unveraendert und laedt die
Bilder ganz normal als Dateien.

Aufruf:   python3 tools/build-web.py [ziel.html]
Standard: build/twitch-royale.html
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


def inline_scripts(html: str) -> tuple[str, int]:
    """Ersetzt <script src="..."> durch den Dateiinhalt."""
    count = 0

    def repl(m: re.Match) -> str:
        nonlocal count
        rel = m.group(1)
        path = ROOT / rel
        if not path.is_file():
            print(f"  ! fehlt: {rel}", file=sys.stderr)
            return m.group(0)
        code = path.read_text(encoding="utf-8")
        if "</script" in code.lower():
            print(f"  ! {rel} enthaelt </script>, kann nicht eingebettet werden", file=sys.stderr)
            return m.group(0)
        count += 1
        print(f"  + {rel}  {len(code)/1024:.0f} KB")
        return "<script>\n%s\n</script>" % code

    return re.sub(r'<script\s+src="([^"]+)"\s*>\s*</script>', repl, html), count


# ---- Fassung fuer den Homebildschirm --------------------------------

PWA_HEAD = """
<meta name="description" content="Twitch Royale — ein Kartenspiel um zwei Brücken.">
<meta name="theme-color" content="#0E1A18">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="icon-180.png">
<!-- Ohne diese drei startet die Seite auf dem iPhone in Safari mit
     Adressleiste, statt als eigenes Fenster im Vollbild. -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Twitch Royale">
"""

SW_REGISTER = """
<script>
/* Speichert die Seite beim ersten Aufruf, damit sie danach auch ohne
   Netz startet. Faellt still aus, wenn der Browser das nicht kann oder
   die Seite ueber file:// geoeffnet wurde. */
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
</script>
"""

SW_JS = """/* Erzeugt von tools/build-web.py --site. Nicht von Hand aendern. */
const CACHE = "twitch-royale-%(version)s";
const FILES = %(files)s;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))
                                .then(() => self.skipWaiting()));
});

/* Alte Staende wegraeumen. Der Cache-Name traegt den Inhalts-Hash, ein
   neuer Build ergibt also einen neuen Namen und damit einen frischen
   Cache — sonst bekaeme man den alten Stand fuer immer serviert. */
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).catch(() => caches.match("index.html"))));
});
"""

MANIFEST = """{
  "name": "Twitch Royale",
  "short_name": "Twitch Royale",
  "description": "Ein Kartenspiel um zwei Br\\u00fccken.",
  "lang": "de",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0E1A18",
  "theme_color": "#0E1A18",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icon-512-maskable.png", "sizes": "512x512", "type": "image/png",
      "purpose": "maskable" }
  ]
}
"""

ICONS = ["icon-180.png", "icon-192.png", "icon-512.png",
         "icon-512-maskable.png", "favicon-32.png"]


def build_site(html: str) -> int:
    """Schreibt site/ als vollstaendige, installierbare Seite."""
    import hashlib
    import json

    dest_dir = ROOT / "site"
    dest_dir.mkdir(parents=True, exist_ok=True)

    missing = [i for i in ICONS if not (dest_dir / i).is_file()]
    if missing:
        print(f"Symbole fehlen: {', '.join(missing)}\n"
              f"Erst  python3 tools/icons.py  laufen lassen.", file=sys.stderr)
        return 1

    print("Skripte einbetten:")
    page, _ = inline_scripts(html)
    print("Bilder einbetten:")
    page, n, raw_bytes = inline_assets(page)

    page = page.replace("</head>", PWA_HEAD + "</head>", 1)
    page = page.replace("</body>", SW_REGISTER + "</body>", 1)

    index = dest_dir / "index.html"
    index.write_text(page, encoding="utf-8")

    (dest_dir / "manifest.webmanifest").write_text(MANIFEST, encoding="utf-8")

    # Der Hash macht aus jeder Aenderung einen neuen Cache-Namen.
    version = hashlib.sha256(page.encode("utf-8")).hexdigest()[:12]
    files = ["./", "index.html", "manifest.webmanifest"] + ICONS
    (dest_dir / "sw.js").write_text(
        SW_JS % {"version": version, "files": json.dumps(files)}, encoding="utf-8")

    # Jekyll auf GitHub Pages ueberspringt sonst Dateien mit Unterstrich
    # und kann den Aufbau durcheinanderbringen.
    (dest_dir / ".nojekyll").write_text("", encoding="utf-8")

    size = index.stat().st_size / 1024
    print(f"\n{index}  {size:.0f} KB  ({n} Bilder, {raw_bytes/1024:.0f} KB roh)")
    print(f"Cache-Name: twitch-royale-{version}")
    return 0


def main() -> int:
    if not SRC.is_file():
        print("index.html nicht gefunden", file=sys.stderr)
        return 1

    html = SRC.read_text(encoding="utf-8")
    args = sys.argv[1:]

    if "--site" in args:
        return build_site(html)

    # Nur den Seiteninhalt uebernehmen: das Web-Ziel liefert
    # <!doctype>, <html>, <head> und <body> selbst.
    inner = html.split("<body>", 1)[1].rsplit("</body>", 1)[0]

    title = re.search(r"<title>(.*?)</title>", html)
    page = "<title>%s</title>\n%s" % (title.group(1) if title else "Spiel", inner)

    print("Skripte einbetten:")
    page, ns = inline_scripts(page)
    if ns == 0:
        print("  (keine)")

    print("Bilder einbetten:")
    page, n, raw_bytes = inline_assets(page)
    if n == 0:
        print("  (keine)")

    dest = pathlib.Path(args[0]) if args else ROOT / "build" / "twitch-royale.html"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(page, encoding="utf-8")

    size = dest.stat().st_size / 1024
    print(f"\n{dest}  {size:.0f} KB  ({n} Bilder, {raw_bytes/1024:.0f} KB roh)")
    if size > 4096:
        print("Achtung: ueber 4 MB. Bilder kleiner rechnen, sonst laedt die Seite traege.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
