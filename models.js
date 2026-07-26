"use strict";
/* ============================================================
   MODELLE — alle 3D-Figuren, von Hand aus Grundkörpern gebaut

   Es gibt keine Modell-Dateien. Jede Figur entsteht hier im Code
   aus Kästen, Kugeln, Zylindern und Kegeln. Das hat drei Vorteile:
   keine Downloads, jede Figur ist eine lesbare Funktion, und
   Farben oder Proportionen ändert man an einer Stelle.

   Maßstab: 1 Einheit = 1 Arena-Kachel. Abdu ist ~1.6 hoch.
   Blickrichtung: jede Figur schaut nach +Z. Der Renderer dreht
   sie über rotation.y in die Laufrichtung.

   Jede Figur liefert eine Group mit .userData.rig zurück:
     { hips, torso, head, legL, legR, armL, armR, prop, bob }
   Der Renderer bewegt genau diese Teile — er muss nichts über
   den inneren Aufbau einer Figur wissen.
   ============================================================ */

const PAL = {
  skin:      0xE3B189,
  skinDark:  0xC28C63,
  hair:      0x2B1E16,
  steel:     0x8E949B,
  steelDark: 0x565C64,
  steelLite: 0xB9C0C7,
  leather:   0x6E4A2E,
  leatherDk: 0x46301E,
  fur:       0x7B5C3B,
  furDark:   0x5A422A,
  cloth:     0x3D4A5B,
  copper:    0xB2603A,
  wood:      0x6B4B32,
  bone:      0xD9CBB0,
  teamBlue:  0x4C7DFF,
  teamRed:   0xFF5A3C,
};

/* ---- Material- und Geometrie-Vorrat -------------------------------
   Einheiten entstehen und sterben im Sekundentakt. Ohne diesen
   Vorrat würde für jede Figur neu auf die Grafikkarte geladen. ---- */
const _mats = new Map();
function mat(color, opts){
  const key = color + "|" + JSON.stringify(opts || {});
  let m = _mats.get(key);
  if(!m){
    m = new THREE.MeshStandardMaterial(Object.assign({
      color, roughness:0.72, metalness:0.0, flatShading:true,
    }, opts || {}));
    _mats.set(key, m);
  }
  return m;
}
const metal = c => mat(c, { roughness:0.34, metalness:0.75, flatShading:true });

const _geos = new Map();
function geo(key, make){
  let g = _geos.get(key);
  if(!g){ g = make(); _geos.set(key, g); }
  return g;
}
const box  = (w,h,d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w,h,d));
const ball = (r,s)   => geo(`s${r},${s||8}`,   () => new THREE.SphereGeometry(r, s||8, (s||8)>>1));
const tube = (rt,rb,h,s) => geo(`c${rt},${rb},${h},${s||8}`, () => new THREE.CylinderGeometry(rt,rb,h,s||8));
const cone = (r,h,s) => geo(`k${r},${h},${s||6}`, () => new THREE.ConeGeometry(r,h,s||6));

/** Kurzform: Mesh bauen und gleich positionieren. */
function part(g, m, x, y, z){
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x||0, y||0, z||0);
  return mesh;
}
/** Gelenk: leere Group als Drehpunkt, damit Gliedmaßen schwingen können. */
function joint(x, y, z){
  const g = new THREE.Group();
  g.position.set(x||0, y||0, z||0);
  return g;
}

/* ============================================================
   ABDU — Nahkämpfer, Fraktion Eisenband
   Nach dem Referenzblatt: Stachel-Schulterpanzer, Fellmantel,
   Panzerhandschuhe, doppelköpfige Axt, Brille, Kinnbart.
   ============================================================ */
function buildAbdu(){
  const root = new THREE.Group();

  const hips = joint(0, 0.52, 0);
  root.add(hips);

  /* --- Beine ------------------------------------------------ */
  const leg = side => {
    const j = joint(0.14 * side, 0, 0);
    j.add(part(box(0.20, 0.34, 0.20), mat(PAL.cloth), 0, -0.17, 0));
    // Stiefel mit Metallkappe
    j.add(part(box(0.23, 0.16, 0.29), mat(PAL.leatherDk), 0, -0.42, 0.02));
    j.add(part(box(0.24, 0.07, 0.13), metal(PAL.steelDark), 0, -0.46, 0.12));
    return j;
  };
  const legL = leg(-1), legR = leg(1);
  hips.add(legL, legR);

  /* --- Rumpf ------------------------------------------------ */
  const torso = joint(0, 0.06, 0);
  hips.add(torso);

  torso.add(part(box(0.46, 0.42, 0.28), mat(PAL.cloth), 0, 0.20, 0));           // Wams
  torso.add(part(box(0.40, 0.20, 0.30), metal(PAL.steelDark), 0, 0.12, 0));      // Brustplatte
  torso.add(part(box(0.44, 0.09, 0.31), mat(PAL.leather), 0, 0.02, 0));          // Gürtel
  torso.add(part(box(0.10, 0.10, 0.06), metal(PAL.copper), 0, 0.02, 0.16));      // Schnalle
  // Riemenkreuz über der Brust
  const strap = a => {
    const s = part(box(0.42, 0.06, 0.03), mat(PAL.leatherDk), 0, 0.22, 0.15);
    s.rotation.z = a; return s;
  };
  torso.add(strap(0.6), strap(-0.6));

  /* --- Fellmantel ------------------------------------------
     Ein Kranz aus schmalen, unterschiedlich langen Zotteln —
     das liest sich aus der Vogelperspektive als Fell, ohne
     dass echtes Haar berechnet werden muss.                  */
  const mantle = joint(0, 0.34, 0);
  torso.add(mantle);
  for(let i = 0; i < 14; i++){
    const a = (i / 14) * Math.PI * 2;
    const long = Math.cos(a) < -0.2 ? 1.5 : 1.0;          // hinten länger
    const r = 0.26;
    const t = part(box(0.11, 0.20 * long, 0.09),
                   mat(i % 2 ? PAL.fur : PAL.furDark),
                   Math.sin(a) * r, -0.09 * long, Math.cos(a) * r);
    t.rotation.y = a;
    t.rotation.x = Math.cos(a) * 0.25;
    mantle.add(t);
  }
  mantle.add(part(tube(0.27, 0.24, 0.12, 10), mat(PAL.fur), 0, 0.02, 0));

  /* --- Schulterpanzer mit Stacheln -------------------------- */
  const pauldron = side => {
    const g = joint(0.30 * side, 0.36, 0);
    g.add(part(ball(0.19, 8), metal(PAL.steel), 0, 0, 0));
    for(let i = 0; i < 4; i++){
      const a = -0.5 + i * 0.42;
      const s = part(cone(0.045, 0.15, 5), metal(PAL.steelLite),
                     Math.sin(a) * 0.16 * side, 0.10, Math.cos(a) * 0.16 - 0.02);
      s.rotation.z = -0.5 * side;
      g.add(s);
    }
    return g;
  };
  torso.add(pauldron(-1), pauldron(1));

  /* --- Arme -------------------------------------------------- */
  const arm = side => {
    const j = joint(0.30 * side, 0.34, 0);
    j.add(part(box(0.15, 0.30, 0.15), mat(PAL.skin), 0, -0.16, 0));            // Oberarm
    j.add(part(box(0.17, 0.16, 0.17), metal(PAL.steel), 0, -0.36, 0));         // Panzerhandschuh
    for(let i = 0; i < 3; i++)                                                 // Knöchelstacheln
      j.add(part(cone(0.028, 0.08, 5), metal(PAL.steelLite),
                 (-0.05 + i * 0.05), -0.36, 0.09));
    return j;
  };
  const armL = arm(-1), armR = arm(1);
  torso.add(armL, armR);

  /* --- Kopf -------------------------------------------------- */
  const head = joint(0, 0.60, 0);
  torso.add(head);
  head.add(part(box(0.30, 0.32, 0.29), mat(PAL.skin), 0, 0.02, 0));
  head.add(part(box(0.32, 0.14, 0.31), mat(PAL.hair), 0, 0.16, -0.01));        // Haar
  head.add(part(box(0.30, 0.16, 0.10), mat(PAL.hair), 0, 0.09, -0.15));        // Nacken
  head.add(part(box(0.14, 0.05, 0.04), mat(PAL.hair), 0, -0.07, 0.15));        // Schnurrbart
  head.add(part(box(0.09, 0.09, 0.04), mat(PAL.hair), 0, -0.13, 0.15));        // Kinnbart
  // Runde Brille
  const lens = x => {
    const l = part(geo("ring", () => new THREE.TorusGeometry(0.055, 0.013, 6, 12)),
                   metal(PAL.copper), x, 0.02, 0.15);
    return l;
  };
  head.add(lens(-0.08), lens(0.08));
  head.add(part(box(0.05, 0.012, 0.012), metal(PAL.copper), 0, 0.02, 0.16));

  /* --- Doppelköpfige Axt ------------------------------------
     Wird an die rechte Hand gehängt, damit sie jeden Schwung
     der Schulter mitmacht.                                    */
  const axe = joint(0, -0.38, 0.06);
  armR.add(axe);
  axe.rotation.set(-0.5, 0, 0.35);
  axe.add(part(tube(0.035, 0.04, 1.05, 6), mat(PAL.wood), 0, 0.18, 0));         // Stiel
  axe.add(part(ball(0.055, 6), metal(PAL.steelDark), 0, -0.35, 0));             // Knauf

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.03);
  bladeShape.lineTo(0.26, -0.24);
  bladeShape.quadraticCurveTo(0.40, 0, 0.26, 0.24);
  bladeShape.lineTo(0, 0.03);
  bladeShape.closePath();
  const bladeGeo = geo("blade", () => new THREE.ExtrudeGeometry(bladeShape, {
    depth:0.045, bevelEnabled:true, bevelSize:0.012, bevelThickness:0.012, bevelSegments:1,
  }));
  for(const s of [1, -1]){
    const b = part(bladeGeo, metal(PAL.steel), 0, 0.66, -0.022);
    b.scale.x = s;
    axe.add(b);
    const rune = part(box(0.12, 0.03, 0.05), metal(PAL.copper), 0.17 * s, 0.66, 0);
    axe.add(rune);
  }

  root.userData.rig = { hips, torso, head, legL, legR, armL, armR, prop:axe, height:1.62 };
  return root;
}

/* ============================================================
   ALLGEMEINE FIGUREN
   Für alle Karten, die noch kein eigenes Modell haben. Sie
   unterscheiden sich durch Silhouette, Größe und Akzentfarbe —
   genug, um sie im Spiel auseinanderzuhalten.
   ============================================================ */
const ACCENT = {
  steinwaechter:0x9AA3A8, klingenwache:0xB9C0C7, rammbock:0x8B5A2B,
  rattenrudel:0x7A6A5A,  strassenbande:0xA33C3C, speerbrueder:0xC08A3E,
  bogenschuetzinnen:0x3E8E5A, feuermagier:0xE2662C, fernrohrschuetzin:0x5A7FA8,
  sturmfalke:0x8899AA,   fledermausschwarm:0x4A3A55, glockenballon:0xC94F4F,
  speerturm:0x9A8A6E,    bollwerk:0x8A8070,
};

function accentOf(cardId){
  const c = ACCENT[cardId];
  if(typeof c === "number") return c;
  // Ableitung aus dem Namen, damit auch neue Karten eine feste Farbe haben
  let h = 0;
  for(let i = 0; i < cardId.length; i++) h = (h * 31 + cardId.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.42, 0.5).getHex();
}

/** Läufer: Nahkämpfer, Fernkämpfer und Schwärme teilen sich dieses Gerüst. */
function buildWalker(card, cardId){
  const root = new THREE.Group();
  const acc = accentOf(cardId);
  const s = Math.max(0.7, card.radius / 0.45);          // Schwärme sind kleiner
  const ranged = card.range >= 2.5;

  const hips = joint(0, 0.46 * s, 0);
  root.add(hips);

  const leg = side => {
    const j = joint(0.10 * s * side, 0, 0);
    j.add(part(box(0.15*s, 0.32*s, 0.15*s), mat(PAL.cloth), 0, -0.16*s, 0));
    j.add(part(box(0.18*s, 0.10*s, 0.24*s), mat(PAL.leatherDk), 0, -0.36*s, 0.03*s));
    return j;
  };
  const legL = leg(-1), legR = leg(1);
  hips.add(legL, legR);

  const torso = joint(0, 0.05*s, 0);
  hips.add(torso);
  torso.add(part(box(0.36*s, (ranged?0.34:0.40)*s, 0.24*s), mat(acc), 0, 0.18*s, 0));
  torso.add(part(box(0.40*s, 0.08*s, 0.26*s), mat(PAL.leather), 0, 0.02*s, 0));
  if(!ranged) torso.add(part(box(0.34*s, 0.16*s, 0.26*s), metal(PAL.steelDark), 0, 0.14*s, 0));

  const arm = side => {
    const j = joint(0.24*s*side, 0.30*s, 0);
    j.add(part(box(0.11*s, 0.26*s, 0.11*s), mat(PAL.skin), 0, -0.14*s, 0));
    return j;
  };
  const armL = arm(-1), armR = arm(1);
  torso.add(armL, armR);

  const head = joint(0, 0.52*s, 0);
  torso.add(head);
  head.add(part(box(0.24*s, 0.25*s, 0.23*s), mat(PAL.skin), 0, 0, 0));
  head.add(part(box(0.26*s, 0.11*s, 0.25*s), mat(PAL.hair), 0, 0.13*s, -0.01*s));

  /* Handstück verrät die Rolle */
  const prop = joint(0, -0.28*s, 0.04*s);
  armR.add(prop);
  if(card.kind === "troop" && card.targets === "buildings"){
    prop.add(part(tube(0.09*s, 0.11*s, 0.34*s, 6), metal(PAL.steelDark), 0, 0.10*s, 0));
  } else if(card.splash){
    prop.add(part(tube(0.022*s, 0.022*s, 0.62*s, 5), mat(PAL.wood), 0, 0.18*s, 0));
    prop.add(part(ball(0.075*s, 8), mat(acc, { emissive:acc, emissiveIntensity:0.55 }), 0, 0.50*s, 0));
  } else if(ranged){
    const bow = part(geo("bow", () => new THREE.TorusGeometry(0.19, 0.018, 5, 10, Math.PI*1.25)),
                     mat(PAL.wood), 0, 0.10*s, 0);
    bow.scale.setScalar(s); bow.rotation.y = Math.PI/2;
    prop.add(bow);
  } else {
    prop.add(part(box(0.05*s, 0.44*s, 0.10*s), metal(PAL.steelLite), 0, 0.18*s, 0));
    prop.add(part(box(0.14*s, 0.05*s, 0.05*s), metal(PAL.steelDark), 0, -0.02*s, 0));
  }

  root.userData.rig = { hips, torso, head, legL, legR, armL, armR, prop, height:1.15*s };
  return root;
}

/** Flieger: schwebt, hat keine Beine, dafür schlagende Flügel. */
function buildFlyer(card, cardId){
  const root = new THREE.Group();
  const acc = accentOf(cardId);
  const s = Math.max(0.7, card.radius / 0.45);

  const hips = joint(0, 0.95, 0);                       // Flughöhe
  root.add(hips);
  const torso = joint(0, 0, 0);
  hips.add(torso);

  if(cardId === "glockenballon"){
    torso.add(part(ball(0.34*s, 10), mat(acc), 0, 0.22*s, 0));
    torso.add(part(tube(0.16*s, 0.20*s, 0.24*s, 8), mat(PAL.leather), 0, -0.18*s, 0));
    for(let i=0;i<4;i++){
      const a = i*Math.PI/2;
      torso.add(part(box(0.015*s,0.28*s,0.015*s), mat(PAL.leatherDk),
                     Math.sin(a)*0.15*s, 0.0, Math.cos(a)*0.15*s));
    }
  } else {
    torso.add(part(ball(0.22*s, 8), mat(acc), 0, 0, 0));
    torso.add(part(box(0.14*s, 0.13*s, 0.20*s), mat(acc), 0, 0.06*s, 0.18*s));
    torso.add(part(cone(0.05*s, 0.14*s, 5), mat(PAL.bone), 0, 0.04*s, 0.30*s));
  }

  const wing = side => {
    const j = joint(0.16*s*side, 0.08*s, 0);
    const w = part(box(0.42*s, 0.03*s, 0.24*s), mat(acc, { roughness:0.9 }), 0.21*s*side, 0, 0);
    j.add(w);
    return j;
  };
  const armL = wing(-1), armR = wing(1);
  torso.add(armL, armR);

  root.userData.rig = { hips, torso, head:torso, legL:null, legR:null,
                        armL, armR, prop:null, flying:true, height:1.35*s };
  return root;
}

/** Gebäude: steht still, hat kein Gerüst. */
function buildStructure(card, cardId){
  const root = new THREE.Group();
  const acc = accentOf(cardId);
  root.add(part(box(0.9, 0.28, 0.9), mat(PAL.steelDark), 0, 0.14, 0));
  if(card.damage > 0){
    root.add(part(tube(0.30, 0.40, 0.85, 8), mat(acc), 0, 0.70, 0));
    root.add(part(cone(0.42, 0.34, 8), mat(PAL.leatherDk), 0, 1.28, 0));
    for(let i=0;i<4;i++){
      const a = i*Math.PI/2 + Math.PI/4;
      root.add(part(box(0.10,0.16,0.10), mat(PAL.steel),
                    Math.sin(a)*0.30, 1.10, Math.cos(a)*0.30));
    }
  } else {
    root.add(part(box(0.86, 0.80, 0.86), mat(acc), 0, 0.68, 0));
    for(let i=0;i<4;i++)
      root.add(part(box(0.20,0.18,0.20), mat(PAL.steel), (i%2?1:-1)*0.31, 1.16, (i<2?1:-1)*0.31));
  }
  root.userData.rig = { static:true, height:1.5 };
  return root;
}

/* ============================================================
   TÜRME
   ============================================================ */
function buildTower(kind, team){
  const root = new THREE.Group();
  const teamCol = team === "blue" ? PAL.teamBlue : PAL.teamRed;
  const king = kind === "king";
  const w = king ? 2.3 : 1.9;
  const h = king ? 2.5 : 1.9;

  root.add(part(box(w*1.12, 0.30, w*1.12), mat(0x5D5A52), 0, 0.15, 0));
  root.add(part(box(w, h, w), mat(0x7C776C), 0, h/2 + 0.2, 0));
  root.add(part(box(w*1.06, 0.24, w*1.06), mat(0x8E887A), 0, h + 0.30, 0));

  // Zinnenkranz
  const n = king ? 5 : 4;
  for(let i = 0; i < n; i++){
    for(const [sx, sz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const t = (i/(n-1) - 0.5) * w * 0.9;
      root.add(part(box(w/n*0.6, 0.26, w/n*0.6), mat(0x8E887A),
                    sx ? sx*w*0.44 : t, h + 0.54, sz ? sz*w*0.44 : t));
    }
  }
  // Wehrgang in Teamfarbe
  root.add(part(box(w*1.02, 0.10, w*1.02), mat(teamCol), 0, h + 0.20, 0));

  if(king){
    root.add(part(tube(0.05, 0.05, 1.5, 5), mat(PAL.wood), 0, h + 1.2, 0));
    const flag = part(box(0.7, 0.42, 0.03), mat(teamCol), 0.36, h + 1.7, 0);
    root.add(flag);
    for(let i = 0; i < 5; i++){
      const a = i / 5 * Math.PI * 2;
      root.add(part(cone(0.10, 0.30, 4), metal(0xE0B84C),
                    Math.sin(a) * 0.42, h + 0.75, Math.cos(a) * 0.42));
    }
    root.userData.flag = flag;
  }
  root.userData.height = h + (king ? 2.2 : 0.7);
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
