# Kartenwerkstatt — Roster-Entwurf v1

> **Status: ENTWURF, noch nicht abgesegnet.**
> Diese Datei ist die einzige Quelle der Wahrheit für alle Karten-Stats.
> Aus ihr entsteht später `src/data/cards.js` 1:1. Änderungen bitte hier machen —
> dann zieht die Engine automatisch nach.
>
> Alle Namen und Symbole sind Eigenentwicklung. Kein Bezug zu bestehenden Produkten,
> nur die Spielmechanik dient als Vorbild.

---

## 1. Stat-Modell

Jede Karte ist ein Datensatz mit diesen Feldern:

| Feld | Bedeutung |
|---|---|
| `id` | Interner Schlüssel, z.B. `steinwaechter` |
| `name` | Anzeigename |
| `emoji` | Symbol im Kreis auf dem Feld und auf der Handkarte |
| `cost` | Elixierkosten 1–9 |
| `kind` | `troop` \| `spell` \| `building` |
| `count` | Wie viele Einheiten pro Karte erscheinen (Schwarm) |
| `hp` | Lebenspunkte **pro Einheit** |
| `damage` | Schaden **pro Treffer** |
| `hitSpeed` | Sekunden zwischen zwei Angriffen |
| `range` | Reichweite in Kacheln (Nahkampf = 1.2) |
| `speed` | Bewegung in Kacheln pro Sekunde |
| `layer` | `ground` \| `air` — wo die Einheit selbst ist |
| `targets` | `ground` \| `air` \| `both` \| `buildings` — was sie angreifen darf |
| `splash` | Radius für Flächenschaden in Kacheln (0 = Einzelziel) |
| `lifetime` | Nur Gebäude: Sekunden bis zum Selbstabbau |
| `deployTime` | Sekunden vom Platzieren bis handlungsfähig (Standard 1.0) |

**Tempo-Stufen:** langsam `0.7` · mittel `1.0` · schnell `1.4` · sehr schnell `1.8` Kacheln/s
**Arena:** 18 Kacheln breit, 32 hoch. Eine mittlere Einheit läuft die halbe Arena in ~16 s.

### Wert-Faustregel für die Balance

Ein Elixier ist ungefähr wert:
- **≈ 380 effektive HP** *oder*
- **≈ 60 DPS**

Eine Karte, die beides bekommt, muss dafür woanders bezahlen (langsam, kurze Reichweite,
kann keine Luftziele treffen, greift nur Gebäude an). Genau diese Schwächen sind das,
was Deckbau interessant macht — deshalb hat unten **keine** Karte nur Vorteile.

---

## 2. Die Türme (keine Karten, aber sie brauchen Stats)

| Turm | HP | Schaden | Angriff alle | DPS | Reichweite | Ziele |
|---|---|---|---|---|---|---|
| **Wachturm** (2× pro Seite) | 2400 | 90 | 0.8 s | 112 | 7.5 | Boden + Luft |
| **Königsturm** (1× pro Seite) | 4000 | 110 | 1.0 s | 110 | 7.0 | Boden + Luft |

Der Königsturm **schläft** zu Beginn. Er erwacht, wenn ein eigener Wachturm fällt
*oder* wenn er selbst Schaden nimmt (z.B. durch einen Zauber). Königsturm zerstört = Match sofort vorbei.

---

## 3. Roster — 18 Karten

### 3.1 Nahkampf & Tanks (Boden)

| # | Karte | Kosten | Anzahl | HP | Schaden | Angriff alle | DPS | Rw | Tempo | Ziele | Rolle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 🗿 **Steinwächter** | 5 | 1 | 3200 | 220 | 1.5 s | 147 | 1.2 | langsam | Boden | Der Panzer. Läuft vorne, saugt Turmschaden. Kann keine Luftziele treffen. |
| 2 | 🗡️ **Klingenwache** | 3 | 1 | 1400 | 160 | 1.2 s | 133 | 1.2 | mittel | Boden | Allrounder-Verteidigerin, gutes Preis-Leistungs-Verhältnis. |
| 3 | 🐗 **Rammbock** | 4 | 1 | 1900 | 300 | 1.5 s | 200 | 1.2 | schnell | **nur Gebäude** | Siegbedingung. Ignoriert alle Truppen und rennt auf den Turm zu. |

### 3.2 Schwarm (Boden)

| # | Karte | Kosten | Anzahl | HP je | Schaden | Angriff alle | DPS je | Rw | Tempo | Ziele | Rolle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | 🐀 **Rattenrudel** | 1 | 4 | 90 | 60 | 0.9 s | 67 | 1.2 | sehr schnell | Boden | Billigster Zykel. Stoppt einen Tank für zwei Sekunden, stirbt an jedem Zauber. |
| 5 | 🔪 **Straßenbande** | 2 | 3 | 220 | 105 | 1.1 s | 95 | 1.2 | schnell | Boden | 285 DPS gebündelt — der beste Einzelziel-Konter im Spiel. |
| 6 | 🪃 **Speerbrüder** | 2 | 3 | 130 | 60 | 1.1 s | 55 | 5.0 | mittel | Boden + Luft | Billige Reichweite, trifft auch Luft. Extrem zerbrechlich. |

### 3.3 Fernkampf (Boden)

| # | Karte | Kosten | Anzahl | HP je | Schaden | Angriff alle | DPS | Rw | Tempo | Ziele | Rolle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 7 | 🏹 **Bogenschützinnen** | 3 | 2 | 300 | 95 | 1.2 s | 79 | 5.5 | mittel | Boden + Luft | Solide Dauerschaden-Basis hinter einem Tank. |
| 8 | 🔥 **Feuermagier** | 4 | 1 | 620 | 250 | 1.6 s | 156 | 5.5 | mittel | Boden + Luft | **Splash 1.3** — löscht ganze Schwärme aus. Der Anti-Schwarm-Anker. |
| 9 | 🔭 **Fernrohrschützin** | 4 | 1 | 420 | 400 | 2.4 s | 167 | **9.0** | langsam | Boden + Luft | Größte Reichweite im Spiel, kann Türme aus sicherer Distanz treffen. Sehr langsame Angriffe. |

### 3.4 Lufteinheiten

| # | Karte | Kosten | Anzahl | HP je | Schaden | Angriff alle | DPS | Rw | Tempo | Ziele | Rolle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 🦅 **Sturmfalke** | 4 | 1 | 900 | 140 | 1.4 s | 100 | 2.5 | mittel | Boden + Luft | **Splash 1.2**. Fliegt über den Fluss, ignoriert Brücken. |
| 11 | 🦇 **Fledermausschwarm** | 2 | 5 | 70 | 55 | 0.9 s | 61 | 1.2 | sehr schnell | Boden + Luft | 305 DPS für 2 Elixier — stirbt aber komplett an jedem Flächenschaden. |
| 12 | 🎈 **Glockenballon** | 5 | 1 | 1700 | 700 | 3.0 s | 233 | 1.5 | langsam | **nur Gebäude** | Zweite Siegbedingung, aus der Luft. **Todesexplosion: 300 Schaden, Radius 2.0** |

### 3.5 Zauber

| # | Karte | Kosten | Radius | Schaden | vs. Türme | Extra |
|---|---|---|---|---|---|---|
| 13 | 🌧️ **Splitterregen** | 3 | 3.5 | 250 | 88 (35 %) | Größter Radius. Räumt Schwärme ab, trifft auch Luft. |
| 14 | ☄️ **Feuerball** | 4 | 2.5 | 600 | 210 (35 %) | Stößt getroffene Einheiten kurz zurück. |
| 15 | ⚡ **Blitzschlag** | 5 | 1.8 | 900 | 315 (35 %) | Kleinster Radius, tötet einzelne teure Ziele und Gebäude. |
| 16 | ❄️ **Frostwelle** | 2 | 3.0 | 80 | 28 (35 %) | Friert getroffene Einheiten **2.5 s** ein — kein Laufen, kein Angreifen. |

> **Warum Zauber nur 35 % gegen Türme?** Sonst wäre reines „Türme wegzaubern" eine
> Gewinnstrategie ohne Truppen. Die Reduktion zwingt dazu, Zauber als *Werkzeug* für
> einen Truppen-Angriff zu benutzen, statt als Angriff selbst.

### 3.6 Gebäude

| # | Karte | Kosten | HP | Schaden | Angriff alle | DPS | Rw | Lebensdauer | Ziele | Rolle |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 17 | 🏯 **Speerturm** | 4 | 1050 | 110 | 0.9 s | 122 | 6.5 | 35 s | Boden + Luft | Defensivgebäude. Zieht Rammbock & Ballon von den Türmen weg. |
| 18 | 🧱 **Bollwerk** | 3 | 2200 | — | — | — | — | 30 s | — | Greift nicht an, hat nur HP. Reine Ablenkung, extrem billig pro HP. |

### 3.7 Optional — braucht eine Extra-Mechanik

| # | Karte | Kosten | HP | Lebensdauer | Effekt |
|---|---|---|---|---|---|
| 19 | 🕳️ **Rattenhöhle** | 5 | 900 | 40 s | Spawnt **alle 5 s** 2 × 🐀 Rattenrudel-Einheiten |

Diese Karte braucht als einzige eine „Gebäude erzeugt Einheiten"-Mechanik in der Engine.
Kleiner Zusatzaufwand in M5 — deshalb hier separat zum Ja/Nein-Entscheiden.

---

## 4. Elixierkurve des Rosters

| Kosten | Anzahl | Karten |
|---|---|---|
| 1 | 1 | 🐀 |
| 2 | 4 | 🔪 🪃 🦇 ❄️ |
| 3 | 4 | 🗡️ 🏹 🌧️ 🧱 |
| 4 | 6 | 🐗 🔥 🔭 🦅 ☄️ 🏯 |
| 5 | 3 (+1) | 🗿 🎈 ⚡ (+🕳️) |

Damit lässt sich sowohl ein billiges Zykel-Deck (Ø 2.8) als auch ein schweres
Tank-Deck (Ø 4.2) bauen — ein 8er-Deck mit Ø 3.2–3.8 ist der gesunde Mittelwert.

---

## 5. Konter-Netz (Design-Kontrolle)

Jede starke Karte hat mindestens zwei klare Antworten — niemand ist alternativlos:

| Bedrohung | Antworten |
|---|---|
| 🗿 Steinwächter | 🔪 Straßenbande, 🦇 Fledermäuse, 🧱 Bollwerk (ablenken) |
| 🐗 Rammbock | 🏯 Speerturm, 🧱 Bollwerk, 🔪 Straßenbande |
| 🎈 Glockenballon | 🏹 Bogenschützinnen, 🪃 Speerbrüder, 🦇 Fledermäuse, ⚡ Blitzschlag |
| 🦇 / 🐀 / 🔪 Schwärme | 🔥 Feuermagier, 🌧️ Splitterregen, 🦅 Sturmfalke |
| 🔥 Feuermagier | ☄️ Feuerball, 🐀 Rattenrudel (überrennen) |
| 🔭 Fernrohrschützin | ☄️ Feuerball, 🦇 Fledermäuse, 🦅 Sturmfalke |
| 🏯 / 🧱 Gebäude | ⚡ Blitzschlag, ☄️ Feuerball |

**Die zwei Karten ohne echten harten Konter sind bewusst 🌧️ und ❄️** — Zauber lassen sich
nicht kontern, nur durch Positionierung entwerten. Deshalb sind ihre Schadenswerte niedrig.

---

## 6. Welche Engine-Features folgen aus diesem Roster?

| Feature | Wegen |
|---|---|
| Einzelziel-Targeting + Aggro-Radius | alle Truppen |
| Schwarm-Spawn (mehrere Einheiten pro Karte, versetzt platziert) | 🐀 🔪 🪃 🏹 🦇 |
| Flächenschaden | 🔥 🦅 + alle Zauber |
| Luft-/Boden-Ebenen und `targets`-Filter | 🦅 🦇 🎈 vs. 🗿 🗡️ 🔪 🐀 |
| „nur Gebäude"-Targeting | 🐗 🎈 |
| Gebäude mit Lebensdauer | 🏯 🧱 (🕳️) |
| Statuseffekt „eingefroren" | ❄️ |
| Rückstoß | ☄️ |
| Todesexplosion beim Sterben | 🎈 |
| Gebäude spawnt Einheiten | 🕳️ (optional) |

Alles davon war im abgesegneten Umfang („voller Baukasten") enthalten —
bis auf **Frostwelle** (Statuseffekt), **Feuerball-Rückstoß** und **Todesexplosion**.
Das sind drei kleine Erweiterungen, die ich in M5 mit einbauen würde.
