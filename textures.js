"use strict";
/* ============================================================
   TEXTUREN — im Code erzeugte PBR-Karten

   Jedes Material bekommt drei Karten:
     map          Grundfarbe (Albedo)
     normalMap    Oberflächenrelief — der wichtigste Teil. Ohne ihn
                  sieht jedes Material aus wie lackiertes Plastik,
                  egal wie gut die Farbe stimmt.
     roughnessMap Wo glänzt es, wo ist es stumpf. Gleichmäßige
                  Rauheit ist der zweite große Billig-Faktor.

   Alles entsteht aus einem Höhenfeld: Daraus wird per Sobel-Filter
   die Normalenkarte gerechnet, und die Farbe wird entlang der Höhe
   moduliert. So passen Farbe und Relief immer zusammen.

   Erzeugt wird einmalig beim Start (~200 ms), danach geteilt.
   ============================================================ */

/* ---- Rauschen -------------------------------------------------- */
function _rng(seed){
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/** Wertrauschen mit weicher Interpolation, kachelbar. */
function valueNoise(w, h, cells, seed){
  const rnd = _rng(seed);
  const g = new Float32Array((cells + 1) * (cells + 1));
  for(let y = 0; y <= cells; y++)
    for(let x = 0; x <= cells; x++)
      g[y * (cells + 1) + x] = (x === cells || y === cells)
        ? g[(y % cells) * (cells + 1) + (x % cells)]   // Kanten schließen
        : rnd();
  const out = new Float32Array(w * h);
  const sm = t => t * t * (3 - 2 * t);
  for(let y = 0; y < h; y++){
    const fy = y / h * cells, y0 = Math.floor(fy), ty = sm(fy - y0);
    for(let x = 0; x < w; x++){
      const fx = x / w * cells, x0 = Math.floor(fx), tx = sm(fx - x0);
      const a = g[y0 * (cells + 1) + x0],       b = g[y0 * (cells + 1) + x0 + 1];
      const c = g[(y0 + 1) * (cells + 1) + x0], d = g[(y0 + 1) * (cells + 1) + x0 + 1];
      out[y * w + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }
  }
  return out;
}

/** Mehrere Oktaven übereinander — grobe Form plus feine Körnung. */
function fbm(w, h, octaves, baseCells, seed, gain){
  const out = new Float32Array(w * h);
  let amp = 1, cells = baseCells, total = 0;
  for(let o = 0; o < octaves; o++){
    const n = valueNoise(w, h, cells, seed + o * 7919);
    for(let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= (gain === undefined ? 0.5 : gain);
    cells *= 2;
  }
  for(let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/* ---- Karten aus einem Höhenfeld -------------------------------- */
function _canvas(w, h){
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
function _tex(canvas, repeat, srgb){
  const t = new THREE.CanvasTexture(canvas);
  if(srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

/**
 * Normalenkarte aus dem Höhenfeld (Sobel).
 * Three erwartet Tangentenraum mit +Y nach oben — daher das
 * Vorzeichen bei ny. Ein falsches Vorzeichen dreht die Beleuchtung
 * um und Vertiefungen sehen aus wie Beulen.
 */
function normalMapFrom(hf, w, h, strength){
  const c = _canvas(w, h), ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h), d = img.data;
  const at = (x, y) => hf[((y + h) % h) * w + ((x + w) % w)];
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const dx = (at(x-1,y-1) + 2*at(x-1,y) + at(x-1,y+1))
               - (at(x+1,y-1) + 2*at(x+1,y) + at(x+1,y+1));
      const dy = (at(x-1,y-1) + 2*at(x,y-1) + at(x+1,y-1))
               - (at(x-1,y+1) + 2*at(x,y+1) + at(x+1,y+1));
      let nx = dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      d[i]   = (nx / len * 0.5 + 0.5) * 255;
      d[i+1] = (ny / len * 0.5 + 0.5) * 255;
      d[i+2] = (nz / len * 0.5 + 0.5) * 255;
      d[i+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Graustufenkarte aus einem Feld, mit Bereich und Kontrast. */
function grayMapFrom(field, w, h, lo, hi){
  const c = _canvas(w, h), ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h), d = img.data;
  for(let i = 0; i < field.length; i++){
    const v = (lo + (hi - lo) * field[i]) * 255;
    d[i*4] = d[i*4+1] = d[i*4+2] = v; d[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Farbkarte: Grundton, entlang der Höhe aufgehellt/abgedunkelt. */
function albedoFrom(field, w, h, base, dark, light, tintField, tintCol, tintAmt){
  const c = _canvas(w, h), ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h), d = img.data;
  const B = new THREE.Color(base), D = new THREE.Color(dark), L = new THREE.Color(light);
  const T = tintCol !== undefined ? new THREE.Color(tintCol) : null;
  const tmp = new THREE.Color();
  for(let i = 0; i < field.length; i++){
    const v = field[i];
    tmp.copy(B);
    if(v < 0.5) tmp.lerp(D, (0.5 - v) * 2 * 0.9);
    else        tmp.lerp(L, (v - 0.5) * 2 * 0.9);
    if(T && tintField) tmp.lerp(T, Math.max(0, tintField[i] - 0.55) * 2.2 * tintAmt);
    d[i*4]   = tmp.r * 255;
    d[i*4+1] = tmp.g * 255;
    d[i*4+2] = tmp.b * 255;
    d[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ============================================================
   MATERIALSÄTZE
   ============================================================ */
const _sets = new Map();

/**
 * Liefert { map, normalMap, roughnessMap } für eine Materialart.
 * Die Sätze sind geteilt — pro Art wird genau einmal gerechnet.
 */
function texSet(kind){
  if(_sets.has(kind)) return _sets.get(kind);
  const S = 256;
  let set;

  switch(kind){

    case "grass": {
      const W = 512;
      const clump = fbm(W, W, 4, 6, 1337);          // grobe Flecken
      const blade = fbm(W, W, 3, 48, 7331, 0.62);   // feine Halme
      const dry   = fbm(W, W, 3, 4, 5150);          // trockene Stellen
      const height = new Float32Array(W * W);
      for(let i = 0; i < height.length; i++)
        height[i] = clump[i] * 0.45 + blade[i] * 0.55;
      set = {
        map: _tex(albedoFrom(height, W, W, 0x74A85E, 0x4E7A44, 0xA6CC84,
                             dry, 0xC0B06A, 0.8), 1, true),
        normalMap: _tex(normalMapFrom(height, W, W, 2.2), 1, false),
        roughnessMap: _tex(grayMapFrom(blade, W, W, 0.78, 1.0), 1, false),
        _repeat: 5,
      };
      break;
    }

    case "stone": {
      // Quaderraster mit Fugen, dazu Verwitterung
      const grain = fbm(S, S, 4, 10, 2024);
      const height = new Float32Array(S * S);
      const bw = 64, bh = 32, joint = 3;
      for(let y = 0; y < S; y++){
        const row = Math.floor(y / bh);
        const off = (row % 2) * (bw / 2);
        for(let x = 0; x < S; x++){
          const lx = (x + off) % bw, ly = y % bh;
          const inJoint = lx < joint || ly < joint;
          height[y*S+x] = (inJoint ? 0.12 : 0.72) + grain[y*S+x] * 0.28;
        }
      }
      set = {
        map: _tex(albedoFrom(height, S, S, 0x8E8A80, 0x5A574F, 0xB4B0A4,
                             grain, 0x7A7060, 0.5), 1, true),
        normalMap: _tex(normalMapFrom(height, S, S, 3.0), 1, false),
        roughnessMap: _tex(grayMapFrom(grain, S, S, 0.72, 0.98), 1, false),
        _repeat: 2,
      };
      break;
    }

    case "wood": {
      // Maserung: gestauchtes Rauschen in eine Richtung, plus Ringe
      const n = fbm(S, S, 4, 8, 4242);
      const height = new Float32Array(S * S);
      for(let y = 0; y < S; y++)
        for(let x = 0; x < S; x++){
          const rings = Math.sin((y * 0.14 + n[y*S+x] * 5.0)) * 0.5 + 0.5;
          height[y*S+x] = rings * 0.55 + n[y*S+x] * 0.45;
        }
      set = {
        map: _tex(albedoFrom(height, S, S, 0x8A6A44, 0x5A4229, 0xAC8A5E,
                             n, 0x6B4A2A, 0.55), 1, true),
        normalMap: _tex(normalMapFrom(height, S, S, 2.0), 1, false),
        roughnessMap: _tex(grayMapFrom(height, S, S, 0.55, 0.92), 1, false),
        _repeat: 2,
      };
      break;
    }

    case "cloth": {
      // Gewebe: feines Kreuzmuster plus weiche Falten
      const fold = fbm(S, S, 3, 5, 909);
      const height = new Float32Array(S * S);
      for(let y = 0; y < S; y++)
        for(let x = 0; x < S; x++){
          const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5;
          height[y*S+x] = weave * 0.35 + fold[y*S+x] * 0.65;
        }
      set = {
        map: _tex(albedoFrom(height, S, S, 0xFFFFFF, 0xC8C8C8, 0xFFFFFF), 1, true),
        normalMap: _tex(normalMapFrom(height, S, S, 1.1), 1, false),
        roughnessMap: _tex(grayMapFrom(height, S, S, 0.82, 1.0), 1, false),
        _repeat: 3,
      };
      break;
    }

    case "leather": {
      // Narbung: viele kleine Zellen
      const cell = fbm(S, S, 3, 34, 6161, 0.55);
      const wear = fbm(S, S, 3, 6, 1717);
      const height = new Float32Array(S * S);
      for(let i = 0; i < height.length; i++)
        height[i] = cell[i] * 0.72 + wear[i] * 0.28;
      set = {
        map: _tex(albedoFrom(height, S, S, 0xFFFFFF, 0xB4AFA8, 0xFFFFFF), 1, true),
        normalMap: _tex(normalMapFrom(height, S, S, 1.6), 1, false),
        roughnessMap: _tex(grayMapFrom(wear, S, S, 0.55, 0.88), 1, false),
        _repeat: 3,
      };
      break;
    }

    case "metal": {
      // Schliffspuren in eine Richtung, dazu Kratzer und Dellen
      const streak = fbm(S, S, 3, 3, 313);
      const dent = fbm(S, S, 4, 14, 2727);
      const height = new Float32Array(S * S);
      for(let y = 0; y < S; y++)
        for(let x = 0; x < S; x++){
          const brush = streak[y*S + ((x * 7) % S)];
          height[y*S+x] = brush * 0.55 + dent[y*S+x] * 0.45;
        }
      set = {
        map: _tex(albedoFrom(height, S, S, 0xFFFFFF, 0xD2D2D2, 0xFFFFFF), 1, true),
        normalMap: _tex(normalMapFrom(height, S, S, 0.9), 1, false),
        roughnessMap: _tex(grayMapFrom(dent, S, S, 0.18, 0.62), 1, false),
        _repeat: 2,
      };
      break;
    }

    case "water": {
      const a = fbm(S, S, 4, 6, 808);
      const b = fbm(S, S, 4, 11, 4404);
      const height = new Float32Array(S * S);
      for(let i = 0; i < height.length; i++) height[i] = a[i] * 0.6 + b[i] * 0.4;
      set = {
        map: _tex(albedoFrom(height, S, S, 0x2E7FA0, 0x1C5C78, 0x54A8C4), 1, true),
        normalMap: _tex(normalMapFrom(height, S, S, 1.4), 1, false),
        roughnessMap: _tex(grayMapFrom(height, S, S, 0.02, 0.16), 1, false),
        _repeat: 3,
      };
      break;
    }

    case "dirt": {
      const n = fbm(S, S, 4, 7, 9119);
      const peb = fbm(S, S, 3, 26, 3311, 0.6);
      const height = new Float32Array(S * S);
      for(let i = 0; i < height.length; i++) height[i] = n[i] * 0.6 + peb[i] * 0.4;
      set = {
        map: _tex(albedoFrom(height, S, S, 0x8A7351, 0x5E4C33, 0xAA9169,
                             peb, 0x9A9086, 0.5), 1, true),
        normalMap: _tex(normalMapFrom(height, S, S, 2.4), 1, false),
        roughnessMap: _tex(grayMapFrom(n, S, S, 0.82, 1.0), 1, false),
        _repeat: 3,
      };
      break;
    }

    /* Neutrale Varianten: Relief und Rauheit wie oben, aber die Farbkarte
       ist nahezu weiß. Nötig überall dort, wo die Materialfarbe die
       Figur bestimmt — sonst multipliziert sich Texturfarbe MIT
       Materialfarbe und alles wird doppelt abgedunkelt. */
    case "woodN": {
      const src = texSet("wood");
      const n = fbm(S, S, 4, 8, 4242);
      const height = new Float32Array(S * S);
      for(let y = 0; y < S; y++)
        for(let x = 0; x < S; x++){
          const rings = Math.sin((y * 0.14 + n[y*S+x] * 5.0)) * 0.5 + 0.5;
          height[y*S+x] = rings * 0.55 + n[y*S+x] * 0.45;
        }
      set = {
        map: _tex(albedoFrom(height, S, S, 0xFFFFFF, 0xB9AE9E, 0xFFFFFF), 1, true),
        normalMap: src.normalMap, roughnessMap: src.roughnessMap, _repeat: 2,
      };
      break;
    }
    case "stoneN": {
      const src = texSet("stone");
      const grain = fbm(S, S, 4, 10, 2024);
      const height = new Float32Array(S * S);
      const bw = 64, bh = 32, joint = 3;
      for(let y = 0; y < S; y++){
        const row = Math.floor(y / bh), off = (row % 2) * (bw / 2);
        for(let x = 0; x < S; x++){
          const lx = (x + off) % bw, ly = y % bh;
          height[y*S+x] = ((lx < joint || ly < joint) ? 0.12 : 0.72) + grain[y*S+x] * 0.28;
        }
      }
      set = {
        map: _tex(albedoFrom(height, S, S, 0xFFFFFF, 0xA8A49B, 0xFFFFFF), 1, true),
        normalMap: src.normalMap, roughnessMap: src.roughnessMap, _repeat: 2,
      };
      break;
    }

    default:
      set = { map:null, normalMap:null, roughnessMap:null, _repeat:1 };
  }

  _sets.set(kind, set);
  return set;
}

/**
 * Hängt einen Materialsatz an ein Material. `tint` bleibt die
 * Grundfarbe — die Karten liefern nur Relief, Rauheit und
 * Helligkeitsschwankung, damit jede Figur ihre Farbe behält.
 */
function applyTexSet(material, kind, repeatScale, normalScale){
  const set = texSet(kind);
  if(!set.map) return material;
  const rep = (set._repeat || 1) * (repeatScale === undefined ? 1 : repeatScale);
  const clone = t => {
    if(!t) return null;
    const c = t.clone();
    c.needsUpdate = true;
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(rep, rep);
    return c;
  };
  material.map = clone(set.map);
  material.normalMap = clone(set.normalMap);
  material.roughnessMap = clone(set.roughnessMap);
  const ns = normalScale === undefined ? 1 : normalScale;
  material.normalScale = new THREE.Vector2(ns, ns);
  material.needsUpdate = true;
  return material;
}

/* ---- Weiche Ränder für Bodenaufdrucke -------------------------------
   Ein Erdfleck mit harter Kante sieht aus wie ein aufgelegtes Brett.
   Eine Alphamaske mit weichem Verlauf lässt ihn in die Wiese auslaufen.
   Zusätzliches Rauschen macht den Rand unregelmäßig statt kreisrund.
--------------------------------------------------------------------- */
const _alphaMasks = new Map();
function decalAlpha(kind){
  if(_alphaMasks.has(kind)) return _alphaMasks.get(kind);
  const S = 256;
  // WICHTIG: Three liest alphaMap aus dem GRUENKANAL, nicht aus dem
  // Alphakanal. Die Maske muss deshalb als Graustufe in RGB stehen.
  const c = _canvas(S, S), g = c.getContext("2d");
  const n = fbm(S, S, 3, 5, kind === "path" ? 4711 : 8123);
  const img = g.createImageData(S, S), d = img.data;
  for(let y = 0; y < S; y++){
    for(let x = 0; x < S; x++){
      const u = x / (S-1), v = y / (S-1);
      let a;
      if(kind === "path"){
        // längs durchgehend, quer weich auslaufend
        // Ueber 40 Prozent der Breite auslaufen lassen, nicht ueber 5.
        const edge = Math.min(1, Math.min(u, 1-u) / 0.40);
        const ends = Math.min(1, Math.min(v, 1-v) / 0.22);
        a = edge * edge * (3 - 2*edge) * ends * ends * (3 - 2*ends);
      } else if(kind === "band"){
        // gleichmäßig längs, weich quer — für Uferschaum
        const e = Math.min(1, Math.min(v, 1-v) / 0.48);
        a = e * e * (3 - 2*e) * 0.85;
      } else {
        // Kern voll deckend, aussen weich auslaufend
        const r = Math.hypot(u - 0.5, v - 0.5) * 2;
        a = 1 - Math.min(1, Math.max(0, (r - 0.52) / 0.48));
        a = a * a * (3 - 2*a);
      }
      a *= 0.62 + n[y*S+x] * 0.65;          // unregelmäßiger Rand
      const g8 = Math.max(0, Math.min(1, a)) * 255;
      const i = (y*S+x)*4;
      d[i] = d[i+1] = d[i+2] = g8;          // Maske in RGB
      d[i+3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  _alphaMasks.set(kind, t);
  return t;
}
