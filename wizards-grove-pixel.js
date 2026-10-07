/**
 * Wizard's grove — 192×144 pixel art with a banded HDR lighting pass.
 * Albedo × banded light + emissive → quantized bloom → soft-shoulder tonemap.
 */

const W = 192;
const H = 144;
const N = W * H;
const TAU = Math.PI * 2;
const FPS = 15;
const BANDS = 5;

const canvas = document.getElementById("wizards-grove");
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext("2d");
const image = ctx.createImageData(W, H);
for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;

const BASE = new Float32Array(N * 3);
const ALB = new Float32Array(N * 3);
const AMBIENT = new Float32Array(N * 3);
const LIT = new Float32Array(N * 3);
const EMI = new Float32Array(N * 3);
const COL = new Float32Array(N * 3);
const BLOOM = new Float32Array(N * 3);
const TMP = new Float32Array(N * 3);
const COVER = new Uint8Array(N);
const KIND = new Uint8Array(N);

// ------------------------------------------------------------ helpers

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function hash(x, y = 0, s = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise(x, y, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

function put(buf, x, y, c) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (!inB(x, y)) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function darkenEllipse(cx, cy, rx, ry, f) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1 || !inB(x, y)) continue;
      const i = (y * W + x) * 3;
      BASE[i] *= f;
      BASE[i + 1] *= f;
      BASE[i + 2] *= f * 1.05;
    }
  }
}

// Sprites are small color grids with an anchor (fx, fy) and an auto outline.
function sprite(w, h, fx, fy) {
  return { w, h, fx, fy, px: new Array(w * h).fill(null), emit: [] };
}

function sset(s, x, y, c) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return;
  s.px[y * s.w + x] = c;
}

function sget(s, x, y) {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
  return s.px[y * s.w + x];
}

function sEllipse(s, cx, cy, rx, ry, fn) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const c = fn(dx, dy, x, y);
      if (c) sset(s, x, y, c);
    }
  }
}

function sLine(s, x0, y0, x1, y1, fn) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    sset(s, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), fn(t));
  }
}

function sOutline(s, oc) {
  const add = [];
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (sget(s, x, y)) continue;
      if (sget(s, x - 1, y) || sget(s, x + 1, y) || sget(s, x, y - 1) || sget(s, x, y + 1)) add.push(y * s.w + x);
    }
  }
  for (const i of add) s.px[i] = oc;
  return s;
}

function blit(s, wx, wy, buf, cover = false) {
  const ox = Math.round(wx) - s.fx;
  const oy = Math.round(wy) - s.fy;
  for (let j = 0; j < s.h; j++) {
    for (let i = 0; i < s.w; i++) {
      const c = s.px[j * s.w + i];
      const x = ox + i;
      const y = oy + j;
      if (!c || !inB(x, y)) continue;
      put(buf, x, y, c);
      if (cover) COVER[y * W + x] = 1;
    }
  }
  return { ox, oy };
}

// ------------------------------------------------------------ palette

const GRASS = ["#1d4a34", "#2c6a40", "#3d8a48", "#56a656", "#86c96a"].map(hex);
const DIRT = ["#5e4330", "#86633f", "#a9835a", "#c9a676"].map(hex);
const STONE = ["#3f4058", "#5c5e7a", "#7c7f9b", "#a2a5bf"].map(hex);
const MOSS = ["#3e6b3e", "#6a9a4f"].map(hex);
const CANOPY = ["#163d33", "#205843", "#2f7650", "#46965c", "#7cc574"].map(hex);
const BUSH = ["#1c5236", "#2b7042", "#43904c", "#68b25a", "#a0d67a"].map(hex);
const LEAF_OL = hex("#0b211c");
const TRUNK = ["#3b261d", "#5b3b2c", "#7d5439"].map(hex);
const IRON = ["#2a2632", "#48404f", "#6f6678"].map(hex);
const FLOWER = ["#ffffff", "#ff93c9", "#ffd45a"].map(hex);
const FLOWER_BLUE = hex("#8fdcff");
const FLOWER_CORE = hex("#ffe37a");

const WZ = {
  hatD: hex("#2a2168"),
  hat: hex("#4a39a3"),
  hatL: hex("#7260d4"),
  gold: hex("#f2c451"),
  goldD: hex("#b3832c"),
  robeD: hex("#33277a"),
  robe: hex("#5343b5"),
  robeL: hex("#7866dc"),
  beard: hex("#f4f1ea"),
  beardS: hex("#c3bcd3"),
  skin: hex("#f1be94"),
  skinS: hex("#c98c6a"),
  eye: hex("#1b1830"),
  boot: hex("#4a3228"),
  wood: hex("#8a5a3a"),
  woodD: hex("#5a3a28"),
  woodL: hex("#b07a4e"),
  crystal: hex("#bff4ff"),
  crystalD: hex("#5fc4f0"),
  star: hex("#ffe38a"),
  ol: hex("#161327"),
};

const DM = {
  post: hex("#7a5236"),
  postD: hex("#56371f"),
  postL: hex("#a0714a"),
  sack: hex("#caa46a"),
  sackD: hex("#9c7a48"),
  sackL: hex("#e4c68e"),
  straw: hex("#f2d464"),
  strawD: hex("#c9a23a"),
  stitch: hex("#4a2e22"),
  red: hex("#d9463e"),
  white: hex("#f3ead8"),
  metal: hex("#8b95a3"),
  metalL: hex("#c6cedb"),
  metalD: hex("#5d6573"),
  rope: hex("#b98f52"),
  eyeW: hex("#ffffff"),
  pupil: hex("#1b1830"),
  button: hex("#3f73d8"),
  buttonD: hex("#22408a"),
  tongue: hex("#e8627e"),
  ol: hex("#1f1720"),
};

const MU = {
  cap: hex("#d14f9d"),
  capL: hex("#f27cc4"),
  capD: hex("#8f2f6e"),
  stem: hex("#efe2cf"),
  stemD: hex("#bfae98"),
  spot: hex("#ffe0f4"),
};

// Emissive colors intentionally exceed 1.0 so the tonemap blows cores out to white.
const SP_CORE = [2.6, 3.2, 3.6];
const SP_SHELL = [0.25, 0.95, 1.6];
const SP_OUTER = [0.1, 0.32, 0.9];
const SP_VIOLET = [0.9, 0.28, 1.45];
const RUNE = [0.22, 0.7, 1.45];
const FL_CORE = [2.4, 1.9, 0.9];
const FL_MID = [1.3, 0.58, 0.1];
const FL_OUT = [0.92, 0.26, 0.04];
const COAL = [1.1, 0.3, 0.06];
const MUSH_GLOW = [1.9, 0.75, 1.6];
const FIREFLY = [2.2, 2.6, 0.6];
const FLOWER_GLOW = [0.45, 1.1, 1.7];

const AMB = [0.58, 0.64, 0.84];

// ------------------------------------------------------------ layout

const WIZ = { x: 72, y: 98 };
const DUM = { x: 134, y: 98 };
const ORB = [87.5, 72.5];
const TARGET = [128.5, 83.5];
const BRAZIERS = [
  { x: 50, y: 71, seed: 1.3 },
  { x: 150, y: 71, seed: 4.1 },
];
const MUSHROOM_SPOTS = [
  [22, 122],
  [177, 118],
  [36, 46],
  [158, 42],
];
const ROCKS = [
  [28, 96],
  [170, 86],
  [118, 46],
  [80, 128],
];
const FLIES = [
  [30, 70],
  [62, 42],
  [100, 32],
  [140, 48],
  [172, 66],
  [18, 108],
  [180, 100],
  [88, 134],
  [124, 128],
  [162, 126],
];

const STATIC_EMIT = [];
const STATIC_LIGHTS = [];

// ------------------------------------------------------------ sprite builders

function buildWizard() {
  const s = sprite(34, 42, 12, 38);
  const FX = 12;
  const FY = 38;

  for (let x = FX + 2; x <= FX + 6; x++) sset(s, x, FY, WZ.boot);
  for (let x = FX - 5; x <= FX - 2; x++) sset(s, x, FY, WZ.boot);

  for (let y = FY - 14; y <= FY - 1; y++) {
    const t = (y - (FY - 14)) / 13;
    let hw = 3.5 + t * 4.5;
    if (y === FY - 1) hw -= 1;
    for (let x = Math.floor(FX - hw); x <= Math.ceil(FX + hw) - 1; x++) {
      const u = (x + 0.5 - FX) / hw;
      let c = u < -0.35 ? WZ.robeL : u < 0.4 ? WZ.robe : WZ.robeD;
      if (y === FY - 1) c = WZ.gold;
      sset(s, x, y, c);
    }
  }
  for (let y = FY - 8; y <= FY - 2; y++) sset(s, FX + 2, y, WZ.gold);
  for (let y = FY - 7; y <= FY - 2; y++) sset(s, FX - 3, y, WZ.robe);
  for (let x = FX - 6; x <= FX + 5; x++) sset(s, x, FY - 9, WZ.gold);
  sset(s, FX + 2, FY - 9, WZ.goldD);

  for (let x = FX + 1; x <= FX + 8; x++) {
    const bell = x >= FX + 7 ? 1 : 0;
    const top = FY - 14 - bell;
    const bot = FY - 11 + bell;
    for (let y = top; y <= bot; y++) sset(s, x, y, y === top ? WZ.robeL : y === bot ? WZ.robeD : WZ.robe);
  }
  for (let y = FY - 15; y <= FY - 10; y++) sset(s, FX + 8, y, WZ.gold);

  const st = [FX + 13, FY - 23];
  sLine(s, FX + 6, FY + 1, st[0], st[1], (t) => (t > 0.85 ? WZ.woodL : WZ.wood));
  sset(s, FX + 8, FY - 4, WZ.woodD);
  sset(s, st[0] - 1, st[1] - 2, WZ.wood);
  sset(s, st[0] - 1, st[1] - 3, WZ.woodD);
  sset(s, st[0] + 2, st[1] - 1, WZ.wood);
  sset(s, st[0] + 2, st[1] - 2, WZ.woodD);
  for (const [dx, dy] of [[0, -1], [1, -1], [0, -2], [1, -2], [0, -3], [1, -3], [1, -4]]) {
    sset(s, st[0] + dx, st[1] + dy, dx === 1 && dy > -3 ? WZ.crystalD : WZ.crystal);
  }

  sset(s, FX + 9, FY - 12, WZ.skin);
  sset(s, FX + 10, FY - 12, WZ.skin);
  sset(s, FX + 9, FY - 11, WZ.skinS);
  sset(s, FX + 10, FY - 11, WZ.skinS);

  for (let y = FY - 19; y <= FY - 14; y++) {
    for (let x = FX - 4; x <= FX; x++) {
      if (y > FY - 16 && x < FX - 3) continue;
      sset(s, x, y, x <= FX - 3 ? WZ.beardS : WZ.beard);
    }
  }

  for (let y = FY - 19; y <= FY - 16; y++) {
    for (let x = FX + 1; x <= FX + 5; x++) sset(s, x, y, y === FY - 19 ? WZ.skinS : WZ.skin);
  }
  sset(s, FX + 3, FY - 19, WZ.beard);
  sset(s, FX + 4, FY - 19, WZ.beard);
  sset(s, FX + 5, FY - 19, WZ.beardS);
  sset(s, FX + 4, FY - 18, WZ.eye);

  for (let y = FY - 17; y <= FY - 6; y++) {
    const t = (y - (FY - 17)) / 11;
    const cx = FX + 3 + t * 0.8;
    const hw = 3.4 * (1 - Math.pow(t, 1.5)) + 0.4;
    const strand = Math.round(cx - hw * 0.25);
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw) - 1; x++) {
      const u = (x + 0.5 - cx) / hw;
      let c = u > 0.5 ? WZ.beardS : WZ.beard;
      if (x === strand && t > 0.2 && t < 0.8) c = WZ.beardS;
      sset(s, x, y, c);
    }
  }

  sset(s, FX + 6, FY - 18, WZ.skin);
  sset(s, FX + 7, FY - 18, WZ.skin);
  sset(s, FX + 6, FY - 17, WZ.skin);
  sset(s, FX + 7, FY - 17, WZ.skinS);
  for (let x = FX + 3; x <= FX + 7; x++) sset(s, x, FY - 16, x === FX + 7 ? WZ.beardS : WZ.beard);

  sEllipse(s, FX + 1, FY - 21.5, 8.5, 2.6, (dx, dy) => (dy < -0.25 ? WZ.hatL : dy < 0.45 ? WZ.hat : WZ.hatD));

  for (let k = 0; k <= 13; k++) {
    const y = FY - 23 - k;
    const cx = FX + 1 - Math.pow(k / 13, 2) * 6;
    const hw = Math.max(0.6, 5 * (1 - k / 14));
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw) - 1; x++) {
      const u = (x + 0.5 - cx) / hw;
      let c = u < -0.3 ? WZ.hatL : u < 0.45 ? WZ.hat : WZ.hatD;
      if (k <= 1) c = k === 0 ? WZ.goldD : WZ.gold;
      sset(s, x, y, c);
    }
  }
  sset(s, FX - 6, FY - 35, WZ.hat);
  sset(s, FX - 7, FY - 34, WZ.hatD);
  sset(s, FX - 7, FY - 33, WZ.gold);

  sset(s, FX + 1, FY - 29, WZ.star);
  sset(s, FX, FY - 29, WZ.star);
  sset(s, FX + 2, FY - 29, WZ.star);
  sset(s, FX + 1, FY - 30, WZ.star);
  sset(s, FX + 1, FY - 28, WZ.star);
  sset(s, FX - 2, FY - 33, WZ.star);
  sset(s, FX + 3, FY - 26, WZ.star);

  return sOutline(s, WZ.ol);
}

function buildDummy() {
  const s = sprite(34, 44, 17, 40);
  const FX = 17;
  const FY = 40;

  for (let x = FX - 3; x <= FX + 3; x++) sset(s, x, FY, DM.postD);
  for (let y = FY - 12; y <= FY - 1; y++) {
    sset(s, FX - 1, y, DM.postL);
    sset(s, FX, y, DM.post);
    sset(s, FX + 1, y, DM.postD);
  }

  for (let x = FX - 11; x <= FX + 11; x++) {
    sset(s, x, FY - 20, DM.postL);
    sset(s, x, FY - 19, DM.post);
    sset(s, x, FY - 18, DM.postD);
  }
  const tuft = [[0, -1], [0, 0], [0, 1], [1, -2], [1, 0], [1, 1], [2, -1], [2, 1], [3, -2], [3, 0], [3, 2]];
  for (const dir of [-1, 1]) {
    tuft.forEach(([dx, dy], i) => sset(s, FX + dir * (12 + dx), FY - 19 + dy, i % 3 === 1 ? DM.strawD : DM.straw));
  }

  sEllipse(s, FX, FY - 13, 6.5, 7, (dx, dy) =>
    dy > 0.72 ? DM.sackD : dx < -0.45 ? DM.sackL : dx < 0.45 ? DM.sack : DM.sackD,
  );
  sEllipse(s, FX, FY - 14, 3.6, 3.6, () => DM.red);
  sEllipse(s, FX, FY - 14, 2.4, 2.4, () => DM.white);
  sEllipse(s, FX, FY - 14, 1.1, 1.1, () => DM.red);

  for (const [dx, dy] of [[3, -18], [5, -18], [4, -17], [3, -16], [5, -16]]) sset(s, FX + dx, FY + dy, DM.stitch);

  for (let x = FX - 4; x <= FX + 3; x++) sset(s, x, FY - 8, DM.rope);
  sset(s, FX + 2, FY - 7, DM.rope);
  sset(s, FX + 3, FY - 6, DM.rope);
  for (const [dx, dy] of [[-3, -6], [-2, -5], [-4, -5], [2, -5]]) sset(s, FX + dx, FY + dy, DM.straw);

  sEllipse(s, FX, FY - 26, 5.4, 5, (dx) => (dx < -0.45 ? DM.sackL : dx < 0.5 ? DM.sack : DM.sackD));
  for (let x = FX - 2; x <= FX + 2; x++) sset(s, x, FY - 21, DM.rope);

  for (let y = FY - 28; y <= FY - 26; y++) for (let x = FX - 4; x <= FX - 2; x++) sset(s, x, y, DM.eyeW);
  sset(s, FX - 2, FY - 26, DM.pupil);
  sset(s, FX + 2, FY - 28, DM.button);
  sset(s, FX + 3, FY - 28, DM.button);
  sset(s, FX + 2, FY - 27, DM.button);
  sset(s, FX + 3, FY - 27, DM.buttonD);

  const grin = [[-3, -24], [-2, -23], [-1, -24], [0, -23], [1, -24], [2, -23], [3, -24]];
  for (const [dx, dy] of grin) sset(s, FX + dx, FY + dy, DM.stitch);
  sset(s, FX + 1, FY - 22, DM.tongue);
  sset(s, FX + 2, FY - 22, DM.tongue);

  for (let k = 0; k <= 6; k++) {
    const y = FY - 31 - k;
    const tilt = k * 0.35;
    const l = FX - 6 + k * 0.5 + tilt;
    const r = FX + 5 - k * 0.5 + tilt;
    for (let x = Math.floor(l); x <= Math.ceil(r); x++) {
      const u = (x - l) / (r - l);
      let c = u < 0.25 ? DM.metalL : u < 0.7 ? DM.metal : DM.metalD;
      if (k === 0) c = DM.metalD;
      if (k === 6) c = DM.metalL;
      sset(s, x, y, c);
    }
  }
  sset(s, FX, FY - 34, DM.metalD);
  sset(s, FX + 1, FY - 34, DM.metalD);
  sset(s, FX - 6, FY - 30, DM.metalD);
  sset(s, FX - 7, FY - 29, DM.metalD);
  sset(s, FX - 7, FY - 28, DM.metalD);
  sset(s, FX + 6, FY - 30, DM.straw);
  sset(s, FX + 7, FY - 29, DM.strawD);
  sset(s, FX + 6, FY - 29, DM.straw);
  sset(s, FX - 5, FY - 30, DM.straw);

  return sOutline(s, DM.ol);
}

function buildMushrooms() {
  const s = sprite(18, 14, 9, 12);
  const caps = [
    [6, 7, 3.6],
    [12, 9, 2.8],
    [9, 11, 2.0],
  ];
  for (const [cx, cy, r] of caps) {
    const sh = Math.max(2, Math.round(r * 0.9));
    for (let y = cy; y < cy + sh; y++) {
      sset(s, cx - 1, y, MU.stem);
      sset(s, cx, y, MU.stemD);
    }
    sEllipse(s, cx, cy, r, r * 0.8, (dx, dy, x, y) =>
      y + 0.5 > cy ? null : dy > -0.25 ? MU.capD : dx < -0.3 ? MU.capL : MU.cap,
    );
    const spots = [
      [cx - 1, cy - Math.round(r * 0.55)],
      [cx + 1, cy - Math.max(1, Math.round(r * 0.3))],
    ];
    for (const [x, y] of spots) {
      sset(s, x, y, MU.spot);
      s.emit.push([x, y]);
    }
  }
  return sOutline(s, hex("#2a1030"));
}

function buildRock() {
  const s = sprite(12, 10, 6, 8);
  sEllipse(s, 6, 5.5, 4.6, 3.4, (dx, dy) => {
    const v = -(0.5 * dx + 0.8 * dy);
    return v > 0.35 ? STONE[3] : v > -0.25 ? STONE[2] : STONE[1];
  });
  sEllipse(s, 5.5, 3.6, 3.2, 1.5, (dx, dy) => (dy < 0.2 ? MOSS[1] : MOSS[0]));
  return sOutline(s, hex("#1c1b2b"));
}

function buildBrazier() {
  const s = sprite(14, 17, 7, 15);
  for (let y = 10; y <= 15; y++) {
    for (let x = 2; x <= 11; x++) {
      let c = x === 2 ? STONE[2] : x === 11 ? STONE[0] : STONE[1];
      if (y === 15 || y === 12 || (y < 12 && x === 6) || (y > 12 && (x === 4 || x === 9))) c = STONE[0];
      sset(s, x, y, c);
    }
  }
  for (let y = 7; y <= 9; y++) for (let x = 2; x <= 11; x++) sset(s, x, y, y === 9 ? STONE[2] : STONE[3]);
  for (let x = 3; x <= 10; x++) {
    sset(s, x, 4, IRON[2]);
    sset(s, x, 5, IRON[1]);
  }
  for (let x = 4; x <= 9; x++) {
    sset(s, x, 6, IRON[0]);
    sset(s, x, 3, hex("#7a2a18"));
    s.emit.push([x, 3]);
  }
  s.flame = { x: 7, y: 3 };
  return sOutline(s, hex("#15141f"));
}

function buildTrunk() {
  const s = sprite(12, 12, 6, 10);
  for (let y = 1; y <= 9; y++) {
    for (let x = 3; x <= 8; x++) sset(s, x, y, x <= 4 ? TRUNK[2] : x >= 7 ? TRUNK[0] : TRUNK[1]);
  }
  for (const [x, y, c] of [[2, 9, 1], [1, 10, 0], [9, 9, 1], [10, 10, 0], [5, 10, 1], [6, 10, 0], [6, 3, 0], [6, 4, 0], [4, 6, 1]]) {
    sset(s, x, y, TRUNK[c]);
  }
  return sOutline(s, LEAF_OL);
}

const WIZARD = buildWizard();
const DUMMY = buildDummy();
const MUSHROOMS = buildMushrooms();
const ROCK = buildRock();
const BRAZIER = buildBrazier();
const TRUNK_S = buildTrunk();

// ------------------------------------------------------------ static world

function drawCanopy(cx, cy, r, pal, seed) {
  const lobes = [[0, 0, r * 0.6]];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + hash(seed, k, 1) * 0.6;
    const d = r * (0.4 + hash(seed, k, 2) * 0.08);
    lobes.push([Math.cos(a) * d, Math.sin(a) * d * 0.8, r * (0.4 + hash(seed, k, 3) * 0.14)]);
  }
  lobes.sort((a, b) => a[1] - b[1]);

  const x0 = Math.floor(cx - r * 1.1) - 1;
  const x1 = Math.ceil(cx + r * 1.1) + 1;
  const y0 = Math.floor(cy - r) - 1;
  const y1 = Math.ceil(cy + r) + 1;
  const bw = x1 - x0 + 1;
  const own = new Int16Array(bw * (y1 - y0 + 1)).fill(-1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      for (let i = lobes.length - 1; i >= 0; i--) {
        const dx = x + 0.5 - (cx + lobes[i][0]);
        const dy = y + 0.5 - (cy + lobes[i][1]);
        if (dx * dx + dy * dy < lobes[i][2] * lobes[i][2]) {
          own[(y - y0) * bw + (x - x0)] = i;
          break;
        }
      }
    }
  }
  const at = (x, y) => (x < x0 || y < y0 || x > x1 || y > y1 ? -1 : own[(y - y0) * bw + (x - x0)]);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const o = at(x, y);
      if (o < 0) {
        if (at(x - 1, y) >= 0 || at(x + 1, y) >= 0 || at(x, y - 1) >= 0 || at(x, y + 1) >= 0) put(BASE, x, y, LEAF_OL);
        continue;
      }
      const [dx, dy, lr] = lobes[o];
      const lx = cx + dx;
      const ly = cy + dy;
      const nx = (x + 0.5 - lx) / lr;
      const ny = (y + 0.5 - ly) / lr;
      const v = -(0.55 * nx + 0.8 * ny);
      let idx = v > 0.35 ? 3 : v > -0.2 ? 2 : v > -0.65 ? 1 : 0;
      if (at(x, y + 1) > o || at(x + 1, y) > o) idx = Math.max(0, idx - 1);
      if ((y + 0.5 - cy) / r > 0.6) idx = Math.min(idx, 1);
      const hx = x + 0.5 - (lx - lr * 0.35);
      const hy = y + 0.5 - (ly - lr * 0.4);
      if (hx * hx + hy * hy < (lr * 0.26) ** 2) idx = 4;
      put(BASE, x, y, pal[idx]);
    }
  }
}

function tree(cx, cy, r, seed, bush = false) {
  darkenEllipse(cx + 2, cy + r * (bush ? 0.55 : 0.78), r * 0.95, r * 0.36, 0.62);
  if (!bush) blit(TRUNK_S, cx, Math.round(cy + r * 0.72 + 8), BASE);
  drawCanopy(cx, cy, r, bush ? BUSH : CANOPY, seed);
}

function buildWorld() {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cx = x >> 1;
      const cy = y >> 1;
      const n = noise(cx / 7, cy / 6, 1) * 0.7 + noise(cx / 2.5, cy / 2.5, 2) * 0.3;
      put(BASE, x, y, n > 0.64 ? GRASS[3] : n < 0.34 ? GRASS[1] : GRASS[2]);
    }
  }

  for (let y = 104; y < H; y++) {
    const cx = 100 + Math.sin(y * 0.09) * 6;
    const hw = 7 + Math.sin(y * 0.23) * 1.2;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      if (!inB(x, y)) continue;
      const edge = x <= cx - hw + 1 || x >= cx + hw - 1;
      put(BASE, x, y, edge ? DIRT[1] : DIRT[2]);
      KIND[y * W + x] = 1;
    }
  }
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(hash(k, 1, 51) * W);
    const y = 104 + Math.floor(hash(k, 2, 51) * (H - 104));
    if (KIND[y * W + x] !== 1 || !inB(x, y + 1)) continue;
    put(BASE, x, y, DIRT[3]);
    put(BASE, x, y + 1, DIRT[0]);
  }

  const onPlaza = (tx, ty) => {
    const dx = (tx * 8 + 4 - 100) / 64;
    const dy = (ty * 8 + 4 - 88) / 32;
    return dx * dx + dy * dy < 1 - hash(tx, ty, 5) * 0.28 && hash(tx, ty, 6) < 0.94;
  };
  for (let ty = 0; ty < H / 8; ty++) {
    for (let tx = 0; tx < W / 8; tx++) {
      if (!onPlaza(tx, ty)) continue;
      const x0 = tx * 8;
      const y0 = ty * 8;
      const dark = hash(tx, ty, 7) > 0.72;
      const base = dark ? STONE[1] : STONE[2];
      const hi = dark ? STONE[2] : STONE[3];
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          put(BASE, x0 + i, y0 + j, i === 7 || j === 7 ? STONE[0] : i === 0 || j === 0 ? hi : base);
          KIND[(y0 + j) * W + x0 + i] = 2;
        }
      }
      if (!onPlaza(tx, ty + 1)) {
        for (let i = 0; i < 8; i++) {
          put(BASE, x0 + i, y0 + 8, i === 7 ? STONE[0] : STONE[1]);
          put(BASE, x0 + i, y0 + 9, STONE[0]);
          if (inB(x0 + i, y0 + 9)) {
            KIND[(y0 + 8) * W + x0 + i] = 2;
            KIND[(y0 + 9) * W + x0 + i] = 2;
          }
        }
      }
      if (hash(tx, ty, 8) > 0.82) {
        for (const [i, j] of [[2, 3], [3, 4], [4, 4], [5, 5]]) put(BASE, x0 + i, y0 + j, STONE[0]);
      }
      if (hash(tx, ty, 9) > 0.78) {
        for (const [i, j] of [[1, 6], [2, 6], [1, 5]]) put(BASE, x0 + i, y0 + j, MOSS[1]);
        put(BASE, x0 + 3, y0 + 6, MOSS[0]);
      }
    }
  }

  const isGrass = (x, y, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!inB(x + i, y + j) || KIND[(y + j) * W + x + i]) return false;
    return true;
  };

  for (let cy = 0; cy < H; cy += 6) {
    for (let cx = 0; cx < W; cx += 7) {
      if (hash(cx, cy, 11) < 0.5) continue;
      const x = cx + Math.floor(hash(cx, cy, 12) * 5);
      const y = cy + Math.floor(hash(cx, cy, 13) * 4);
      if (!isGrass(x, y, 3, 3)) continue;
      put(BASE, x + 1, y, GRASS[4]);
      put(BASE, x, y + 1, GRASS[4]);
      put(BASE, x + 2, y + 1, GRASS[4]);
      put(BASE, x + 1, y + 1, GRASS[1]);
      for (let i = 0; i < 3; i++) put(BASE, x + i, y + 2, GRASS[1]);
    }
  }

  for (let cy = 0; cy < H; cy += 11) {
    for (let cx = 0; cx < W; cx += 13) {
      if (hash(cx, cy, 21) < 0.7) continue;
      const count = 1 + Math.floor(hash(cx, cy, 22) * 3);
      for (let f = 0; f < count; f++) {
        const x = cx + Math.floor(hash(cx + f, cy, 23) * 10);
        const y = cy + Math.floor(hash(cx, cy + f, 24) * 8);
        if (!isGrass(x - 1, y - 1, 3, 3)) continue;
        const glow = hash(cx + f, cy + f, 25) < 0.25;
        const petal = glow ? FLOWER_BLUE : FLOWER[Math.floor(hash(cx, cy + f, 26) * FLOWER.length)];
        put(BASE, x, y, FLOWER_CORE);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          put(BASE, x + dx, y + dy, petal);
          if (glow) STATIC_EMIT.push({ x: x + dx, y: y + dy, c: FLOWER_GLOW, k: 0.55, p: cx * 0.3 + f });
        }
      }
    }
  }

  darkenEllipse(WIZ.x, WIZ.y + 1, 9, 3, 0.58);
  darkenEllipse(DUM.x, DUM.y + 1, 8, 2.5, 0.58);
  for (const b of BRAZIERS) darkenEllipse(b.x + 1, b.y + 1, 7, 2, 0.6);

  for (const [x, y] of ROCKS) {
    darkenEllipse(x + 1, y + 1, 5, 1.8, 0.62);
    blit(ROCK, x, y, BASE);
  }

  for (const [x, y] of MUSHROOM_SPOTS) {
    darkenEllipse(x + 1, y + 1, 7, 2, 0.62);
    const { ox, oy } = blit(MUSHROOMS, x, y, BASE);
    for (const [ex, ey] of MUSHROOMS.emit) STATIC_EMIT.push({ x: ox + ex, y: oy + ey, c: MUSH_GLOW, k: 1, p: x * 0.1 + ey });
    STATIC_LIGHTS.push({ x: x, y: y - 4, r: 15, c: [1, 0.42, 0.85], I: 0.75 });
  }

  for (const b of BRAZIERS) {
    const { ox, oy } = blit(BRAZIER, b.x, b.y, BASE);
    b.fx = ox + BRAZIER.flame.x;
    b.fy = oy + BRAZIER.flame.y;
    for (const [ex, ey] of BRAZIER.emit) STATIC_EMIT.push({ x: ox + ex, y: oy + ey, c: COAL, k: 1, p: b.seed + ex });
  }

  const trees = [
    [-4, -2, 20],
    [26, 4, 18],
    [54, -4, 21],
    [84, 2, 19],
    [114, -3, 20],
    [146, 3, 18],
    [176, -2, 21],
    [200, 4, 18],
    [-2, 62, 17],
    [4, 104, 15],
    [-4, 142, 18],
    [196, 58, 17],
    [188, 100, 15],
    [198, 142, 18],
  ].map(([x, y, r], i) => ({ x, y, r, seed: i * 3.7 + 1, bush: false }));
  const bushes = [
    [30, 143, 8],
    [46, 147, 7],
    [150, 145, 8],
    [168, 142, 7],
    [14, 80, 7],
    [180, 80, 6],
  ].map(([x, y, r], i) => ({ x, y, r, seed: i * 5.3 + 40, bush: true }));
  for (const t of [...trees, ...bushes].sort((a, b) => a.y - b.y)) tree(t.x, t.y, t.r, t.seed, t.bush);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - W / 2) / (W / 2);
      const dy = (y + 0.5 - H / 2) / (H / 2);
      const d = Math.sqrt(dx * dx * 0.8 + dy * dy);
      const band = Math.floor(clamp((d - 0.7) / 0.5, 0, 1) * 3) / 3;
      const f = 1 - band * 0.3;
      const i = (y * W + x) * 3;
      AMBIENT[i] = AMB[0] * f;
      AMBIENT[i + 1] = AMB[1] * f;
      AMBIENT[i + 2] = AMB[2] * f;
    }
  }
}

buildWorld();

// ------------------------------------------------------------ lighting

const bandFalloff = (d2) => {
  const f = (1 - d2) * (1 - d2);
  return Math.floor(f * BANDS + 0.5) / BANDS;
};

function addPoint(x, y, r, c, I) {
  const ry = r / 1.2;
  const x0 = Math.max(0, Math.floor(x - r));
  const x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - ry));
  const y1 = Math.min(H - 1, Math.ceil(y + ry));
  const rr = r * r;
  for (let yy = y0; yy <= y1; yy++) {
    const dy = (yy + 0.5 - y) * 1.2;
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx + 0.5 - x;
      const d2 = (dx * dx + dy * dy) / rr;
      if (d2 >= 1) continue;
      const f = bandFalloff(d2) * I;
      if (!f) continue;
      const i = (yy * W + xx) * 3;
      LIT[i] += c[0] * f;
      LIT[i + 1] += c[1] * f;
      LIT[i + 2] += c[2] * f;
    }
  }
}

function addSegment(ax, ay, bx, by, r, c, I) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
  const vx = bx - ax;
  const vy = by - ay;
  const vv = vx * vx + vy * vy;
  const rr = r * r;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const px = xx + 0.5 - ax;
      const py = yy + 0.5 - ay;
      const t = clamp((px * vx + py * vy) / vv, 0, 1);
      const dx = px - vx * t;
      const dy = (py - vy * t) * 1.2;
      const d2 = (dx * dx + dy * dy) / rr;
      if (d2 >= 1) continue;
      const f = bandFalloff(d2) * I;
      if (!f) continue;
      const i = (yy * W + xx) * 3;
      LIT[i] += c[0] * f;
      LIT[i + 1] += c[1] * f;
      LIT[i + 2] += c[2] * f;
    }
  }
}

// ------------------------------------------------------------ emissive

function emAdd(x, y, c, k = 1) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (!inB(x, y)) return;
  const i = (y * W + x) * 3;
  EMI[i] += c[0] * k;
  EMI[i + 1] += c[1] * k;
  EMI[i + 2] += c[2] * k;
}

function emMax(x, y, c, k = 1, ground = false) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (!inB(x, y)) return;
  if (ground && COVER[y * W + x]) return;
  const i = (y * W + x) * 3;
  EMI[i] = Math.max(EMI[i], c[0] * k);
  EMI[i + 1] = Math.max(EMI[i + 1], c[1] * k);
  EMI[i + 2] = Math.max(EMI[i + 2], c[2] * k);
}

function disc(cx, cy, r, inner, mid, outer) {
  for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++) {
    for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < r * 0.5) emMax(x, y, inner);
      else if (d < r) emMax(x, y, mid);
      else if (d < r + 1.3) emMax(x, y, outer);
    }
  }
}

function drawFlame(fx, fy, t, seed) {
  const fl = Math.sin(t * 11 + seed) * 0.5 + Math.sin(t * 17.3 + seed * 2) * 0.5;
  const h = 9 + Math.round(fl * 1.5);
  for (let k = 0; k < h; k++) {
    const y = fy - k;
    const v = k / h;
    const hw = k < 2 ? 2.6 + k * 0.5 : 3.6 * Math.pow(Math.max(0, 1 - (k - 2) / (h - 1)), 0.85);
    if (hw < 0.3) continue;
    const cx = fx + Math.sin(t * 9 + k * 0.7 + seed) * k * 0.12;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw) - 1; x++) {
      const u = Math.abs(x + 0.5 - cx) / hw;
      emMax(x, y, u < 0.42 && v < 0.55 ? FL_CORE : u < 0.72 && v < 0.82 ? FL_MID : FL_OUT);
    }
  }
  const fi = Math.floor(t * FPS);
  if (hash(fi, seed, 3) > 0.45) emMax(fx - 1 + Math.round(Math.sin(t * 7 + seed) * 1.5), fy - h - 1, FL_OUT);
  for (let e = 0; e < 3; e++) {
    const a = (t * 0.7 + hash(e, seed, 4)) % 1;
    const x = fx + Math.sin(a * 9 + e * 2) * 2.5 + (hash(e, seed, 5) - 0.5) * 4;
    emAdd(x, fy - 4 - a * 16, FL_MID, 1 - a);
  }
  return fl;
}

function drawSpell(t) {
  const fi = Math.floor(t * FPS);
  const [ax, ay] = ORB;
  const [bx, by] = TARGET;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const steps = Math.ceil(len * 2);
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const env = Math.sin(Math.PI * s);
    const off = (Math.sin(s * 13 - t * 26) * 1.3 + Math.sin(s * 29 + t * 19) * 0.6) * env;
    const px = Math.floor(ax + dx * s + nx * off);
    const py = Math.floor(ay + dy * s + ny * off);
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const d = Math.abs(ox) + Math.abs(oy);
        if (d === 0) emMax(px, py, SP_CORE);
        else if (d === 1) emMax(px + ox, py + oy, SP_SHELL);
        else if (d === 2) emMax(px + ox, py + oy, SP_OUTER);
      }
    }
    const off2 = Math.sin(s * 21 + t * 22) * 2.8 * env;
    emMax(ax + dx * s + nx * off2, ay + dy * s + ny * off2, SP_VIOLET);
  }

  for (let f = 0; f < 3; f++) {
    const s = 0.2 + hash(fi, f, 21) * 0.65;
    let x = ax + dx * s;
    let y = ay + dy * s;
    const side = hash(fi, f, 22) > 0.5 ? 1 : -1;
    const n = 3 + Math.floor(hash(fi, f, 23) * 4);
    for (let k = 0; k < n; k++) {
      x += ux * 0.6 + nx * side * 1.1 + (hash(fi, f * 10 + k, 24) - 0.5) * 1.4;
      y += uy * 0.6 + ny * side * 1.1 + (hash(fi, f * 10 + k, 25) - 0.5) * 1.4;
      emMax(x, y, k < 2 ? SP_SHELL : SP_OUTER);
    }
  }

  const pr = 3.6 + Math.sin(t * 14) * 0.5;
  disc(ax, ay, pr, SP_CORE, SP_SHELL, SP_OUTER);
  for (let k = 1; k <= 10; k++) {
    const f = (1 - k / 11) * 0.75;
    emAdd(ax + pr + k, ay, SP_SHELL, f);
    emAdd(ax - pr - k, ay, SP_SHELL, f);
  }
  for (let k = 1; k <= 4; k++) {
    emAdd(ax, ay - pr - k, SP_SHELL, (1 - k / 5) * 0.6);
    emAdd(ax, ay + pr + k, SP_SHELL, (1 - k / 5) * 0.6);
  }

  const ir = 2.8 + Math.sin(t * 18) * 0.6;
  disc(bx, by, ir, SP_CORE, SP_SHELL, SP_OUTER);
  for (let k = 0; k < 8; k++) {
    if ((k + fi) % 2) continue;
    const a = (k / 8) * TAU + 0.2;
    const L = 5 + ((fi + k) % 3) * 2;
    for (let j = ir; j < ir + L; j++) {
      emMax(bx + Math.cos(a) * j, by + Math.sin(a) * j * 0.85, j < ir + 2 ? SP_SHELL : SP_OUTER);
    }
  }

  const back = Math.atan2(dy, dx) + Math.PI;
  for (let k = 0; k < 18; k++) {
    const a = (t * 1.4 + hash(k, 0, 31)) % 1;
    const ang = back + (hash(k, 1, 31) - 0.5) * 3.4;
    const dist = a * (10 + hash(k, 2, 31) * 16);
    const x = bx + Math.cos(ang) * dist;
    const y = by + Math.sin(ang) * dist * 0.8 + a * a * 9;
    const c = a < 0.3 ? SP_CORE : a < 0.6 ? SP_SHELL : SP_OUTER;
    emAdd(x, y, c, 1 - a * 0.5);
    emAdd(x - Math.cos(ang) * 1.5, y - Math.sin(ang) * 1.2, SP_OUTER, 0.6 * (1 - a));
  }

  for (let k = 0; k < 5; k++) {
    const ang = t * 3.2 + (k * TAU) / 5;
    const r = 6 + Math.sin(t * 2 + k);
    emAdd(ax + Math.cos(ang) * r, ay + Math.sin(ang) * r * 0.7, SP_SHELL, 0.9);
  }
}

function drawRunes(t) {
  const cx = WIZ.x;
  const cy = WIZ.y + 1;
  const pulse = 0.8 + 0.2 * Math.sin(t * 6);
  const ring = (rx, ry) => {
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * TAU;
      emMax(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, RUNE, pulse, true);
    }
  };
  ring(16, 6);
  ring(12, 4.4);
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8 + t * 0.9;
    const x = Math.floor(cx + Math.cos(a) * 14);
    const y = Math.floor(cy + Math.sin(a) * 5.2);
    if (k % 2) {
      emMax(x, y, RUNE, pulse * 1.3, true);
      emMax(x, y - 1, RUNE, pulse, true);
    } else {
      emMax(x, y, RUNE, pulse * 1.3, true);
      emMax(x + 1, y, RUNE, pulse, true);
    }
  }
  for (let k = 0; k < 10; k++) {
    const a = (t * 0.45 + hash(k, 2, 41)) % 1;
    emAdd(cx + (hash(k, 3, 41) - 0.5) * 30, cy + 2 - a * 28, SP_SHELL, (1 - a) * 0.8);
  }
}

// ------------------------------------------------------------ frame

function boxBlur(src, dst, R, horizontal) {
  const len = horizontal ? W : H;
  const lines = horizontal ? H : W;
  const step = horizontal ? 3 : W * 3;
  const norm = 1 / (2 * R + 1);
  for (let l = 0; l < lines; l++) {
    const base = horizontal ? l * W * 3 : l * 3;
    for (let ch = 0; ch < 3; ch++) {
      let acc = 0;
      for (let k = 0; k <= R && k < len; k++) acc += src[base + k * step + ch];
      for (let p = 0; p < len; p++) {
        dst[base + p * step + ch] = acc * norm;
        const add = p + R + 1;
        const sub = p - R;
        if (add < len) acc += src[base + add * step + ch];
        if (sub >= 0) acc -= src[base + sub * step + ch];
      }
    }
  }
}

const tonemap = (v) => (v < 0.8 ? v : 0.8 + 0.2 * (1 - Math.exp(-(v - 0.8) / 0.2)));

function render(t) {
  ALB.set(BASE);
  COVER.fill(0);
  EMI.fill(0);
  LIT.set(AMBIENT);

  const fi = Math.floor(t * FPS);
  blit(WIZARD, WIZ.x, WIZ.y, ALB, true);
  blit(DUMMY, DUM.x + (fi % 3 === 0 ? 1 : 0), DUM.y, ALB, true);

  for (const e of STATIC_EMIT) emAdd(e.x, e.y, e.c, e.k * (0.8 + 0.2 * Math.sin(t * 2.2 + e.p)));
  drawRunes(t);
  for (const b of BRAZIERS) {
    const fl = drawFlame(b.fx, b.fy, t, b.seed);
    addPoint(b.fx, b.fy - 3, 30 + fl * 1.5, [1, 0.52, 0.2], 1.35 * (0.88 + fl * 0.12));
  }
  drawSpell(t);

  for (let k = 0; k < FLIES.length; k++) {
    const [bx, by] = FLIES[k];
    const x = bx + Math.sin(t * 0.9 + k * 1.7) * 5;
    const y = by + Math.sin(t * 1.3 + k * 2.3) * 3;
    const blink = 0.5 + 0.5 * Math.sin(t * 2.2 + k * 1.1);
    if (blink < 0.25) continue;
    emAdd(x, y, FIREFLY, blink);
    addPoint(x, y, 7, [0.9, 1, 0.4], 0.35 * blink);
  }

  for (const l of STATIC_LIGHTS) addPoint(l.x, l.y, l.r, l.c, l.I * (0.9 + 0.1 * Math.sin(t * 2 + l.x)));
  addPoint(ORB[0], ORB[1], 28, [0.5, 0.8, 1], 0.95 + Math.sin(t * 14) * 0.12);
  addPoint(TARGET[0], TARGET[1], 24, [0.55, 0.85, 1], 0.8 + Math.sin(t * 18) * 0.12);
  addSegment(ORB[0], ORB[1], TARGET[0], TARGET[1], 12, [0.4, 0.72, 1], 0.45);
  addPoint(WIZ.x, WIZ.y + 1, 20, [0.4, 0.65, 1], 0.55);

  for (let i = 0; i < N * 3; i++) {
    const v = ALB[i] * LIT[i] + EMI[i];
    COL[i] = v;
    BLOOM[i] = v > 1.05 ? (v - 1.05) * 0.8 : 0;
  }
  for (let p = 0; p < 3; p++) {
    boxBlur(BLOOM, TMP, 3, true);
    boxBlur(TMP, BLOOM, 3, false);
  }

  const out = image.data;
  for (let i = 0, j = 0; i < N; i++, j += 3) {
    let r = COL[j] + Math.floor(BLOOM[j] * 10) / 10;
    let g = COL[j + 1] + Math.floor(BLOOM[j + 1] * 10) / 10;
    let b = COL[j + 2] + Math.floor(BLOOM[j + 2] * 10) / 10;
    const m = Math.max(r, g, b);
    if (m > 1) {
      const e = (m - 1) * 0.3;
      r += e;
      g += e;
      b += e;
    }
    const o = i * 4;
    out[o] = Math.min(255, tonemap(r) * 255);
    out[o + 1] = Math.min(255, tonemap(g) * 255);
    out[o + 2] = Math.min(255, tonemap(b) * 255);
  }
  ctx.putImageData(image, 0, 0);
}

function fit() {
  const parent = canvas.parentElement;
  const maxW = parent ? parent.clientWidth : window.innerWidth;
  const s = Math.max(1, Math.floor(maxW / W));
  canvas.style.width = `${W * s}px`;
  canvas.style.height = `${H * s}px`;
}

let lastFrame = -1;
function tick(now) {
  const f = Math.floor((now / 1000) * FPS);
  if (f !== lastFrame) {
    lastFrame = f;
    render(f / FPS);
  }
  requestAnimationFrame(tick);
}

window.addEventListener("resize", fit);
fit();
requestAnimationFrame(tick);
