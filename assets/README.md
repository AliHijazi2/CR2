# Bildmaterial

Hier liegen die Figuren-Bilder. Eine Karte bindet ihr Bild in `index.html`
im Block `const CARDS = {…}` ein:

    klingenwache:{ name:"Klingenwache", emoji:"🗡️", art:"assets/klingenwache.png",
                   artScale:1.8, cost:3, … },

`art`      Pfad zum Bild. Fehlt es oder lädt es nicht, zeigt das Spiel
           weiter das `emoji` — es geht also nie kaputt.
`artScale` Höhe der Figur als Vielfaches ihres Kollisions-Durchmessers.
           1.8 passt für stehende Figuren, 1.0 für flache Objekte.

## Anforderungen an die Dateien

- **Format:** PNG mit Transparenz (kein weißer Hintergrund)
- **Blickrichtung:** von schräg oben gesehen, Figur schaut zum unteren
  Bildrand. Beide Teams benutzen dasselbe Bild — die Seite erkennt man
  am farbigen Ring am Boden, nicht an der Figur.
- **Größe:** 256×256 bis 512×512 reicht. Größer kostet nur Ladezeit.
- **Ausrichtung:** Die Figur sollte den Rahmen möglichst ausfüllen und
  mit den Füßen am unteren Bildrand stehen.
