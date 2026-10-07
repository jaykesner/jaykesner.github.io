/**
 * Anim test — a 10 s seamless pixel-art loop drawn into a 240×135 framebuffer.
 * Every periodic motion uses a period that divides LOOP so frame 0 === frame LOOP.
 */

const W = 240;
const H = 135;
const LOOP = 10;
const TAU = Math.PI * 2;

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
canvas.width = W;
canvas.height = H;
const image = ctx.createImageData(W, H);
const FB = { w: W, h: H, data: new Uint32Array(image.data.buffer) };

// ---------------------------------------------------------------- helpers

function C(hex) {
  const n = parseInt(hex.slice(1), 16);
  return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}

function mix(a, b, t) {
  const ar = a & 255, ag = (a >> 8) & 255, ab = (a >> 16) & 255;
  const br = b & 255, bg = (b >> 8) & 255, bb = (b >> 16) & 255;
  const r = (ar + (br - ar) * t) | 0;
  const g = (ag + (bg - ag) * t) | 0;
  const bl = (ab + (bb - ab) * t) | 0;
  return ((255 << 24) | (bl << 16) | (g << 8) | r) >>> 0;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function layer(w, h) {
  return { w, h, data: new Uint32Array(w * h) };
}

function px(L, x, y, c) {
  if (x < 0 || y < 0 || x >= L.w || y >= L.h) return;
  L.data[y * L.w + x] = c;
}

function rect(L, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(L, x + i, y + j, c);
}

function blit(src, dst, ox, oy) {
  for (let j = 0; j < src.h; j++) {
    for (let i = 0; i < src.w; i++) {
      const c = src.data[j * src.w + i];
      if (c) px(dst, ox + i, oy + j, c);
    }
  }
}

function spr(L, rows, pal, x, y, flip = false) {
  const w = rows[0].length;
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < w; i++) {
      const c = pal[rows[j][i]];
      if (c) px(L, x + (flip ? w - 1 - i : i), y + j, c);
    }
  }
}

// ---------------------------------------------------------------- palette

const SKY_BANDS = ["#2d5aa0", "#3a6bb3", "#4b7ec3", "#5f93d1", "#78a8dc", "#95bce5", "#b5cfec", "#d3dcee", "#ecdde0"].map(C);
const SUN_CORE = C("#fffbe6");
const SUN_RIM = C("#ffeaa8");
const SUN_GLOW = C("#fff0c4");

const PAL_FAR = ["#8d97c4", "#a4afd6", "#bfc8e6", "#d8def1", "#eef1fa"].map(C);
const PAL_MID = ["#99a0cc", "#b3bbdf", "#cfd5ee", "#e8ebf7", "#ffffff"].map(C);
const PAL_SEA_BACK = ["#a79fc6", "#bdb7d8", "#d4d0e7", "#e8e6f3", "#f8f7fc"].map(C);
const PAL_SEA_FRONT = ["#b6a8c8", "#cdc1db", "#e2dae9", "#f2eef5", "#ffffff"].map(C);
const LEAVES = ["#27552f", "#357a3a", "#4d9b43", "#6fbd4f", "#9bd96b"].map(C);

const GRASS_HI = C("#c6ec78");
const GRASS = C("#86cc4c");
const GRASS_SH = C("#5ea73d");
const DIRT = C("#9b6a43");
const DIRT_DK = C("#71472d");
const ROCK = ["#2c2742", "#433b5c", "#5c5378", "#786e93", "#968dae"].map(C);
const VINE = C("#4d8f3a");
const VINE_LEAF = C("#79bf4f");
const ROOT = C("#6b4a36");
const CRYSTAL = ["#2a8fb8", "#3cc6e6", "#8ff4ff", "#e6feff"].map(C);

const WALL = C("#f1e4c6");
const WALL_SH = C("#d9c7a1");
const WALL_SPECK = C("#e4d4b1");
const WOOD = C("#7a4b2f");
const WOOD_DK = C("#56341f");
const WOOD_HI = C("#9a6a45");
const STONE = C("#9c93a8");
const STONE_DK = C("#716a80");
const ROOF = C("#cc5a40");
const ROOF_HI = C("#e97c5c");
const ROOF_DK = C("#9a3f30");
const ROOF_OL = C("#5e2a2a");
const BRICK = C("#a44f3d");
const BRICK_DK = C("#7a3a2e");
const CAP = C("#4d4458");
const GLOW = C("#ffd57e");
const GLOW_HI = C("#fff0bf");
const GLOW_DIM = C("#f2bf66");
const DOOR = C("#8a5a3a");
const DOOR_DK = C("#6a4128");
const KNOB = C("#ffd34d");
const INSIDE = C("#b86a36");
const INSIDE_HI = C("#f3b566");
const SPILL = C("#f6d9a0");
const FENCE = C("#efe3c8");
const FENCE_SH = C("#bfae8f");
const PATH = C("#d8d0c0");
const PATH_DK = C("#aaa193");
const BED = C("#7a5236");
const BED_DK = C("#5c3c28");
const STEM = C("#4c9a3a");
const PETALS = ["#ff7eb6", "#ffd84a", "#b48cff", "#ffffff", "#ff6b5e", "#7fd4ff"].map(C);
const BLOOM_CORE = C("#ffe27a");
const APPLE = C("#e8483f");
const SMOKE = C("#f4f4f6");
const SMOKE_SH = C("#c9cbdc");
const BIRD = C("#353a5c");
const WATER = C("#a8e4ff");
const WATER_HI = C("#e9fbff");
const CAN = C("#7fb3c8");
const CAN_HI = C("#bfe0ea");
const CAN_DK = C("#4f7f98");
const FLY_WING = C("#fff3a0");
const FLY_BODY = C("#3b2f3f");

const CHAR_PAL = {
  h: C("#5b3a29"),
  H: C("#83573a"),
  s: C("#f6caa4"),
  e: C("#2b2233"),
  y: C("#ffcf4a"),
  b: C("#4a7fd6"),
  p: C("#6b4a36"),
  k: C("#2b2233"),
};
const CHAR_BLINK = { ...CHAR_PAL, e: CHAR_PAL.s };

// ---------------------------------------------------------------- sprites

const IDLE = [
  "..hhhh..",
  ".hhhhHh.",
  ".hhsses.",
  ".hsssss.",
  "..yyyy..",
  ".bbbbbb.",
  "sbbbbbbs",
  ".bbbbbb.",
  "..pppp..",
  "..p..p..",
  "..k..k..",
];

const patch = (base, rows) => base.map((r, i) => rows[i] ?? r);

const WALK_A = patch(IDLE, { 9: ".pp..pp.", 10: ".k....k." });
const WALK_B = patch(IDLE, { 6: ".bbbbbb.", 7: "sbbbbbbs", 9: "...pp...", 10: "...kk..." });
const WATER_POSE = patch(IDLE, { 5: ".bbbbbbs", 6: "sbbbbbb." });

const IDLE9 = IDLE.map((r) => r + ".");
const WAVE_A = patch(IDLE9, { 3: ".hsssss.s", 4: "..yyyy.b.", 5: ".bbbbbbb.", 6: "sbbbbbb.." });
const WAVE_B = patch(IDLE9, { 2: ".hhsses.s", 3: ".hsssss.b", 4: "..yyyy.b.", 5: ".bbbbbbb.", 6: "sbbbbbb.." });

const BIRD_UP = ["k...k", ".k.k.", "..k.."];
const BIRD_DOWN = ["..k..", ".k.k.", "k...k"];
const BIRD_PAL = { k: BIRD };

// ---------------------------------------------------------------- sky

const SKY = new Uint32Array(W * H);
(function buildSky() {
  const n = SKY_BANDS.length;
  const sunX = 198;
  const sunY = 24;
  for (let y = 0; y < H; y++) {
    const v = (y / (H - 1)) * (n - 1);
    const i = Math.floor(v);
    const f = v - i;
    for (let x = 0; x < W; x++) {
      let c = f > bayer(x, y) ? SKY_BANDS[Math.min(i + 1, n - 1)] : SKY_BANDS[i];
      const d = Math.hypot(x + 0.5 - sunX, y + 0.5 - sunY);
      if (d < 6) c = SUN_CORE;
      else if (d < 7.5) c = SUN_RIM;
      else {
        const g = Math.max(0, 1 - (d - 7.5) / 24);
        const q = Math.floor(g * g * 0.75 * 4 + bayer(x, y)) / 4;
        if (q > 0) c = mix(c, SUN_GLOW, q);
      }
      SKY[y * W + x] = c;
    }
  }
})();

// ---------------------------------------------------------------- blobs (clouds, foliage)

function makeBlob(lobes, amp, freq, base) {
  const sorted = lobes
    .map((l, i) => [l[0], l[1], l[2], l[3] ?? hash(i * 7.7 + l[0] * 0.3 + l[1]) * TAU])
    .sort((a, b) => a[1] - b[1]);
  const n = sorted.length;
  return { lobes: sorted, amp, freq, base, lx: new Float32Array(n), ly: new Float32Array(n), lr: new Float32Array(n) };
}

const MASK = new Int16Array(W * H);

/** Union of circles; later (lower) lobes sit in front. Shaded per lobe, lit from upper-left. */
function drawBlob(blob, cx, cy, t, pal) {
  const { lobes, lx, ly, lr } = blob;
  const n = lobes.length;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const [dx, dy, r, ph] = lobes[i];
    const rr = Math.max(1, r + blob.amp * Math.sin((TAU * blob.freq * t) / LOOP + ph));
    lx[i] = cx + dx;
    ly[i] = cy + dy;
    lr[i] = rr;
    x0 = Math.min(x0, lx[i] - rr);
    x1 = Math.max(x1, lx[i] + rr);
    y0 = Math.min(y0, ly[i] - rr);
    y1 = Math.max(y1, ly[i] + rr);
  }
  const bottom = cy + blob.base;
  const minX = Math.max(0, Math.floor(x0));
  const maxX = Math.min(W - 1, Math.ceil(x1));
  const minY = Math.max(0, Math.floor(y0));
  const maxY = Math.min(H - 1, Math.ceil(y1), Math.ceil(bottom) - 1);
  if (minX > maxX || minY > maxY) return;
  const bw = maxX - minX + 1;

  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const qx = x + 0.5;
      let own = -1;
      for (let i = n - 1; i >= 0; i--) {
        const dx = qx - lx[i];
        const dy = py - ly[i];
        if (dx * dx + dy * dy < lr[i] * lr[i]) {
          own = i;
          break;
        }
      }
      MASK[(y - minY) * bw + (x - minX)] = own;
    }
  }

  const np = pal.length;
  const vy1 = Math.min(bottom, y1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const m = (y - minY) * bw + (x - minX);
      const own = MASK[m];
      if (own < 0) continue;
      const r = lr[own];
      const nx = (x + 0.5 - lx[own]) / r;
      const ny = (y + 0.5 - ly[own]) / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let v = 0.5 - 0.3 * nx - 0.45 * ny + 0.2 * (nz - 0.5);
      v += 0.12 - ((y + 0.5 - y0) / (vy1 - y0)) * 0.3;
      if (y + 0.5 > bottom - 3) v -= 0.15;
      let idx = Math.floor(v * np + bayer(x, y) - 0.5);

      const above = y > minY ? MASK[m - bw] : minY > 0 ? -1 : own;
      const below = y < maxY ? MASK[m + bw] : -1;
      const right = x < maxX ? MASK[m + 1] : -1;
      if (above === -1 && ny < 0.35) idx = np - 1;
      else if (above >= 0 && above < own && ny < 0) idx = Math.max(idx, np - 2);
      else if (below > own || right > own) idx -= 1;
      if (below === -1 && y + 0.5 < bottom - 1) idx -= 1;

      FB.data[y * W + x] = pal[clamp(idx, 0, np - 1)];
    }
  }
}

function seaLobes(count, spacing, rMin, rVar, jitterY, seed) {
  const lobes = [];
  for (let i = 0; i < count; i++) {
    lobes.push([
      -W / 2 - 10 + i * spacing + (hash(seed + i) - 0.5) * 6,
      (hash(seed + i * 2.3) - 0.5) * jitterY,
      rMin + hash(seed + i * 3.7) * rVar,
    ]);
  }
  return lobes;
}

const CLOUD_HIGH = makeBlob(
  [[-22, 2, 6], [-10, -2, 9], [4, -4, 8], [16, 0, 7], [27, 3, 5], [-30, 4, 4], [-2, 3, 7]],
  0.6, 1, 7,
);
const CLOUD_LEFT = makeBlob(
  [
    [-32, 10, 10], [-18, 4, 14], [0, -4, 18], [20, 2, 15], [34, 10, 10], [-6, -20, 12], [10, -22, 10],
    [-20, -8, 10], [24, -10, 9], [-26, 14, 9], [-8, 12, 12], [12, 12, 12], [28, 14, 8],
  ],
  1.1, 1, 20,
);
const CLOUD_RIGHT = makeBlob(
  [
    [-30, 8, 10], [-16, 2, 13], [2, -6, 16], [20, 0, 13], [34, 8, 10], [-6, -18, 10], [10, -20, 11],
    [24, -12, 8], [-22, 12, 8], [-4, 10, 12], [16, 10, 11],
  ],
  1.1, 1, 18,
);
const SEA_BACK = makeBlob(seaLobes(19, 14, 8, 5, 6, 21), 0.9, 2, 40);
const SEA_FRONT = makeBlob(seaLobes(16, 17, 10, 5, 5, 57), 1.0, 2, 40);
const TREE_BLOB = makeBlob(
  [[-7, 2, 6], [6, 2, 6], [0, -4, 8], [-4, 5, 5], [4, 5, 5], [0, 1, 7], [-5, -3, 5], [5, -3, 5]],
  0.45, 2, Infinity,
);

const WISP_SPAN = W + 80;
const WISPS = [
  { blob: makeBlob([[-12, 1, 4], [-5, -1, 6], [4, -2, 5], [11, 0, 4], [0, 1, 5]], 0.5, 2, 3), x0: 30, y: 106 },
  { blob: makeBlob([[-16, 1, 5], [-7, -2, 7], [5, -1, 6], [14, 1, 4], [0, 1, 6]], 0.5, 2, 4), x0: 200, y: 122 },
];

// ---------------------------------------------------------------- islands

function makeIsland({ w, depth, top0, seed, big = false }) {
  const h = top0 + depth + 18;
  const L = layer(w, h);
  const top = new Int16Array(w);
  const bot = new Int16Array(w);

  for (let c = 0; c < w; c++) {
    const u = (c + 0.5 - w / 2) / (w / 2);
    const au = Math.abs(u);
    const dome = -(big ? 2 : 1) * (1 - u * u);
    const edge = au > 0.84 ? ((au - 0.84) / 0.16) ** 2 * (big ? 6 : 2) : 0;
    top[c] = top0 + Math.round(dome + edge);
    const prof = Math.pow(Math.max(0, 1 - Math.pow(au, 1.8)), 1.4);
    const noise = (hash(seed + Math.floor(c / 3)) - 0.5) * (big ? 7 : 2);
    bot[c] = top[c] + 3 + Math.max(0, Math.round(prof * depth + noise * prof));
  }

  const inside = (c, r) => c >= 0 && c < w && r >= top[c] && r <= bot[c];

  for (let c = 0; c < w; c++) {
    const u = (c + 0.5 - w / 2) / (w / 2);
    const g = 2 + (hash(seed + c * 1.31) > 0.55 ? 1 : 0);
    for (let r = top[c]; r <= bot[c]; r++) {
      const d = r - top[c];
      let col;
      if (d === 0) col = GRASS_HI;
      else if (d < g) col = d === g - 1 ? GRASS_SH : GRASS;
      else if (d === g) col = DIRT;
      else if (d === g + 1) col = DIRT_DK;
      else {
        const fv = (r - top0) / (depth + 4);
        let v = 1.05 - 0.55 * fv - 0.4 * ((u + 1) / 2);
        const strataOffset = Math.floor(hash(seed + Math.floor(c / 7)) * 4);
        if ((r + strataOffset) % 6 === 0 && hash(seed + c * 0.7 + r) > 0.25) v -= 0.2;
        if (!inside(c - 1, r)) v += 0.25;
        if (!inside(c + 1, r)) v -= 0.2;
        if (r === bot[c]) v -= 0.35;
        col = ROCK[clamp(Math.floor(v * 5 + bayer(c, r) - 0.5), 0, 4)];
      }
      px(L, c, r, col);
    }
  }

  L.top = top;
  L.bot = bot;
  return L;
}

const ISL = makeIsland({ w: 128, depth: 40, top0: 34, seed: 11, big: true });
const IX = 56;
const IY = 46;

const HX = 18;
let HB = Infinity;
for (let c = HX; c < HX + 26; c++) HB = Math.min(HB, ISL.top[c]);
const EY = HB - 15;
const TX = 113;
const DOOR_SX = IX + HX + 3;
const GARDEN_SX = 134;

(function paintIsland() {
  const L = ISL;
  const { top, bot } = L;
  const isOpenGround = (c) => c > HX + 27 && (c < 86 || c > 110) && Math.abs(c - TX) > 3;

  for (let k = 0; k < 10; k++) {
    const c = 6 + Math.floor(hash(k * 9.13 + 1) * (L.w - 12));
    const len = 3 + Math.floor(hash(k * 4.37 + 2) * 8);
    const isRoot = k % 3 === 2;
    for (let j = 1; j <= len; j++) {
      px(L, c, bot[c] + j, isRoot ? ROOT : VINE);
      if (!isRoot && j % 3 === 0) px(L, c + (k % 2 ? 1 : -1), bot[c] + j, VINE_LEAF);
    }
  }

  const cc = Math.round(L.w * 0.6);
  const cb = bot[cc];
  px(L, cc, cb + 1, CRYSTAL[2]);
  px(L, cc, cb + 2, CRYSTAL[2]);
  px(L, cc, cb + 3, CRYSTAL[1]);
  px(L, cc, cb + 4, CRYSTAL[3]);
  px(L, cc - 1, cb + 1, CRYSTAL[1]);
  px(L, cc - 1, cb + 2, CRYSTAL[0]);
  px(L, cc + 1, cb + 1, CRYSTAL[0]);
  L.crystal = { x: cc, y: cb + 3 };

  for (let k = 0; k < 26; k++) {
    const c = 3 + Math.floor(hash(k * 3.71 + 40) * (L.w - 6));
    if (!isOpenGround(c) && c > 16) continue;
    px(L, c, top[c] - 1, GRASS);
    if (k % 3 === 0) px(L, c, top[c] - 2, GRASS_HI);
    if (k % 5 === 1) px(L, c + 1, top[c] - 1, k % 2 ? PETALS[3] : PETALS[1]);
  }

  for (let c = 4; c <= 12; c++) {
    const g = top[c];
    if ((c - 4) % 4 === 0) {
      for (let r = g - 5; r < g; r++) px(L, c, r, r === g - 1 ? FENCE_SH : FENCE);
    } else {
      px(L, c, g - 4, FENCE);
      px(L, c, g - 2, FENCE);
    }
  }

  for (let c = HX - 1; c <= HX + 26; c++) {
    for (let r = HB; r < Math.max(HB + 1, top[c]); r++) px(L, c, r, r === HB ? STONE : STONE_DK);
  }

  for (let r = EY - 12; r <= EY - 4; r++) {
    for (let c = HX + 19; c <= HX + 22; c++) {
      px(L, c, r, r % 3 === 0 || c === HX + 22 ? BRICK_DK : BRICK);
    }
  }
  rect(L, HX + 18, EY - 13, 6, 1, CAP);

  rect(L, HX, HB - 14, 26, 14, WALL);
  for (let r = HB - 14; r < HB; r++) px(L, HX + 24, r, WALL_SH);
  for (let k = 0; k < 14; k++) {
    px(L, HX + 1 + Math.floor(hash(k * 3.3) * 23), HB - 13 + Math.floor(hash(k * 5.1) * 12), WALL_SPECK);
  }
  for (let r = HB - 14; r < HB; r++) {
    px(L, HX, r, WOOD);
    px(L, HX + 25, r, WOOD_DK);
  }
  rect(L, HX, HB - 14, 26, 1, WOOD);
  rect(L, HX, HB - 1, 26, 1, WOOD_DK);

  for (let r = HB - 13; r < HB; r++) {
    px(L, HX + 2, r, WOOD_DK);
    px(L, HX + 11, r, WOOD_DK);
  }
  rect(L, HX + 2, HB - 13, 10, 1, WOOD_DK);

  rect(L, HX + 15, HB - 12, 7, 7, WOOD_DK);
  rect(L, HX + 16, HB - 11, 5, 5, GLOW);
  for (let r = HB - 11; r <= HB - 7; r++) px(L, HX + 18, r, WOOD);
  rect(L, HX + 16, HB - 9, 5, 1, WOOD);
  for (let c = HX + 14; c <= HX + 22; c++) px(L, c, HB - 5, c % 2 ? STEM : PETALS[(c >> 1) % PETALS.length]);
  rect(L, HX + 14, HB - 4, 9, 1, WOOD);
  rect(L, HX + 14, HB - 3, 9, 1, WOOD_DK);

  for (let k = 0; k <= 15; k++) {
    const y = EY - k;
    const x0 = HX - 2 + k;
    const x1 = HX + 27 - k;
    if (x0 > x1) break;
    for (let x = x0; x <= x1; x++) {
      let c;
      if (x === x0 || x === x1 || k === 0) c = ROOF_OL;
      else if (k % 3 === 1) c = ROOF_DK;
      else c = (x + k) % 5 === 0 ? ROOF_DK : ROOF;
      if (c === ROOF && x === x0 + 1) c = ROOF_HI;
      px(L, x, y, c);
    }
  }
  rect(L, HX + 11, EY - 8, 4, 4, ROOF_OL);
  rect(L, HX + 12, EY - 7, 2, 2, GLOW);

  for (let c = HX + 28; c < 86; c += 5) {
    for (let i = 0; i < 3; i++) {
      px(L, c + i, top[c + i], PATH);
      px(L, c + i, top[c + i] + 1, PATH_DK);
    }
  }

  for (let c = 88; c <= 108; c++) {
    px(L, c, top[c], c % 2 ? BED : BED_DK);
    px(L, c, top[c] + 1, BED_DK);
  }

  const tg = top[TX];
  for (let r = tg - 12; r < tg; r++) {
    px(L, TX - 1, r, WOOD_HI);
    px(L, TX, r, WOOD);
    px(L, TX + 1, r, WOOD_DK);
  }
  px(L, TX - 2, tg - 1, WOOD);
  px(L, TX + 2, tg - 1, WOOD_DK);
  px(L, TX + 2, tg - 8, WOOD);
  px(L, TX + 3, tg - 9, WOOD);
})();

const MINIS = [
  { L: makeIsland({ w: 16, depth: 8, top0: 4, seed: 3 }), x: 22, y: 86, ph: 1.0, amp: 2 },
  { L: makeIsland({ w: 12, depth: 6, top0: 4, seed: 7 }), x: 204, y: 94, ph: 2.6, amp: 1.5 },
  { L: makeIsland({ w: 10, depth: 5, top0: 4, seed: 9 }), x: 180, y: 112, ph: 4.1, amp: 2 },
];
{
  const a = MINIS[0].L;
  px(a, 5, a.top[5] - 1, STEM);
  px(a, 5, a.top[5] - 2, PETALS[0]);
  px(a, 10, a.top[10] - 1, GRASS);
  px(a, 11, a.top[11] - 1, GRASS_HI);
  const b = MINIS[1].L;
  px(b, 6, b.top[6] - 1, GRASS);
  px(b, 7, b.top[7] - 2, GRASS_HI);
  px(b, 7, b.top[7] - 1, GRASS);
}

const FLOWERS = [
  [90, 3, 0],
  [93, 2, 1],
  [97, 4, 2],
  [100, 2, 3],
  [104, 3, 4],
  [107, 2, 5],
];

// ---------------------------------------------------------------- choreography

/** Character timeline across one 10 s loop. Null = inside the house. */
function characterState(t) {
  if (t < 1.0 || t >= 9.6) return null;
  if (t < 1.4) return { x: DOOR_SX, face: 1, pose: "idle" };
  if (t < 4.0) return { x: lerp(DOOR_SX, GARDEN_SX, (t - 1.4) / 2.6), face: 1, pose: "walk" };
  if (t < 6.2) return { x: GARDEN_SX, face: 1, pose: "water" };
  if (t < 6.4) return { x: GARDEN_SX, face: 1, pose: "idle" };
  if (t < 7.3) return { x: GARDEN_SX, face: 1, pose: "wave" };
  if (t < 9.4) return { x: lerp(GARDEN_SX, DOOR_SX, (t - 7.3) / 2.1), face: -1, pose: "walk" };
  return { x: DOOR_SX, face: -1, pose: "idle" };
}

const doorOpen = (t) => (t >= 0.7 && t < 1.7) || (t >= 9.0 && t < 9.9);
const groundAt = (sx, bob) => IY + bob + ISL.top[clamp(sx - IX, 0, ISL.w - 1)];

// ---------------------------------------------------------------- dynamic drawing

function drawDoor(open, bob) {
  const x = IX + HX + 3;
  const y = IY + bob + HB - 12;
  if (open) {
    for (let j = 0; j < 12; j++) {
      for (let i = 0; i < 8; i++) px(FB, x + i, y + j, j / 11 > bayer(x + i, y + j) ? INSIDE_HI : INSIDE);
    }
    rect(FB, x, y, 2, 12, DOOR_DK);
    px(FB, x + 1, y + 6, KNOB);
    rect(FB, x + 2, y + 12, 7, 1, SPILL);
  } else {
    rect(FB, x, y, 8, 12, DOOR);
    for (let j = 0; j < 12; j++) {
      px(FB, x + 2, y + j, DOOR_DK);
      px(FB, x + 5, y + j, DOOR_DK);
    }
    px(FB, x, y, WOOD_DK);
    px(FB, x + 7, y, WOOD_DK);
    px(FB, x + 6, y + 6, KNOB);
  }
}

function drawWindow(t, bob) {
  const base = Math.floor(t * 4) % 7 === 3 ? GLOW_DIM : GLOW;
  const wx = IX + HX + 16;
  const wy = IY + bob + HB - 11;
  for (const [ox, oy] of [[0, 0], [3, 0], [0, 3], [3, 3]]) {
    px(FB, wx + ox, wy + oy, GLOW_HI);
    px(FB, wx + ox + 1, wy + oy, base);
    px(FB, wx + ox, wy + oy + 1, base);
    px(FB, wx + ox + 1, wy + oy + 1, base);
  }
}

function drawSmoke(t, bob) {
  const ox = IX + HX + 20.5;
  const oy = IY + bob + EY - 14;
  const T = 2.5;
  const N = 4;
  for (let i = 0; i < N; i++) {
    const a = (t / T + i / N) % 1;
    const x = ox + a * 9 + Math.sin(a * 5 + i) * 1.2;
    const y = oy - a * 18;
    const r = 1 + a * 2.4;
    const dens = 1.15 - a * 1.1;
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
      for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
        const dx = xx + 0.5 - x;
        const dy = yy + 0.5 - y;
        if (dx * dx + dy * dy <= r * r && bayer(xx, yy) < dens) {
          px(FB, xx, yy, dx + dy > r * 0.4 ? SMOKE_SH : SMOKE);
        }
      }
    }
  }
}

function drawTree(t, bob) {
  const cx = IX + TX;
  const cy = IY + bob + ISL.top[TX] - 17;
  drawBlob(TREE_BLOB, cx, cy, t, LEAVES);
  for (const [dx, dy] of [[-5, 3], [3, -4], [6, 4], [-1, 6]]) px(FB, cx + dx, cy + dy, APPLE);
}

function drawFlowers(t, bob) {
  FLOWERS.forEach(([c, sh, ci], i) => {
    const gx = IX + c;
    const gy = IY + bob + ISL.top[c];
    const sway = Math.round(Math.sin((TAU * t) / 2.5 + i * 1.7) * 0.7);
    for (let j = 1; j <= sh; j++) px(FB, gx + (j === sh ? sway : 0), gy - j, STEM);
    if (sh > 2) px(FB, gx + 1, gy - 2, STEM);
    const bx = gx + sway;
    const by = gy - sh - 1;
    px(FB, bx, by, BLOOM_CORE);
    px(FB, bx - 1, by, PETALS[ci]);
    px(FB, bx + 1, by, PETALS[ci]);
    px(FB, bx, by - 1, PETALS[ci]);
  });
}

function drawButterfly(t, bob) {
  const bx = IX + 99;
  const by = groundAt(bx, bob) - 10;
  const x = bx + Math.round(7 * Math.sin((TAU * t) / 5));
  const y = by + Math.round(3 * Math.sin((TAU * t) / 2.5));
  px(FB, x, y, FLY_BODY);
  if (Math.floor(t / 0.1) % 2) {
    px(FB, x - 1, y - 1, FLY_WING);
    px(FB, x + 1, y - 1, FLY_WING);
  } else {
    px(FB, x - 1, y, FLY_WING);
    px(FB, x + 1, y, FLY_WING);
  }
}

function drawWatering(t, sx, sy, bob) {
  rect(FB, sx + 8, sy + 4, 4, 3, CAN);
  rect(FB, sx + 8, sy + 4, 4, 1, CAN_HI);
  rect(FB, sx + 8, sy + 6, 4, 1, CAN_DK);
  px(FB, sx + 8, sy + 3, CAN_DK);
  px(FB, sx + 9, sy + 2, CAN_DK);
  px(FB, sx + 10, sy + 2, CAN_DK);
  px(FB, sx + 11, sy + 3, CAN_DK);
  px(FB, sx + 12, sy + 5, CAN);
  px(FB, sx + 13, sy + 6, CAN);
  px(FB, sx + 14, sy + 6, CAN_HI);

  if (t < 4.2 || t > 6.0) return;
  const x0 = sx + 15;
  const y0 = sy + 7;
  const gy = groundAt(x0, bob);
  for (let i = 0; i < 6; i++) {
    const a = ((t - 4.2) / 0.45 + i / 6) % 1;
    const y = Math.round(y0 + a * (gy - 1 - y0));
    const x = x0 + (i % 3 === 0 ? 1 : 0) + (a > 0.5 && i % 2 ? 1 : 0);
    px(FB, x, y, i % 2 ? WATER : WATER_HI);
  }
  if (Math.floor(t / 0.15) % 2) {
    px(FB, x0 - 1, gy - 1, WATER_HI);
    px(FB, x0 + 2, gy - 1, WATER);
  }
}

function drawCharacter(t, bob) {
  const st = characterState(t);
  if (!st) return;
  const sx = Math.round(st.x);
  const sy = groundAt(sx + 4, bob) - 11;
  const pal = t % 2.5 < 0.12 ? CHAR_BLINK : CHAR_PAL;
  let rows = IDLE;
  if (st.pose === "walk") rows = Math.floor(t / 0.14) % 2 ? WALK_A : WALK_B;
  else if (st.pose === "water") rows = WATER_POSE;
  else if (st.pose === "wave") rows = Math.floor(t / 0.18) % 2 ? WAVE_A : WAVE_B;
  spr(FB, rows, pal, sx, sy, st.face < 0);
  if (st.pose === "water") drawWatering(t, sx, sy, bob);
}

function drawBirds(t) {
  if (t < 5.4 || t > 8.4) return;
  const k = t - 5.4;
  for (let b = 0; b < 2; b++) {
    const x = Math.round(-10 + k * 100 - b * 9);
    const y = Math.round(32 + b * 4 + Math.sin(k * 3 + b) * 2);
    const up = (Math.floor(t / 0.12) + b) % 2 === 0;
    spr(FB, up ? BIRD_UP : BIRD_DOWN, BIRD_PAL, x, y);
  }
}

function drawCrystalTwinkle(t, bob) {
  if (t % 2.5 >= 0.3) return;
  const x = IX + ISL.crystal.x + 1;
  const y = IY + bob + ISL.crystal.y;
  px(FB, x, y, CRYSTAL[3]);
  px(FB, x - 1, y, CRYSTAL[2]);
  px(FB, x + 1, y, CRYSTAL[2]);
  px(FB, x, y - 1, CRYSTAL[2]);
  px(FB, x, y + 1, CRYSTAL[2]);
}

function drawMini(m, t) {
  const bob = Math.round(Math.sin((TAU * t) / 5 + m.ph) * m.amp);
  blit(m.L, FB, m.x, m.y + bob);
}

function drawWisps(t) {
  for (const w of WISPS) {
    const x = ((((w.x0 - (t / LOOP) * WISP_SPAN) % WISP_SPAN) + WISP_SPAN) % WISP_SPAN) - 40;
    drawBlob(w.blob, Math.round(x), w.y, t, PAL_MID);
  }
}

// ---------------------------------------------------------------- frame

function render(t) {
  FB.data.set(SKY);

  const drift = Math.round(Math.sin((TAU * t) / LOOP) * 1.5);
  drawBlob(CLOUD_HIGH, 118 + drift, 26, t, PAL_FAR);
  drawBlob(CLOUD_LEFT, 44 - drift, 62, t, PAL_MID);
  drawBlob(CLOUD_RIGHT, 206 + drift, 70, t, PAL_MID);
  drawBlob(SEA_BACK, W / 2, 112, t, PAL_SEA_BACK);
  drawBlob(SEA_FRONT, W / 2, 127, t, PAL_SEA_FRONT);

  drawMini(MINIS[0], t);
  drawMini(MINIS[1], t);

  const bob = Math.round(Math.sin((TAU * t) / 5) * 1.5);
  blit(ISL, FB, IX, IY + bob);
  drawDoor(doorOpen(t), bob);
  drawWindow(t, bob);
  drawCrystalTwinkle(t, bob);
  drawTree(t, bob);
  drawFlowers(t, bob);
  drawButterfly(t, bob);
  drawCharacter(t, bob);
  drawSmoke(t, bob);
  drawBirds(t);

  drawMini(MINIS[2], t);
  drawWisps(t);

  ctx.putImageData(image, 0, 0);
}

function fit() {
  const parent = canvas.parentElement;
  const maxW = parent ? parent.clientWidth : window.innerWidth;
  // Match Wizard's Grove display width (192×integer), not cottage framebuffer width.
  const s = Math.max(1, Math.floor(maxW / 192));
  const displayW = 192 * s;
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${(H / W) * displayW}px`;
}

/** `?t=4.5` freezes the loop at that second, handy for inspecting a single frame. */
const frozen = new URLSearchParams(location.search).get("t");
const FROZEN_T = frozen === null ? null : ((parseFloat(frozen) % LOOP) + LOOP) % LOOP;

function tick(now) {
  render(FROZEN_T ?? (now / 1000) % LOOP);
  requestAnimationFrame(tick);
}

window.addEventListener("resize", fit);
fit();
requestAnimationFrame(tick);
