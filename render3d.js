"use strict";
/* ============================================================
   DARSTELLUNG — 3D-Szene

   Ersetzt den früheren 2D-Zeichner. Die Spiellogik (Abschnitte
   1–8 in index.html) weiß davon nichts: Sie rechnet weiter in
   Kacheln, dieser Renderer liest den Zustand nur ab.

   Koordinaten:   Spiel (x, y)  ->  Welt (x, 0, y)
   Y ist die Höhe. Die Kamera steht hinter der Spielerseite und
   blickt schräg nach unten — dieselbe Perspektive wie im Vorbild.
   ============================================================ */

let scene, camera, renderer, groundPlane, raycaster, pointerNDC;
let composer, aoPass, bloomPass, gradePass;
const AO_SCALE = 0.5, BLOOM_SCALE = 0.6;
let ready = false;

const unitViews = new Map();     // Einheiten-ID -> { root, rig, bar, blob, ... }
const towerViews = new Map();
let effectViews = [];
let aimRing = null, zoneMesh = null, waterMat = null, gridHelper = null;

const CAM = { tilt: 1.12, dist: 30, height: 25, look: 16.0 };

/* ---- Aufbau ----------------------------------------------------- */
function initScene(canvas){
  if(ready) return;

  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16241F);
  scene.fog = new THREE.Fog(0x1B2C24, 82, 130);

  camera = new THREE.PerspectiveCamera(38, 1, 1, 140);

  // Himmelslicht: kuehl von oben, warm reflektiert vom Boden.
  // Das ersetzt die fehlende Lichtstreuung und nimmt den Schatten
  // ihre Tote-Ecke-Wirkung.
  scene.add(new THREE.HemisphereLight(0xC6E0F4, 0x5E6B3E, 1.15));

  const sun = new THREE.DirectionalLight(0xFFF0D2, 2.5);
  sun.position.set(-14, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Schattenkamera eng um die Arena legen: je kleiner der Ausschnitt,
  // desto schaerfer der Schatten bei gleicher Aufloesung.
  const sc = sun.shadow.camera;
  sc.left = -18; sc.right = 18; sc.top = 26; sc.bottom = -26;
  sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.022;
  sun.shadow.radius = 3.5;          // weiche Kante statt Treppenstufen
  sun.target.position.set(AW/2, 0, AH/2);
  scene.add(sun, sun.target);

  // Aufheller von vorn unten: hebt die Figuren aus dem Hintergrund,
  // ohne zweite Schatten zu werfen.
  const rim = new THREE.DirectionalLight(0xA8C8FF, 0.55);
  rim.position.set(12, 8, 44);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xFFE6C0, 0.30);
  fill.position.set(16, 6, -12);
  scene.add(fill);

  buildEnvironment();

  buildArena();

  raycaster = new THREE.Raycaster();
  pointerNDC = new THREE.Vector2();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Zielring für das Platzieren
  aimRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.75, 28),
    new THREE.MeshBasicMaterial({ color:0x78FFBE, transparent:true, opacity:0.9,
                                  side:THREE.DoubleSide, depthWrite:false }));
  aimRing.rotation.x = -Math.PI/2;
  aimRing.visible = false;
  scene.add(aimRing);

  buildComposer();
  ready = true;
}

/* ---- Nachbearbeitung ------------------------------------------------
   Die drei Stufen, die am meisten ausmachen:
     1. Umgebungsverdeckung (GTAO) — dunkelt Berührungspunkte und
        Vertiefungen ab. Ohne sie kleben Figuren auf dem Boden,
        statt darin zu stehen. Das ist der groesste Billig-Faktor.
     2. Bloom — laesst helle Stellen (Kristall, Metallglanz)
        ueberstrahlen und gibt der Szene Tiefe.
     3. Farbkorrektur — Kontrastkurve, kuehle Schatten gegen warme
        Lichter, leichte Vignette. Ohne sie wirken die Farben flach.
   Reihenfolge: Bild -> AO -> Bloom -> Tonwert/Farbraum -> Korrektur.
--------------------------------------------------------------------- */
const GradeShader = {
  name: "Grade",
  uniforms: {
    tDiffuse:  { value: null },
    uContrast: { value: 1.085 },
    uSat:      { value: 1.12 },
    uVignette: { value: 0.32 },
    uLift:     { value: new THREE.Vector3(0.94, 0.98, 1.08) },
    uGain:     { value: new THREE.Vector3(1.05, 1.01, 0.94) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uContrast, uSat, uVignette;
    uniform vec3 uLift, uGain;
    varying vec2 vUv;
    void main(){
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 col = src.rgb;
      col = (col - 0.5) * uContrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col * uLift, col * uGain, smoothstep(0.12, 0.88, l));
      col = mix(vec3(l), col, uSat);
      vec2 d = vUv - 0.5;
      col *= 1.0 - uVignette * dot(d, d) * 2.1;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), src.a);
    }`,
};

function buildComposer(){
  const sz = new THREE.Vector2();
  renderer.getSize(sz);
  composer = new THREE.EffectComposer(renderer);
  // Nachbearbeitung kostet Fuellrate. Auf hochaufloesenden Bildschirmen
  // reicht 1.5-fach voellig; darueber sieht man keinen Unterschied mehr.
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  composer.setSize(sz.x, sz.y);

  composer.addPass(new THREE.RenderPass(scene, camera));

  // Der AO-Durchgang ist mit Abstand der teuerste. Sein Schluss-Verbund
  // rendert aber nur einen Vollbild-Quad und TASTET die AO-Textur ab —
  // die darf also gröber sein. Halbe Auflösung kostet ein Viertel und
  // ist bei weicher Verdeckung nicht zu unterscheiden.
  aoPass = new THREE.GTAOPass(scene, camera, sz.x, sz.y);
  aoPass.output = THREE.GTAOPass.OUTPUT.Default;
  aoPass.updateGtaoMaterial({
    radius: 0.55,            // Weltmass: etwa eine halbe Kachel
    distanceExponent: 1.6,
    thickness: 0.9,
    scale: 1.0,
    samples: 6,
    screenSpaceRadius: false,
  });
  aoPass.blendIntensity = 0.95;
  aoPass.setSize(sz.x * AO_SCALE, sz.y * AO_SCALE);
  composer.addPass(aoPass);

  bloomPass = new THREE.UnrealBloomPass(sz.clone().multiplyScalar(BLOOM_SCALE), 0.34, 0.8, 0.84);
  composer.addPass(bloomPass);

  composer.addPass(new THREE.OutputPass());

  gradePass = new THREE.ShaderPass(GradeShader);
  composer.addPass(gradePass);
}

/* ---- Umgebungsspiegelung ------------------------------------------
   Metall ohne etwas zum Spiegeln sieht immer nach Plastik aus. Statt
   eine Umgebungskarte zu laden, baue ich eine winzige Kulisse aus
   leuchtenden Flaechen — Himmel oben, Boden unten, ein helles Fenster
   seitlich — und lasse Three daraus die Spiegelungskarte rechnen.  */
function buildEnvironment(){
  const env = new THREE.Scene();
  const panel = (c, w, h, d, x, y, z, rx, ry) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color:c, side:THREE.BackSide }));
    m.position.set(x, y, z);
    if(rx) m.rotation.x = rx;
    if(ry) m.rotation.y = ry;
    env.add(m);
    return m;
  };
  panel(0xBFD4E2, 20, 20, 20, 0, 0, 0);                       // Himmel
  const glow = (c, w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color:c }));
    m.position.set(x, y, z);
    m.rotation.y = ry || 0;
    env.add(m);
  };
  glow(0xFFF3E2, 9, 9, -6.5, 4.5, 2, Math.PI/2);              // Sonnenseite
  glow(0x8D9AA3, 8, 8, 6.5, 2.0, -2, -Math.PI/2);             // kuehle Gegenseite
  glow(0x4A5442, 18, 18, 0, -8, 0, 0);                        // Wiese von unten

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  // Wichtig: die Umgebung wirkt in Three als Licht auf JEDES Material,
  // nicht nur auf Metall. Bei voller Staerke faerbt sie Haut und Stoff
  // mit ein — deshalb deutlich heruntergeregelt.
  scene.environmentIntensity = 0.52;
  pmrem.dispose();
}

/* ---- Bodenmaterial --------------------------------------------------
   Statt einer einzelnen Farbfläche mit Rauschen jetzt ein voller
   PBR-Satz aus textures.js: Farbe, Relief und Rauheit. Die Kachelung
   wird getrennt gesetzt, damit die Halme auf 18x32 Kacheln nicht
   zu Streifen gezogen werden.                                     */
function groundMaterial(kind, tint, repX, repY, normalScale){
  const set = texSet(kind);
  const dup = t => {
    if(!t) return null;
    const c = t.clone(); c.needsUpdate = true;
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repX, repY);
    c.anisotropy = 8;
    return c;
  };
  return new THREE.MeshStandardMaterial({
    color: tint,
    map: dup(set.map),
    normalMap: dup(set.normalMap),
    roughnessMap: dup(set.roughnessMap),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughness: 1.0, metalness: 0.0,
  });
}

/* ---- Arena ------------------------------------------------------- */
function buildArena(){
  const half = { x: AW/2, z: AH/2 };

  const mk = (w, d, x, z, tint) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d),
                             groundMaterial("grass", tint, w/3.4, d/3.4, 1.6));
    m.position.set(x, -0.2, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // Zwei Spielfeldhälften, leicht unterschiedlich, damit die Mitte lesbar ist
  mk(AW, RIVER.y0,        half.x, RIVER.y0/2,                 0xFFFFFF);
  mk(AW, AH - RIVER.y1,   half.x, RIVER.y1 + (AH-RIVER.y1)/2, 0xF2F6EC);

  // Fluss: tiefer gelegt, damit die Böschung Schatten wirft
  const river = new THREE.Mesh(
    new THREE.BoxGeometry(AW, 0.34, RIVER.y1 - RIVER.y0),
    groundMaterial("water", 0x8FB6C6, 5, 1.2, 1.1));
  // Rauheit nicht zu niedrig: bei einer fast spiegelnden Oberflaeche
  // wirft die Umgebungskulisse ihre Sonnenflaeche als hartes Rechteck
  // zurueck. 0.34 streut sie zu einem weichen Glanz.
  river.material.metalness = 0.22;
  river.material.roughness = 0.34;
  river.position.set(half.x, -0.30, (RIVER.y0 + RIVER.y1)/2);
  scene.add(river);
  waterMat = river.material;

  // Uferschaum: heller Saum, wo Wasser auf Erde trifft. Ohne ihn
  // stossen zwei Flaechen mit einer messerscharfen Kante aneinander.
  const foamMat = new THREE.MeshBasicMaterial({
    color:0xE6F4F8, transparent:true, opacity:0.17, depthWrite:false,
    alphaMap: decalAlpha("band"), blending:THREE.NormalBlending });
  for(const z of [RIVER.y0 + 0.16, RIVER.y1 - 0.16]){
    const f = new THREE.Mesh(new THREE.PlaneGeometry(AW, 0.40), foamMat);
    f.rotation.x = -Math.PI/2;
    f.position.set(half.x, -0.115, z);
    scene.add(f);
  }

  // Uferzone: schmaler Erdstreifen, damit Wiese und Wasser nicht
  // mit einer harten Kante aneinanderstoßen
  for(const [z, d] of [[RIVER.y0 - 0.34, 0.7], [RIVER.y1 + 0.34, 0.7]]){
    const bank = new THREE.Mesh(new THREE.BoxGeometry(AW, 0.42, d),
                                groundMaterial("dirt", 0xFFFFFF, AW/2.4, 0.5, 1.6));
    bank.position.set(half.x, -0.19, z);
    bank.receiveShadow = true;
    scene.add(bank);
  }

  // Brücken mit Geländerpfosten
  for(const bx of BRIDGES){
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(BRIDGE_HALF*2, 0.22, RIVER.y1 - RIVER.y0 + 0.9),
      groundMaterial("wood", 0xFFFFFF, 1.4, 2.4, 1.7));
    b.position.set(bx, 0.02, (RIVER.y0 + RIVER.y1)/2);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    for(const sx of [-1, 1]){
      for(let i = 0; i < 4; i++){
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.12),
                                 groundMaterial("wood", 0xCCCCCC, 1, 1, 1.2));
        p.position.set(bx + sx*(BRIDGE_HALF - 0.08), 0.22,
                       RIVER.y0 - 0.35 + i * ((RIVER.y1 - RIVER.y0 + 0.7) / 3));
        p.castShadow = true;
        scene.add(p);
      }
    }
  }

  // Rasterlinien, dezent, als Orientierung beim Platzieren
  const grid = new THREE.Group();
  const lineMat = new THREE.MeshBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.022 });
  for(let i = 1; i < AW; i++){
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.03, AH), lineMat);
    m.rotation.x = -Math.PI/2; m.position.set(i, 0.03, half.z); grid.add(m);
  }
  for(let i = 1; i < AH; i++){
    const m = new THREE.Mesh(new THREE.PlaneGeometry(AW, 0.03), lineMat);
    m.rotation.x = -Math.PI/2; m.position.set(half.x, 0.03, i); grid.add(m);
  }
  grid.visible = false;          // nur beim Platzieren sichtbar
  gridHelper = grid;
  scene.add(grid);

  // Platzierungszone (wird beim Kartenwählen eingeblendet)
  zoneMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color:0x4C7DFF, transparent:true, opacity:0.13, depthWrite:false }));
  zoneMesh.rotation.x = -Math.PI/2;
  zoneMesh.visible = false;
  scene.add(zoneMesh);

  dressScene();

  // Bande rundherum
  for(const [w, d, x, z] of [[AW+1.2, 0.6, AW/2, -0.5], [AW+1.2, 0.6, AW/2, AH+0.5],
                             [0.6, AH+1.2, -0.5, AH/2], [0.6, AH+1.2, AW+0.5, AH/2]]){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d),
                             groundMaterial("stone", 0x9AA894, w/2, d/2, 1.4));
    m.position.set(x, 0.1, z);
    scene.add(m);
  }
}

/* ---- Bewuchs und Ausstattung ---------------------------------------
   Große leere Flächen sind der dritte Billig-Faktor. Grasbüschel,
   Steine, Blumen und Erdflecken brechen sie auf.

   Alles über InstancedMesh: 900 Büschel kosten damit einen einzigen
   Zeichenaufruf statt 900. Ohne das wäre der Aufwand nicht vertretbar.
--------------------------------------------------------------------- */
function _rand(seed){
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Frei? Nicht im Fluss, nicht unter einem Turm, nicht auf der Brücke. */
function _freeSpot(x, y){
  if(x < 0.7 || x > AW - 0.7 || y < 0.7 || y > AH - 0.7) return false;
  if(y > RIVER.y0 - 1.0 && y < RIVER.y1 + 1.0) return false;
  for(const t of TOWER_SPOTS)
    if(Math.hypot(x - t.x, y - t.y) < (t.kind === "king" ? 2.6 : 2.2)) return false;
  return true;
}

function dressScene(){
  const rnd = _rand(20260726);
  const dummy = new THREE.Object3D();

  /* --- Bodenaufdrucke: ausgetretene Erde, weich auslaufend --------- */
  const decalMat = (kind, rep, opacity) => {
    const m = groundMaterial("dirt", 0xFFFFFF, rep, rep, 1.3);
    m.alphaMap = decalAlpha(kind);
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
    m.polygonOffset = true;          // gegen Z-Flimmern mit dem Boden
    m.polygonOffsetFactor = -2;
    return m;
  };
  const patchMat = decalMat("patch", 2, 0.9);
  const pathMat  = decalMat("path", 2, 0.72);

  for(const t of TOWER_SPOTS){
    const r = t.kind === "king" ? 2.6 : 2.1;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(r*2, r*2), patchMat);
    p.rotation.x = -Math.PI/2;
    p.position.set(t.x, 0.012, t.y);
    p.receiveShadow = true;
    scene.add(p);
  }

  /* --- Trampelpfade zu den Brücken --- */
  for(const bx of BRIDGES){
    for(const [z, h] of [[RIVER.y0 - 2.4, 4.4], [RIVER.y1 + 2.4, 4.4]]){
      const path = new THREE.Mesh(new THREE.PlaneGeometry(1.7, h), pathMat);
      path.rotation.x = -Math.PI/2;
      path.position.set(bx, 0.010, z);
      scene.add(path);
    }
  }

  /* --- Grosse weiche Farbflecken ------------------------------------
     Die Rasentextur wiederholt sich ueber 18x32 Kacheln sichtbar.
     Ein paar grosse, unterschiedlich getoente Flecken darueber
     brechen das Muster auf, ohne neue Texturen zu kosten.         */
  const shadeAlpha = decalAlpha("patch");
  for(let i = 0; i < 11; i++){
    const x = rnd() * AW, y = rnd() * AH;
    if(y > RIVER.y0 - 0.6 && y < RIVER.y1 + 0.6) continue;
    const r = 2.4 + rnd() * 3.6;
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.24 + rnd()*0.07, 0.30 + rnd()*0.2, 0.28 + rnd()*0.22),
      transparent:true, opacity:0.07 + rnd()*0.09, depthWrite:false,
      alphaMap: shadeAlpha, blending:THREE.NormalBlending });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(r*2, r*2), m);
    p.rotation.x = -Math.PI/2;
    p.rotation.z = rnd() * 6.28;
    p.position.set(x, 0.008, y);
    scene.add(p);
  }

  /* --- Grasbüschel --- */
  const bladeGeo = new THREE.ConeGeometry(0.030, 0.34, 3, 1, true);
  bladeGeo.translate(0, 0.17, 0);
  const bladeMat = new THREE.MeshStandardMaterial({
    color:0x63914C, roughness:1.0, metalness:0, side:THREE.DoubleSide });
  const N_BLADE = 900;
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, N_BLADE);
  blades.castShadow = false; blades.receiveShadow = false;
  let n = 0, guard = 0;
  const tint = new THREE.Color();
  while(n < N_BLADE && guard++ < N_BLADE * 6){
    const x = rnd() * AW, y = rnd() * AH;
    if(!_freeSpot(x, y)) continue;
    const s2 = 0.6 + rnd() * 0.85;
    dummy.position.set(x, 0, y);
    dummy.rotation.set((rnd()-0.5) * 0.35, rnd() * 6.28, (rnd()-0.5) * 0.35);
    dummy.scale.set(s2, s2 * (0.7 + rnd() * 0.9), s2);
    dummy.updateMatrix();
    blades.setMatrixAt(n, dummy.matrix);
    tint.setHSL(0.23 + rnd() * 0.05, 0.20 + rnd() * 0.16, 0.26 + rnd() * 0.14);
    blades.setColorAt(n, tint);
    n++;
  }
  blades.count = n;
  blades.instanceMatrix.needsUpdate = true;
  if(blades.instanceColor) blades.instanceColor.needsUpdate = true;
  scene.add(blades);

  /* --- Steine --- */
  const rockGeo = new THREE.SphereGeometry(0.5, 6, 4);
  const rockMat = new THREE.MeshStandardMaterial({ color:0x8C8880, roughness:0.92, metalness:0.02 });
  if(typeof applyTexSet === "function") applyTexSet(rockMat, "stoneN", 1.5, 1.2);
  const N_ROCK = 46;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, N_ROCK);
  rocks.castShadow = true; rocks.receiveShadow = true;
  n = 0; guard = 0;
  while(n < N_ROCK && guard++ < N_ROCK * 20){
    const x = rnd() * AW, y = rnd() * AH;
    if(!_freeSpot(x, y)) continue;
    const s2 = 0.13 + rnd() * 0.20;
    dummy.position.set(x, s2 * 0.34, y);
    dummy.rotation.set(rnd()*6.28, rnd()*6.28, rnd()*6.28);
    dummy.scale.set(s2, s2 * (0.5 + rnd()*0.4), s2 * (0.8 + rnd()*0.5));
    dummy.updateMatrix();
    rocks.setMatrixAt(n, dummy.matrix);
    tint.setHSL(0.09, 0.05 + rnd()*0.06, 0.42 + rnd()*0.22);
    rocks.setColorAt(n, tint);
    n++;
  }
  rocks.count = n;
  rocks.instanceMatrix.needsUpdate = true;
  if(rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  scene.add(rocks);

  /* --- Blüten: kleine Farbtupfer gegen die Eintönigkeit --- */
  const flowerGeo = new THREE.SphereGeometry(0.055, 6, 4);
  const flowerMat = new THREE.MeshStandardMaterial({ color:0xFFFFFF, roughness:0.7 });
  const N_FLOWER = 130;
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, N_FLOWER);
  n = 0; guard = 0;
  const palette = [0xF2E37A, 0xE8F0F4, 0xE0A0C8, 0xF0B060];
  while(n < N_FLOWER && guard++ < N_FLOWER * 20){
    const x = rnd() * AW, y = rnd() * AH;
    if(!_freeSpot(x, y)) continue;
    dummy.position.set(x, 0.10 + rnd() * 0.06, y);
    dummy.rotation.set(0, rnd() * 6.28, 0);
    const s2 = 0.7 + rnd() * 0.7;
    dummy.scale.set(s2, s2 * 0.6, s2);
    dummy.updateMatrix();
    flowers.setMatrixAt(n, dummy.matrix);
    tint.setHex(palette[(rnd() * palette.length) | 0]);
    flowers.setColorAt(n, tint);
    n++;
  }
  flowers.count = n;
  flowers.instanceMatrix.needsUpdate = true;
  if(flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  scene.add(flowers);

  /* --- Schilf am Ufer --- */
  const reedGeo = new THREE.ConeGeometry(0.022, 0.58, 3, 1, true);
  reedGeo.translate(0, 0.275, 0);
  const reedMat = new THREE.MeshStandardMaterial({
    color:0x7C8A4A, roughness:0.95, side:THREE.DoubleSide });
  const N_REED = 160;
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, N_REED);
  n = 0;
  for(let i = 0; i < N_REED; i++){
    const x = 0.6 + rnd() * (AW - 1.2);
    if(BRIDGES.some(bx => Math.abs(x - bx) < BRIDGE_HALF + 0.5)) continue;
    const side = rnd() < 0.5 ? -1 : 1;
    const y = side < 0 ? RIVER.y0 - 0.25 - rnd() * 0.55 : RIVER.y1 + 0.25 + rnd() * 0.55;
    const s2 = 0.7 + rnd() * 0.8;
    dummy.position.set(x, 0, y);
    dummy.rotation.set((rnd()-0.5) * 0.4, rnd() * 6.28, (rnd()-0.5) * 0.4);
    dummy.scale.set(s2, s2 * (0.8 + rnd() * 0.8), s2);
    dummy.updateMatrix();
    reeds.setMatrixAt(n, dummy.matrix);
    tint.setHSL(0.16 + rnd() * 0.06, 0.22 + rnd() * 0.16, 0.26 + rnd() * 0.14);
    reeds.setColorAt(n, tint);
    n++;
  }
  reeds.count = n;
  reeds.instanceMatrix.needsUpdate = true;
  if(reeds.instanceColor) reeds.instanceColor.needsUpdate = true;
  scene.add(reeds);
}

/* ---- Balken und Schatten ---------------------------------------- */
function makeBar(team, width){
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.06, 0.19),
    new THREE.MeshBasicMaterial({ color:0x0B1211, depthTest:false, transparent:true,
                                  opacity:0.9, side:THREE.DoubleSide }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.13),
    new THREE.MeshBasicMaterial({ color: team === "blue" ? 0x5C8CFF : 0xFF6A4C,
                                  depthTest:false, side:THREE.DoubleSide,
                                  // muss ebenfalls "transparent" sein: Three zeichnet
                                  // erst alle undurchsichtigen Objekte, danach die
                                  // durchsichtigen. Sonst deckt der Hintergrund zu.
                                  transparent:true, opacity:1 }));
  fg.position.z = 0.01;                       // knapp vor dem Hintergrund
  bg.renderOrder = 998; fg.renderOrder = 999;
  g.add(bg, fg);
  g.userData = { fg, width };
  return g;
}
function setBar(g, frac){
  const { fg, width } = g.userData;
  fg.scale.x = Math.max(0.001, frac);
  fg.position.x = -width * (1 - frac) / 2;
}
function makeBlob(r){
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 14),
    new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.13, depthWrite:false }));
  m.rotation.x = -Math.PI/2;
  m.position.y = 0.05;
  return m;
}
function makeRing(r, team){
  const col = team === "blue" ? 0x6E97FF : 0xFF7A50;
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r*0.80, 22),
    new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.26,
                                  depthWrite:false }));
  const rim = new THREE.Mesh(new THREE.RingGeometry(r*0.78, r, 24),
    new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.95,
                                  side:THREE.DoubleSide, depthWrite:false }));
  disc.rotation.x = rim.rotation.x = -Math.PI/2;
  disc.position.y = 0.055; rim.position.y = 0.065;
  g.add(disc, rim);
  g.userData.tint = m => { disc.material.opacity = m*0.26; rim.material.opacity = m*0.95; };
  return g;
}

/* ---- Teamfarbe an der Figur ----------------------------------------
   Seit beide Seiten dieselben Charaktere spielen, reicht der Ring am
   Boden allein nicht mehr zum Unterscheiden. Gegnerische Figuren
   bekommen deshalb einen Rotstich. Die Materialien sind zwischen
   allen Einheiten geteilt, deshalb wird pro Ausgangsmaterial genau
   eine eingefaerbte Kopie angelegt und wiederverwendet.          */
const _tinted = new Map();
const TEAM_RED = new THREE.Color(0xFF4A2A);
function tintRed(root){
  root.traverse(o => {
    if(!o.isMesh || !o.material || !o.material.color) return;
    let m = _tinted.get(o.material.uuid);
    if(!m){
      m = o.material.clone();
      // Achtung: Three mischt Farben im linearen Raum. Dort wirkt der
      // gleiche Anteil deutlich kraeftiger als im sRGB-Augenmass — 0.30
      // hat die Figuren komplett rot gefaerbt. 0.13 laesst Streifen,
      // Gold und Stahl erkennbar und markiert trotzdem eindeutig.
      m.color.lerp(TEAM_RED, 0.13);
      _tinted.set(o.material.uuid, m);
    }
    o.material = m;
  });
}

/* ---- Ansichten pflegen ------------------------------------------ */
function viewForUnit(u){
  let v = unitViews.get(u.id);
  if(v) return v;

  const card = CARDS[u.cardId];
  const root = buildModelFor(u.cardId, card);
  const rig = root.userData.rig || {};
  if(u.team === "red") tintRed(root);

  const holder = new THREE.Group();
  // Figuren etwas groesser als massstabsgetreu: aus der Vogelperspektive
  // sind sie sonst kaum zu erkennen. Die Spiellogik bleibt unberuehrt.
  const scaler = new THREE.Group();
  scaler.scale.setScalar(1.45);
  scaler.add(root);
  holder.add(scaler);
  const blob = makeBlob(u.radius * 0.95);      // nur noch leichte Abdunklung
  const ring = makeRing(u.radius * 1.55, u.team);
  const bar = makeBar(u.team, Math.max(0.8, u.radius * 2.2));
  holder.add(blob, ring, bar);
  scene.add(holder);

  // Teamfarbe als Erkennungsmerkmal an Schulter und Brust
  root.traverse(o => {
    if(o.isMesh && o.material && o.material.color && Math.random() < 0){ /* Platzhalter */ }
  });

  v = { holder, root, rig, bar, blob, ring,
        facing: u.team === "blue" ? Math.PI : 0,
        phase: Math.random() * 6.28, swing: 0, dead: 0,
        lastX: u.x, lastY: u.y, barY: ((rig.height || 1.2) + 0.30) * 1.45 };
  unitViews.set(u.id, v);
  return v;
}

function viewForTower(t){
  let v = towerViews.get(t.id);
  if(v) return v;
  const root = buildTower(t.kind, t.team);
  root.position.set(t.x, 0, t.y);
  if(t.team === "red") root.rotation.y = Math.PI;
  const bar = makeBar(t.team, t.radius * 1.7);
  scene.add(root, bar);
  v = { root, bar, barY: root.userData.height + 0.4 };
  towerViews.set(t.id, v);
  return v;
}

/* ---- Bild zeichnen ---------------------------------------------- */
let animClock = 0;

function draw(dt){
  if(!ready) return;
  animClock += dt || 0.016;

  /* --- Türme --- */
  for(const t of W.towers){
    const v = viewForTower(t);
    v.root.visible = true;
    if(t.dead){
      v.root.position.y = -1.4;                   // eingestürzt
      v.bar.visible = false;
      v.root.rotation.z = 0.16;
      continue;
    }
    v.bar.visible = true;
    v.bar.position.set(t.x, v.barY, t.y);
    v.bar.quaternion.copy(camera.quaternion);
    setBar(v.bar, t.hp / t.maxHp);
    if(v.root.userData.flag) v.root.userData.flag.rotation.y = Math.sin(animClock * 1.7) * 0.3;
    if(t.asleep) v.root.position.y = -0.12 + Math.sin(animClock * 1.1) * 0.02;
    else v.root.position.y = 0;
  }

  /* --- Einheiten --- */
  const alive = new Set();
  for(const u of W.units){
    if(u.isTower) continue;
    alive.add(u.id);
    const v = viewForUnit(u);
    const rig = v.rig;

    v.holder.position.set(u.x, 0, u.y);

    // Blickrichtung: aus der tatsächlichen Bewegung, weich nachgeführt
    const dx = u.x - v.lastX, dz = u.y - v.lastY;
    const moved = Math.hypot(dx, dz);
    if(moved > 0.0006) v.facing = Math.atan2(dx, dz);
    else if(u.target) v.facing = Math.atan2(u.target.x - u.x, u.target.y - u.y);
    let diff = v.facing - v.root.rotation.y;
    while(diff >  Math.PI) diff -= Math.PI*2;
    while(diff < -Math.PI) diff += Math.PI*2;
    v.root.rotation.y += diff * Math.min(1, (dt||0.016) * 11);
    v.lastX = u.x; v.lastY = u.y;

    const speed = moved / Math.max(dt || 0.016, 1e-4);
    animate(v, rig, u, speed, dt || 0.016);

    // Aufstellen: Figur wächst aus dem Boden
    if(u.deploy > 0){
      const k = 1 - u.deploy;
      v.root.scale.setScalar(0.35 + 0.65 * k);
      v.root.position.y = -0.5 * (1 - k);
    } else if(!v.dead){
      v.root.scale.setScalar(1);
      v.root.position.y = 0;
    }

    v.bar.position.set(0, v.barY, 0);          // lokal zur Figur
    v.bar.quaternion.copy(camera.quaternion);
    setBar(v.bar, u.hp / u.maxHp);
    v.bar.visible = u.deploy <= 0;

    if(u.frozen > 0){
      v.ring.children.forEach(c => c.material.color.setHex(0x8CE1FF));
      v.root.rotation.y = v.root.rotation.y;      // eingefroren: keine Animation
    } else {
      const col = u.team === "blue" ? 0x6E97FF : 0xFF7A50;
      v.ring.children.forEach(c => c.material.color.setHex(col));
    }
  }

  // Gefallene Einheiten versinken, dann verschwinden sie
  for(const [id, v] of unitViews){
    if(alive.has(id)) continue;
    v.dead += (dt || 0.016);
    v.root.position.y = -v.dead * 1.6;
    v.root.rotation.z = v.dead * 1.5;
    v.root.scale.setScalar(Math.max(0.01, 1 - v.dead * 1.1));
    v.bar.visible = false;
    v.ring.userData.tint(Math.max(0, 1 - v.dead * 1.9));
    v.blob.material.opacity = Math.max(0, 0.13 - v.dead * 0.3);
    if(v.dead > 0.75){
      scene.remove(v.holder);
      unitViews.delete(id);
    }
  }

  // Wasser bewegen: die beiden Karten unterschiedlich schnell versetzen,
  // dadurch entsteht Stroemung statt einer starren Flaeche.
  if(waterMat){
    const t = animClock;
    if(waterMat.map)       waterMat.map.offset.set(t * 0.012, t * 0.030);
    if(waterMat.normalMap) waterMat.normalMap.offset.set(-t * 0.019, t * 0.043);
  }

  drawEffects(dt || 0.016);
  drawAim();
  if(composer) composer.render(); else renderer.render(scene, camera);
}

/* ---- Bewegungsablauf -------------------------------------------- */
function animate(v, rig, u, speed, dt){
  if(rig.static) return;

  if(u.frozen > 0) return;

  // Angriffsschwung: läuft nach jedem Schlag einmal durch
  if(u.cd > 0 && v.lastCd !== undefined && u.cd > v.lastCd) v.swing = 1;
  v.lastCd = u.cd;
  v.swing = Math.max(0, v.swing - dt * 3.4);

  const walking = speed > 0.12;
  v.phase += dt * (walking ? 5.5 + speed * 2.2 : 1.6);

  const s = Math.sin(v.phase), c = Math.cos(v.phase);

  if(rig.flying){
    rig.hips.position.y = (rig.height ? 0.95 : 0.95) + s * 0.07;
    if(rig.armL) rig.armL.rotation.z =  Math.sin(v.phase * 3.2) * 0.7;
    if(rig.armR) rig.armR.rotation.z = -Math.sin(v.phase * 3.2) * 0.7;
    if(rig.torso) rig.torso.rotation.x = c * 0.06;
    return;
  }

  const amp = walking ? 0.62 : 0.06;
  if(rig.legL) rig.legL.rotation.x =  s * amp;
  if(rig.legR) rig.legR.rotation.x = -s * amp;
  if(rig.hips){
    rig.hips.position.y = (v.baseHip !== undefined ? v.baseHip : (v.baseHip = rig.hips.position.y))
                          + Math.abs(c) * (walking ? 0.05 : 0.012);
    rig.hips.rotation.y = s * (walking ? 0.09 : 0.02);
  }
  if(rig.torso) rig.torso.rotation.y = -s * (walking ? 0.11 : 0.02);

  // Arme: beim Laufen gegenläufig, beim Schlag nach vorn durchgezogen
  // poseL/poseR: Grundstellung der Arme aus dem Modell (z.B. Schützenhaltung).
  // Lauf- und Schlagbewegung werden daraufaddiert, nicht daruebergeschrieben.
  const swingEase = v.swing * v.swing;
  const bL = rig.poseL || 0, bR = rig.poseR || 0;
  if(rig.armR) rig.armR.rotation.x = bR - s * amp * 0.55 - swingEase * 2.3;
  if(rig.armL) rig.armL.rotation.x = bL + s * amp * 0.55 - swingEase * 0.5;
  if(rig.torso) rig.torso.rotation.x = swingEase * 0.35;
  if(rig.head)  rig.head.rotation.x  = -swingEase * 0.2;
}

/* ---- Zauberwirkung ---------------------------------------------- */
function drawEffects(dt){
  // Ringe aus der Spiellogik in Szenenobjekte übersetzen
  for(const e of W.effects){
    if(e._view) continue;
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.34, 26),
      new THREE.MeshBasicMaterial({ color:new THREE.Color(e.color || "#FFD27A"),
                                    transparent:true, opacity:0.95, side:THREE.DoubleSide,
                                    depthWrite:false, blending:THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI/2;
    m.position.set(e.x, 0.09, e.y);
    scene.add(m);
    e._view = m;
    effectViews.push({ e, m });
  }
  effectViews = effectViews.filter(({ e, m }) => {
    const a = e.t / e.life;
    if(e.t <= 0 || a <= 0){ scene.remove(m); m.geometry.dispose(); return false; }
    const r = e.kind === "ring" ? (e.r || 0.2) : 0.3;
    m.scale.setScalar(Math.max(0.05, r / 0.34));
    m.material.opacity = Math.min(1, a * 1.3);
    return true;
  });
}

/* ---- Zielhilfe --------------------------------------------------- */
function drawAim(){
  const card = W.selected >= 0 ? CARDS[W.blue.hand[W.selected]] : null;

  if(gridHelper) gridHelper.visible = !!card && !W.over;
  if(card && card.kind !== "spell" && !W.over){
    const y0 = RIVER.y1 + 0.2, y1 = AH;
    zoneMesh.visible = true;
    zoneMesh.scale.set(AW, y1 - y0, 1);
    zoneMesh.position.set(AW/2, 0.04, (y0 + y1)/2);
  } else {
    zoneMesh.visible = false;
  }

  if(card && W.aim && !W.over){
    const ok = canPlace("blue", card, W.aim.x, W.aim.y);
    const r = card.kind === "spell" ? card.radius : Math.max(0.7, (card.count||1) * 0.3);
    aimRing.visible = true;
    aimRing.position.set(W.aim.x, 0.08, W.aim.y);
    aimRing.scale.setScalar(r / 0.75);
    aimRing.material.color.setHex(ok ? 0x78FFBE : 0xFF5A3C);
  } else {
    aimRing.visible = false;
  }
}

/* ---- Kamera und Größe -------------------------------------------- */
function resize(){
  if(!ready) return;
  const r = renderer.domElement.getBoundingClientRect();
  if(r.width < 2 || r.height < 2) return;
  renderer.setSize(r.width, r.height, false);
  if(composer){
    composer.setSize(r.width, r.height);
    if(aoPass) aoPass.setSize(r.width * AO_SCALE, r.height * AO_SCALE);
    if(bloomPass) bloomPass.setSize(r.width * BLOOM_SCALE, r.height * BLOOM_SCALE);
  }
  camera.aspect = r.width / r.height;

  camera.updateProjectionMatrix();
  fitArena();
}

/* Die Arena muss bei jedem Seitenverhaeltnis ganz ins Bild passen und
   dabei mittig sitzen. Eine geschlossene Formel dafuer ist unzuverlaessig:
   die Kamera ist geneigt, also steht die vordere Arenakante naeher und
   projiziert groesser als die hintere. Eine Naeherung ueber cos(tilt)
   unterschaetzt sie und schneidet bei breiten Fenstern den eigenen
   Koenigsturm ab.

   Stattdessen werden die acht Eckpunkte des Arena-Quaders wirklich
   projiziert. Zwei Groessen werden gesucht:

     dist — der Abstand. Je weiter weg, desto kleiner das Bild, also ist
            "passt es noch" monoton in dist. Intervallhalbierung findet
            damit sicher den kleinsten passenden Abstand.
     look — der Zielpunkt auf der Mittelachse. Nur den Abstand zu suchen
            reicht nicht: durch die Neigung stoesst die vordere Kante
            zuerst an, waehrend oben ein breiter leerer Streifen bleibt.
            Der Zielpunkt wird deshalb per Newton-Schritt so verschoben,
            dass ober- und unterhalb gleich viel Rand bleibt.

   Beides haengt voneinander ab, also wechseln sich die Schritte ab.
   Laeuft nur beim Aendern der Fenstergroesse — die Kosten sind egal.  */
const FIT_MARGIN = 0.9;      // Rand in Kacheln
const FIT_TOP    = 3.6;      // Hoehe der Tuerme, damit die Zinnen passen
const _fitV = new THREE.Vector3();
let _fitPts = null;
let FIT_DIST = 30;

/* Erst bei der ersten Benutzung bauen: AW und AH stehen im Skript von
   index.html und sind beim Laden dieser Datei noch nicht definiert. */
function fitPoints(){
  if(!_fitPts){
    _fitPts = [];
    for(const x of [-FIT_MARGIN, AW + FIT_MARGIN])
      for(const z of [-FIT_MARGIN, AH + FIT_MARGIN])
        for(const y of [0, FIT_TOP])
          _fitPts.push(new THREE.Vector3(x, y, z));
  }
  return _fitPts;
}

function placeCam(dist, look){
  camera.position.set(AW/2, dist * Math.sin(CAM.tilt),
                      look + dist * Math.cos(CAM.tilt));
  camera.lookAt(AW/2, 1.2, look);
  camera.updateMatrixWorld(true);
}

/** Bildraum-Huelle aller Eckpunkte. Alles innerhalb -1..1 heisst: passt. */
function fitBounds(dist, look){
  placeCam(dist, look);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for(const p of fitPoints()){
    _fitV.copy(p).project(camera);
    if(_fitV.x < x0) x0 = _fitV.x;
    if(_fitV.x > x1) x1 = _fitV.x;
    if(_fitV.y < y0) y0 = _fitV.y;
    if(_fitV.y > y1) y1 = _fitV.y;
  }
  return { x0, x1, y0, y1, worst: Math.max(-x0, x1, -y0, y1) };
}

function fitArena(){
  let look = AH / 2, dist = FIT_DIST;

  for(let pass = 0; pass < 5; pass++){
    // 1) kleinster Abstand, bei dem bei diesem Zielpunkt alles passt
    let lo = 18, hi = 130;
    if(fitBounds(hi, look).worst > 1){
      dist = hi;                       // passt selbst ganz hinten nicht
    } else {
      for(let i = 0; i < 24; i++){
        const mid = (lo + hi) / 2;
        if(fitBounds(mid, look).worst > 1) lo = mid; else hi = mid;
      }
      dist = hi;
    }

    // 2) Zielpunkt nachziehen, bis die Arena senkrecht mittig sitzt
    const b0 = fitBounds(dist, look);
    const off = (b0.y0 + b0.y1) / 2;
    if(Math.abs(off) < 0.004) break;
    const step = 0.5;
    const off1 = (() => { const b = fitBounds(dist, look + step);
                          return (b.y0 + b.y1) / 2; })();
    const slope = (off1 - off) / step;
    if(Math.abs(slope) < 1e-6) break;
    look = clampNum(look - off / slope, AH/2 - 10, AH/2 + 10);
  }

  FIT_DIST = dist;
  CAM.look = look;
  placeCam(dist, look);
  camera.updateProjectionMatrix();
}

function clampNum(v, a, b){ return v < a ? a : v > b ? b : v; }

/** Bildschirmpunkt -> Spielkoordinate auf dem Boden. */
function pickTile(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  pointerNDC.x =  ((clientX - r.left) / r.width) * 2 - 1;
  pointerNDC.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  const hit = new THREE.Vector3();
  if(!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
  return { x: hit.x, y: hit.z };
}

/** Alles wegräumen, damit die nächste Partie sauber startet. */
function resetScene(){
  for(const [, v] of unitViews) scene.remove(v.holder);
  unitViews.clear();
  for(const [, v] of towerViews){ scene.remove(v.root); scene.remove(v.bar); }
  towerViews.clear();
  for(const { m } of effectViews) scene.remove(m);
  effectViews = [];
}
