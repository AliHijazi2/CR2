"use strict";
/* ============================================================
   MODELLE — alle 3D-Figuren, von Hand aus Grundkörpern gebaut

   Es gibt keine Modell-Dateien. Jede Figur entsteht hier im Code.

   Drei Regeln, damit nichts blockhaft wirkt:
     1. KEIN flatShading. Harte Facetten sind der Hauptgrund,
        warum Grundkörper nach Klötzchen aussehen.
     2. Runde Körper zuerst: Kapseln für Gliedmaßen, Drehprofile
        (Lathe) für Rumpf und Türme, Kästen nur für Kanten,
        die wirklich kantig sein sollen.
     3. Ausreichend Segmente. Eine Kugel mit 8 Segmenten ist ein
        Kristall, mit 20 eine Kugel.

   Maßstab: 1 Einheit = 1 Arena-Kachel. Abdu ist ~1.6 hoch.
   Blickrichtung: jede Figur schaut nach +Z.

   Jede Figur liefert eine Group mit .userData.rig zurück:
     { hips, torso, head, legL, legR, armL, armR, prop, height }
   ============================================================ */

const PAL = {
  skin:      0xD9A277,
  skinDark:  0xB07F58,
  hair:      0x2A1D14,
  steel:     0x9AA1A9,
  steelDark: 0x4E545C,
  steelLite: 0xC3CAD2,
  leather:   0x6B4527,
  leatherDk: 0x40291657 & 0xFFFFFF,
  fur:       0x7E5E3C,
  furDark:   0x543E28,
  furLite:   0x9A7850,
  cloth:     0x3A4757,
  clothDk:   0x27313D,
  copper:    0xAF5F35,
  wood:      0x6A4A31,
  bone:      0xD5C7AC,
  teamBlue:  0x4C7DFF,
  teamRed:   0xFF5A3C,
};
PAL.leatherDk = 0x402916;

/* ---- Material- und Geometrie-Vorrat -------------------------------
   Einheiten entstehen und sterben im Sekundentakt. Ohne diesen
   Vorrat würde für jede Figur neu auf die Grafikkarte geladen. ---- */
const _mats = new Map();
/**
 * texKind hängt einen PBR-Satz aus textures.js an (Relief + Rauheit).
 * Die Farbe bleibt die Grundfarbe der Figur — die Karten liefern nur
 * Oberfläche. Ohne sie sieht jedes Material wie lackiertes Plastik aus.
 */
function mat(color, opts, texKind){
  const key = color + "|" + JSON.stringify(opts || {}) + "|" + (texKind || "");
  let m = _mats.get(key);
  if(!m){
    m = new THREE.MeshStandardMaterial(Object.assign({
      color, roughness:0.78, metalness:0.02,
    }, opts || {}));
    // Kachelung und Reliefstaerke je Materialart. Pauschale Werte
    // lassen kleine Teile wie Geflecht aussehen: die Maserung
    // wiederholt sich dann mehrfach auf wenigen Zentimetern.
    const TUNE = {
      cloth:   [1.2, 0.45],
      leather: [1.0, 0.55],
      metal:   [1.0, 0.50],
      woodN:   [0.5, 0.55],
      stoneN:  [0.9, 0.75],
    };
    if(texKind && typeof applyTexSet === "function"){
      const t = TUNE[texKind] || [1, 1];
      applyTexSet(m, texKind, t[0], t[1]);
    }
    // Kennzeichnung fuer das Verschmelzen: Teile mit gleicher
    // Oberflaechenart koennen sich EIN Material teilen, wenn ihre
    // Farbe in die Geometrie gebacken wird.
    m.userData.tex = texKind || "plain";
    m.userData.rough = Math.round((opts && opts.roughness !== undefined ? opts.roughness : 0.78) * 10) / 10;
    m.userData.metal = Math.round((opts && opts.metalness !== undefined ? opts.metalness : 0.02) * 10) / 10;
    _mats.set(key, m);
  }
  return m;
}
const metal = (c, rough) => mat(c, { roughness: rough === undefined ? 0.32 : rough, metalness:0.92 }, "metal");
const skin  = c => mat(c, { roughness:0.58, metalness:0.0 });          // Haut ohne Relief
const cloth = c => mat(c, { roughness:0.92, metalness:0.0 }, "cloth");
const hide  = c => mat(c, { roughness:0.68, metalness:0.03 }, "leather");
const wood  = c => mat(c, { roughness:0.86, metalness:0.0 }, "woodN");
const stone = c => mat(c, { roughness:0.95, metalness:0.0 }, "stoneN");

const _geos = new Map();
function geo(key, make){
  let g = _geos.get(key);
  if(!g){ g = make(); _geos.set(key, g); }
  return g;
}

/* Runde Grundkörper in brauchbarer Auflösung */
const capsule = (r, len, s) =>
  geo(`p${r},${len},${s||14}`, () => new THREE.CapsuleGeometry(r, len, 4, s || 14));
const ball = (r, s) =>
  geo(`s${r},${s||20}`, () => new THREE.SphereGeometry(r, s || 20, (s || 20) >> 1));
const dome = (r, s) =>
  geo(`d${r},${s||20}`, () => new THREE.SphereGeometry(r, s || 20, 10, 0, Math.PI*2, 0, Math.PI/2));
const tube = (rt, rb, h, s) =>
  geo(`c${rt},${rb},${h},${s||16}`, () => new THREE.CylinderGeometry(rt, rb, h, s || 16));
const spike = (r, h, s) =>
  geo(`k${r},${h},${s||12}`, () => new THREE.ConeGeometry(r, h, s || 12));
/** Quader mit gebrochenen Kanten. Eine scharfe 90-Grad-Kante faengt
    kein Licht ein und liest sich sofort als billig; eine kleine
    Rundung erzeugt dagegen einen Glanzsaum. Radius richtet sich nach
    der kuerzesten Seite, damit duenne Riemen nicht zu Wuersten werden. */
const box = (w, h, d) =>
  geo(`b${w},${h},${d}`, () => {
    const r = Math.min(w, h, d) * 0.3;
    return r > 0.004 ? new THREE.RoundedBoxGeometry(w, h, d, 2, r)
                     : new THREE.BoxGeometry(w, h, d);
  });
const ring = (r, t, s) =>
  geo(`t${r},${t},${s||16}`, () => new THREE.TorusGeometry(r, t, 8, s || 16));
/** Kugelschale mit Ausschnitt: für eine Kapuze, die vorn offen ist.
    phi = π/2 zeigt nach +Z (vorn), dort bleibt die Lücke. */
const shell = (r, gap, s) =>
  geo(`h${r},${gap},${s||26}`, () => new THREE.SphereGeometry(
    r, s || 26, 14, Math.PI/2 + gap, Math.PI*2 - 2*gap));

/** Drehprofil: aus einer Silhouette einen runden Körper machen.
    Damit werden Rumpf, Stiefel und Türme rund statt eckig. */
function lathe(key, pts, seg){
  return geo("l" + key, () => new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y)), seg || 18));
}

function part(g, m, x, y, z){
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x || 0, y || 0, z || 0);
  mesh.castShadow = true;
  return mesh;
}
function joint(x, y, z){
  const g = new THREE.Group();
  g.position.set(x || 0, y || 0, z || 0);
  return g;
}

/* ============================================================
   ABDU — Nahkämpfer, Fraktion Eisenband
   ============================================================ */
function buildAbdu(){
  const root = new THREE.Group();
  const hips = joint(0, 0.56, 0);
  root.add(hips);

  /* --- Beine: Kapseln, Stiefel als Drehprofil ---------------- */
  const legProfile = lathe("boot", [
    [0.00, 0.00], [0.105, 0.01], [0.125, 0.06], [0.118, 0.13],
    [0.100, 0.18], [0.098, 0.22], [0.00, 0.23],
  ]);
  const leg = side => {
    const j = joint(0.135 * side, 0, 0);
    const thigh = part(capsule(0.090, 0.17, 14), cloth(PAL.cloth), 0, -0.13, 0);
    const knee  = part(ball(0.072, 14), hide(PAL.leatherDk), 0, -0.255, 0.008);
    const calf  = part(capsule(0.068, 0.15, 14), hide(PAL.leather), 0, -0.35, 0.004);
    const boot  = part(legProfile, hide(PAL.leatherDk), 0, -0.50, 0.01);
    boot.scale.set(1.15, 1.0, 1.5);
    const cap = part(dome(0.088, 16), metal(PAL.steelDark, 0.4), 0, -0.47, 0.075);
    cap.rotation.x = Math.PI * 0.42;
    cap.scale.set(1.15, 0.7, 1.2);
    j.add(thigh, knee, calf, boot, cap);
    return j;
  };
  const legL = leg(-1), legR = leg(1);
  hips.add(legL, legR);

  /* --- Rumpf: ein Drehprofil, taillieren statt stapeln -------- */
  const torso = joint(0, 0.04, 0);
  hips.add(torso);

  const bodyProfile = lathe("abdutorso", [
    [0.000, 0.00], [0.148, 0.01], [0.158, 0.07], [0.139, 0.16],
    [0.168, 0.26], [0.205, 0.35], [0.198, 0.44], [0.145, 0.49], [0.000, 0.50],
  ], 20);
  const body = part(bodyProfile, cloth(PAL.cloth), 0, 0, 0);
  body.scale.set(1.16, 1, 0.90);                       // breite Schultern, flacher Rücken
  torso.add(body);

  // Brustpanzer als zweites, etwas größeres Profil nur über der Brust
  const plate = part(lathe("abduplate", [
    [0.000, 0.00], [0.175, 0.01], [0.200, 0.07], [0.213, 0.15], [0.190, 0.20], [0.000, 0.21],
  ], 20), metal(PAL.steelDark, 0.38), 0, 0.24, 0);
  plate.scale.set(1.16, 1, 0.93);
  torso.add(plate);

  // Gürtel und Schnalle
  const belt = part(ring(0.175, 0.028, 20), hide(PAL.leather), 0, 0.09, 0);
  belt.rotation.x = Math.PI/2; belt.scale.set(1.12, 0.9, 0.95);
  torso.add(belt);
  torso.add(part(ball(0.038, 14), metal(PAL.copper, 0.3), 0, 0.09, 0.155));

  // Riemenkreuz
  for(const a of [0.62, -0.62]){
    const s = part(box(0.40, 0.038, 0.022), hide(PAL.leatherDk), 0, 0.30, 0.145);
    s.rotation.z = a;
    torso.add(s);
  }

  /* --- Fellmantel: drei versetzte Lagen aus weichen Zotteln --- */
  const mantle = joint(0, 0.44, 0);
  torso.add(mantle);
  const tuftGeo = capsule(0.036, 0.085, 8);
  for(let layer = 0; layer < 2; layer++){
    const n = 11 + layer * 3;
    const rad = 0.235 + layer * 0.04;
    for(let i = 0; i < n; i++){
      const a = (i / n) * Math.PI * 2 + layer * 0.35;
      // Vor der Brust bleibt das Fell weg — dort sitzt der Panzer.
      if(Math.cos(a) > 0.45) continue;
      const back = Math.cos(a) < -0.2 ? 1.8 : 0.9;
      const col = [PAL.fur, PAL.furDark, PAL.furLite][(i + layer) % 3];
      const t = part(tuftGeo, cloth(col),
                     Math.sin(a) * rad, -0.04 - layer * 0.045 - 0.035 * back, Math.cos(a) * rad);
      t.scale.set(1, back, 1);
      t.rotation.set(Math.cos(a) * 0.34, a, -Math.sin(a) * 0.34);
      mantle.add(t);
    }
  }
  const collar = part(lathe("collar", [
    [0.00, 0.00], [0.20, 0.02], [0.225, 0.07], [0.18, 0.12], [0.00, 0.13],
  ], 20), cloth(PAL.fur), 0, -0.05, -0.02);
  collar.scale.set(1.25, 1, 1.1);
  mantle.add(collar);

  /* --- Schulterpanzer: Halbkugel mit glatten Stacheln --------- */
  const pauldron = side => {
    const g = joint(0.275 * side, 0.41, 0);
    const shell = part(dome(0.135, 20), metal(PAL.steel, 0.3), 0, 0, 0);
    shell.scale.set(1.05, 0.95, 1.15);
    shell.rotation.z = -0.28 * side;
    g.add(shell);
    const trim = part(ring(0.135, 0.018, 20), metal(PAL.steelDark, 0.4), 0, 0, 0);
    trim.rotation.x = Math.PI/2; trim.scale.set(1.05, 1.15, 1);
    g.add(trim);
    for(let i = 0; i < 4; i++){
      const a = -0.62 + i * 0.42;
      const s = part(spike(0.030, 0.125, 12), metal(PAL.steelLite, 0.28),
                     Math.sin(a) * 0.11 * side, 0.095, Math.cos(a) * 0.12 - 0.02);
      s.rotation.set(0.2, 0, -0.55 * side);
      g.add(s);
    }
    return g;
  };
  torso.add(pauldron(-1), pauldron(1));

  /* --- Arme --------------------------------------------------- */
  const arm = side => {
    const j = joint(0.255 * side, 0.395, 0);
    j.add(part(capsule(0.062, 0.19, 14), skin(PAL.skin), 0, -0.145, 0));
    j.add(part(ball(0.058, 12), skin(PAL.skin), 0, -0.275, 0));
    j.add(part(capsule(0.055, 0.16, 14), skin(PAL.skinDark), 0, -0.375, 0));
    const gaunt = part(ball(0.078, 16), metal(PAL.steel, 0.34), 0, -0.485, 0);
    gaunt.scale.set(1, 1.15, 1.05);
    j.add(gaunt);
    for(let i = 0; i < 3; i++)
      j.add(part(spike(0.018, 0.055, 10), metal(PAL.steelLite, 0.3),
                 (-0.040 + i * 0.040) * side, -0.480, 0.066));
    return j;
  };
  const armL = arm(-1), armR = arm(1);
  torso.add(armL, armR);

  /* --- Kopf ---------------------------------------------------- */
  torso.add(part(tube(0.070, 0.082, 0.13, 14), skin(PAL.skinDark), 0, 0.545, -0.005));
  const head = joint(0, 0.70, 0);
  torso.add(head);

  const skull = part(ball(0.155, 20), skin(PAL.skin), 0, 0.02, 0);
  skull.scale.set(1.0, 1.1, 0.98);
  head.add(skull);
  head.add(part(capsule(0.058, 0.04, 12), skin(PAL.skin), 0, -0.06, 0.10));   // Kinn
  // Hier stand früher ein hautfarbener Zylinder als Hinterkopf. Solange
  // die Haare eine dicke Halbkugel waren, lag er darunter verborgen. Mit
  // der schlankeren Slickback-Frisur ragte er oben aus dem Haar heraus —
  // als beige Kugel mitten im Hinterkopf. Den Hinterkopf bilden jetzt
  // Haarellipse und Nackenfülle allein.

  for(const ex of [-0.058, 0.058]){                                   // Augen
    const e = part(ball(0.020, 12), mat(0xF2EDE4, { roughness:0.35 }), ex, 0.030, 0.126);
    const ir = part(ball(0.011, 10), mat(0x3A2A1C, { roughness:0.3 }), ex, 0.030, 0.140);
    head.add(e, ir);
    const brow = part(box(0.048, 0.014, 0.02), cloth(PAL.hair), ex, 0.068, 0.135);
    brow.rotation.z = ex > 0 ? -0.16 : 0.16;
    head.add(brow);
  }

  /* --- Haar: nach hinten gegelt -------------------------------------
     Vorher war das eine Halbkugel — die hat rundherum eine waagerechte
     Schnittkante und sieht deshalb aus wie eine über die Stirn gezogene
     Mütze. Stattdessen jetzt eine Vollellipse, die gegenüber dem Schädel
     nach HINTEN und nach OBEN versetzt ist: vorn verschwindet sie im Kopf
     (Stirn bleibt frei, die Haarlinie sitzt hoch), oben und hinten ragt
     sie heraus. Genau das ergibt die Silhouette von zurückgekämmtem Haar.
     Darüber liegen einzelne Strähnen, die die Kämmrichtung zeigen.    */
  const hairMat = cloth(PAL.hair);

  const hair = part(ball(0.162, 22), hairMat, 0, 0.046, -0.020);
  hair.scale.set(1.02, 0.99, 1.04);        // eng am Schädel, nicht bauschig
  head.add(hair);

  // Aufwölbung über der Stirn: der Punkt, ab dem das Haar zurückgeht.
  // Ohne sie beginnt die Frisur aus dem Nichts und wirkt wie ein Topfschnitt.
  const quiff = part(ball(0.088, 16), hairMat, 0, 0.150, 0.040);
  quiff.scale.set(1.35, 0.62, 1.05);
  quiff.rotation.x = -0.42;
  head.add(quiff);

  // Fülle im Nacken, deutlich flacher als zuvor
  const bulk = part(ball(0.108, 18), hairMat, 0, 0.022, -0.118);
  bulk.scale.set(0.92, 0.80, 1.16);
  head.add(bulk);

  // Auslauf am Nacken
  const tail = part(capsule(0.038, 0.040, 12), hairMat, 0, -0.068, -0.140);
  tail.rotation.x = -0.60;
  tail.scale.set(1.55, 1, 0.70);
  head.add(tail);

  // Schläfen: höher angesetzt, damit sie nicht über die Wangen hängen
  for(const sx of [-1, 1]){
    const temple = part(ball(0.088, 14), hairMat, 0.130 * sx, 0.070, -0.062);
    temple.scale.set(0.32, 0.62, 1.02);
    head.add(temple);
    // Ohr davor, damit sich Ohr und Schläfenhaar nicht durchdringen
    const ear = part(ball(0.034, 12), skin(PAL.skinDark), 0.146 * sx, -0.008, 0.026);
    ear.scale.set(0.38, 1.10, 0.78);
    head.add(ear);
  }

  // Strähnen: dünner und heller, damit sie als Glanz statt als Wülste lesen
  for(let i = 0; i < 9; i++){
    const dx = (i / 8 - 0.5) * 0.215;
    const st = part(capsule(0.0075, 0.225, 8), cloth(0x4A3626),
                    dx, 0.132 - Math.abs(dx) * 0.44, -0.024 - Math.abs(dx) * 0.12);
    st.rotation.x = -1.80;                 // nach hinten geneigt, dem Schädel folgend
    st.rotation.z = -dx * 2.4;             // nach außen auffächernd
    head.add(st);
  }

  // Bart: Schnurrbart plus Kinnbart, weiche Formen
  const mous = part(capsule(0.026, 0.075, 10), cloth(PAL.hair), 0, -0.035, 0.135);
  mous.rotation.z = Math.PI/2;
  head.add(mous);
  const goat = part(ball(0.052, 14), cloth(PAL.hair), 0, -0.085, 0.115);
  goat.scale.set(0.85, 1.15, 0.7);
  head.add(goat);

  // Runde Brille
  for(const x of [-0.058, 0.058]){
    const l = part(ring(0.042, 0.0085, 20), metal(PAL.copper, 0.22), x, 0.030, 0.146);
    head.add(l);
    const arm2 = part(box(0.075, 0.008, 0.008), metal(PAL.copper, 0.22), x * 1.9, 0.036, 0.09);
    head.add(arm2);
  }
  head.add(part(tube(0.008, 0.008, 0.045, 8), metal(PAL.copper, 0.25), 0, 0.025, 0.14)
           , part(ball(0.017, 10), skin(PAL.skinDark), 0, -0.005, 0.155));   // Nase

  /* --- Doppelköpfige Axt --------------------------------------- */
  const axe = joint(0, -0.485, 0.045);        // sitzt im Panzerhandschuh
  armR.add(axe);
  axe.rotation.set(-0.30, 0.10, -0.52);      // schraeg nach hinten oben
  axe.add(part(tube(0.026, 0.030, 0.92, 12), wood(PAL.wood), 0, 0.16, 0));
  axe.add(part(ball(0.040, 14), metal(PAL.steelDark, 0.35), 0, -0.30, 0));
  const grip = part(ring(0.036, 0.011, 14), hide(PAL.leatherDk), 0, -0.10, 0);
  grip.rotation.x = Math.PI/2;
  axe.add(grip);

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.024);
  bladeShape.lineTo(0.135, -0.145);
  bladeShape.quadraticCurveTo(0.245, 0, 0.135, 0.145);
  bladeShape.lineTo(0, 0.024);
  bladeShape.closePath();
  const bladeGeo = geo("blade2", () => new THREE.ExtrudeGeometry(bladeShape, {
    depth:0.034, bevelEnabled:true, bevelSize:0.012, bevelThickness:0.011, bevelSegments:3,
    curveSegments:12,
  }));
  for(const s of [1, -1]){
    const b = part(bladeGeo, metal(PAL.steel, 0.24), 0, 0.58, -0.017);
    b.scale.x = s;
    axe.add(b);
    const inlay = part(box(0.065, 0.020, 0.040), metal(PAL.copper, 0.3), 0.10 * s, 0.58, 0);
    axe.add(inlay);
  }
  axe.add(part(tube(0.038, 0.038, 0.13, 12), metal(PAL.steelDark, 0.35), 0, 0.58, 0));

  root.userData.rig = { hips, torso, head, legL, legR, armL, armR, prop:axe, height:1.62 };
  return root;
}

/* ============================================================
   YUNUS PEACE — Fernkämpfer mit Bogen

   Hinweis zu den Vorlagen: Auf dem Referenzblatt sind ein
   Vereinswappen und das Logo einer realen Fluggesellschaft zu
   sehen. Beides ist bewusst NICHT nachgebaut. Übernommen sind
   nur Schnitt und Farben des Trikots, Bart, Bogen und Köcher.
   ============================================================ */
const KIT = { gold:0xF2C81E, navy:0x16386B, sock:0xEFEFEF, boot:0x171719,
              bow:0x6E4526, shaft:0xBFA079, fletch:0xDCD6C7, beard:0x1E1510 };

/** Senkrechte Trikotstreifen als Textur.
    Bei einem Drehprofil läuft die u-Koordinate einmal um den Körper —
    aus waagerechten Bändern im Bild werden dadurch senkrechte
    Streifen am Trikot. Zwölf Bänder ergeben die Streifenbreite
    der Vorlage. */
let _kitMat = null;
function kitMaterial(){
  if(_kitMat) return _kitMat;
  const c = document.createElement("canvas");
  c.width = 384; c.height = 8;
  const g = c.getContext("2d");
  const bands = 12;
  for(let i = 0; i < bands; i++){
    g.fillStyle = i % 2 ? "#16386B" : "#F2C81E";
    g.fillRect(Math.floor(i * 384 / bands), 0, Math.ceil(384 / bands) + 1, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _kitMat = new THREE.MeshStandardMaterial({ map:t, roughness:0.88, metalness:0.0 });
  // Streifen bleiben, aber das Gewebe-Relief kommt dazu
  if(typeof texSet === "function"){
    const cl = texSet("cloth");
    _kitMat.normalMap = cl.normalMap;
    _kitMat.roughnessMap = cl.roughnessMap;
    _kitMat.normalScale = new THREE.Vector2(0.8, 0.8);
    _kitMat.needsUpdate = true;
  }
  return _kitMat;
}

function buildYunus(){
  const root = new THREE.Group();
  const hips = joint(0, 0.62, 0);
  root.add(hips);

  /* --- Beine: Sportlerbeine mit Stutzen und Fußballschuh -------- */
  const bootProfile = lathe("fbboot", [
    [0.00, 0.00], [0.095, 0.008], [0.108, 0.045], [0.098, 0.09],
    [0.080, 0.12], [0.078, 0.15], [0.00, 0.16],
  ]);
  const leg = side => {
    const j = joint(0.115 * side, 0, 0);
    j.add(part(capsule(0.068, 0.15, 14), skin(PAL.skin), 0, -0.19, 0));        // Oberschenkel
    j.add(part(ball(0.056, 14), skin(PAL.skinDark), 0, -0.325, 0.006));        // Knie
    j.add(part(capsule(0.058, 0.10, 14), skin(PAL.skin), 0, -0.395, 0));       // Wade oben
    const sock = part(capsule(0.058, 0.13, 14), cloth(KIT.navy), 0, -0.50, 0); // Stutzen
    const band = part(tube(0.062, 0.062, 0.05, 14), cloth(KIT.sock), 0, -0.415, 0);
    const foot = part(bootProfile, cloth(KIT.boot), 0, -0.60, 0.015);
    foot.scale.set(1.05, 1.0, 1.75);
    j.add(sock, band, foot);
    return j;
  };
  const legL = leg(-1), legR = leg(1);
  hips.add(legL, legR);

  // Hose sitzt an der Hüfte, nicht am Bein — sonst schwingt sie mit
  const shorts = part(lathe("fbshorts", [
    [0.000, 0.00], [0.185, 0.01], [0.192, 0.09], [0.168, 0.18], [0.000, 0.19],
  ], 18), cloth(KIT.navy), 0, -0.19, 0);
  shorts.scale.set(1.08, 1, 0.92);
  hips.add(shorts);

  /* --- Rumpf im Streifentrikot ---------------------------------- */
  const torso = joint(0, 0.02, 0);
  hips.add(torso);
  const jersey = part(lathe("fbtorso", [
    [0.000, 0.00], [0.132, 0.01], [0.142, 0.08], [0.128, 0.18],
    [0.152, 0.28], [0.174, 0.37], [0.166, 0.44], [0.128, 0.48], [0.000, 0.49],
  ], 22), kitMaterial(), 0, 0, 0);
  jersey.scale.set(1.12, 1, 0.84);          // sportlich: breit, aber flach
  torso.add(jersey);

  // Kragen
  const collar = part(ring(0.085, 0.018, 18), cloth(KIT.navy), 0, 0.475, 0.005);
  collar.rotation.x = Math.PI/2; collar.scale.set(1.15, 1, 0.9);
  torso.add(collar);

  /* --- Köcher auf dem Rücken ------------------------------------ */
  const quiver = joint(-0.125, 0.28, -0.150);
  quiver.rotation.set(0.22, 0, -0.30);
  torso.add(quiver);
  quiver.add(part(tube(0.058, 0.052, 0.34, 14), hide(PAL.leather), 0, 0, 0));
  quiver.add(part(ring(0.058, 0.012, 14), hide(PAL.leatherDk), 0, 0.10, 0));
  for(let i = 0; i < 5; i++){
    const a = i * 1.257, r = 0.030;
    const px2 = Math.sin(a) * r, pz2 = Math.cos(a) * r;
    quiver.add(part(tube(0.007, 0.007, 0.40, 6), wood(KIT.shaft), px2, 0.24, pz2));
    for(let f = 0; f < 3; f++){
      const fa = f * 2.094;
      const fl = part(box(0.006, 0.075, 0.038), cloth(KIT.fletch),
                      px2 + Math.sin(fa)*0.014, 0.40, pz2 + Math.cos(fa)*0.014);
      fl.rotation.y = fa;
      quiver.add(fl);
    }
  }

  /* --- Arme: kurze Trikotärmel, dann Haut ----------------------- */
  const arm = side => {
    const j = joint(0.205 * side, 0.40, 0);
    // Rohr statt Kapsel: an den Kugelkappen einer Kapsel laufen die
    // Bildkoordinaten sternförmig zusammen — die Streifen würden dort
    // zu einem Windrad. Beim Rohr laufen sie sauber senkrecht um.
    const sleeve = part(tube(0.076, 0.066, 0.15, 16), kitMaterial(), 0.010 * side, -0.055, 0);
    const cuff = part(ring(0.066, 0.010, 16), cloth(KIT.navy), 0.010 * side, -0.128, 0);
    cuff.rotation.x = Math.PI/2;
    // Schulterkappe einfarbig: die offene Deckflaeche des Rohrs zeigte
    // von oben sonst waagerechte Baender statt Streifen.
    const cap = part(dome(0.078, 16), cloth(KIT.navy), 0.010 * side, 0.016, 0);
    cap.scale.set(1, 0.72, 1);
    j.add(sleeve, cuff, cap);
    j.add(part(capsule(0.052, 0.15, 14), skin(PAL.skin), 0, -0.155, 0));
    j.add(part(ball(0.047, 12), skin(PAL.skinDark), 0, -0.255, 0));
    j.add(part(capsule(0.045, 0.14, 14), skin(PAL.skin), 0, -0.345, 0));
    const hand = part(ball(0.052, 14), skin(PAL.skin), 0, -0.44, 0);
    hand.scale.set(0.85, 1.05, 1.1);
    j.add(hand);
    return j;
  };
  const armL = arm(-1), armR = arm(1);
  torso.add(armL, armR);

  /* --- Bogen in der linken Hand ---------------------------------
     Vier Gelenke, jedes mit genau einer Drehung — so bleibt
     nachvollziehbar, was welche Achse tut. Eine einzelne
     rotation.set(x,y,z) hatte hier die Kantung VOR dem Aufstellen
     angewandt, wodurch der Bogen flach lag.                      */
  const bowMount = joint(0, -0.45, 0.04);
  armL.add(bowMount);
  bowMount.rotation.x = 1.14;              // hebt die Armneigung wieder auf
  const bowCant = joint(0, 0, 0);
  bowMount.add(bowCant);
  bowCant.rotation.z = 0.50;               // gekantet, damit er von oben lesbar bleibt
  const bow = joint(0, 0, 0);
  bowCant.add(bow);
  bow.rotation.y = -Math.PI/2;             // Wurfarme senkrecht, Bauch nach vorn

  const ARC = Math.PI * 1.1, RAD = 0.295;
  const limb = part(geo("fbbow2", () => new THREE.TorusGeometry(RAD, 0.016, 8, 28, ARC)),
                    wood(KIT.bow), 0, 0, 0);
  limb.rotation.z = -ARC/2;                // Bogenbauch auf +X zentrieren
  bow.add(limb);
  bow.add(part(ball(0.030, 12), hide(PAL.leatherDk), RAD, 0, 0));       // Griff
  const chordX = RAD * Math.cos(ARC/2), chordL = 2 * RAD * Math.sin(ARC/2);
  bow.add(part(tube(0.004, 0.004, chordL, 6), cloth(0xE8E2D4), chordX, 0, 0));
  // Aufgelegter Pfeil, waagerecht durch den Griff nach vorn
  const shaft = part(tube(0.006, 0.006, 0.52, 6), wood(KIT.shaft), RAD * 0.30, 0.0, 0);
  shaft.rotation.z = Math.PI/2;
  bow.add(shaft);
  const tip = part(spike(0.019, 0.06, 8), metal(PAL.steelDark, 0.35), RAD * 0.30 + 0.29, 0, 0);
  tip.rotation.z = -Math.PI/2;
  bow.add(tip);

  /* --- Kopf ------------------------------------------------------ */
  torso.add(part(tube(0.058, 0.070, 0.11, 14), skin(PAL.skinDark), 0, 0.525, 0));
  const head = joint(0, 0.665, 0);
  torso.add(head);

  const skull = part(ball(0.145, 22), skin(PAL.skin), 0, 0.015, 0);
  skull.scale.set(1.0, 1.06, 0.97);
  head.add(skull);
  head.add(part(ball(0.016, 10), skin(PAL.skin), 0, -0.012, 0.146));            // Nase

  // Vollbart: etwas größer als der Schädel, damit er an den Wangen sichtbar wird
  const beard = part(ball(0.150, 20), cloth(KIT.beard), 0, -0.072, 0.012);
  beard.scale.set(1.02, 0.60, 0.95);
  head.add(beard);
  const mous = part(capsule(0.022, 0.062, 10), cloth(KIT.beard), 0, -0.032, 0.124);
  mous.rotation.z = Math.PI/2;
  head.add(mous);
  head.add(part(box(0.042, 0.012, 0.02), cloth(0x2B1F18), 0, -0.062, 0.132));   // Mund

  // Augen: grün, mit kräftigen Brauen
  for(const ex of [-0.055, 0.055]){
    head.add(part(ball(0.020, 12), mat(0xF4F0E7, { roughness:0.35 }), ex, 0.030, 0.118));
    head.add(part(ball(0.011, 10), mat(0x4F6B32, { roughness:0.3 }), ex, 0.030, 0.132));
    const brow = part(box(0.050, 0.017, 0.022), cloth(KIT.beard), ex, 0.072, 0.126);
    brow.rotation.z = ex > 0 ? -0.20 : 0.20;
    head.add(brow);
  }

  // Haar: dieselbe Bauweise wie bei Abdu — Vollellipse nach hinten
  // versetzt, damit keine Mützenkante entsteht — plus Spitzen obenauf.
  const hairMat = cloth(PAL.hair);
  // Die Tiefe der Haarellipse muss KLEINER bleiben als die des Schädels,
  // sonst ragt sie über die Stirn. Schädel-Tiefe hier: 0.145 * 0.97 = 0.141.
  const hair = part(ball(0.147, 22), hairMat, 0, 0.044, -0.028);
  hair.scale.set(1.02, 0.99, 1.03);
  head.add(hair);
  const bulk = part(ball(0.100, 16), hairMat, 0, 0.020, -0.110);
  bulk.scale.set(0.94, 0.82, 1.12);
  head.add(bulk);
  for(const sx of [-1, 1]){
    const temple = part(ball(0.082, 14), hairMat, 0.122 * sx, 0.060, -0.050);
    temple.scale.set(0.34, 0.66, 1.0);
    head.add(temple);
  }
  // Spitzen: nach oben hinten stehendes Deckhaar
  for(let i = 0; i < 9; i++){
    const dx = (i / 8 - 0.5) * 0.19;
    const sp = part(capsule(0.020, 0.075, 8), hairMat,
                    dx, 0.168 - Math.abs(dx) * 0.42, 0.026 - Math.abs(dx) * 0.14);
    sp.rotation.x = -0.85 - Math.abs(dx) * 0.5;
    sp.rotation.z = -dx * 3.2;
    head.add(sp);
  }

  // Grundstellung: linker Arm hält den Bogen vor, rechter zieht die Sehne.
  // Der Renderer addiert Lauf- und Schlagbewegung auf diese Werte.
  root.userData.rig = { hips, torso, head, legL, legR, armL, armR, prop:bow,
                        poseL:-1.05, poseR:-0.88, height:1.58 };
  return root;
}

/* ============================================================
   MERTABI — Zauberer mit Kristallstab

   Zu den Vorlagen: Auf dem Referenzblatt sind zweimal Logos eines
   bestehenden Spiels eingeblendet. Die sind NICHT nachgebaut.
   Übernommen sind Kapuzenrobe, Goldbesatz, Gürtel mit Kronen-
   schnalle, Stiefel, Brille, Bart und der lila Kristallstab.
   ============================================================ */
const ROBE = { cloth:0x6E1F2A, dark:0x4E141C, gold:0xC79A38,
               belt:0x5B3A24, boot:0x4E3620, staff:0x7A1F2A, crystal:0x9B4BE8 };

function buildMertabi(){
  const root = new THREE.Group();
  const hips = joint(0, 0.50, 0);
  root.add(hips);

  /* --- Beine: kurz, nur die Stiefel schauen unter dem Saum hervor -- */
  const bootGeo = lathe("mboot", [
    [0.00, 0.00], [0.105, 0.008], [0.122, 0.05], [0.112, 0.11],
    [0.098, 0.15], [0.096, 0.19], [0.00, 0.20],
  ]);
  const leg = side => {
    const j = joint(0.115 * side, 0, 0);
    j.add(part(capsule(0.070, 0.16, 12), cloth(0x3A2A20), 0, -0.18, 0));
    const b = part(bootGeo, hide(ROBE.boot), 0, -0.47, 0.012);
    b.scale.set(1.05, 1.0, 1.45);
    j.add(b);
    return j;
  };
  const legL = leg(-1), legR = leg(1);
  hips.add(legL, legR);

  /* --- Robe: hängt an der Hüfte, damit sie beim Laufen nicht
         mit den Beinen mitschwingt ------------------------------ */
  const robe = part(lathe("mrobe", [
    [0.000, 0.00], [0.315, 0.006], [0.300, 0.09], [0.255, 0.26],
    [0.215, 0.42], [0.200, 0.56], [0.214, 0.68], [0.196, 0.80], [0.000, 0.82],
  ], 24), cloth(ROBE.cloth), 0, -0.40, 0);
  robe.scale.set(1.0, 1, 0.94);
  hips.add(robe);

  // Goldsaum unten
  const hem = part(ring(0.302, 0.017, 26), cloth(ROBE.gold), 0, -0.30, 0);
  hem.rotation.x = Math.PI/2; hem.scale.set(1, 1, 0.94);
  hips.add(hem);
  // Zwei senkrechte Goldbahnen vorn
  for(const sx of [-1, 1]){
    const strip = part(box(0.026, 0.46, 0.014), cloth(ROBE.gold),
                       0.062 * sx, -0.175, 0.229);
    strip.rotation.x = -0.24;
    strip.rotation.z = -0.05 * sx;
    hips.add(strip);
  }

  /* --- Rumpf ------------------------------------------------------ */
  const torso = joint(0, 0.02, 0);
  hips.add(torso);

  // Gürtel mit Kronenschnalle
  const belt = part(ring(0.208, 0.032, 22), hide(ROBE.belt), 0, 0.02, 0);
  belt.rotation.x = Math.PI/2; belt.scale.set(1, 1, 0.94);
  torso.add(belt);
  const buckle = part(box(0.13, 0.10, 0.028), cloth(ROBE.gold), 0, 0.02, 0.223);
  torso.add(buckle);
  for(let i = 0; i < 3; i++)
    torso.add(part(spike(0.018, 0.045, 8), cloth(ROBE.gold),
                   (-0.036 + i * 0.036), 0.055, 0.226));

  // Schulterpasse mit Goldkante
  const yoke = part(lathe("myoke", [
    [0.000, 0.00], [0.205, 0.01], [0.222, 0.08], [0.196, 0.15], [0.000, 0.16],
  ], 22), cloth(ROBE.dark), 0, 0.30, 0);
  yoke.scale.set(1.0, 1, 0.94);
  torso.add(yoke);
  const yokeTrim = part(ring(0.216, 0.014, 24), cloth(ROBE.gold), 0, 0.335, 0);
  yokeTrim.rotation.x = Math.PI/2; yokeTrim.scale.set(1, 1, 0.94);
  torso.add(yokeTrim);

  /* --- Arme mit weiten Ärmeln ------------------------------------- */
  const arm = side => {
    const j = joint(0.205 * side, 0.40, 0);
    const sleeve = part(lathe(`msleeve`, [
      [0.000, 0.00], [0.098, 0.01], [0.092, 0.14], [0.082, 0.26], [0.000, 0.27],
    ], 16), cloth(ROBE.cloth), 0, -0.28, 0);
    j.add(sleeve);
    const cuff = part(ring(0.086, 0.016, 18), cloth(ROBE.gold), 0, -0.26, 0);
    cuff.rotation.x = Math.PI/2;
    j.add(cuff);
    j.add(part(capsule(0.050, 0.10, 12), skin(PAL.skin), 0, -0.34, 0));
    const hand = part(ball(0.056, 14), skin(PAL.skin), 0, -0.43, 0);
    hand.scale.set(0.9, 1.0, 1.05);
    j.add(hand);
    return j;
  };
  const armL = arm(-1), armR = arm(1);
  torso.add(armL, armR);

  /* --- Kristallstab in der rechten Hand ---------------------------
     Wie beim Bogen: erst die Armneigung aufheben, dann steht der
     Stab senkrecht, unabhängig von der Laufbewegung.            */
  const staffMount = joint(0, -0.43, 0.02);
  armR.add(staffMount);
  staffMount.rotation.x = 0.25;
  staffMount.rotation.z = -0.10;
  staffMount.add(part(tube(0.021, 0.025, 1.20, 12), wood(ROBE.staff), 0, 0.26, 0));
  for(const y of [-0.10, 0.44])
    staffMount.add((() => { const g = part(ring(0.028, 0.010, 14), cloth(ROBE.gold), 0, y, 0);
                            g.rotation.x = Math.PI/2; return g; })());
  // Fassung und Kristall
  const socket = part(tube(0.052, 0.030, 0.09, 10), cloth(ROBE.gold), 0, 0.845, 0);
  staffMount.add(socket);
  for(let i = 0; i < 4; i++){
    const a = i * Math.PI/2;
    const claw = part(spike(0.018, 0.13, 8), cloth(ROBE.gold),
                      Math.sin(a) * 0.048, 0.925, Math.cos(a) * 0.048);
    claw.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
    staffMount.add(claw);
  }
  const crystalMat = mat(ROBE.crystal, { emissive:ROBE.crystal, emissiveIntensity:1.4,
                                         roughness:0.15, metalness:0.1 });
  const up = part(spike(0.072, 0.19, 6), crystalMat, 0, 1.05, 0);
  const dn = part(spike(0.072, 0.10, 6), crystalMat, 0, 0.905, 0);
  dn.rotation.x = Math.PI;
  staffMount.add(up, dn);

  /* --- Kopf -------------------------------------------------------- */
  torso.add(part(tube(0.058, 0.070, 0.10, 14), skin(PAL.skinDark), 0, 0.505, 0));
  const head = joint(0, 0.635, 0);
  torso.add(head);

  const skullM = part(ball(0.142, 22), skin(PAL.skin), 0, 0.015, 0);
  skullM.scale.set(1.0, 1.06, 0.97);
  head.add(skullM);
  head.add(part(ball(0.016, 10), skin(PAL.skin), 0, -0.012, 0.143));

  const beardM = part(ball(0.148, 20), cloth(0x241812), 0, -0.070, 0.010);
  beardM.scale.set(1.02, 0.60, 0.95);
  head.add(beardM);
  const mousM = part(capsule(0.021, 0.058, 10), cloth(0x241812), 0, -0.030, 0.122);
  mousM.rotation.z = Math.PI/2;
  head.add(mousM);
  for(const ex of [-0.053, 0.053]){
    head.add(part(ball(0.019, 12), mat(0xF4F0E7, { roughness:0.35 }), ex, 0.032, 0.116));
    head.add(part(ball(0.010, 10), mat(0x3B2A1C, { roughness:0.3 }), ex, 0.032, 0.130));
    const l = part(ring(0.044, 0.008, 20), metal(0xD8D4CB, 0.25), ex, 0.032, 0.140);
    head.add(l);
  }
  head.add(part(tube(0.007, 0.007, 0.040, 8), metal(0xD8D4CB, 0.25), 0, 0.032, 0.146));
  // Haaransatz unter der Kapuze
  const fringe = part(ball(0.140, 18), cloth(PAL.hair), 0, 0.062, -0.010);
  fringe.scale.set(1.02, 0.86, 1.02);
  head.add(fringe);

  /* --- Kapuze: Schale mit Ausschnitt nach vorn --------------------- */
  const hoodMat = new THREE.MeshStandardMaterial({ color:ROBE.cloth, roughness:0.92,
                                                   side:THREE.DoubleSide });
  const hood = new THREE.Mesh(shell(0.205, 0.80, 28), hoodMat);
  hood.position.set(0, 0.030, -0.030);
  hood.scale.set(1.02, 1.10, 1.14);
  hood.castShadow = true;
  head.add(hood);
  // Zipfel hinten
  const peak = part(spike(0.085, 0.20, 10), cloth(ROBE.cloth), 0, 0.115, -0.185);
  peak.rotation.x = 1.55;
  head.add(peak);
  // Goldkante um die Öffnung
  const brim = part(ring(0.198, 0.017, 26), cloth(ROBE.gold), 0, 0.025, 0.006);
  brim.rotation.x = -0.16;
  brim.scale.set(1.02, 1.12, 1);
  head.add(brim);

  root.userData.rig = { hips, torso, head, legL, legR, armL, armR, prop:staffMount,
                        poseL:-1.25, poseR:-0.25, height:1.62 };
  return root;
}

/* ============================================================
   TIMGIOH — Riese, Tank

   Aus dem Referenzblatt: Brustpanzer aus Fassdauben mit Metall-
   reifen und Seilbindung, verstärkte Schulterstücke, Lederstulpen,
   breiter Gürtel mit Messingschnalle, Kittel mit ausgefranstem
   Saum, blaugrüne Hose, schwere Stiefel. Keine Waffe — er
   schlägt mit den Fäusten. Deutlich größer als die übrigen
   Figuren; die Größenangabe auf dem Blatt ist eindeutig.
   ============================================================ */
const TIM = { tunic:0x9E9068, tunicDk:0x7E7150, plank:0x8A7250, plankDk:0x6B5739,
              band:0x76797E, rust:0x8E5A32, rope:0xBFA87C, leather:0x6B4A2E,
              leatherDk:0x483120, brass:0xB99038, trouser:0x3C5A63, boot:0x5A4028 };

function buildTimgioh(){
  const root = new THREE.Group();
  const hips = joint(0, 0.64, 0);
  root.add(hips);

  /* --- Beine: kurz und stämmig, breiter Stand ------------------- */
  const bootGeo = lathe("tboot", [
    [0.00, 0.00], [0.150, 0.01], [0.168, 0.07], [0.155, 0.15],
    [0.170, 0.20], [0.166, 0.28], [0.00, 0.29],
  ], 20);
  const leg = side => {
    const j = joint(0.165 * side, 0, 0);
    j.add(part(capsule(0.115, 0.17, 16), cloth(TIM.trouser), 0, -0.15, 0));
    j.add(part(capsule(0.104, 0.12, 16), cloth(TIM.trouser), 0, -0.35, 0));
    const b = part(bootGeo, hide(TIM.boot), 0, -0.56, 0.02);
    b.scale.set(1.05, 1.0, 1.45);
    j.add(b);
    const rim = part(ring(0.156, 0.024, 18), hide(TIM.leatherDk), 0, -0.355, 0.01);
    rim.rotation.x = Math.PI/2; rim.scale.set(1.02, 1, 1.15);
    j.add(rim);
    return j;
  };
  const legL = leg(-1), legR = leg(1);
  hips.add(legL, legR);

  /* --- Rumpf: schwerer Kittel ----------------------------------- */
  const torso = joint(0, 0.03, 0);
  hips.add(torso);
  const body = part(lathe("ttorso", [
    [0.000, 0.00], [0.215, 0.01], [0.232, 0.10], [0.228, 0.24],
    [0.238, 0.38], [0.230, 0.50], [0.192, 0.58], [0.000, 0.60],
  ], 24), cloth(TIM.tunic), 0, -0.10, 0);
  body.scale.set(1.06, 1, 0.90);
  torso.add(body);

  // Ausgefranster Saum: einzelne Zipfel statt glatter Kante
  for(let i = 0; i < 16; i++){
    const a = (i / 16) * Math.PI * 2;
    const len = 0.055 + (i % 3) * 0.022;
    const t = part(box(0.030, len, 0.010), cloth(i % 2 ? TIM.tunic : TIM.tunicDk),
                   Math.sin(a) * 0.222 * 1.06, -0.104 - len/2, Math.cos(a) * 0.222 * 0.90);
    t.rotation.y = a;
    t.rotation.x = (i % 2 ? 0.12 : -0.08);
    torso.add(t);
  }

  /* --- Brustpanzer aus Fassdauben -------------------------------
     Neun senkrechte Bretter auf einem Frontbogen, dazu zwei
     Metallreifen und zwei Seilbindungen.                       */
  const CH = 0.222;
  for(let i = 0; i < 9; i++){
    const a = -1.15 + i * 0.2875;
    const pl = part(box(0.062, 0.33, 0.042), wood(i % 2 ? TIM.plank : TIM.plankDk),
                    Math.sin(a) * CH * 1.06, 0.335, Math.cos(a) * CH * 0.90);
    pl.rotation.y = a;
    torso.add(pl);
  }
  for(const [y, col, tb] of [[0.265, TIM.band, 0.020], [0.405, TIM.band, 0.020],
                             [0.195, TIM.rope, 0.013], [0.470, TIM.rope, 0.013]]){
    const hoop = part(ring(CH + 0.014, tb, 26), col === TIM.rope ? hide(col) : metal(col, 0.5),
                      0, y, 0);
    hoop.rotation.x = Math.PI/2;
    hoop.scale.set(1.06, 0.90, 1);
    torso.add(hoop);
  }
  // Rostflecken auf den Reifen
  for(let i = 0; i < 5; i++){
    const a = -1.0 + i * 0.5;
    torso.add(part(box(0.040, 0.038, 0.024), mat(TIM.rust, { roughness:0.95 }),
                   Math.sin(a) * (CH + 0.016) * 1.06, 0.265 + (i % 2) * 0.14,
                   Math.cos(a) * (CH + 0.016) * 0.90));
  }

  /* --- Gürtel mit Messingschnalle ------------------------------- */
  const belt = part(ring(0.228, 0.040, 24), hide(TIM.leather), 0, -0.02, 0);
  belt.rotation.x = Math.PI/2; belt.scale.set(1.06, 0.90, 1);
  torso.add(belt);
  torso.add(part(box(0.130, 0.112, 0.038), metal(TIM.brass, 0.45), 0, -0.02, 0.232));
  torso.add(part(box(0.086, 0.072, 0.044), cloth(TIM.leather), 0, -0.02, 0.238));

  /* --- Schulterstücke: dieselben Dauben, quer gelegt ------------ */
  const pauldron = side => {
    const g = joint(0.278 * side, 0.455, 0);
    g.rotation.z = -0.28 * side;
    for(let i = 0; i < 3; i++){
      const pl = part(box(0.165, 0.070, 0.195), wood(i % 2 ? TIM.plank : TIM.plankDk),
                      0.02 * side, 0.015 - i * 0.082, 0);
      pl.rotation.x = 0.06 * i;
      g.add(pl);
    }
    const strap = part(box(0.034, 0.245, 0.205), metal(TIM.band, 0.5), 0.062 * side, -0.05, 0);
    g.add(strap);
    g.add(part(ball(0.022, 10), metal(TIM.brass, 0.4), 0.062 * side, 0.025, 0.10));
    return g;
  };
  torso.add(pauldron(-1), pauldron(1));

  /* --- Arme: dick, mit Lederstulpe und Faust -------------------- */
  const arm = side => {
    const j = joint(0.268 * side, 0.445, 0);
    j.add(part(capsule(0.086, 0.14, 16), cloth(TIM.tunic), 0, -0.09, 0));    // Ärmel
    j.add(part(capsule(0.078, 0.11, 16), skin(PAL.skin), 0, -0.26, 0));      // Oberarm
    const cuff = part(tube(0.092, 0.083, 0.17, 18), hide(TIM.leather), 0, -0.41, 0);
    j.add(cuff);
    j.add(part(ring(0.088, 0.012, 18), hide(TIM.leatherDk), 0, -0.492, 0));
    const fist = part(ball(0.086, 16), skin(PAL.skin), 0, -0.56, 0.012);
    fist.scale.set(0.92, 1.0, 1.06);
    j.add(fist);
    for(let k = 0; k < 3; k++)                                              // Knöchel
      j.add(part(ball(0.026, 10), skin(PAL.skinDark),
                 (-0.037 + k * 0.037) * side, -0.582, 0.076));
    return j;
  };
  const armL = arm(-1), armR = arm(1);
  torso.add(armL, armR);

  /* --- Kopf: massig, kurzes Haar, kein Bart --------------------- */
  torso.add(part(tube(0.098, 0.118, 0.16, 16), skin(PAL.skinDark), 0, 0.575, 0));
  const head = joint(0, 0.690, 0);
  torso.add(head);

  const skullT = part(ball(0.158, 22), skin(PAL.skin), 0, 0.018, 0);
  skullT.scale.set(1.0, 1.02, 0.97);
  head.add(skullT);
  // Schwere Wangen und Doppelkinn
  const jowl = part(ball(0.138, 18), skin(PAL.skin), 0, -0.064, 0.018);
  jowl.scale.set(1.06, 0.72, 0.98);
  head.add(jowl);
  head.add(part(ball(0.018, 10), skin(PAL.skin), 0, -0.016, 0.156));
  head.add(part(box(0.056, 0.013, 0.020), cloth(0x7A4A40), 0, -0.070, 0.138));  // Mund

  for(const ex of [-0.058, 0.058]){
    head.add(part(ball(0.020, 12), mat(0xF2EDE4, { roughness:0.35 }), ex, 0.032, 0.132));
    head.add(part(ball(0.010, 10), mat(0x4A3524, { roughness:0.3 }), ex, 0.032, 0.145));
    const brow = part(box(0.052, 0.017, 0.022), cloth(0x3B2A1C), ex, 0.072, 0.138);
    brow.rotation.z = ex > 0 ? -0.22 : 0.22;                                  // finsterer Blick
    head.add(brow);
  }

  // Kurzes Haar, nach der bewährten Bauweise: Vollellipse nach hinten
  // versetzt, damit vorn keine Mützenkante entsteht.
  const hairT = part(ball(0.160, 22), cloth(0x40301F), 0, 0.044, -0.022);
  hairT.scale.set(1.02, 0.96, 1.03);
  head.add(hairT);
  const napeT = part(ball(0.108, 16), cloth(0x40301F), 0, 0.010, -0.115);
  napeT.scale.set(0.94, 0.82, 1.08);
  head.add(napeT);
  for(const sx of [-1, 1]){
    const ear = part(ball(0.036, 12), skin(PAL.skinDark), 0.160 * sx, -0.004, 0.018);
    ear.scale.set(0.40, 1.10, 0.80);
    head.add(ear);
  }

  root.userData.rig = { hips, torso, head, legL, legR, armL, armR, prop:null,
                        poseL:0.10, poseR:0.10, height:1.86 };
  return root;
}

/* ============================================================
   ALLGEMEINE FIGUREN
   ============================================================ */
const ACCENT = {
  steinwaechter:0x8F9AA0, klingenwache:0xAEB6BE, rammbock:0x8A5A2E,
  rattenrudel:0x7C6B59,  strassenbande:0x9E3B3B, speerbrueder:0xBC8940,
  bogenschuetzinnen:0x3B8A58, feuermagier:0xDD6528, fernrohrschuetzin:0x587DA6,
  sturmfalke:0x8697A9,   fledermausschwarm:0x4A3A55, glockenballon:0xC44C4C,
  speerturm:0x998969,    bollwerk:0x877E6E,
};
function accentOf(cardId){
  if(typeof ACCENT[cardId] === "number") return ACCENT[cardId];
  let h = 0;
  for(let i = 0; i < cardId.length; i++) h = (h * 31 + cardId.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.4, 0.48).getHex();
}

/** Läufer: gemeinsames Gerüst für Nahkämpfer, Schützen und Schwärme. */
function buildWalker(card, cardId){
  const root = new THREE.Group();
  const acc = accentOf(cardId);
  const s = Math.max(0.72, card.radius / 0.45);
  const ranged = card.range >= 2.5;
  const heavy = !ranged && card.hp >= 1200;

  const hips = joint(0, 0.50 * s, 0);
  root.add(hips);

  const leg = side => {
    const j = joint(0.105 * s * side, 0, 0);
    j.add(part(capsule(0.072*s, 0.17*s, 12), cloth(PAL.cloth), 0, -0.13*s, 0));
    j.add(part(capsule(0.064*s, 0.13*s, 12), hide(PAL.leather), 0, -0.30*s, 0));
    const b = part(ball(0.082*s, 14), hide(PAL.leatherDk), 0, -0.43*s, 0.02*s);
    b.scale.set(1, 0.75, 1.45);
    j.add(b);
    return j;
  };
  const legL = leg(-1), legR = leg(1);
  hips.add(legL, legR);

  const torso = joint(0, 0.04*s, 0);
  hips.add(torso);
  const prof = lathe(`w${ranged?1:0}${heavy?1:0}`, [
    [0.000, 0.00], [0.125, 0.01], [0.142, 0.08], [0.136, 0.16],
    [heavy?0.170:0.152, 0.26], [heavy?0.180:0.158, 0.34], [0.130, 0.40], [0.000, 0.41],
  ], 18);
  const body = part(prof, cloth(acc), 0, 0, 0);
  body.scale.set(s * (heavy ? 1.15 : 1.0), s, s * 0.92);
  torso.add(body);

  if(heavy){
    const pl = part(dome(0.16*s, 16), metal(PAL.steelDark, 0.4), 0, 0.22*s, 0);
    pl.scale.set(1.15, 0.9, 1.0);
    torso.add(pl);
  }
  const belt = part(ring(0.145*s, 0.026*s, 16), hide(PAL.leather), 0, 0.09*s, 0);
  belt.rotation.x = Math.PI/2; belt.scale.set(1.1, 0.95, 1);
  torso.add(belt);

  const arm = side => {
    const j = joint(0.19*s*side, 0.33*s, 0);
    j.add(part(capsule(0.055*s, 0.15*s, 12), skin(PAL.skin), 0, -0.12*s, 0));
    j.add(part(ball(0.062*s, 12), skin(PAL.skinDark), 0, -0.26*s, 0));
    return j;
  };
  const armL = arm(-1), armR = arm(1);
  torso.add(armL, armR);

  const head = joint(0, 0.52*s, 0);
  torso.add(head);
  const sk = part(ball(0.125*s, 18), skin(PAL.skin), 0, 0, 0);
  sk.scale.set(1, 1.08, 0.97);
  head.add(sk);
  // Kein dome: eine Halbkugel hat rundum eine waagerechte Kante und
  // sieht deshalb aus wie eine Mütze. Stattdessen eine Vollellipse,
  // nach hinten oben versetzt — Stirn frei, Masse im Nacken.
  const hr = part(ball(0.130*s, 18), cloth(PAL.hair), 0, 0.038*s, -0.020*s);
  hr.scale.set(1.02, 0.98, 1.05);
  head.add(hr);
  const hrBack = part(ball(0.098*s, 14), cloth(PAL.hair), 0, 0.010*s, -0.098*s);
  hrBack.scale.set(0.92, 0.80, 1.15);
  head.add(hrBack);
  if(heavy){
    const helm = part(dome(0.142*s, 18), metal(PAL.steel, 0.35), 0, 0.005*s, 0);
    helm.scale.set(1.02, 1.0, 1.02);
    head.add(helm);
    head.add(part(spike(0.026*s, 0.10*s, 10), metal(PAL.steelLite, 0.3), 0, 0.16*s, 0));
  }

  /* Handstück verrät die Rolle */
  const prop = joint(0, -0.27*s, 0.03*s);
  armR.add(prop);
  if(card.targets === "buildings"){
    prop.add(part(tube(0.02*s, 0.02*s, 0.5*s, 10), wood(PAL.wood), 0, 0.16*s, 0));
    const ramHead = part(capsule(0.085*s, 0.10*s, 14), metal(PAL.steelDark, 0.4), 0, 0.42*s, 0);
    ramHead.rotation.x = Math.PI/2;
    prop.add(ramHead);
  } else if(card.splash){
    prop.add(part(tube(0.018*s, 0.020*s, 0.62*s, 10), wood(PAL.wood), 0, 0.18*s, 0));
    prop.add(part(ball(0.072*s, 16),
                  mat(acc, { emissive:acc, emissiveIntensity:0.9, roughness:0.3 }), 0, 0.50*s, 0));
  } else if(ranged){
    const bow = part(geo("bow2", () => new THREE.TorusGeometry(0.185, 0.016, 8, 24, Math.PI*1.3)),
                     wood(PAL.wood), 0, 0.09*s, 0);
    bow.scale.setScalar(s); bow.rotation.y = Math.PI/2;
    prop.add(bow);
  } else {
    prop.add(part(box(0.042*s, 0.42*s, 0.09*s), metal(PAL.steelLite, 0.26), 0, 0.18*s, 0));
    prop.add(part(box(0.13*s, 0.042*s, 0.05*s), metal(PAL.steelDark, 0.4), 0, -0.02*s, 0));
    prop.add(part(ball(0.030*s, 12), metal(PAL.copper, 0.3), 0, -0.06*s, 0));
  }

  root.userData.rig = { hips, torso, head, legL, legR, armL, armR, prop, height:1.16*s };
  return root;
}

/** Flieger: schwebt, keine Beine, schlagende Schwingen. */
function buildFlyer(card, cardId){
  const root = new THREE.Group();
  const acc = accentOf(cardId);
  const s = Math.max(0.72, card.radius / 0.45);

  const hips = joint(0, 0.95, 0);
  root.add(hips);
  const torso = joint(0, 0, 0);
  hips.add(torso);

  if(cardId === "glockenballon"){
    const hull = part(lathe("balloon", [
      [0.00, 0.00], [0.20, 0.06], [0.32, 0.22], [0.34, 0.40],
      [0.26, 0.56], [0.12, 0.64], [0.00, 0.66],
    ], 20), cloth(acc), 0, -0.10*s, 0);
    hull.scale.setScalar(s);
    torso.add(hull);
    const basket = part(lathe("basket", [
      [0.00, 0.00], [0.15, 0.005], [0.17, 0.10], [0.155, 0.18], [0.00, 0.19],
    ], 16), hide(PAL.leather), 0, -0.36*s, 0);
    basket.scale.setScalar(s);
    torso.add(basket);
    for(let i = 0; i < 6; i++){
      const a = i * Math.PI / 3;
      const rope = part(tube(0.007*s, 0.007*s, 0.26*s, 6), hide(PAL.leatherDk),
                        Math.sin(a)*0.15*s, -0.24*s, Math.cos(a)*0.15*s);
      torso.add(rope);
    }
  } else {
    const bodyM = part(capsule(0.16*s, 0.16*s, 16), cloth(acc), 0, 0, 0);
    bodyM.rotation.x = Math.PI/2;
    torso.add(bodyM);
    const hd = part(ball(0.115*s, 16), cloth(acc), 0, 0.055*s, 0.19*s);
    torso.add(hd);
    torso.add(part(spike(0.045*s, 0.13*s, 10), mat(PAL.bone, { roughness:0.5 }), 0, 0.035*s, 0.30*s));
    const tail = part(spike(0.075*s, 0.24*s, 10), cloth(acc), 0, 0.0, -0.24*s);
    tail.rotation.x = -Math.PI/2;
    torso.add(tail);
  }

  const wing = side => {
    const j = joint(0.13*s*side, 0.06*s, 0);
    const w = part(lathe(`wing${side}`, [
      [0.00, 0.00], [0.06, 0.10], [0.05, 0.30], [0.02, 0.44], [0.00, 0.50],
    ], 8), cloth(acc), 0, 0, 0);
    w.rotation.z = -Math.PI/2 * side;
    w.scale.set(s, s * 1.5, s * 2.4);
    j.add(w);
    return j;
  };
  const armL = wing(-1), armR = wing(1);
  torso.add(armL, armR);

  root.userData.rig = { hips, torso, head:torso, legL:null, legR:null,
                        armL, armR, prop:null, flying:true, height:1.35*s };
  return root;
}

/** Gebäude: steht still. */
function buildStructure(card, cardId){
  const root = new THREE.Group();
  const acc = accentOf(cardId);
  root.add(part(lathe("plinth", [
    [0.00, 0.00], [0.52, 0.02], [0.50, 0.14], [0.44, 0.20], [0.00, 0.21],
  ], 16), mat(0x6A6558, { roughness:0.95 }), 0, 0, 0));

  if(card.damage > 0){
    const shaft = part(lathe("watchtower", [
      [0.00, 0.00], [0.36, 0.02], [0.32, 0.30], [0.29, 0.62],
      [0.36, 0.70], [0.34, 0.82], [0.00, 0.84],
    ], 18), mat(acc, { roughness:0.9 }), 0, 0.18, 0);
    root.add(shaft);
    const roof = part(spike(0.46, 0.38, 14), hide(PAL.leatherDk), 0, 1.20, 0);
    root.add(roof);
    for(let i = 0; i < 6; i++){
      const a = i * Math.PI / 3;
      root.add(part(capsule(0.028, 0.10, 8), metal(PAL.steel, 0.35),
                    Math.sin(a)*0.30, 0.98, Math.cos(a)*0.30));
    }
  } else {
    const wall = part(lathe("bulwark", [
      [0.00, 0.00], [0.46, 0.02], [0.44, 0.55], [0.48, 0.62], [0.46, 0.72], [0.00, 0.73],
    ], 14), mat(acc, { roughness:0.95 }), 0, 0.18, 0);
    root.add(wall);
    for(let i = 0; i < 8; i++){
      const a = i * Math.PI / 4;
      root.add(part(box(0.16, 0.16, 0.16), mat(0x9A917E, { roughness:0.95 }),
                    Math.sin(a)*0.42, 0.96, Math.cos(a)*0.42));
    }
  }
  root.userData.rig = { static:true, height:1.55 };
  return root;
}

/* ============================================================
   TÜRME — rund statt kubisch, mit Zinnenkranz
   ============================================================ */
function buildTower(kind, team){
  const root = new THREE.Group();
  const teamCol = team === "blue" ? PAL.teamBlue : PAL.teamRed;
  const king = kind === "king";
  const R = king ? 1.15 : 0.95;
  const H = king ? 2.6 : 2.0;
  const stoneA = stone(0x8B8375);
  const stone2 = stone(0x9C947F);

  root.add(part(lathe(`base${king?1:0}`, [
    [0.00, 0.00], [R*1.30, 0.03], [R*1.26, 0.22], [R*1.10, 0.34], [0.00, 0.35],
  ], 22), stone(0x6E695C), 0, 0, 0));

  root.add(part(lathe(`shaft${king?1:0}`, [
    [0.00, 0.00], [R, 0.02], [R*0.94, H*0.45], [R*0.90, H*0.82],
    [R*1.12, H*0.90], [R*1.10, H], [0.00, H],
  ], 24), stoneA, 0, 0.30, 0));

  // Zinnen
  const n = king ? 12 : 10;
  for(let i = 0; i < n; i++){
    const a = (i / n) * Math.PI * 2;
    const m = part(box(R*0.34, 0.34, R*0.26), stone2,
                   Math.sin(a) * R * 1.02, H + 0.46, Math.cos(a) * R * 1.02);
    m.rotation.y = a;
    root.add(m);
  }
  // Wehrgang in Teamfarbe
  const band = part(ring(R*1.09, 0.055, 26), mat(teamCol, { roughness:0.6 }), 0, H + 0.28, 0);
  band.rotation.x = Math.PI/2;
  root.add(band);

  // Schießscharten
  for(let i = 0; i < 4; i++){
    const a = i * Math.PI/2 + Math.PI/4;
    root.add(part(box(0.12, 0.32, 0.10), stone(0x3A362E),
                  Math.sin(a)*R*0.93, H*0.62, Math.cos(a)*R*0.93));
  }

  if(king){
    root.add(part(tube(0.045, 0.045, 1.5, 10), wood(PAL.wood), 0, H + 1.35, 0));
    const flag = part(box(0.66, 0.40, 0.02), mat(teamCol, { roughness:0.75 }), 0.34, H + 1.85, 0);
    root.add(flag);
    for(let i = 0; i < 6; i++){
      const a = i / 6 * Math.PI * 2;
      root.add(part(spike(0.085, 0.30, 10), metal(0xD9AF4A, 0.28),
                    Math.sin(a) * R * 0.52, H + 0.80, Math.cos(a) * R * 0.52));
    }
    root.userData.flag = flag;
  }
  root.traverse(o => { if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  const flagRef = root.userData.flag;
  if(flagRef) flagRef.name = "rig_flag";   // Fahne bleibt beweglich
  flattenNonRig(root);
  mergeStatic(root);                       // Turm ist statisch bis auf die Fahne
  if(flagRef) root.userData.flag = flagRef;
  root.userData.height = H + (king ? 2.3 : 0.9);
  return root;
}

/* ============================================================
   AUSWAHL UND OPTIMIERUNG

   Eine Figur besteht aus bis zu sechzig Einzelteilen. Zehn Riesen
   auf dem Feld waren dadurch über 600 Zeichenaufrufe — auf
   Mobilgeräten der Flaschenhals.

   Zwei Schritte dagegen:
     1. Unbewegliche Geschwister mit gleichem Material werden zu
        einem Mesh verschmolzen. Was sich bewegt (Arme, Beine,
        Kopf, Waffe), bleibt ein eigenes Gelenk.
     2. Jede Kartenart wird genau EINMAL gebaut und danach geklont.
        Das spart zusätzlich die Bauzeit beim Aufstellen.
   ============================================================ */
const RIG_KEYS = ["hips", "torso", "head", "legL", "legR", "armL", "armR", "prop"];

/**
 * Löst alle Gruppen auf, die kein Gelenk sind (Schulterstücke, Mantel,
 * Waffenaufhängung …), und bäckt ihre Lage in die Kinder ein. Erst
 * dadurch landen genug gleichmaterialige Teile im selben Gelenk, dass
 * sich das Verschmelzen lohnt.
 */
function flattenNonRig(root){
  let changed = true;
  while(changed){
    changed = false;
    const victims = [];
    root.traverse(o => {
      if(o === root || !o.isGroup) return;
      if(o.name && o.name.startsWith("rig_")) return;
      if(!o.parent) return;
      victims.push(o);
    });
    for(const g of victims){
      const parent = g.parent;
      if(!parent) continue;
      g.updateMatrix();
      for(const c of g.children.slice()){
        c.applyMatrix4(g.matrix);
        parent.add(c);
      }
      parent.remove(g);
      changed = true;
    }
  }
  return root;
}

/* Sammelmaterialien: eines je (Oberflaechenart, Rauheit, Metallanteil).
   Die eigentliche Farbe kommt aus den Vertexfarben der verschmolzenen
   Geometrie — dadurch teilen sich zehn verschiedenfarbige Teile ein
   Material statt zehn eigene zu brauchen. */
const _vmats = new Map();
function vertexMat(tex, rough, metal){
  const key = tex + "|" + rough + "|" + metal;
  let m = _vmats.get(key);
  if(!m){
    m = new THREE.MeshStandardMaterial({
      color:0xFFFFFF, vertexColors:true, roughness:rough, metalness:metal });
    if(tex !== "plain" && typeof applyTexSet === "function"){
      const TUNE2 = { cloth:[1.2,0.45], leather:[1.0,0.55], metal:[1.0,0.50],
                      woodN:[0.5,0.55], stoneN:[0.9,0.75] };
      const t = TUNE2[tex] || [1, 1];
      applyTexSet(m, tex, t[0], t[1]);
    }
    _vmats.set(key, m);
  }
  return m;
}

/** Kann ein Material im Sammelmaterial aufgehen? */
function _mergeable(m){
  // userData.tex tragen nur die Materialien aus mat() — Sonderfaelle
  // wie die Trikotstreifen oder der leuchtende Kristall bleiben damit
  // automatisch aussen vor.
  return m && m.isMeshStandardMaterial && !m.transparent
      && (!m.emissive || (m.emissive.r + m.emissive.g + m.emissive.b) < 0.001)
      && m.userData && m.userData.tex !== undefined;
}

/** Verschmilzt Mesh-Geschwister gleicher Oberflaechenart unter jedem Gelenk. */
function mergeStatic(root){
  const groups = [];
  root.traverse(o => { if(o.isGroup || o === root) groups.push(o); });
  for(const g of groups){
    const byMat = new Map();
    for(const c of g.children){
      if(!c.isMesh || c.isInstancedMesh) continue;
      const m = c.material;
      const key = _mergeable(m)
        ? "v|" + m.userData.tex + "|" + m.userData.rough + "|" + m.userData.metal
        : m.uuid;
      if(!byMat.has(key)) byMat.set(key, []);
      byMat.get(key).push(c);
    }
    for(const [key, list] of byMat){
      if(list.length < 2) continue;
      const geos = [];
      let ok = true;
      for(const m of list){
        const gm = m.geometry.clone();
        m.updateMatrix();
        gm.applyMatrix4(m.matrix);
        // Nur Position/Normale/UV behalten — sonst scheitert das
        // Verschmelzen an unterschiedlichen Attributsätzen.
        for(const name of Object.keys(gm.attributes))
          if(name !== "position" && name !== "normal" && name !== "uv")
            gm.deleteAttribute(name);
        if(!gm.attributes.uv){ ok = false; break; }
        geos.push(gm);
      }
      if(!ok) continue;
      // mergeGeometries verlangt einheitliche Attribute: entweder ALLE
      // indiziert oder KEINE. ExtrudeGeometry liefert nicht indiziert,
      // die Grundkörper indiziert — gemischt scheitert es. Nur im
      // Mischfall auflösen, sonst bläht sich die Geometrie unnötig auf.
      const idx = geos.filter(g2 => g2.index).length;
      if(idx > 0 && idx < geos.length)
        for(let i = 0; i < geos.length; i++)
          if(geos[i].index) geos[i] = geos[i].toNonIndexed();
      const vertexColored = key.startsWith("v|");
      if(vertexColored){
        // Farbe jedes Teils in seine Geometrie backen
        for(let i = 0; i < geos.length; i++){
          const gm = geos[i], col = list[i].material.color;
          const n = gm.attributes.position.count;
          const arr = new Float32Array(n * 3);
          for(let v = 0; v < n; v++){ arr[v*3] = col.r; arr[v*3+1] = col.g; arr[v*3+2] = col.b; }
          gm.setAttribute("color", new THREE.BufferAttribute(arr, 3));
        }
      }
      const merged = THREE.mergeGeometries(geos, false);
      if(!merged) continue;
      const useMat = vertexColored
        ? vertexMat(list[0].material.userData.tex,
                    list[0].material.userData.rough,
                    list[0].material.userData.metal)
        : list[0].material;
      const mesh = new THREE.Mesh(merged, useMat);
      mesh.castShadow = true;
      for(const m of list) g.remove(m);
      g.add(mesh);
    }
  }
  return root;
}

const _protos = new Map();

function buildModelFor(cardId, card){
  let entry = _protos.get(cardId);
  if(!entry){
    const proto = _rawModel(cardId, card);
    const rig = proto.userData.rig || {};
    for(const k of RIG_KEYS)
      if(rig[k] && rig[k].isObject3D) rig[k].name = "rig_" + k;
    flattenNonRig(proto);
    mergeStatic(proto);
    // userData VOR dem Klonen leeren: Object3D.clone serialisiert
    // userData über JSON — Verweise auf Gelenke würden das sprengen.
    const plain = {};
    for(const k in rig) if(!(rig[k] && rig[k].isObject3D)) plain[k] = rig[k];
    proto.userData = {};
    entry = { proto, plain, keys: RIG_KEYS.filter(k => rig[k] && rig[k].isObject3D) };
    _protos.set(cardId, entry);
  }
  const inst = entry.proto.clone(true);
  const rig = Object.assign({}, entry.plain);
  for(const k of entry.keys) rig[k] = inst.getObjectByName("rig_" + k);
  inst.userData.rig = rig;
  return inst;
}

function _rawModel(cardId, card){
  if(cardId === "abdu")  return buildAbdu();
  if(cardId === "yunus") return buildYunus();
  if(cardId === "mertabi") return buildMertabi();
  if(cardId === "timgioh") return buildTimgioh();
  if(card.kind === "building") return buildStructure(card, cardId);
  if(card.layer === "air") return buildFlyer(card, cardId);
  return buildWalker(card, cardId);
}
