# Bildmaterial

## `assets/cards/` — die Handkarten

Das ist das Bildmaterial, das im Spiel tatsächlich benutzt wird: das
komplette Kartenbild mit Goldrahmen, Titelband und Figur, so wie es unten
in der Hand liegt. Eine Karte bindet es in `index.html` im Block
`const CARDS = {…}` über das Feld `card` ein:

    abdu:{ name:"Abdu", emoji:"🪓", card:"assets/cards/abdu.jpg",
           cost:4, kind:"troop", … },

`card`  Pfad zum Kartenbild. Fehlt es oder lädt es nicht, fällt die Karte
        auf `emoji` plus den in CSS nachgebauten Goldrahmen zurück — die
        Hand geht also nie kaputt.

### Anforderungen an die Dateien

- **Format:** JPEG, Qualität ~88. Die Bilder sind vollflächig, also bringt
  PNG hier nichts außer Dateigröße.
- **Seitenverhältnis:** 0.72 (Breite ÷ Höhe), zum Beispiel 224 × 311.
  Die Karte im Spiel hat genau dieses Verhältnis, das Bild wird per
  `object-fit:cover` eingepasst — kleine Abweichungen werden also
  beschnitten, große verzerren die Komposition.
- **Aufbau:** Titelband mit dem Namen ganz oben, Figur als Brustbild
  darunter. Die Elixier-Kugel sitzt **unten links** auf der Karte, dort
  sollte nichts Wichtiges liegen.
- **Rahmen:** rundum geschlossen.

### Zuschneiden

Die Vorlagen sind hochkant (~0.52) und damit zu schmal. Das Skript nimmt
den oberen Teil (Titelband und Figur) und setzt die untere Rahmenleiste
des Originals wieder an, damit der Goldrahmen nicht offen endet:

    python3 tools/karte-zuschneiden.py vorlage.jpeg abdu

Danach in `index.html` bei der Karte `card:"assets/cards/abdu.jpg"`
eintragen.

## `assets/*.png` — ältere Figuren-Ausschnitte

`abdu.png`, `yunus.png`, `mertabi.png`, `timgioh.png` sind freigestellte
Ausschnitte aus den Vorlagen. Sie stammen aus der Zeit, als die Hand nur
ein kleines Symbol angezeigt hat. Seit die vollen Kartenbilder da sind,
verweist kein Code mehr auf sie.

Sie bleiben liegen, weil sie sich als Quelle für weitere Grafiken eignen —
aber sie kosten nichts: `tools/build-web.py` bettet nur Pfade ein, die im
Code wirklich vorkommen.

## Keine fremden Vorlagen

Alle Bilder hier sind eigene Grafiken. Aus dem Vorbild wird nur die
Spielmechanik übernommen, kein Bildmaterial, keine Namen, keine Logos.
