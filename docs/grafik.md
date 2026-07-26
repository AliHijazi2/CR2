# Grafik-Werkstatt

Dieses Dokument ist die einzige Wahrheit fuer alles, was mit Aussehen zu tun hat:
Analyse des Ist-Zustands, die Massnahmen, und die Regeln, an die sich neue Assets
halten muessen.

---

## 1. Analyse: die fuenf groessten Schwaechen (Stand vor dem Umbau)

Ich habe den Renderer gegen das Ziel "modernes Mobile-Game / stilisiertes PC-Indie"
geprueft. Fuenf Probleme haben zusammen 90 % des billigen Eindrucks erzeugt:

### 1.1 Alles war einfarbig
Jedes Material war ein reiner `MeshStandardMaterial` mit einer Farbe und einer
Rauheitszahl. Kein Pixel im Bild hatte eine andere Farbe als sein Nachbar, ausser
wo die Beleuchtung sie geaendert hat. Genau das liest das Auge als "Plastik" oder
"Spielzeug": echtes Holz, Stein und Stoff haben eine Textur, und ohne die fehlt der
Groessenmassstab. Ein 4 m grosser Steinturm und ein 4 cm grosser Kieselstein sahen
aus demselben Material aus.

### 1.2 Die Beleuchtung war eine Punktlampe im schwarzen Raum
Es gab genau eine gerichtete Lampe und ein schwaches Umgebungslicht. Was nicht direkt
von der Sonne getroffen wurde, war einfach flach dunkel. In der Realitaet bekommt eine
Schattenseite Licht vom Himmel und vom Boden zurueckgeworfen (globale Beleuchtung).
Ohne das wirkt jede Figur wie ausgeschnitten und aufgeklebt.

### 1.3 Kein Post-Processing
Das Bild ging roh aus dem Renderer auf den Bildschirm. Keine Kontaktverschattung in
den Ecken, kein Leuchten an hellen Kanten, keine Farbabstimmung. Fast jedes moderne
Spiel gewinnt einen grossen Teil seines Looks erst nach dem eigentlichen Rendern.

### 1.4 Harte Kanten ueberall
Alles war aus `BoxGeometry` gebaut, also aus perfekt scharfen 90-Grad-Kanten. Echte
Objekte haben immer eine minimale Verrundung, und genau die faengt einen hellen
Glanzstreifen ein. Ohne diesen Streifen sieht eine Kante "computergeneriert" aus.

### 1.5 Der Boden war eine leere gruene Flaeche
Zwei Drittel des Bildschirms waren eine einzige Farbe ohne jedes Detail. Kein Gras,
keine Steine, keine Trampelpfade, keine Farbvariation. Das war die groesste leere
Flaeche im ganzen Bild und hat den Rest mit heruntergezogen.

---

## 2. Massnahmen

### 2.1 Prozedurale PBR-Texturen (`textures.js`)
Es werden keine Bilddateien geladen — alle Texturen werden beim Start im Browser aus
Rauschen berechnet. Das haelt die Datei klein und laesst sich beliebig variieren.

Kette pro Material:

1. `valueNoise` — glattes Gitterrauschen mit Cosinus-Interpolation.
2. `fbm` — mehrere Oktaven davon uebereinander (jede halb so stark, doppelt so fein).
   Das ergibt die typische natuerliche "Wolkigkeit" statt gleichmaessigem Grieseln.
3. `albedoFrom` — Farbkarte: die Hoehe aus dem fbm moduliert eine Basisfarbe.
4. `normalMapFrom` — Normalkarte: Sobel-Operator ueber die Hoehenkarte. Die Steigung
   in x/y wird zur Neigung der Oberflaeche. Wichtig: `ny = -dy`, weil die
   Bildkoordinate nach unten laeuft, die Texturkoordinate aber nach oben.
5. `grayMapFrom` — Rauheitskarte: wo die Oberflaeche zerkratzt ist, streut sie
   staerker.

Zehn Sorten: `grass`, `stone`, `wood`, `cloth`, `leather`, `metal`, `water`, `dirt`
plus die neutralen Varianten `woodN`/`stoneN`.

**Regel — neutrale Varianten:** Eine Albedo-Textur wird in three.js mit
`material.color` multipliziert. Wenn beide gefaerbt sind, multipliziert man zwei
Farben und das Ergebnis ist deutlich zu dunkel. Materialien, die ihre Farbe selbst
setzen (jedes Holzteil an einer Figur), muessen deshalb `woodN`/`stoneN` benutzen —
die sind grau und tragen nur die Struktur bei.

**Regel — TUNE-Tabelle:** Dieselbe Holztextur auf einem 4 m Bruecke und auf einem
8 cm Guertel sieht auf dem kleinen Teil aus wie Korbgeflecht. In `models.js` steht
deshalb pro Materialsorte eine Wiederholungsskala:

```js
const TUNE = { cloth:[1.2,0.45], leather:[1.0,0.55], metal:[1.0,0.50],
               woodN:[0.5,0.55], stoneN:[0.9,0.75] };
```

Erste Zahl = Texturwiederholung, zweite = Staerke der Normalkarte.

### 2.2 Beleuchtung mit Umgebung
Statt "eine Lampe" gibt es jetzt:

- Sonne (gerichtet, warm, wirft weiche Schatten via `PCFSoftShadowMap`)
- Fuelllicht aus der Gegenrichtung, kuehl — simuliert Himmelslicht
- `HemisphereLight` — Himmelblau von oben, Grasgruen von unten
- eine echte Umgebungskarte: eine kleine Szene aus farbigen Flaechen wird per
  `PMREMGenerator` zu einer Umgebungstextur gebacken und als `scene.environment`
  gesetzt

**Regel:** `scene.environment` beleuchtet *jedes* Material, nicht nur Metall. Wenn die
Panels blau sind, ist die ganze Szene blau. Die Panels bleiben deshalb weitgehend
neutral, und die Staerke wird ueber `scene.environmentIntensity` gesteuert.

### 2.3 Post-Processing-Kette (`render3d.js`)

```
RenderPass -> GTAOPass -> UnrealBloomPass -> OutputPass -> GradeShader
```

- **GTAO** — Umgebungsverdeckung. Verdunkelt Ecken und Beruehrungspunkte. Sorgt
  dafuer, dass Figuren auf dem Boden *stehen* statt zu schweben.
- **Bloom** — helle Stellen leuchten leicht ueber ihre Kante hinaus.
- **GradeShader** — eigener Shader: Kontrast 1.085, Saettigung 1.12, Vignette 0.32,
  plus Lift/Gain fuer eine kuehlere Schatten- und waermere Lichtstimmung.

**Regel — Aufloesung:** GTAO und Bloom laufen *nicht* in voller Aufloesung
(`AO_SCALE = 0.5`, `BLOOM_SCALE = 0.6`). In voller Aufloesung hat allein AO die
Bildzeit verdoppelt. Beides sind weiche Effekte, denen die halbe Aufloesung nicht
anzusehen ist. Kosten der ganzen Kette danach: 27 % statt 98 %.

### 2.4 Verrundete Geometrie (`models.js`)

```js
const box = (w, h, d) =>
  geo(`b${w},${h},${d}`, () => {
    const r = Math.min(w, h, d) * 0.3;
    return r > 0.004 ? new THREE.RoundedBoxGeometry(w, h, d, 2, r)
                     : new THREE.BoxGeometry(w, h, d);
  });
```

Jeder Quader im Spiel ist damit automatisch verrundet, ohne dass irgendein
Modellcode geaendert werden musste. Der Radius ist relativ zur kleinsten Kante, damit
duenne Platten nicht zu Wuersten werden. Unter 4 mm lohnt sich die Verrundung nicht
und kostet nur Dreiecke.

### 2.5 Angezogene Szene (`dressScene()`)
Der leere Rasen bekommt:

- weiche Schmutzflecken und Trampelpfade zu den Bruecken (Decals)
- 900 Grashalme, 46 Steine, 130 Blumen, 160 Schilfhalme — alle als `InstancedMesh`,
  also 4 Zeichenaufrufe statt 1236
- 11 grosse weiche Farbflecken, damit das Gruen nicht ueberall dasselbe Gruen ist
- animiertes Wasser: Farb- und Normalkarte scrollen mit unterschiedlicher
  Geschwindigkeit und Richtung, das ergibt Interferenz statt sichtbarem Gleiten

**Regel — Alpha-Masken:** `alphaMap` liest in three.js den **gruenen Kanal**, nicht
den Alphakanal. Masken muessen als Graustufe in RGB geschrieben werden, sonst wird
aus einem weichen Fleck eine harte Scheibe.

### 2.6 Umland (`buildSurround()`)
Die Arena ist 18 × 32 Kacheln, also mit 0.56 deutlich hochkanter als jedes Fenster
je sein wird. Passt man sie ganz ins Bild ein, bleibt links und rechts zwangslaeufig
Platz uebrig — und der war schwarz.

Die Arena einfach groesser zu ziehen ist keine Loesung: dann faellt der eigene
Koenigsturm aus dem Bild und man kann nicht mehr sehen, was vor der eigenen
Grundlinie passiert. Das Vorbild loest es ueber Landschaft *um* die Arena herum.
Genau das macht `buildSurround()`: eine grosse Wiese, ein Baumguertel, Gebuesch,
Findlinge.

**Regel — Guertel, nicht Flaeche.** Der erste Versuch hat die Baeume gleichmaessig
ueber die ganze Wiese verteilt. Bei knapper Einpassung landet dabei fast nichts im
sichtbaren Rand — 96 Baeume waren da, aber weit draussen im Nebel. Stattdessen wird
ein Punkt auf dem um `d` vergroesserten Arena-Rechteck gezogen, mit `d` stark zur
Arena hin gewichtet (`Math.pow(rnd(), 1.8)`). Die langen Seiten bekommen dadurch von
selbst mehr ab, und genau dort war das Schwarz.

**Regel — kein Schattenwurf im Umland.** Die Schattenkamera der Sonne deckt nur die
Arena ab (`left/right ±18`, `top/bottom ±26`). Nimmt man das Umland mit hinein, muss
dieselbe Schattenkarte die vierfache Flaeche abdecken und die Schatten *auf dem
Spielfeld* werden sichtbar grober. Das Umland wirft deshalb nichts.

**Regel — `envMapIntensity` statt Farbe.** Laub ohne Schattenwurf bekommt von allen
Seiten volles Licht und leuchtet heller als das Spielfeld — auch mit dunkler
Grundfarbe. Der richtige Hebel ist `material.envMapIntensity` (Laub 0.30, Wiese
0.55): er nimmt genau diesem Material die Umgebungsbeleuchtung, ohne die
Beleuchtung der Arena anzufassen.

Der Nebel (`Fog(0x2E4437, 46, 104)`) loest den Baumguertel zur Bildkante hin auf.
Nebelfarbe und `scene.background` sind gleich, sonst sieht man den Uebergang.

Kosten: vier Zeichenaufrufe (Staemme, Laub, Gebuesch, Findlinge) fuer rund 640
Instanzen.

---

## 3. Performance

Die Detailsteigerung war nur bezahlbar, weil gleichzeitig die Zeichenaufrufe gefallen
sind. Drei Schritte in `models.js`:

1. **`flattenNonRig`** — Modelle sind zum Bauen in Gruppen verschachtelt. Alles, was
   nicht zum Animationsskelett gehoert, wird in die Elterntransformation
   hineingerechnet und die Gruppe entfernt.
2. **`mergeStatic`** — Geschwisterteile mit derselben Oberflaeche werden zu einer
   Geometrie verschmolzen. Damit sie sich ein Material teilen koennen, wird die Farbe
   jedes Teils in einen `color`-Vertexattribut gebacken und ein gemeinsames Material
   mit `vertexColors:true` benutzt.
3. **`_protos`** — pro Kartentyp wird das Modell genau einmal gebaut und danach nur
   noch geklont.

Gemessen mit 10 Riesen im Bild:

| | vorher | nachher |
|---|---|---|
| Meshes gesamt | 1153 | **389** |
| Turm | 30 | 2 |
| Abdu | 44 | 26 |
| Timgioh | 42 | 21 |
| Post-Processing-Kosten | 98 % | 27 % |

Dreiecke: ~220k, plus 4 `InstancedMesh`-Gruppen mit 1177 Instanzen.
Texturgenerierung: ~185 ms, einmalig beim Start.

**Fallstricke, die dabei aufgetreten sind:**

- `mergeGeometries` scheitert, wenn indizierte und nicht-indizierte Geometrien
  gemischt sind (`ExtrudeGeometry` ist nicht indiziert). Loesung: nur im Mischfall
  alles auf nicht-indiziert umstellen.
- `Object3D.clone()` serialisiert `userData` als JSON. Verweise auf Objekte im
  Skelett ueberleben das nicht. Loesung: die Skelettknoten bekommen Namen
  (`rig_head` etc.), `userData` wird vor dem Klonen geleert, und nach dem Klonen wird
  das Skelett ueber `getObjectByName` neu zusammengesetzt.

---

## 3a. Kameraeinpassung

Die Arena muss bei jedem Seitenverhaeltnis ganz ins Bild passen *und* mittig sitzen.
Eine geschlossene Formel dafuer ist unzuverlaessig: die Kamera ist um 1.12 rad
geneigt, also steht die vordere Arenakante naeher an der Kamera und projiziert
groesser als die hintere. Die alte Naeherung ueber `AH * cos(tilt)` hat sie
unterschaetzt und bei breiteren Fenstern den eigenen Koenigsturm abgeschnitten.

`fitArena()` sucht stattdessen zwei Groessen, indem es die acht Eckpunkte des
Arena-Quaders wirklich projiziert:

- **`dist`** — der Abstand. "Passt es noch" ist monoton in `dist`, also findet
  Intervallhalbierung sicher den kleinsten passenden Abstand.
- **`look`** — der Zielpunkt auf der Mittelachse. Nur den Abstand zu suchen reicht
  nicht: durch die Neigung stoesst die vordere Kante zuerst an, waehrend oben ein
  breiter leerer Streifen bleibt. Der Zielpunkt wird per Newton-Schritt so
  verschoben, dass ober- und unterhalb gleich viel Rand bleibt.

Beides haengt voneinander ab, also wechseln sich die Schritte fuenfmal ab. Laeuft
nur beim Aendern der Fenstergroesse.

`FIT_MARGIN` steht auf 0.2 Kacheln — knapp, weil das Umland den Rest traegt.

## 4. Regeln fuer neue Assets

1. Keine reinen Farbflaechen. Jedes Material bekommt eine Textursorte.
2. Selbst gefaerbte Materialien benutzen die neutrale Texturvariante.
3. Kleine Teile brauchen eine kleinere Texturwiederholung — TUNE-Tabelle pflegen.
4. Quader ueber `box()` bauen, nie direkt `BoxGeometry`.
5. Alles, was mehr als ~20-mal vorkommt, wird `InstancedMesh`.
6. Nach jedem neuen Modell den Meshzaehler pruefen: eine Figur sollte unter 30 liegen.
7. Farben in linearem Raum mischen sich staerker als erwartet — der rote
   Gegnerton liegt bei `lerp 0.13`, nicht bei 0.30.
8. Nie eine leere Bildkante zulassen. Was am Rand steht, gehoert ins Umland und
   damit in `buildSurround()` — nicht in `dressScene()`, das nur die Arena
   ausstattet.
