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
let ready = false;

const unitViews = new Map();     // Einheiten-ID -> { root, rig, bar, blob, ... }
const towerViews = new Map();
let effectViews = [];
let aimRing = null, zoneMesh = null;

const CAM = { tilt: 1.12, dist: 30, height: 25, look: 16.0 };

/* ---- Aufbau ----------------------------------------------------- */
function initScene(canvas){
  if(ready) return;

  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16241F);
  scene.fog = new THREE.Fog(0x16241F, 78, 122);

  camera = new THREE.PerspectiveCamera(38, 1, 1, 140);

  scene.add(new THREE.HemisphereLight(0xCFE4F2, 0x4A5C42, 0.95));

  const sun = new THREE.DirectionalLight(0xFFF4E2, 2.3);
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
  sun.target.position.set(AW/2, 0, AH/2);
  scene.add(sun, sun.target);

  const rim = new THREE.DirectionalLight(0x9CC0FF, 0.5);
  rim.position.set(12, 10, 44);
  scene.add(rim);

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

  ready = true;
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
  panel(0xCBD3D6, 20, 20, 20, 0, 0, 0);                       // neutrale Kuppel
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
  scene.environmentIntensity = 0.38;
  pmrem.dispose();
}

/* ---- Bodenstruktur -------------------------------------------------
   Eine gleichmaessig gruene Flaeche wirkt wie Filz. Ein bisschen
   Rauschen und ein paar hellere Buendel geben ihr Tiefe.          */
function grassTexture(base, spots){
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for(let i = 0; i < 2600; i++){
    const x = Math.random()*256, y = Math.random()*256;
    const l = (Math.random()-0.5) * 26;
    g.fillStyle = `rgba(${l>0?255:0},${l>0?255:0},${l>0?200:0},${Math.abs(l)/150})`;
    g.fillRect(x, y, 2.2, 1.2);
  }
  for(let i = 0; i < spots; i++){
    const x = Math.random()*256, y = Math.random()*256;
    const r = 6 + Math.random()*16;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(255,255,210,0.10)");
    grd.addColorStop(1, "rgba(255,255,210,0)");
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  // Ohne diese Zeile behandelt Three die Textur als linear und der
  // Rasen wirkt ausgewaschen.
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 10);
  return t;
}

/* ---- Arena ------------------------------------------------------- */
function buildArena(){
  const half = { x: AW/2, z: AH/2 };

  const grass = grassTexture("#5F8C52", 60);
  const groundMat = (c, textured) => new THREE.MeshStandardMaterial({
    color:c, roughness:0.97, metalness:0.0, map: textured ? grass : null });
  const mk = (w, d, x, z, c, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), groundMat(c, true));
    m.position.set(x, (y||0) - 0.2, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // Zwei Spielfeldhälften, leicht unterschiedlich, damit die Mitte lesbar ist
  mk(AW, RIVER.y0,        half.x, RIVER.y0/2,                 0xBFCFB2);
  mk(AW, AH - RIVER.y1,   half.x, RIVER.y1 + (AH-RIVER.y1)/2, 0xC9D9BB);

  // Fluss: tiefer gelegt, damit die Böschung Schatten wirft
  const river = new THREE.Mesh(
    new THREE.BoxGeometry(AW, 0.34, RIVER.y1 - RIVER.y0),
    new THREE.MeshStandardMaterial({ color:0x2A7C99, roughness:0.06, metalness:0.55 }));
  river.position.set(half.x, -0.30, (RIVER.y0 + RIVER.y1)/2);
  scene.add(river);

  // Brücken mit Geländerpfosten
  for(const bx of BRIDGES){
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(BRIDGE_HALF*2, 0.22, RIVER.y1 - RIVER.y0 + 0.9),
      groundMat(0x7A6045));
    b.position.set(bx, 0.02, (RIVER.y0 + RIVER.y1)/2);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    for(const sx of [-1, 1]){
      for(let i = 0; i < 4; i++){
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.12), groundMat(0x5C4632));
        p.position.set(bx + sx*(BRIDGE_HALF - 0.08), 0.22,
                       RIVER.y0 - 0.35 + i * ((RIVER.y1 - RIVER.y0 + 0.7) / 3));
        p.castShadow = true;
        scene.add(p);
      }
    }
  }

  // Rasterlinien, dezent, als Orientierung beim Platzieren
  const grid = new THREE.Group();
  const lineMat = new THREE.MeshBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.045 });
  for(let i = 1; i < AW; i++){
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.03, AH), lineMat);
    m.rotation.x = -Math.PI/2; m.position.set(i, 0.03, half.z); grid.add(m);
  }
  for(let i = 1; i < AH; i++){
    const m = new THREE.Mesh(new THREE.PlaneGeometry(AW, 0.03), lineMat);
    m.rotation.x = -Math.PI/2; m.position.set(half.x, 0.03, i); grid.add(m);
  }
  scene.add(grid);

  // Platzierungszone (wird beim Kartenwählen eingeblendet)
  zoneMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color:0x4C7DFF, transparent:true, opacity:0.13, depthWrite:false }));
  zoneMesh.rotation.x = -Math.PI/2;
  zoneMesh.visible = false;
  scene.add(zoneMesh);

  // Bande rundherum
  for(const [w, d, x, z] of [[AW+1.2, 0.6, AW/2, -0.5], [AW+1.2, 0.6, AW/2, AH+0.5],
                             [0.6, AH+1.2, -0.5, AH/2], [0.6, AH+1.2, AW+0.5, AH/2]]){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), groundMat(0x24352B));
    m.position.set(x, 0.1, z);
    scene.add(m);
  }
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
  const m = new THREE.Mesh(new THREE.RingGeometry(r*0.82, r, 20),
    new THREE.MeshBasicMaterial({ color: team === "blue" ? 0x6E97FF : 0xFF8368,
                                  transparent:true, opacity:0.85, side:THREE.DoubleSide,
                                  depthWrite:false }));
  m.rotation.x = -Math.PI/2;
  m.position.y = 0.06;
  return m;
}

/* ---- Ansichten pflegen ------------------------------------------ */
function viewForUnit(u){
  let v = unitViews.get(u.id);
  if(v) return v;

  const card = CARDS[u.cardId];
  const root = buildModelFor(u.cardId, card);
  const rig = root.userData.rig || {};

  const holder = new THREE.Group();
  // Figuren etwas groesser als massstabsgetreu: aus der Vogelperspektive
  // sind sie sonst kaum zu erkennen. Die Spiellogik bleibt unberuehrt.
  const scaler = new THREE.Group();
  scaler.scale.setScalar(1.45);
  scaler.add(root);
  holder.add(scaler);
  const blob = makeBlob(u.radius * 0.95);      // nur noch leichte Abdunklung
  const ring = makeRing(u.radius * 1.25, u.team);
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
      v.ring.material.color.setHex(0x8CE1FF);
      v.root.rotation.y = v.root.rotation.y;      // eingefroren: keine Animation
    } else {
      v.ring.material.color.setHex(u.team === "blue" ? 0x6E97FF : 0xFF8368);
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
    v.ring.material.opacity = Math.max(0, 0.85 - v.dead * 1.6);
    v.blob.material.opacity = Math.max(0, 0.13 - v.dead * 0.3);
    if(v.dead > 0.75){
      scene.remove(v.holder);
      unitViews.delete(id);
    }
  }

  drawEffects(dt || 0.016);
  drawAim();
  renderer.render(scene, camera);
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
  const swingEase = v.swing * v.swing;
  if(rig.armR) rig.armR.rotation.x = -s * amp * 0.55 - swingEase * 2.3;
  if(rig.armL) rig.armL.rotation.x =  s * amp * 0.55 - swingEase * 0.5;
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
  camera.aspect = r.width / r.height;

  // Bildausschnitt an das Seitenverhältnis anpassen: Bei schmalen
  // Fenstern weiter weg, damit die Arena immer ganz sichtbar bleibt.
  // Reichweite so waehlen, dass sowohl Breite als auch Tiefe passen.
  const vFov = camera.fov * Math.PI / 180;
  const needH = (AH * Math.cos(CAM.tilt) + 1.5) / (2 * Math.tan(vFov/2));
  const needW = (AW + 1.5) / (2 * Math.tan(vFov/2) * camera.aspect);
  const dist  = Math.max(24, needH, needW);
  camera.position.set(AW/2, dist * Math.sin(CAM.tilt), CAM.look + dist * Math.cos(CAM.tilt));
  camera.lookAt(AW/2, 1.2, CAM.look);
  camera.updateProjectionMatrix();
}

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
