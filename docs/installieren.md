# Im Browser öffnen und auf den Homebildschirm legen

## 1. Einmalig: GitHub Pages einschalten

Das musst du einmal von Hand machen, das kann kein Skript für dich tun:

1. Im Repository auf **Settings** → links **Pages**
2. Unter **Build and deployment** bei *Source* **GitHub Actions** auswählen
3. Speichern

Danach läuft `.github/workflows/pages.yml` bei jedem Push automatisch,
baut die Seite und stellt sie online. Unter **Actions** siehst du den Lauf;
wenn er grün ist, steht die Adresse oben im Job **veroeffentlichen** und
außerdem wieder unter Settings → Pages. Sie sieht so aus:

    https://alihijazi2.github.io/CR2/

> Wenn das Repository **privat** ist, braucht GitHub Pages einen bezahlten
> Plan. Auf einem kostenlosen Konto musst du es auf **öffentlich** stellen
> (Settings → ganz unten → *Change visibility*), sonst bleibt die Seite aus.

Der Workflow horcht auf `main`, `master` **und** auf den Entwicklungszweig
`claude/clash-royale-clone-game-eilj9a` — die Seite ist also schon vor dem
Zusammenführen erreichbar. Nach dem Merge kann die Zeile raus.

## 2. Auf den Homebildschirm legen (iPhone)

1. Die Adresse in **Safari** öffnen (nicht Chrome — nur Safari darf unter
   iOS etwas auf den Homebildschirm legen)
2. Unten auf **Teilen** (das Quadrat mit dem Pfeil nach oben)
3. **Zum Home-Bildschirm** wählen
4. Der Name steht schon da: *Brückenkrieg*. Auf **Hinzufügen** tippen.

Danach liegt das Symbol wie eine App auf dem Bildschirm. Beim Antippen
startet das Spiel **im Vollbild** — ohne Adressleiste und ohne Safari-Leiste
unten.

## 3. Ohne Internet spielen

Beim ersten Aufruf speichert ein Service Worker die ganze Seite. Ab dann
startet sie auch im Flugmodus. Das Spiel ist eine einzige Datei von rund
1 MB, es wird also nichts nachgeladen.

**Wenn du eine neue Fassung nicht siehst:** der Cache-Name trägt einen
Hash über den Seiteninhalt. Ein neuer Build ergibt einen neuen Namen, der
Browser holt sich beim nächsten Start alles frisch und wirft den alten
Stand weg. Manchmal braucht es zwei Starts — beim ersten wird der neue
Stand geladen, beim zweiten benutzt.

## Was dafür im Code steckt

| Datei | Rolle |
|---|---|
| `tools/icons.py` | erzeugt die App-Symbole (Arena von oben: Feld, Fluss, zwei Brücken) |
| `tools/build-web.py --site` | baut `site/` — eine Datei mit allem drin, plus Manifest und Service Worker |
| `.github/workflows/pages.yml` | baut und veröffentlicht bei jedem Push |
| `site/` | Bauergebnis, steht in `.gitignore` |

Lokal ansehen — Service Worker laufen **nicht** über `file://`, es braucht
einen echten Server:

    python3 tools/icons.py
    python3 tools/build-web.py --site
    cd site && python3 -m http.server 8000

Dann `http://localhost:8000` öffnen.

## Die drei Angaben, ohne die iOS nicht mitspielt

- `apple-mobile-web-app-capable: yes` — ohne das startet die Seite vom
  Homebildschirm trotzdem in Safari, mit Adressleiste.
- `apple-touch-icon` — ohne das nimmt iOS einen Screenshot der Seite als
  Symbol. Die Datei muss **ohne Transparenz** sein, die runden Ecken macht
  iOS selbst.
- `viewport-fit=cover` plus `env(safe-area-inset-*)` im CSS — ohne das
  liegt die Statusleiste im Vollbild über der Anzeige von Zeit und Kronen.
