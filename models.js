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
function mat(color, opts){
  const key = color + "|" + JSON.stringify(opts || {});
  let m = _mats.get(key);
  if(!m){
    m = new THREE.MeshStandardMaterial(Object.assign({
      color, roughness:0.78, metalness:0.02,
    }, opts || {}));
    _mats.set(key, m);
  }
  return m;
}
/** Metall: braucht wenig Rauheit und viel Metallanteil, damit die
    Umgebungsspiegelung aus render3d.js überhaupt sichtbar wird. */
const metal = (c, rough) => mat(c, { roughness: rough === undefined ? 0.32 : rough, metalness:0.92 });
const skin  = c => mat(c, { roughness:0.62, metalness:0.0 });
const cloth = c => mat(c, { roughness:0.92, metalness:0.0 });
const hide  = c => mat(c, { roughness:0.68, metalness:0.03 });

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
const box = (w, h, d, r) =>
  geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const ring = (r, t, s) =>
  geo(`t${r},${t},${s||16}`, () => new THREE.TorusGeometry(r, t, 8, s || 16));

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
  head.add(part(capsule(0.06, 0.05, 12), skin(PAL.skinDark), 0, 0.06, -0.14));// Nacken

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
  axe.add(part(tube(0.026, 0.030, 0.92, 12), hide(PAL.wood), 0, 0.16, 0));
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
    prop.add(part(tube(0.02*s, 0.02*s, 0.5*s, 10), hide(PAL.wood), 0, 0.16*s, 0));
    const ramHead = part(capsule(0.085*s, 0.10*s, 14), metal(PAL.steelDark, 0.4), 0, 0.42*s, 0);
    ramHead.rotation.x = Math.PI/2;
    prop.add(ramHead);
  } else if(card.splash){
    prop.add(part(tube(0.018*s, 0.020*s, 0.62*s, 10), hide(PAL.wood), 0, 0.18*s, 0));
    prop.add(part(ball(0.072*s, 16),
                  mat(acc, { emissive:acc, emissiveIntensity:0.9, roughness:0.3 }), 0, 0.50*s, 0));
  } else if(ranged){
    const bow = part(geo("bow2", () => new THREE.TorusGeometry(0.185, 0.016, 8, 24, Math.PI*1.3)),
                     hide(PAL.wood), 0, 0.09*s, 0);
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
  const stone  = mat(0x8B8375, { roughness:0.96 });
  const stone2 = mat(0x9C947F, { roughness:0.94 });

  root.add(part(lathe(`base${king?1:0}`, [
    [0.00, 0.00], [R*1.30, 0.03], [R*1.26, 0.22], [R*1.10, 0.34], [0.00, 0.35],
  ], 22), mat(0x6E695C, { roughness:0.97 }), 0, 0, 0));

  root.add(part(lathe(`shaft${king?1:0}`, [
    [0.00, 0.00], [R, 0.02], [R*0.94, H*0.45], [R*0.90, H*0.82],
    [R*1.12, H*0.90], [R*1.10, H], [0.00, H],
  ], 24), stone, 0, 0.30, 0));

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
    root.add(part(box(0.12, 0.32, 0.10), mat(0x3A362E, { roughness:1 }),
                  Math.sin(a)*R*0.93, H*0.62, Math.cos(a)*R*0.93));
  }

  if(king){
    root.add(part(tube(0.045, 0.045, 1.5, 10), hide(PAL.wood), 0, H + 1.35, 0));
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
  root.userData.height = H + (king ? 2.3 : 0.9);
  return root;
}

/* ============================================================
   AUSWAHL
   ============================================================ */
function buildModelFor(cardId, card){
  if(cardId === "abdu") return buildAbdu();
  if(card.kind === "building") return buildStructure(card, cardId);
  if(card.layer === "air") return buildFlyer(card, cardId);
  return buildWalker(card, cardId);
}
