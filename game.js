/* ===================== NEON DASH — game.js ===================== */
(function () {
'use strict';

// ---------- Config ----------
var CFG = {
  BLOCK: 44,
  GRAVITY: 3200,
  JUMP_V: 1020,
  MOVE_SPEED: 400,
  MAX_FALL: 1700,
  COYOTE: 0.10,
  BUFFER: 0.10,
  ROT_SPEED: 12.0,
  PAD_V: 1520,
  RING_V: 1280,
  SHIP_GRAVITY: 1500,
  SHIP_THRUST: 2700,
  SHIP_MAX_UP: -760,
  SHIP_MAX_DOWN: 920,
  RESPAWN: 0.35,
  FIXED_DT: 1 / 120,
  DESIGN_H: 720,
  BPM: 128
};
var HALF = CFG.BLOCK / 2;
var GROUND_SCREEN = CFG.DESIGN_H * 0.78;

// ---------- Utils ----------
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- DOM ----------
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var elMenu = document.getElementById('menu');
var elPause = document.getElementById('pause');
var elVictory = document.getElementById('victory');
var elHud = document.getElementById('hud');
var elProgressFill = document.getElementById('progressFill');
var elPct = document.getElementById('pctLabel');
var elAttempt = document.getElementById('attemptLabel');
var elSoundBtn = document.getElementById('soundBtn');
var elSoundIcon = document.getElementById('soundIcon');
var elPauseBtn = document.getElementById('pauseBtn');
var elSkins = document.getElementById('skins');
var elPractice = document.getElementById('practiceToggle');
var elBest = document.getElementById('bestStats');

// ---------- Save ----------
var SAVE_KEY = 'neondash_save_v1';
var save = { bestStage: 0, bestEndless: 0, attempt: 0, practice: false, skin: 0, muted: true };
function loadSave() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      var o = JSON.parse(raw);
      for (var k in save) if (o.hasOwnProperty(k)) save[k] = o[k];
    }
  } catch (e) {}
}
var saveTimer = 0;
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}
function persistSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(function () { saveTimer = 0; persist(); }, 400);
}
loadSave();

// ---------- Skins ----------
var SKINS = [
  { name: 'CYAN', c1: '#22e6ff', c2: '#0a6b8a', face: 'plain', unlock: 0 },
  { name: 'PINK', c1: '#ff2fb9', c2: '#8a0a5a', face: 'plain', unlock: 0 },
  { name: 'LIME', c1: '#4dff88', c2: '#0a7a3a', face: 'cross', unlock: 25 },
  { name: 'GOLD', c1: '#ffe23d', c2: '#8a6a00', face: 'cross', unlock: 50 },
  { name: 'VIOLET', c1: '#8a4dff', c2: '#3a0a8a', face: 'star', unlock: 75 },
  { name: 'EMBER', c1: '#ff6a3d', c2: '#8a1a00', face: 'star', unlock: 100 },
  { name: 'FROST', c1: '#b9f7ff', c2: '#367da8', face: 'diamond', unlock: 125 },
  { name: 'TOXIC', c1: '#c7ff32', c2: '#477900', face: 'bolt', unlock: 150 },
  { name: 'PLASMA', c1: '#ff66ed', c2: '#6814a0', face: 'eye', unlock: 175 },
  { name: 'SOLAR', c1: '#ffad42', c2: '#a52b18', face: 'hex', unlock: 200 },
  { name: 'GHOST', c1: '#e4eaff', c2: '#6875a8', face: 'target', unlock: 225 },
  { name: 'VOID', c1: '#9b78ff', c2: '#24104f', face: 'flame', unlock: 250 }
];
function skinUnlocked(i) {
  var s = SKINS[i];
  return save.bestStage >= s.unlock || save.bestEndless >= s.unlock * 8;
}
function currentSkin() { return SKINS[save.skin] || SKINS[0]; }

// ---------- Input ----------
var Input = {
  held: false,
  _press: false,
  _keys: {},
  init: function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'w' || k === 'W') {
        if (!self._keys.jump) { self._keys.jump = true; self.held = true; self._press = true; }
        e.preventDefault();
      } else if (k === 'r' || k === 'R') { Game.restart(); }
      else if (k === 'p' || k === 'P') { Game.togglePause(); }
      else if (k === 'm' || k === 'M') { Audio.toggle(); }
    });
    window.addEventListener('keyup', function (e) {
      var k = e.key;
      if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'w' || k === 'W') {
        self._keys.jump = false; self.held = false; e.preventDefault();
      }
    });
    function down(e) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      self.held = true; self._press = true;
      Audio.start();
      if (canvas.setPointerCapture && e.pointerId !== undefined) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      }
      e.preventDefault();
    }
    function up() { self.held = false; }
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('blur', function () { self.held = false; self._keys.jump = false; if (Game.state === 'playing') Game.pause(); });
  },
  consumePress: function () { var p = this._press; this._press = false; return p; }
};

// ---------- Audio ----------
var Audio = {
  ctx: null, master: null, musicGain: null, sfxGain: null,
  started: false, muted: save.muted, nextNoteTime: 0, step: 0,
  startTime: 0, schedTimer: null, noiseBuf: null,
  start: function () {
    if (this.started) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.5; this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.8; this.sfxGain.connect(this.master);
    var len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = this.noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.started = true;
    this.startTime = this.ctx.currentTime;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    var self = this;
    this.schedTimer = setInterval(function () { self.scheduler(); }, 25);
  },
  setMuted: function (m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
    updateSoundIcon();
  },
  toggle: function () { this.start(); this.setMuted(!this.muted); save.muted = this.muted; persistSoon(); },
  scheduler: function () {
    if (!this.started) return;
    var spb = 60 / CFG.BPM / 4;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextNoteTime, spb);
      this.nextNoteTime += spb;
      this.step = (this.step + 1) % 64;
    }
  },
  scheduleStep: function (s, t, spb) {
    var ctx = this.ctx;
    var bar = Math.floor(s / 16);
    var beat = s % 16;
    var roots = [0, 0, 5, 5, 3, 3, 8, 8];
    var root = roots[bar % roots.length];
    var scale = [0, 3, 5, 7, 10, 12];
    if (beat % 4 === 0) this.kick(t);
    if (beat % 8 === 4) this.hat(t, 0.25);
    if (beat % 2 === 0) this.hat(t, 0.08);
    if (beat % 4 === 0 || beat % 8 === 6) {
      this.bass(t, 55 * Math.pow(2, root / 12), spb * 3.2);
    }
    if (beat % 2 === 1) {
      var n = scale[(s * 3) % scale.length];
      this.lead(t, 220 * Math.pow(2, (root + n + 12) / 12), spb * 1.4);
    }
  },
  bass: function (t, f, dur) {
    var c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  },
  lead: function (t, f, dur) {
    var c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  },
  kick: function (t) {
    var c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.18);
  },
  hat: function (t, vol) {
    var c = this.ctx, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = this.noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(this.musicGain);
    s.start(t); s.stop(t + 0.06);
  },
  blip: function (f0, f1, dur, type, vol) {
    if (!this.started || this.muted) return;
    var c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise: function (dur, vol, hp) {
    if (!this.started || this.muted) return;
    var c = this.ctx, t = c.currentTime, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = this.noiseBuf; f.type = 'highpass'; f.frequency.value = hp || 800;
    g.gain.setValueAtTime(vol || 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t); s.stop(t + dur + 0.02);
  },
  sfxJump: function () { this.blip(420, 720, 0.12, 'square', 0.25); },
  sfxPad: function () { this.blip(300, 1200, 0.22, 'sawtooth', 0.3); },
  sfxRing: function () { this.blip(880, 1600, 0.16, 'triangle', 0.3); },
  sfxPortal: function () { this.blip(200, 900, 0.3, 'sawtooth', 0.28); },
  sfxShatter: function () { this.noise(0.35, 0.5, 300); this.blip(220, 40, 0.3, 'square', 0.3); },
  sfxLand: function () { this.blip(160, 120, 0.05, 'sine', 0.12); },
  sfxWin: function () { this.blip(520, 1040, 0.5, 'triangle', 0.35); },
  getBeat: function () {
    var t;
    if (this.started && !this.muted) t = this.ctx.currentTime - this.startTime;
    else t = performance.now() / 1000;
    var spb = 60 / CFG.BPM;
    var f = (t / spb) % 1;
    return Math.pow(1 - f, 2);
  }
};
function updateSoundIcon() {
  elSoundIcon.textContent = Audio.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
}

// ---------- Particles ----------
var particles = [];
function spawnParticle(p) {
  var particleLimit = LOW_POWER ? 80 : 240;
  if (particles.length >= particleLimit) return;
  particles.push(p);
}
function burst(x, y, n, color, spd, life, size) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, s = rnd(spd * 0.3, spd);
    spawnParticle({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(life * 0.5, life), max: life, size: rnd(size * 0.5, size), color: color, g: 1400, type: 'spark' });
  }
}
function updateParticles(dt) {
  // Swap-remove expired particles instead of shifting the whole array with splice().
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
      continue;
    }
    p.vy += (p.g || 0) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

// ---------- Level building ----------
function buildStage() {
  var B = CFG.BLOCK, ents = [];
  function add(e) { ents.push(e); }
  function spike(bx, n, base) { n = n || 1; base = base || 0; for (var i = 0; i < n; i++) add({ type: 'spike', x: (bx + i) * B, baseY: base, w: B, h: B }); }
  function block(bx, top, w, h) { w = w || 1; h = h || 1; add({ type: 'block', x: bx * B, y: -top * B, w: w * B, h: h * B }); }
  function pad(bx) { add({ type: 'pad', x: bx * B, y: 0, w: B }); }
  function ring(bx, by) { add({ type: 'ring', x: bx * B + B / 2, y: -by * B, r: B * 0.55, used: false }); }
  function shipP(bx) { add({ type: 'shipPortal', x: bx * B, y: -B * 2.6, w: B * 0.8, h: B * 3.2 }); }
  function cubeP(bx) { add({ type: 'cubePortal', x: bx * B, y: -B * 2.6, w: B * 0.8, h: B * 3.2 }); }
  function endP(bx) { add({ type: 'endPortal', x: bx * B, y: -B * 2.6, w: B * 1.0, h: B * 3.4 }); }

  var cx = 10;
  // --- Intro runway ---
  cx = 12; spike(cx, 1); cx += 8;
  spike(cx, 1); cx += 8;
  spike(cx, 2); cx += 9;
  // --- Basic blocks ---
  block(cx, 1, 2, 1); cx += 8;
  spike(cx, 1); cx += 8;
  block(cx, 1, 1, 1); block(cx + 3, 2, 1, 1); cx += 9;
  spike(cx, 2); cx += 9;
  block(cx, 2, 2, 2); cx += 9;
  spike(cx, 1); cx += 8;
  spike(cx, 1); cx += 8;
  // --- Stair section ---
  block(cx, 1, 1, 1); cx += 5;
  block(cx, 2, 1, 1); cx += 5;
  block(cx, 3, 1, 1); cx += 6;
  block(cx, 2, 1, 1); cx += 5;
  block(cx, 1, 1, 1); cx += 6;
  spike(cx, 2); cx += 9;
  block(cx, 1, 3, 1); cx += 9;
  spike(cx, 1); cx += 8;
  spike(cx, 3); cx += 10;
  // --- Ring combos ---
  pad(cx); ring(cx + 2, 4); spike(cx + 3, 1); cx += 10;
  pad(cx); ring(cx + 2, 5); spike(cx + 3, 2); cx += 11;
  block(cx, 1, 2, 1); ring(cx + 4, 4); spike(cx + 5, 1); cx += 11;
  spike(cx, 2); cx += 9;
  // --- Pre-ship run ---
  block(cx, 1, 1, 1); cx += 5;
  block(cx, 2, 1, 1); cx += 5;
  spike(cx, 2); cx += 9;
  shipP(cx); cx += 8;
  // --- Ship flight corridor ---
  var shipStart = cx;
  block(cx, 7, 8, 1);
  block(cx + 10, 1, 6, 1);
  spike(cx + 11, 1, -B);
  cx += 18;
  block(cx, 7, 6, 1);
  block(cx + 8, 1, 5, 1);
  spike(cx + 9, 1, -B);
  cx += 16;
  block(cx, 7, 5, 1);
  block(cx + 7, 1, 4, 1);
  spike(cx + 8, 1, -B);
  cx += 14;
  block(cx, 7, 6, 1);
  cx += 14;
  cubeP(cx); cx += 8;
  // --- Finale ---
  spike(cx, 1); cx += 8;
  spike(cx, 2); cx += 9;
  block(cx, 1, 2, 1); cx += 8;
  spike(cx, 1); cx += 8;
  pad(cx); ring(cx + 2, 4); spike(cx + 3, 2); cx += 11;
  block(cx, 2, 1, 1); cx += 5;
  block(cx, 1, 1, 1); cx += 6;
  spike(cx, 3); cx += 10;
  spike(cx, 1); cx += 8;
  spike(cx, 2); cx += 9;
  var endBx = cx + 6;
  endP(endBx);
  var endX = endBx * B;
  return { ents: ents, endX: endX, startX: 0, shipStart: shipStart * B };
}


function buildExtraStage(level) {
  var B = CFG.BLOCK, ents = [], cx = 12;
  function add(e) { ents.push(e); }
  function spike(x, n, base) { n = n || 1; base = base || 0; for (var i = 0; i < n; i++) add({ type: 'spike', x: (x + i) * B, baseY: base, w: B, h: B }); }
  function block(x, top, w, h) { add({ type: 'block', x: x * B, y: -top * B, w: (w || 1) * B, h: (h || 1) * B }); }
  function pad(x) { add({ type: 'pad', x: x * B, y: 0, w: B }); }
  function ring(x, y) { add({ type: 'ring', x: x * B + B / 2, y: -y * B, r: B * 0.55, used: false }); }
  function portal(type, x) { add({ type: type, x: x * B, y: -B * 2.6, w: B, h: B * 3.4 }); }
  // Each course has its own rhythm and obstacle sequence.
  var patternsByLevel = {
    1: [
      ['s',1,7],['s',2,9],['b',1,2,1,8],['s',2,9],['b',2,1,2,8],['s',3,11],
      ['p',0,7],['r',4,0,3,8],['s',2,9],['b',1,3,1,9],['s',1,7],['s',3,11],
      ['p',0,7],['r',5,0,3,9],['b',2,2,2,9],['s',2,9],['s',1,7],['s',2,9]
    ],
    2: [
      ['s',2,8],['b',1,1,1,6],['s',3,10],['b',2,2,2,8],['s',2,8],['p',0,7],
      ['r',5,0,3,8],['s',3,10],['b',1,3,1,8],['s',2,8],['b',3,1,3,9],
      ['s',3,10],['p',0,7],['r',5,0,3,8],['s',2,8],['b',2,2,2,8],['s',3,10]
    ],
    3: [
      ['s',1,7],['s',2,8],['b',1,2,1,7],['s',3,10],['p',0,7],['r',5,0,3,8],
      ['s',2,8],['b',2,1,2,7],['s',3,10],['b',1,3,1,8],['s',2,8],['p',0,7],
      ['r',5,0,3,8],['s',3,10],['b',2,2,2,8],['s',3,10],['s',2,8]
    ],
    4: [
      ['s',1,6],['b',1,1,1,6],['s',2,8],['s',1,6],['b',2,2,2,8],['s',2,8],
      ['p',0,7],['r',4,0,2,7],['s',2,8],['b',1,3,1,8],['s',3,10],['b',1,2,1,7],
      ['p',0,7],['r',5,0,2,8],['s',2,8],['s',3,10],['b',2,1,2,8]
    ],
    5: [
      ['b',1,1,1,5],['s',2,8],['b',2,1,2,7],['s',1,6],['s',3,10],['p',0,7],
      ['r',5,0,3,8],['b',1,2,1,7],['s',2,8],['b',3,1,3,9],['s',2,8],['p',0,7],
      ['r',5,0,3,8],['s',3,10],['b',2,2,2,8],['s',2,8],['s',3,10]
    ],
    6: [
      ['s',3,10],['s',1,6],['b',1,3,1,8],['s',2,8],['p',0,7],['r',5,0,3,8],
      ['b',2,1,2,7],['s',3,10],['b',1,2,1,7],['s',2,8],['s',3,10],['p',0,7],
      ['r',5,0,3,8],['b',3,1,3,9],['s',2,8],['s',3,10],['b',2,2,2,8]
    ],
    7: [
      ['s',1,6],['s',2,8],['b',1,1,1,6],['s',3,10],['b',2,2,2,8],['p',0,7],
      ['r',5,0,3,8],['s',2,8],['b',1,3,1,8],['s',3,10],['p',0,7],['r',5,0,3,8],
      ['s',2,8],['b',2,1,2,7],['s',3,10],['s',2,8],['b',1,2,1,7]
    ],
    8: [
      ['b',1,2,1,7],['s',2,8],['p',0,7],['r',4,0,3,8],['s',3,10],['b',2,3,2,9],
      ['s',2,8],['b',1,1,1,6],['s',3,10],['p',0,7],['r',5,0,3,8],['s',2,8],
      ['b',3,1,3,9],['s',3,10],['b',1,2,1,7],['s',2,8],['s',3,10]
    ],
    9: [
      ['s',2,8],['b',1,2,1,7],['s',3,10],['p',0,7],['r',5,0,3,8],['b',2,2,2,8],
      ['s',2,8],['s',3,10],['b',1,3,1,8],['p',0,7],['r',5,0,3,8],['s',3,10],
      ['b',2,1,2,7],['s',2,8],['b',1,2,1,7],['s',3,10],['s',2,8]
    ]
  };
  var patterns = patternsByLevel[level] || patternsByLevel[1];
  for (var i = 0; i < patterns.length; i++) {
    var p = patterns[i], w = p[p.length - 1];
    if (p[0] === 's') spike(cx, p[1]);
    else if (p[0] === 'b') block(cx, p[1], p[2], p[3]);
    else if (p[0] === 'p') pad(cx);
    else if (p[0] === 'r') { ring(cx + 2, p[1]); spike(cx + 3, p[3]); }
    cx += w;
  }
  // Flight sections give selected courses a different feel.
  var shipStart = 0;
  if (level === 3 || level === 9) {
    shipStart = cx;
    portal('shipPortal', cx); cx += 7;
    block(cx, 7, 7, 1); block(cx + 9, 1, 5, 1); spike(cx + 10, 1, -B); cx += 16;
    block(cx, 7, 5, 1); block(cx + 7, 1, 4, 1); spike(cx + 8, 1, -B); cx += 14;
    portal('cubePortal', cx); cx += 8;
  }
  spike(cx, 2); cx += 10; spike(cx, 1); cx += 8;
  var endBx = cx + 5;
  portal('endPortal', endBx);
  return { ents: ents, endX: endBx * B, startX: 0, shipStart: shipStart * B };
}

function makeChunk(bx, diff) {
  var B = CFG.BLOCK, ents = [];
  function add(e) { ents.push(e); }
  function spike(x, n, base) { n = n || 1; base = base || 0; for (var i = 0; i < n; i++) add({ type: 'spike', x: (x + i) * B, baseY: base, w: B, h: B }); }
  function block(x, top, w, h) { w = w || 1; h = h || 1; add({ type: 'block', x: x * B, y: -top * B, w: w * B, h: h * B }); }
  function pad(x) { add({ type: 'pad', x: x * B, y: 0, w: B }); }
  function ring(x, by) { add({ type: 'ring', x: x * B + B / 2, y: -by * B, r: B * 0.55, used: false }); }
  var r = Math.random();
  var w;
  if (diff < 0.25) {
    if (r < 0.5) { spike(bx, 1); w = 8; }
    else { block(bx, 1, 2, 1); w = 8; }
  } else if (diff < 0.55) {
    if (r < 0.4) { spike(bx, 2); w = 9; }
    else if (r < 0.7) { block(bx, 1, 1, 1); block(bx + 3, 2, 1, 1); w = 9; }
    else { pad(bx); spike(bx + 3, 1); w = 9; }
  } else {
    if (r < 0.3) { spike(bx, 2); block(bx + 4, 1, 2, 1); w = 10; }
    else if (r < 0.55) { pad(bx); ring(bx + 2, 4); spike(bx + 3, 2); w = 10; }
    else if (r < 0.8) { block(bx, 1, 1, 1); block(bx + 2, 2, 1, 1); block(bx + 4, 3, 1, 1); w = 11; }
    else { spike(bx, 3); w = 11; }
  }
  return { ents: ents, width: w };
}

// ---------- Geometry helpers ----------
function satPoly(a, b) {
  var polys = [a, b];
  for (var pi = 0; pi < 2; pi++) {
    var poly = polys[pi];
    for (var i = 0; i < poly.length; i++) {
      var p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      var nx = -(p2.y - p1.y), ny = (p2.x - p1.x);
      var minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity, d;
      for (var j = 0; j < a.length; j++) { d = a[j].x * nx + a[j].y * ny; if (d < minA) minA = d; if (d > maxA) maxA = d; }
      for (var k = 0; k < b.length; k++) { d = b[k].x * nx + b[k].y * ny; if (d < minB) minB = d; if (d > maxB) maxB = d; }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}
function triRect(tri, rx, ry, rw, rh) {
  var rect = [{ x: rx, y: ry }, { x: rx + rw, y: ry }, { x: rx + rw, y: ry + rh }, { x: rx, y: ry + rh }];
  return satPoly(tri, rect);
}
function spikeTri(e) {
  var A = { x: e.x, y: e.baseY }, Bc = { x: e.x + e.w, y: e.baseY }, C = { x: e.x + e.w / 2, y: e.baseY - e.h };
  var gx = (A.x + Bc.x + C.x) / 3, gy = (A.y + Bc.y + C.y) / 3, k = 0.55;
  function shrink(p) { return { x: gx + (p.x - gx) * k, y: gy + (p.y - gy) * k }; }
  return [shrink(A), shrink(Bc), shrink(C)];
}

// ---------- Player ----------
var player = {
  x: 0, y: -HALF, vy: 0, rot: 0, mode: 'cube', onGround: true,
  coyote: 0, buffer: 0, prevY: -HALF, wasGround: true, trail: []
};

// ---------- Game ----------
var hudPctCache = '', hudWidthCache = '', hudAttemptCache = '';

var Game = {
  state: 'menu', mode: 'stage', selectedLevel: 0, ents: [], endX: 1, startX: 0, shipStart: 0,
  speedMul: 1, attempt: 0, progress: 0, maxProgress: 0,
  hitStop: 0, shake: 0, respawnTimer: 0,
  camX: 0, camY: -GROUND_SCREEN, viewW: 1280,
  checkpoints: [], lastCp: null, genBlock: 0, menuTime: 0,
  practice: false,

  startRun: function (mode) {
    Audio.start();
    this.mode = mode;
    this.practice = save.practice;
    this.attempt = 0;
    this.maxProgress = 0;
    this.speedMul = 1;
    this.checkpoints = [];
    this.lastCp = null;
    this.hitStop = 0; this.shake = 0;
    particles.length = 0;
    if (mode === 'stage') {
      var lv = this.selectedLevel === 0 ? buildStage() : buildExtraStage(this.selectedLevel);
      this.ents = lv.ents;
      this.endX = lv.endX;
      this.startX = lv.startX;
      this.shipStart = lv.shipStart;
      this.genBlock = 0;
    } else {
      this.ents = [];
      this.endX = Infinity;
      this.startX = 0;
      this.shipStart = 0;
      this.resetPlayer(this.startX);
      this.genBlock = 16;
      this.endlessEnsure();
    }
    if (mode === 'stage') this.resetPlayer(this.startX);
    this.camX = this.startX - this.viewW * 0.3;
    this.camY = -GROUND_SCREEN;
    this.state = 'playing';
    this.attempt = 1;
    save.attempt = (save.attempt || 0) + 1;
    persistSoon();
    elMenu.classList.add('hidden');
    elPause.classList.add('hidden');
    elVictory.classList.add('hidden');
    elHud.classList.remove('hidden');
    elPauseBtn.classList.remove('hidden');
    this.updateHud();
  },

  resetPlayer: function (x) {
    var p = player;
    p.x = x; p.y = -HALF; p.vy = 0; p.rot = 0; p.mode = 'cube';
    p.onGround = true; p.coyote = 0; p.buffer = 0; p.prevY = -HALF; p.wasGround = true;
    p.trail.length = 0;
  },

  endlessEnsure: function () {
    var ahead = player.x + Math.max(1800, this.viewW + 900);
    var guard = 0;
    while (this.genBlock * CFG.BLOCK < ahead && guard < 40) {
      var diff = clamp(this.genBlock / 420, 0, 1);
      var c = makeChunk(this.genBlock, diff);
      for (var i = 0; i < c.ents.length; i++) this.ents.push(c.ents[i]);
      this.genBlock += c.width;
      guard++;
    }

    // Endless mode only needs nearby obstacles. Discard passed chunks so
    // collision checks and both render passes stay bounded during long runs.
    var keepFrom = player.x - 900;
    while (this.ents.length) {
      var first = this.ents[0];
      var firstWidth = first.w || CFG.BLOCK;
      if (first.x + firstWidth >= keepFrom) break;
      this.ents.shift();
    }
  },

  restart: function () {
    if (this.state === 'menu') return;
    this.startRun(this.mode);
  },
  pause: function () {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    elPause.classList.remove('hidden');
    elPauseBtn.classList.add('hidden');
  },
  resume: function () {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    elPause.classList.add('hidden');
    elPauseBtn.classList.remove('hidden');
  },
  togglePause: function () {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  },
  quit: function () {
    this.state = 'menu';
    elPause.classList.add('hidden');
    elVictory.classList.add('hidden');
    elHud.classList.add('hidden');
    elPauseBtn.classList.add('hidden');
    elMenu.classList.remove('hidden');
    this.refreshMenu();
  },

  die: function () {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.hitStop = 0.09;
    this.shake = 20;
    this.respawnTimer = CFG.RESPAWN;
    var sk = currentSkin();
    burst(player.x, player.y, 26, sk.c1, 520, 0.7, 9);
    burst(player.x, player.y, 14, '#ffffff', 380, 0.5, 6);
    Audio.sfxShatter();
    this.recordProgress();
  },

  recordProgress: function () {
    if (this.practice) return;
    var pct = Math.floor(this.progress * 100);
    if (this.mode === 'stage') {
      if (pct > save.bestStage) { save.bestStage = pct; persistSoon(); }
    } else {
      var dist = Math.floor((player.x - this.startX) / 50);
      if (dist > save.bestEndless) { save.bestEndless = dist; persistSoon(); }
    }
  },

  victory: function () {
    if (this.state !== 'playing') return;
    this.state = 'victory';
    this.progress = 1;
    if (!this.practice && save.bestStage < 100) { save.bestStage = 100; persist(); }
    Audio.sfxWin();
    this.updateHud();
    document.getElementById('victoryStats').textContent = 'Best ' + save.bestStage + '%  \u00B7  Attempt ' + this.attempt;
    elVictory.classList.remove('hidden');
    elPauseBtn.classList.add('hidden');
    burst(player.x, player.y, 40, '#4dff88', 600, 1.0, 10);
    burst(player.x, player.y, 30, '#ffe23d', 500, 0.9, 8);
  },

  respawn: function () {
    this.attempt++;
    save.attempt = (save.attempt || 0) + 1;
    persistSoon();
    if (this.mode === 'endless') {
      this.ents = [];
      this.genBlock = 16;
      this.speedMul = 1;
      this.resetPlayer(this.startX);
      this.endlessEnsure();
    } else if (this.practice && this.lastCp) {
      this.resetPlayer(this.lastCp.x);
      player.y = this.lastCp.y; player.mode = this.lastCp.mode; player.rot = this.lastCp.rot || 0;
      player.onGround = false; player.vy = 0;
    } else {
      this.resetPlayer(this.startX);
    }
    this.maxProgress = this.progress;
    this.state = 'playing';
    this.hitStop = 0;
  },

  updateHud: function () {
    var pctText, widthText;
    if (this.mode === 'stage') {
      var stagePct = Math.floor(this.progress * 100);
      pctText = stagePct + '%';
      widthText = stagePct + '%';
    } else {
      var distance = player.x - this.startX;
      var chunk = distance % 2200;
      var endlessPct = Math.floor(chunk / 2200 * 100);
      widthText = endlessPct + '%';
      pctText = Math.floor(distance / 50) + 'm';
    }
    var attemptText = 'Attempt ' + this.attempt + (this.practice ? '  \u00B7  PRACTICE' : '');
    // Avoid forcing DOM/style work on every 120 Hz physics tick.
    if (pctText !== hudPctCache) { elPct.textContent = pctText; hudPctCache = pctText; }
    if (widthText !== hudWidthCache) { elProgressFill.style.width = widthText; hudWidthCache = widthText; }
    if (attemptText !== hudAttemptCache) { elAttempt.textContent = attemptText; hudAttemptCache = attemptText; }
  },

  refreshMenu: function () {
    elBest.innerHTML = 'BEST STAGE <b>' + save.bestStage + '%</b> &nbsp;&middot;&nbsp; ENDLESS <b>' + save.bestEndless + 'm</b> &nbsp;&middot;&nbsp; ATTEMPT <b>' + (save.attempt || 0) + '</b>';
    document.getElementById('stageHighscore').textContent = 'HIGH SCORE · ' + save.bestStage + '%';
    document.getElementById('endlessHighscore').textContent = 'HIGH SCORE · ' + save.bestEndless + 'm';
    buildSkinUI();
  }
};

// ---------- Update ----------
function update(dt, pressed) {
  Game.menuTime += dt;
  if (Game.shake > 0) Game.shake = Math.max(0, Game.shake - dt * 60);
  if (Game.hitStop > 0) { Game.hitStop -= dt; updateParticles(dt * 0.25); updateCamera(dt); return; }

  if (Game.state === 'menu') {
    Game.camX += 42 * dt;
    updateParticles(dt);
    updateCamera(dt);
    return;
  }
  if (Game.state === 'paused' || Game.state === 'victory') { updateParticles(dt); updateCamera(dt); return; }

  if (Game.state === 'playing') updatePlaying(dt, pressed);
  else if (Game.state === 'dead') {
    Game.respawnTimer -= dt;
    if (Game.respawnTimer <= 0) Game.respawn();
  }
  updateParticles(dt);
  updateCamera(dt);
}

function updatePlaying(dt, pressed) {
  var p = player, B = CFG.BLOCK;
  p.prevY = p.y;
  p.wasGround = p.onGround;

  if (p.mode === 'cube') {
    if (p.onGround) p.coyote = CFG.COYOTE; else p.coyote = Math.max(0, p.coyote - dt);
    if (pressed || Input.held) p.buffer = CFG.BUFFER;
    p.buffer = Math.max(0, p.buffer - dt);
    if (p.buffer > 0 && (p.onGround || p.coyote > 0)) {
      p.vy = -CFG.JUMP_V; p.onGround = false; p.coyote = 0; p.buffer = 0;
      Audio.sfxJump();
      burst(p.x, p.y + HALF, 5, currentSkin().c1, 160, 0.3, 4);
    }
    p.vy += CFG.GRAVITY * dt;
    if (p.vy > CFG.MAX_FALL) p.vy = CFG.MAX_FALL;
    p.x += CFG.MOVE_SPEED * Game.speedMul * dt;
    p.y += p.vy * dt;
    p.onGround = false;
    if (p.y + HALF > 0) { p.y = -HALF; p.vy = 0; p.onGround = true; }
  } else {
    p.vy += (Input.held ? -CFG.SHIP_THRUST : CFG.SHIP_GRAVITY) * dt;
    if (p.vy < CFG.SHIP_MAX_UP) p.vy = CFG.SHIP_MAX_UP;
    if (p.vy > CFG.SHIP_MAX_DOWN) p.vy = CFG.SHIP_MAX_DOWN;
    p.x += CFG.MOVE_SPEED * Game.speedMul * dt;
    p.y += p.vy * dt;
    p.onGround = false;
    if (p.y + HALF > 0) { p.y = -HALF; p.vy = 0; }
  }

  handleWorld(p, pressed, dt);

  if (Game.state !== 'playing') return;

  if (p.mode === 'cube') {
    if (p.onGround) {
      if (!p.wasGround) {
        Audio.sfxLand();
        burst(p.x, p.y + HALF, 6, currentSkin().c1, 200, 0.3, 4);
        p.squash = 1;
      }
      p.rot = Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2);
    } else {
      p.rot += CFG.ROT_SPEED * dt;
    }
  } else {
    p.rot = lerp(p.rot, clamp(p.vy / 900, -1, 1) * 0.6, 0.18);
  }
  if (p.squash > 0) p.squash = Math.max(0, p.squash - dt * 6);

  if (Game.mode === 'stage') {
    Game.progress = clamp((p.x - Game.startX) / (Game.endX - Game.startX), 0, 1);
    if (Game.progress > Game.maxProgress) Game.maxProgress = Game.progress;
  } else {
    Game.progress = clamp((p.x - Game.startX) / 2200, 0, 1);
    Game.speedMul = Math.min(1.6, 1 + (p.x - Game.startX) / 26000);
    Game.endlessEnsure();
    Game.recordProgress();
  }

  if (Game.practice) {
    var nextCp = (Game.lastCp ? Game.lastCp.x : Game.startX) + 520;
    if (p.x > nextCp) {
      Game.lastCp = { x: p.x, y: p.y, mode: p.mode, rot: p.rot };
    }
  }

  if (Math.random() < 0.5) {
    spawnParticle({ x: p.x - HALF - rnd(0, 30), y: p.y + rnd(-HALF, HALF), vx: -rnd(500, 900), vy: 0, life: rnd(0.15, 0.35), max: 0.35, size: rnd(6, 18), color: currentSkin().c1, g: 0, type: 'line' });
  }

  Game.updateHud();
}

function firstEntityAt(minX) {
  // Entity arrays are generated in increasing x order; binary search skips
  // everything well behind the player/camera instead of rescanning it.
  var lo = 0, hi = Game.ents.length;
  while (lo < hi) {
    var mid = (lo + hi) >>> 1;
    if (Game.ents[mid].x < minX) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function handleWorld(p, pressed, dt) {
  var B = CFG.BLOCK, half = HALF;
  var minX = p.x - 320, maxX = p.x + 1100;
  var inset = 7;
  var pleft = p.x - half + inset, ptop = p.y - half + inset, pwid = B - inset * 2, phei = B - inset * 2;
  var i, e;

  for (i = firstEntityAt(minX - 400); i < Game.ents.length; i++) {
    e = Game.ents[i];
    if (e.x > maxX) break;
    if (e.type === 'block') {
      if (e.x + e.w < minX) continue;
      if (p.mode === 'cube') {
        var fleft = p.x - half, ftop = p.y - half;
        var ox = fleft < e.x + e.w && fleft + B > e.x;
        var oy = ftop < e.y + e.h && ftop + B > e.y;
        if (ox && oy) {
          var prevBottom = p.prevY + half;
          if (p.vy >= 0 && (prevBottom <= e.y + 14 || p.y < e.y)) {
            p.y = e.y - half; p.vy = 0; p.onGround = true;
          } else {
            Game.die(); return;
          }
        }
      } else {
        if (p.x - half < e.x + e.w && p.x + half > e.x && p.y - half < e.y + e.h && p.y + half > e.y) {
          Game.die(); return;
        }
      }
    } else if (e.type === 'spike') {
      if (e.x + e.w < minX || e.x > maxX) continue;
      if (triRect(spikeTri(e), pleft, ptop, pwid, phei)) { Game.die(); return; }
    } else if (e.type === 'pad') {
      if (p.mode !== 'cube') continue;
      if (p.x + half > e.x && p.x - half < e.x + e.w && p.y + half > -10 && p.y + half < 20) {
        p.vy = -CFG.PAD_V; p.onGround = false; p.coyote = 0;
        Audio.sfxPad();
        burst(p.x, p.y + half, 12, '#ffe23d', 320, 0.5, 6);
      }
    } else if (e.type === 'ring') {
      if (e.used) continue;
      var dx = p.x - e.x, dy = p.y - e.y;
      if (dx * dx + dy * dy < (e.r + half) * (e.r + half)) {
        if (pressed) {
          e.used = true;
          p.vy = -CFG.RING_V; p.onGround = false;
          Audio.sfxRing();
          burst(e.x, e.y, 14, '#ffe23d', 360, 0.5, 6);
        }
      }
    } else if (e.type === 'shipPortal') {
      if (p.mode !== 'cube') continue;
      if (p.x + half > e.x && p.x - half < e.x + e.w && p.y + half > e.y && p.y - half < e.y + e.h) {
        p.mode = 'ship'; p.vy = -260; p.rot = 0;
        Audio.sfxPortal();
        burst(p.x, p.y, 16, '#ff2fb9', 380, 0.6, 7);
      }
    } else if (e.type === 'cubePortal') {
      if (p.mode !== 'ship') continue;
      if (p.x + half > e.x && p.x - half < e.x + e.w && p.y + half > e.y && p.y - half < e.y + e.h) {
        p.mode = 'cube'; p.vy = 0; p.onGround = false; p.coyote = 0; p.buffer = 0;
        Audio.sfxPortal();
        burst(p.x, p.y, 16, '#4dff88', 380, 0.6, 7);
      }
    } else if (e.type === 'endPortal') {
      if (p.x + half > e.x && p.x - half < e.x + e.w && p.y + half > e.y && p.y - half < e.y + e.h) {
        Game.victory(); return;
      }
    }
  }
}

function updateCamera(dt) {
  var targetX = player.x - Game.viewW * 0.3;
  if (Game.state === 'menu') targetX = Game.camX;
  Game.camX = lerp(Game.camX, targetX, 1 - Math.pow(0.001, dt));
  var baseY = -GROUND_SCREEN;
  var targetY = Math.min(baseY, player.y - CFG.DESIGN_H * 0.45);
  if (Game.state === 'menu') targetY = baseY;
  Game.camY = lerp(Game.camY, targetY, 1 - Math.pow(0.002, dt));
}

// ---------- Render ----------
var LOW_POWER = (typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4))) || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
var DPR = 1, S = 1, viewW = 1280, viewH = 720, skyGrad = null;
var renderTime = 0;            // seconds, advanced every rendered frame (visual only)
var lastMode = 'cube';         // detect portal transitions for flash FX
var trailPts = [];             // visual-only ribbon trail samples
var fx = { flash: 0, flashColor: '#ffffff', victoryT: 0, fireworks: [] };
var noiseCanvas = null, noiseCtx = null;
var starSeed = null;

// Color helpers ------------------------------------------------------------
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
}
function rgb(c, a) {
  if (a === undefined) return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}

// Color-shift zone palettes (Electric Cyan -> Cyber Magenta -> Solar Gold -> Crimson Overdrive)
var PALETTES = [
  { sky0: hexToRgb('#0a2a4a'), sky1: hexToRgb('#061428'), sky2: hexToRgb('#02060f'), floor: hexToRgb('#0a2740'), grid: hexToRgb('#22e6ff'), glow: hexToRgb('#22e6ff'), accent: hexToRgb('#ff2fb9'), star: hexToRgb('#bfefff') },
  { sky0: hexToRgb('#2a0a3a'), sky1: hexToRgb('#160424'), sky2: hexToRgb('#08020c'), floor: hexToRgb('#280a34'), grid: hexToRgb('#ff2fb9'), glow: hexToRgb('#ff2fb9'), accent: hexToRgb('#22e6ff'), star: hexToRgb('#ffc2f0') },
  { sky0: hexToRgb('#3a2c06'), sky1: hexToRgb('#1e1404'), sky2: hexToRgb('#0c0802'), floor: hexToRgb('#322608'), grid: hexToRgb('#ffd23d'), glow: hexToRgb('#ffc83c'), accent: hexToRgb('#ff7828'), star: hexToRgb('#fff2c0') },
  { sky0: hexToRgb('#340a12'), sky1: hexToRgb('#1c0308'), sky2: hexToRgb('#0c0104'), floor: hexToRgb('#2e0810'), grid: hexToRgb('#ff3c46'), glow: hexToRgb('#ff323c'), accent: hexToRgb('#ffb43c'), star: hexToRgb('#ffd0c0') }
];
function paletteLerp(a, b, t) {
  return {
    sky0: mix(a.sky0, b.sky0, t), sky1: mix(a.sky1, b.sky1, t), sky2: mix(a.sky2, b.sky2, t),
    floor: mix(a.floor, b.floor, t), grid: mix(a.grid, b.grid, t), glow: mix(a.glow, b.glow, t),
    accent: mix(a.accent, b.accent, t), star: mix(a.star, b.star, t)
  };
}
function currentPalette() {
  var prog;
  if (Game.state === 'menu') prog = (renderTime * 0.04) % 1;
  else prog = Game.progress || 0;
  var n = PALETTES.length - 1;
  var scaled = clamp(prog, 0, 1) * n;
  var i = Math.floor(scaled);
  if (i >= n) return PALETTES[n];
  return paletteLerp(PALETTES[i], PALETTES[i + 1], scaled - i);
}

// Film-grain / noise texture (built once) ----------------------------------
function buildNoise() {
  noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = 160; noiseCanvas.height = 160;
  noiseCtx = noiseCanvas.getContext('2d');
  var img = noiseCtx.createImageData(160, 160);
  var d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    var v = (Math.random() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 26;
  }
  noiseCtx.putImageData(img, 0, 0);
  // Precompute star field
  starSeed = [];
  for (var s = 0; s < 90; s++) {
    starSeed.push({ x: Math.random(), y: Math.random() * 0.7, r: rnd(0.6, 1.9), tw: rnd(0.5, 2.4), ph: rnd(0, 6.28) });
  }
}

function resize() {
  // High-DPI canvases multiply the pixels rendered every frame.
  DPR = Math.min(window.devicePixelRatio || 1, LOW_POWER ? 0.85 : 1.5);
  var w = canvas.clientWidth || window.innerWidth;
  var h = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
  S = h / CFG.DESIGN_H;
  viewW = w / S;
  viewH = CFG.DESIGN_H;
  Game.viewW = viewW;
  skyGrad = null;
  if (!noiseCanvas) buildNoise();
}
window.addEventListener('resize', resize);

function setWorldTransform() {
  var a = S * DPR;
  var sh = Game.shake;
  var ox = sh ? rnd(-sh, sh) : 0, oy = sh ? rnd(-sh, sh) : 0;
  ctx.setTransform(a, 0, 0, a, (-Game.camX + ox) * a, (-Game.camY + oy) * a);
}

function drawAtmosphere(w, h, groundCss, pal, beat, lightweight) {
  // Animated neon aurora ribbons drift independently of the camera.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var bands = lightweight ? 2 : 3;
  for (var b = 0; b < bands; b++) {
    var phase = renderTime * (0.22 + b * 0.07) + b * 2.1;
    var y = groundCss * (0.28 + b * 0.105);
    ctx.beginPath();
    ctx.moveTo(-30, y + Math.sin(phase) * 18 * S);
    for (var x = 0; x <= w + 80; x += 80) {
      var waveY = y + Math.sin(phase + x * 0.006) * (18 + b * 5) * S
        + Math.cos(phase * 0.7 + x * 0.002) * 9 * S;
      ctx.lineTo(x, waveY);
    }
    ctx.strokeStyle = rgb(b % 2 ? pal.accent : pal.grid, (lightweight ? 0.10 : 0.13) + beat * 0.07);
    ctx.lineWidth = (lightweight ? 2 : 3.5) * S;
    ctx.stroke();
  }

  // Slow drifting signal motes add motion without spawning particle objects.
  var motes = lightweight ? 5 : 9;
  for (var m = 0; m < motes; m++) {
    var travel = (renderTime * (10 + (m % 3) * 5) + m * 137) % (w + 40);
    var mx = travel - 20;
    var my = groundCss * (0.18 + (m % 5) * 0.105)
      + Math.sin(renderTime * 0.65 + m * 1.7) * 12 * S;
    var radius = (1.2 + (m % 3) * 0.55) * S;
    ctx.globalAlpha = 0.38 + 0.3 * Math.sin(renderTime * 1.8 + m);
    ctx.fillStyle = rgb(m % 2 ? pal.star : pal.accent);
    ctx.beginPath();
    ctx.arc(mx, my, radius, 0, Math.PI * 2);
    ctx.fill();
    if (!lightweight) {
      ctx.globalAlpha *= 0.35;
      ctx.fillRect(mx - 12 * S, my - 0.5 * S, 9 * S, S);
    }
  }
  ctx.restore();
}

function drawBackground() {
  var w = canvas.width / DPR, h = canvas.height / DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  var pal = currentPalette();
  var beat = LOW_POWER ? 0 : Audio.getBeat();
  var groundCss = (-Game.camY) * S;

  if (LOW_POWER) {
    // Lightweight layered sky: more depth without the costly nebula effects.
    var lowSky = ctx.createLinearGradient(0, 0, 0, h);
    lowSky.addColorStop(0, rgb(pal.sky0));
    lowSky.addColorStop(0.62, rgb(pal.sky2));
    lowSky.addColorStop(1, rgb(pal.floor));
    ctx.fillStyle = lowSky;
    ctx.fillRect(0, 0, w, h);
    drawStars(w, h, groundCss, pal, 0);
    ctx.fillStyle = rgb(mix(pal.floor, pal.sky2, 0.28), 0.96);
    ctx.fillRect(0, groundCss, w, Math.max(0, h - groundCss));
    ctx.fillStyle = rgb(pal.grid, 0.22);
    ctx.fillRect(0, groundCss + 5, w, 2);
    ctx.fillStyle = rgb(pal.accent, 0.5);
    ctx.fillRect(0, groundCss, w, 2);
    ctx.fillStyle = rgb(pal.grid, 0.16);
    ctx.fillRect(0, groundCss + 18, w, 1);

    // Lightweight distant skyline: adds depth with a few solid rectangles,
    // avoiding per-building gradients, shadows, and window loops.
    var skylineBase = groundCss - 8;
    var skylineScroll = (Game.camX * 0.10 * S) % 150;
    for (var bi = -1; bi < Math.ceil(w / 150) + 1; bi++) {
      var bx = bi * 150 - skylineScroll;
      var bh = (28 + hash(bi * 13.7 + 4) * 54) * S;
      var bw = (48 + hash(bi * 7.3 + 2) * 46) * S;
      ctx.fillStyle = rgb(mix(pal.sky2, pal.grid, 0.18), 0.72);
      ctx.fillRect(bx, skylineBase - bh, bw, bh);
      ctx.fillStyle = rgb(pal.grid, 0.28);
      ctx.fillRect(bx, skylineBase - bh, bw, Math.max(1, 2 * S));
      // A handful of deterministic lit windows.
      ctx.fillStyle = rgb(pal.accent, 0.24);
      for (var wi = 0; wi < 3; wi++) {
        var wx = bx + (8 + wi * 12) * S;
        var wy = skylineBase - bh + (10 + wi * 9) * S;
        if (wx < bx + bw - 4 * S && wy < skylineBase - 4 * S) {
          ctx.fillRect(wx, wy, Math.max(1, 3 * S), Math.max(1, 4 * S));
        }
      }
    }
    // A second, quieter silhouette and horizon tracers create extra depth at almost no cost.
    var farBase = skylineBase - 18 * S;
    var farScroll = (Game.camX * 0.045 * S) % 210;
    ctx.fillStyle = rgb(mix(pal.sky0, pal.sky2, 0.42), 0.42);
    for (var fi = -1; fi < Math.ceil(w / 210) + 1; fi++) {
      var fx = fi * 210 - farScroll;
      var fh = (55 + hash(fi * 9.1 + 17) * 70) * S;
      ctx.fillRect(fx, farBase - fh, (72 + hash(fi * 4.2 + 5) * 65) * S, fh);
    }
    ctx.fillStyle = rgb(pal.accent, 0.14);
    ctx.fillRect(0, groundCss - 34 * S, w, Math.max(1, S));
    ctx.fillStyle = rgb(pal.grid, 0.12);
    ctx.fillRect(0, groundCss - 30 * S, w, Math.max(1, S));
    drawAtmosphere(w, h, groundCss, pal, 0, true);
    // Sparse floating markers, drawn as short line segments rather than effects.
    ctx.strokeStyle = rgb(pal.accent, 0.22);
    ctx.lineWidth = Math.max(1, S);
    for (var mi = 0; mi < 4; mi++) {
      var mx = ((mi * 173 + Game.camX * 0.07) % (w + 80)) - 40;
      var my = groundCss - (105 + (mi % 2) * 62) * S;
      ctx.strokeRect(mx, my, 9 * S, 9 * S);
      ctx.beginPath(); ctx.moveTo(mx - 5 * S, my + 4 * S); ctx.lineTo(mx + 14 * S, my + 4 * S); ctx.stroke();
    }
    return;
  }

  // Layer 1 — deep nebula gradient sky
  var g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgb(pal.sky0));
  g.addColorStop(0.55, rgb(pal.sky1));
  g.addColorStop(1, rgb(pal.sky2));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Nebula blooms
  ctx.globalCompositeOperation = 'lighter';
  for (var nb = 0; nb < 3; nb++) {
    var nx = w * (0.2 + nb * 0.3) + Math.sin(renderTime * 0.1 + nb) * 40;
    var ny = groundCss * (0.3 + nb * 0.12);
    var rad = w * (0.28 + 0.05 * nb);
    var ng = ctx.createRadialGradient(nx, ny, 10, nx, ny, rad);
    ng.addColorStop(0, rgb(nb % 2 ? pal.accent : pal.grid, 0.10 + beat * 0.05));
    ng.addColorStop(1, rgb(pal.sky2, 0));
    ctx.fillStyle = ng;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';

  if (!LOW_POWER) {
    drawStars(w, h, groundCss, pal, beat);
    drawMegastructures(groundCss, w, pal, beat);
    drawSkylineEQ(groundCss, w, pal, beat);
  } else {
    drawStars(w, h, groundCss, pal, beat);
  }
  drawFloor(groundCss, w, h, pal, beat);

  drawAtmosphere(w, h, groundCss, pal, beat, false);

  // Beat horizon glow
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.10 + beat * 0.18;
  var g2 = ctx.createRadialGradient(w * 0.5, groundCss, 10, w * 0.5, groundCss, w * 0.7);
  g2.addColorStop(0, rgb(pal.accent, 0.5));
  g2.addColorStop(1, rgb(pal.accent, 0));
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  if (!LOW_POWER) drawFilmGrain(w, h);
}

function drawStars(w, h, groundCss, pal, beat) {
  if (!starSeed) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var par = (Game.camX * 0.02) % w;
  for (var i = 0; i < starSeed.length; i++) {
    var st = starSeed[i];
    var x = (st.x * w - par + w) % w;
    var y = st.y * groundCss;
    var tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(renderTime * st.tw + st.ph));
    ctx.globalAlpha = tw * (0.5 + beat * 0.4);
    ctx.fillStyle = rgb(pal.star);
    ctx.beginPath();
    ctx.arc(x, y, st.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMegastructures(groundCss, w, pal, beat) {
  var par = 0.12;
  var scroll = Game.camX * par;
  var span = 520;
  var startIdx = Math.floor(scroll / span) - 1;
  var count = Math.ceil(viewW / span) + 3;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (var i = 0; i < count; i++) {
    var idx = startIdx + i;
    var r1 = hash(idx * 2.3), r2 = hash(idx * 5.7 + 3);
    var x = (idx * span - scroll) * S + span * S * 0.5;
    var baseY = groundCss - (40 + r1 * 60) * S;
    var size = (70 + r2 * 90) * S;
    var rot = renderTime * (0.15 + r1 * 0.2) * (idx % 2 ? 1 : -1) + r2 * 6.28;
    var sides = 3 + (idx % 3);
    ctx.save();
    ctx.translate(x, baseY - size * 0.5);
    ctx.rotate(rot);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = rgb(pal.grid, 0.20 + beat * 0.12);
    ctx.shadowColor = rgb(pal.grid, 0.6);
    ctx.shadowBlur = 12;
    ctx.beginPath();
    for (var s = 0; s <= sides; s++) {
      var a = (s / sides) * Math.PI * 2;
      var px = Math.cos(a) * size * 0.5, py = Math.sin(a) * size * 0.5;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // inner polygon
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (var s2 = 0; s2 <= sides; s2++) {
      var a2 = (s2 / sides) * Math.PI * 2 + 0.4;
      var px2 = Math.cos(a2) * size * 0.28, py2 = Math.sin(a2) * size * 0.28;
      if (s2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawSkylineEQ(groundCss, w, pal, beat) {
  var BW = 120;
  var scroll = Game.camX * 0.3;
  var startIdx = Math.floor(scroll / BW) - 1;
  var count = Math.ceil(viewW / BW) + 3;
  ctx.save();
  for (var i = 0; i < count; i++) {
    var idx = startIdx + i;
    var r1 = hash(idx * 1.7), r2 = hash(idx * 3.1 + 9);
    var bw = (54 + r1 * 64) * S;
    var bh = (120 * (0.5 + r2 * 1.1)) * S;
    var x = (idx * BW - scroll) * S;
    var y = groundCss - bh;
    var bg = ctx.createLinearGradient(x, y, x, groundCss);
    bg.addColorStop(0, rgb(mix(pal.sky0, pal.grid, 0.25), 0.9));
    bg.addColorStop(1, rgb(pal.sky2, 0.95));
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, bw, bh + 4);
    // neon top edge
    ctx.fillStyle = rgb(pal.grid, 0.5 + beat * 0.4);
    ctx.fillRect(x, y, bw, 2);
    // windows
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = rgb(pal.grid, 0.3);
    for (var wy = y + 8; wy < groundCss - 6; wy += 16) {
      for (var wx = x + 6; wx < x + bw - 6; wx += 14) {
        if (hash(wx * 0.3 + wy) > 0.6) ctx.fillRect(wx, wy, 5, 7);
      }
    }
    ctx.globalAlpha = 1;
    // beat-reactive equalizer bar on the rooftop
    var eqH = (10 + hash(idx * 7.7) * 34) * (0.4 + beat * 0.9) * S;
    var eqW = bw * 0.5;
    var ex = x + bw * 0.25;
    var eg = ctx.createLinearGradient(ex, y - eqH, ex, y);
    eg.addColorStop(0, rgb(pal.accent, 0.95));
    eg.addColorStop(1, rgb(pal.grid, 0.15));
    ctx.fillStyle = eg;
    ctx.shadowColor = rgb(pal.accent, 0.8);
    ctx.shadowBlur = 10;
    ctx.fillRect(ex, y - eqH, eqW, eqH);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawFloor(groundCss, w, h, pal, beat) {
  if (groundCss > h) return;
  var fh = h - groundCss;
  // base floor gradient
  var fg = ctx.createLinearGradient(0, groundCss, 0, h);
  fg.addColorStop(0, rgb(mix(pal.floor, pal.grid, 0.18), 0.95));
  fg.addColorStop(1, rgb(pal.sky2, 1));
  ctx.fillStyle = fg;
  ctx.fillRect(0, groundCss, w, fh);

  // scrolling neon tile grid (perspective-ish compression toward horizon)
  ctx.save();
  ctx.beginPath(); ctx.rect(0, groundCss, w, fh); ctx.clip();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgb(pal.grid, 0.16 + beat * 0.16);
  var step = CFG.BLOCK * 2 * S;
  var scroll = (Game.camX * S) % step;
  ctx.beginPath();
  for (var x = -scroll; x < w + step; x += step) { ctx.moveTo(x, groundCss); ctx.lineTo(x, h); }
  var rows = 6;
  for (var r = 0; r <= rows; r++) {
    var t = r / rows;
    var yy = groundCss + fh * (t * t);
    ctx.moveTo(0, yy); ctx.lineTo(w, yy);
  }
  ctx.stroke();

  // specular sheen sweeping across the floor
  ctx.globalCompositeOperation = 'lighter';
  var sweep = ((renderTime * 0.25) % 1) * (w + 300) - 150;
  var sg = ctx.createLinearGradient(sweep - 120, 0, sweep + 120, 0);
  sg.addColorStop(0, rgb(pal.grid, 0));
  sg.addColorStop(0.5, rgb(pal.grid, 0.10 + beat * 0.08));
  sg.addColorStop(1, rgb(pal.grid, 0));
  ctx.fillStyle = sg;
  ctx.fillRect(0, groundCss, w, fh);
  ctx.restore();

  // bright horizon line
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgb(pal.grid, 0.5 + beat * 0.4);
  ctx.lineWidth = 2.4;
  ctx.shadowColor = rgb(pal.grid, 0.9);
  ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.moveTo(0, groundCss); ctx.lineTo(w, groundCss); ctx.stroke();
  ctx.restore();
}

function drawFilmGrain(w, h) {
  if (!noiseCanvas) return;
  // A repeating pattern replaces dozens of per-frame drawImage calls.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = ctx.createPattern(noiseCanvas, 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawGrid() {
  var beat = LOW_POWER ? 0 : Audio.getBeat();
  var pal = currentPalette();
  if (LOW_POWER) {
    var lowLeft = Game.camX - 40, lowRight = Game.camX + viewW + 40;
    ctx.strokeStyle = rgb(pal.grid, 0.16);
    ctx.lineWidth = 1 / S;
    ctx.beginPath();
    for (var lx = Math.floor(lowLeft / (CFG.BLOCK * 2)) * CFG.BLOCK * 2; lx < lowRight; lx += CFG.BLOCK * 2) {
      ctx.moveTo(lx, 0); ctx.lineTo(lx, CFG.BLOCK * 6);
    }
    ctx.moveTo(lowLeft, 0); ctx.lineTo(lowRight, 0);
    ctx.stroke();
    return;
  }
  ctx.lineWidth = 1.5 / S;
  ctx.strokeStyle = rgb(pal.grid, 0.10 + beat * 0.18);
  var left = Game.camX - 40;
  var right = Game.camX + viewW + 40;
  var step = CFG.BLOCK * 2;
  var startX = Math.floor(left / step) * step;
  ctx.beginPath();
  for (var x = startX; x < right; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, CFG.BLOCK * 6); }
  for (var y = 0; y <= CFG.BLOCK * 6; y += CFG.BLOCK) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
  ctx.stroke();

  ctx.strokeStyle = rgb(pal.accent, 0.18 + beat * 0.22);
  ctx.lineWidth = 2.5 / S;
  ctx.beginPath();
  ctx.moveTo(left, 0); ctx.lineTo(right, 0);
  ctx.stroke();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawBlock(e) {
  if (LOW_POWER) {
    var lowPal = currentPalette();
    ctx.fillStyle = rgb(mix(lowPal.floor, lowPal.grid, 0.22), 0.98);
    ctx.fillRect(e.x + 2, e.y + 2, e.w - 4, e.h - 4);
    ctx.fillStyle = rgb(lowPal.grid, 0.2);
    ctx.fillRect(e.x + 4, e.y + 4, e.w - 8, Math.min(4, e.h - 8));
    // Small inset panel and corner highlights give blocks more dimension
    // without blur, gradients, or additional canvas state changes.
    ctx.fillStyle = rgb(lowPal.sky2, 0.42);
    ctx.fillRect(e.x + 6, e.y + 8, Math.max(0, e.w - 12), Math.max(1, Math.min(3, e.h * 0.08)));
    ctx.fillStyle = rgb(lowPal.accent, 0.5);
    ctx.fillRect(e.x + 5, e.y + 5, 3, 3);
    ctx.fillRect(e.x + e.w - 8, e.y + 5, 3, 3);
    ctx.strokeStyle = rgb(lowPal.grid, 0.9);
    ctx.lineWidth = 2;
    ctx.strokeRect(e.x + 2, e.y + 2, e.w - 4, e.h - 4);
    ctx.strokeStyle = rgb(lowPal.accent, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(e.x + 5, e.y + e.h - 5);
    ctx.lineTo(e.x + e.w - 5, e.y + e.h - 5);
    ctx.stroke();
    return;
  }
  var beat = Audio.getBeat();
  var pal = currentPalette();
  var trim = pal.grid;
  ctx.save();
  // body
  var g = ctx.createLinearGradient(e.x, e.y, e.x, e.y + e.h);
  g.addColorStop(0, rgb(mix(pal.floor, trim, 0.30), 0.96));
  g.addColorStop(1, rgb(pal.sky2, 0.96));
  ctx.fillStyle = g;
  roundRect(ctx, e.x + 2, e.y + 2, e.w - 4, e.h - 4, 6);
  ctx.fill();

  // internal circuit / brick inlays
  ctx.save();
  roundRect(ctx, e.x + 2, e.y + 2, e.w - 4, e.h - 4, 6);
  ctx.clip();
  ctx.strokeStyle = rgb(trim, 0.22);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var ix = e.x + CFG.BLOCK; ix < e.x + e.w - 4; ix += CFG.BLOCK) { ctx.moveTo(ix, e.y + 4); ctx.lineTo(ix, e.y + e.h - 4); }
  for (var iy = e.y + CFG.BLOCK; iy < e.y + e.h - 4; iy += CFG.BLOCK) { ctx.moveTo(e.x + 4, iy); ctx.lineTo(e.x + e.w - 4, iy); }
  ctx.stroke();
  // glowing nodes at intersections
  ctx.fillStyle = rgb(trim, 0.5 + beat * 0.4);
  for (var nx = e.x + CFG.BLOCK; nx < e.x + e.w - 4; nx += CFG.BLOCK) {
    for (var ny = e.y + CFG.BLOCK; ny < e.y + e.h - 4; ny += CFG.BLOCK) {
      ctx.fillRect(nx - 1.5, ny - 1.5, 3, 3);
    }
  }
  ctx.restore();

  // beveled neon outline
  ctx.shadowColor = rgb(trim, 0.85);
  ctx.shadowBlur = 12 + beat * 8;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = rgb(trim, 0.95);
  roundRect(ctx, e.x + 2, e.y + 2, e.w - 4, e.h - 4, 6);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // bright glowing top-surface trim (landing read)
  ctx.shadowColor = rgb(trim, 1);
  ctx.shadowBlur = 16 + beat * 10;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(e.x + 3, e.y + 2.5);
  ctx.lineTo(e.x + e.w - 3, e.y + 2.5);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // corner bevel accents
  ctx.strokeStyle = rgb(trim, 0.8);
  ctx.lineWidth = 2;
  var cb = 7;
  var cs = [[e.x + 2, e.y + 2, 1, 1], [e.x + e.w - 2, e.y + 2, -1, 1], [e.x + 2, e.y + e.h - 2, 1, -1], [e.x + e.w - 2, e.y + e.h - 2, -1, -1]];
  ctx.beginPath();
  for (var c = 0; c < cs.length; c++) {
    var q = cs[c];
    ctx.moveTo(q[0] + q[2] * cb, q[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(q[0], q[1] + q[3] * cb);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSpike(e) {
  if (LOW_POWER) {
    var lowPal = currentPalette();
    ctx.fillStyle = '#32172b';
    ctx.beginPath();
    ctx.moveTo(e.x, e.baseY); ctx.lineTo(e.x + e.w, e.baseY); ctx.lineTo(e.x + e.w / 2, e.baseY - e.h);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(e.x + e.w * 0.18, e.baseY - 3);
    ctx.lineTo(e.x + e.w * 0.5, e.baseY - e.h * 0.72);
    ctx.lineTo(e.x + e.w * 0.82, e.baseY - 3);
    ctx.closePath(); ctx.fill();
    // Dark inset facet makes the hazard read more clearly at low resolution.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.moveTo(e.x + e.w * 0.5, e.baseY - e.h * 0.56);
    ctx.lineTo(e.x + e.w * 0.72, e.baseY - 5);
    ctx.lineTo(e.x + e.w * 0.5, e.baseY - 5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgb(lowPal.accent, 0.95);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(e.x, e.baseY); ctx.lineTo(e.x + e.w / 2, e.baseY - e.h); ctx.lineTo(e.x + e.w, e.baseY);
    ctx.stroke();
    return;
  }
  var beat = Audio.getBeat();
  var pal = currentPalette();
  var full = [{ x: e.x, y: e.baseY }, { x: e.x + e.w, y: e.baseY }, { x: e.x + e.w / 2, y: e.baseY - e.h }];
  var cx = e.x + e.w / 2, cy = e.baseY - e.h * 0.42;
  ctx.save();

  // outer danger glow
  ctx.shadowColor = 'rgba(255,40,70,0.9)';
  ctx.shadowBlur = 16 + beat * 10;
  var g = ctx.createLinearGradient(e.x, e.baseY, e.x, e.baseY - e.h);
  g.addColorStop(0, 'rgba(20,14,26,0.97)');
  g.addColorStop(1, 'rgba(58,20,40,0.97)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(full[0].x, full[0].y); ctx.lineTo(full[1].x, full[1].y); ctx.lineTo(full[2].x, full[2].y);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;

  // beveled metallic inner facet
  var k = 0.62;
  var gx = (full[0].x + full[1].x + full[2].x) / 3, gy = (full[0].y + full[1].y + full[2].y) / 3;
  function shrink(p) { return { x: gx + (p.x - gx) * k, y: gy + (p.y - gy) * k }; }
  var b0 = shrink(full[0]), b1 = shrink(full[1]), b2 = shrink(full[2]);
  var bg = ctx.createLinearGradient(b0.x, b0.y, b2.x, b2.y);
  bg.addColorStop(0, 'rgba(90,96,120,0.9)');
  bg.addColorStop(0.5, 'rgba(40,44,66,0.9)');
  bg.addColorStop(1, 'rgba(20,22,38,0.9)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y);
  ctx.closePath(); ctx.fill();

  // razor-sharp neon outline
  ctx.lineJoin = 'round';
  ctx.shadowColor = rgb(pal.accent, 0.95);
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#ff5ec8';
  ctx.beginPath();
  ctx.moveTo(full[0].x, full[0].y); ctx.lineTo(full[1].x, full[1].y); ctx.lineTo(full[2].x, full[2].y);
  ctx.closePath(); ctx.stroke();
  ctx.shadowBlur = 0;

  // pulsing crimson danger core
  var pulse = 0.55 + beat * 0.45 + Math.sin(renderTime * 5 + e.x * 0.05) * 0.12;
  ctx.globalCompositeOperation = 'lighter';
  var cg = ctx.createRadialGradient(cx, cy, 1, cx, cy, e.w * 0.3);
  cg.addColorStop(0, 'rgba(255,80,90,' + (0.9 * pulse) + ')');
  cg.addColorStop(1, 'rgba(255,40,70,0)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(cx, cy, e.w * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,180,180,' + pulse + ')';
  ctx.beginPath(); ctx.arc(cx, cy, e.w * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPad(e) {
  var beat = Audio.getBeat();
  ctx.save();
  // base plate
  ctx.shadowColor = 'rgba(255,226,61,0.9)';
  ctx.shadowBlur = 14 + beat * 8;
  var bg = ctx.createLinearGradient(e.x, e.y - 10, e.x, e.y);
  bg.addColorStop(0, '#fff6c0');
  bg.addColorStop(1, '#ffb43c');
  ctx.fillStyle = bg;
  roundRect(ctx, e.x + 4, e.y - 10, e.w - 8, 10, 4);
  ctx.fill();
  ctx.shadowBlur = 0;

  // animated upward shockwave chevrons
  ctx.globalCompositeOperation = 'lighter';
  var cx = e.x + e.w / 2;
  for (var i = 0; i < 3; i++) {
    var t = ((renderTime * 1.6 + i / 3) % 1);
    var yy = e.y - 12 - t * 46;
    var alpha = (1 - t) * (0.7 + beat * 0.3);
    var half = (e.w * 0.32) * (0.6 + t * 0.7);
    ctx.strokeStyle = 'rgba(255,230,120,' + alpha + ')';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - half, yy + 8);
    ctx.lineTo(cx, yy);
    ctx.lineTo(cx + half, yy + 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRing(e) {
  if (e.used) return;
  var beat = Audio.getBeat();
  var pulse = 1 + Math.sin(Game.menuTime * 6) * 0.08 + beat * 0.12;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(pulse, pulse);
  ctx.globalCompositeOperation = 'lighter';

  // base glowing ring
  ctx.shadowColor = 'rgba(255,226,61,0.95)';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffe23d';
  ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff6c0';
  ctx.beginPath(); ctx.arc(0, 0, e.r * 0.6, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;

  // orbiting energy arcs
  var rot = renderTime * 3.2;
  for (var a = 0; a < 2; a++) {
    var start = rot + a * Math.PI;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = a ? 'rgba(255,120,200,0.9)' : 'rgba(180,255,220,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 1.18, start, start + Math.PI * 0.55);
    ctx.stroke();
  }
  // inner energy core
  var cg = ctx.createRadialGradient(0, 0, 1, 0, 0, e.r * 0.5);
  cg.addColorStop(0, 'rgba(255,255,220,' + (0.5 + beat * 0.4) + ')');
  cg.addColorStop(1, 'rgba(255,226,61,0)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(0, 0, e.r * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPortal(e, c1, c2, label) {
  var beat = Audio.getBeat();
  var cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  var rgb1 = hexToRgb(c1), rgb2 = hexToRgb(c2);
  ctx.save();
  ctx.translate(cx, cy);
  var pulse = 1 + Math.sin(Game.menuTime * 4) * 0.05 + beat * 0.1;
  ctx.scale(pulse, 1);
  ctx.globalCompositeOperation = 'lighter';

  // inner swirling vortex fill
  var vg = ctx.createRadialGradient(0, 0, 4, 0, 0, e.h * 0.5);
  vg.addColorStop(0, rgb(rgb1, 0.35));
  vg.addColorStop(0.6, rgb(rgb2, 0.18));
  vg.addColorStop(1, rgb(rgb2, 0));
  ctx.fillStyle = vg;
  ctx.beginPath();
  ctx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // multi-ring spinning vortex
  var rings = 4;
  for (var r = 0; r < rings; r++) {
    var f = 1 - r * 0.16;
    var rot = renderTime * (1.4 + r * 0.6) * (r % 2 ? 1 : -1);
    ctx.save();
    ctx.rotate(rot * 0.15);
    ctx.lineWidth = 6 - r;
    ctx.strokeStyle = rgb(r % 2 ? rgb1 : rgb2, 0.85 - r * 0.12);
    ctx.shadowColor = rgb(rgb1, 0.9);
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.ellipse(0, 0, (e.w / 2) * f, (e.h / 2) * f, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.shadowBlur = 0;

  // swirling suction particles
  var N = 10;
  for (var i = 0; i < N; i++) {
    var t = (renderTime * 0.6 + i / N) % 1;
    var ang = i * 2.399 + renderTime * 2.0;
    var rad = (1 - t) * e.w * 0.9;
    var px = Math.cos(ang) * rad * 0.5;
    var py = Math.sin(ang) * rad;
    ctx.globalAlpha = t * 0.8;
    ctx.fillStyle = rgb(i % 2 ? rgb1 : rgb2);
    ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // label
  ctx.fillStyle = '#eaf6ff';
  ctx.font = 'bold ' + Math.round(CFG.BLOCK * 0.34) + 'px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = rgb(rgb1, 0.9);
  ctx.shadowBlur = 10;
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

function drawCheckpoint() {
  if (!Game.practice || !Game.lastCp) return;
  var x = Game.lastCp.x;
  ctx.save();
  ctx.strokeStyle = 'rgba(77,255,136,0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath(); ctx.moveTo(x, -CFG.BLOCK * 6); ctx.lineTo(x, 0); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#4dff88';
  ctx.beginPath(); ctx.moveTo(x, -CFG.BLOCK * 6); ctx.lineTo(x + 22, -CFG.BLOCK * 6 + 8); ctx.lineTo(x, -CFG.BLOCK * 6 + 16); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawTrail() {
  var tr = trailPts;
  if (tr.length < 2) return;
  var sk = currentSkin();
  var c1 = hexToRgb(sk.c1);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';
  // three layered passes: wide glow, mid, bright core
  var passes = [
    { w: 1.9, a: 0.16, col: rgb(c1) },
    { w: 1.1, a: 0.34, col: rgb(c1) },
    { w: 0.5, a: 0.7, col: 'rgba(255,255,255,0.9)' }
  ];
  for (var pi = 0; pi < passes.length; pi++) {
    var ps = passes[pi];
    for (var i = 1; i < tr.length; i++) {
      var a = i / tr.length;
      ctx.globalAlpha = a * ps.a;
      ctx.strokeStyle = ps.col;
      ctx.lineWidth = a * HALF * ps.w;
      ctx.beginPath();
      ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
      ctx.lineTo(tr[i].x, tr[i].y);
      ctx.stroke();
    }
  }
  // spark embers shed from the trail
  if (tr.length > 4 && Math.random() < 0.6) {
    var tip = tr[tr.length - 1];
    spawnParticle({ x: tip.x + rnd(-6, 6), y: tip.y + rnd(-HALF, HALF), vx: -rnd(120, 320), vy: rnd(-60, 60), life: rnd(0.2, 0.5), max: 0.5, size: rnd(2, 4.5), color: sk.c1, g: 200, type: 'ember' });
  }
  ctx.restore();
}

function drawCubeShape(c, skin, s) {
  var h = s / 2;
  c.save();
  // body gradient
  var g = c.createLinearGradient(-h, -h, h, h);
  g.addColorStop(0, skin.c1);
  g.addColorStop(1, skin.c2);
  c.fillStyle = g;
  roundRect(c, -h, -h, s, s, s * 0.07);
  c.fill();

  // top glossy highlight
  c.save();
  roundRect(c, -h, -h, s, s, s * 0.07);
  c.clip();
  var hl = c.createLinearGradient(0, -h, 0, 0);
  hl.addColorStop(0, 'rgba(255,255,255,0.55)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = hl;
  c.fillRect(-h, -h, s, h);
  c.restore();

  // outer white rim
  c.lineWidth = Math.max(2, s * 0.06);
  c.strokeStyle = '#ffffff';
  roundRect(c, -h, -h, s, s, s * 0.07);
  c.stroke();
  // inner bevel panel
  c.lineWidth = Math.max(1, s * 0.03);
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  roundRect(c, -h * 0.72, -h * 0.72, s * 0.72, s * 0.72, s * 0.04);
  c.stroke();

  var name = skin.name;
  c.fillStyle = 'rgba(5,1,15,0.88)';
  c.strokeStyle = 'rgba(5,1,15,0.88)';

  if (skin.face === 'plain') {
    if (name === 'PINK') {
      // cheeky face: angled visor eyes + grin
      c.save();
      c.translate(-s * 0.2, -s * 0.08); c.rotate(0.25);
      c.fillRect(-s * 0.08, -s * 0.05, s * 0.16, s * 0.14);
      c.restore();
      c.save();
      c.translate(s * 0.2, -s * 0.08); c.rotate(-0.25);
      c.fillRect(-s * 0.08, -s * 0.05, s * 0.16, s * 0.14);
      c.restore();
      c.beginPath(); c.arc(0, s * 0.16, s * 0.16, 0.15 * Math.PI, 0.85 * Math.PI); c.lineWidth = s * 0.06; c.stroke();
    } else {
      // CYAN: visor + smile
      c.fillRect(-h * 0.42, -h * 0.28, s * 0.16, s * 0.2);
      c.fillRect(h * 0.12, -h * 0.28, s * 0.16, s * 0.2);
      roundRect(c, -h * 0.3, h * 0.14, s * 0.6, s * 0.1, s * 0.05); c.fill();
    }
  } else if (skin.face === 'cross') {
    c.save(); c.rotate(Math.PI / 4);
    if (name === 'GOLD') {
      // crown notches on the cross tips
      c.fillRect(-s * 0.32, -s * 0.05, s * 0.64, s * 0.1);
      c.fillRect(-s * 0.05, -s * 0.32, s * 0.1, s * 0.64);
      c.fillRect(-s * 0.05, -s * 0.42, s * 0.1, s * 0.1);
      c.fillRect(-s * 0.42, -s * 0.05, s * 0.1, s * 0.1);
      c.fillRect(s * 0.32, -s * 0.05, s * 0.1, s * 0.1);
    } else {
      c.fillRect(-s * 0.32, -s * 0.05, s * 0.64, s * 0.1);
      c.fillRect(-s * 0.05, -s * 0.32, s * 0.1, s * 0.64);
    }
    c.restore();
  } else if (skin.face === 'star') {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      var rr = (i % 2 === 0) ? s * 0.3 : s * 0.14;
      var px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath(); c.fill();
    if (name === 'EMBER') {
      c.fillStyle = 'rgba(255,220,120,0.9)';
      c.beginPath(); c.moveTo(0, -s * 0.16);
      c.quadraticCurveTo(s * 0.12, 0, 0, s * 0.16);
      c.quadraticCurveTo(-s * 0.12, 0, 0, -s * 0.16); c.fill();
    }
  } else if (skin.face === 'diamond') {
    c.beginPath(); c.moveTo(0, -s * 0.34); c.lineTo(s * 0.27, 0);
    c.lineTo(0, s * 0.34); c.lineTo(-s * 0.27, 0); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fillRect(-s * 0.035, -s * 0.2, s * 0.07, s * 0.4);
  } else if (skin.face === 'bolt') {
    c.beginPath(); c.moveTo(s * 0.06, -s * 0.36); c.lineTo(-s * 0.22, s * 0.02);
    c.lineTo(-s * 0.02, s * 0.02); c.lineTo(-s * 0.08, s * 0.36);
    c.lineTo(s * 0.24, -s * 0.08); c.lineTo(s * 0.04, -s * 0.08); c.closePath(); c.fill();
  } else if (skin.face === 'eye') {
    c.beginPath(); c.ellipse(0, 0, s * 0.34, s * 0.19, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = skin.c1; c.beginPath(); c.arc(0, 0, s * 0.12, 0, Math.PI * 2); c.fill();
  } else if (skin.face === 'hex') {
    c.beginPath();
    for (var hx = 0; hx < 6; hx++) { var ha = hx * Math.PI / 3; var hpx = Math.cos(ha) * s * 0.3, hpy = Math.sin(ha) * s * 0.3; if (!hx) c.moveTo(hpx,hpy); else c.lineTo(hpx,hpy); }
    c.closePath(); c.lineWidth = s * 0.09; c.stroke();
    c.fillRect(-s * 0.07, -s * 0.07, s * 0.14, s * 0.14);
  } else if (skin.face === 'target') {
    c.beginPath(); c.arc(0, 0, s * 0.29, 0, Math.PI * 2); c.lineWidth = s * 0.07; c.stroke();
    c.beginPath(); c.arc(0, 0, s * 0.12, 0, Math.PI * 2); c.fill();
  } else if (skin.face === 'flame') {
    c.beginPath(); c.moveTo(0, s * 0.34); c.bezierCurveTo(-s * 0.34, s * 0.05, -s * 0.05, -s * 0.12, s * 0.08, -s * 0.36);
    c.bezierCurveTo(s * 0.13, -s * 0.08, s * 0.38, 0, 0, s * 0.34); c.fill();
    c.fillStyle = skin.c1; c.beginPath(); c.moveTo(0, s * 0.2); c.quadraticCurveTo(-s * 0.1, 0, s * 0.08, -s * 0.12);
    c.quadraticCurveTo(s * 0.2, s * 0.08, 0, s * 0.2); c.fill();
  }
  c.restore();
}


var skinSpriteCache = {};
function drawSkinSprite(c, skin, size) {
  var sprite = skinSpriteCache[skin.name];
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = 96;
    sprite.height = 96;
    var spriteCtx = sprite.getContext('2d');
    spriteCtx.translate(48, 48);
    drawCubeShape(spriteCtx, skin, 96);
    skinSpriteCache[skin.name] = sprite;
  }
  c.drawImage(sprite, -size / 2, -size / 2, size, size);
}

function drawPlayerReflection(p, sk) {
  var c1 = hexToRgb(sk.c1);
  var d = clamp(-p.y / (CFG.BLOCK * 6), 0, 1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // contact glow directly beneath
  var rad = CFG.BLOCK * (0.8 + (1 - d) * 0.7);
  var rg = ctx.createRadialGradient(p.x, 0, 2, p.x, 0, rad);
  rg.addColorStop(0, rgb(c1, 0.55 * (1 - d * 0.6)));
  rg.addColorStop(1, rgb(c1, 0));
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.ellipse(p.x, 0, rad, rad * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  // faint vertical light streak (reflection)
  var sg = ctx.createLinearGradient(p.x, 0, p.x, -p.y);
  sg.addColorStop(0, rgb(c1, 0.22 * (1 - d * 0.7)));
  sg.addColorStop(1, rgb(c1, 0));
  ctx.fillStyle = sg;
  var sw = CFG.BLOCK * 0.5;
  ctx.fillRect(p.x - sw / 2, -p.y, sw, -p.y);
  ctx.restore();
}

function drawPlayerAura(p, sk) {
  var c1 = hexToRgb(sk.c1);
  var beat = Audio.getBeat();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var rad = CFG.BLOCK * (1.6 + beat * 0.5);
  var rg = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, rad);
  rg.addColorStop(0, rgb(c1, 0.30 + beat * 0.15));
  rg.addColorStop(0.5, rgb(c1, 0.10));
  rg.addColorStop(1, rgb(c1, 0));
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawCubeLite(c, skin, size) {
  var h = size / 2;
  // Flat fills and a few crisp shapes: richer than the old fallback without blur or gradients.
  c.fillStyle = skin.c2;
  c.fillRect(-h, -h, size, size);
  c.fillStyle = skin.c1;
  c.fillRect(-h + 3, -h + 3, size - 6, size - 6);
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.fillRect(-h + 4, -h + 4, size - 8, size * 0.16);
  c.lineWidth = Math.max(2, size * 0.055);
  c.strokeStyle = '#ffffff';
  c.strokeRect(-h + 1.5, -h + 1.5, size - 3, size - 3);
  c.fillStyle = 'rgba(4,8,22,0.88)';
  c.fillRect(-h * 0.66, -h * 0.66, size * 0.66, size * 0.66);
  c.fillStyle = '#ffffff';
  if (skin.face === 'diamond') {
    c.beginPath(); c.moveTo(0,-size*0.27); c.lineTo(size*0.22,0); c.lineTo(0,size*0.27); c.lineTo(-size*0.22,0); c.closePath(); c.fill();
  } else if (skin.face === 'bolt') {
    c.beginPath(); c.moveTo(size*0.06,-size*0.3); c.lineTo(-size*0.2,size*0.02); c.lineTo(-size*0.01,size*0.02); c.lineTo(-size*0.07,size*0.3); c.lineTo(size*0.22,-size*0.08); c.lineTo(size*0.04,-size*0.08); c.closePath(); c.fill();
  } else if (skin.face === 'eye') {
    c.beginPath(); c.ellipse(0,0,size*0.28,size*0.15,0,0,Math.PI*2); c.fill();
    c.fillStyle = skin.c1; c.beginPath(); c.arc(0,0,size*0.09,0,Math.PI*2); c.fill();
  } else if (skin.face === 'hex') {
    c.strokeStyle='#ffffff'; c.lineWidth=size*0.07; c.beginPath();
    for(var q=0;q<6;q++){var a=q*Math.PI/3,px=Math.cos(a)*size*0.25,py=Math.sin(a)*size*0.25;if(!q)c.moveTo(px,py);else c.lineTo(px,py);}
    c.closePath(); c.stroke();
  } else if (skin.face === 'target') {
    c.beginPath(); c.arc(0,0,size*0.25,0,Math.PI*2); c.lineWidth=size*0.06; c.stroke();
    c.beginPath(); c.arc(0,0,size*0.09,0,Math.PI*2); c.fill();
  } else if (skin.face === 'flame') {
    c.beginPath(); c.moveTo(0,size*0.27); c.quadraticCurveTo(-size*0.3,0,size*0.08,-size*0.3); c.quadraticCurveTo(size*0.3,0,0,size*0.27); c.fill();
  } else if (skin.face === 'cross') {
    c.fillRect(-size*0.28,-size*0.055,size*0.56,size*0.11); c.fillRect(-size*0.055,-size*0.28,size*0.11,size*0.56);
  } else if (skin.face === 'star') {
    c.beginPath(); for(var z=0;z<10;z++){var aa=-Math.PI/2+z*Math.PI/5,rr=z%2?size*0.12:size*0.28,xx=Math.cos(aa)*rr,yy=Math.sin(aa)*rr;if(!z)c.moveTo(xx,yy);else c.lineTo(xx,yy);} c.closePath(); c.fill();
  } else {
    c.fillRect(-size*0.28,-size*0.23,size*0.13,size*0.18);
    c.fillRect(size*0.13,-size*0.23,size*0.13,size*0.18);
    c.fillRect(-size*0.2,size*0.14,size*0.4,size*0.07);
  }
}

function drawPlayer() {
  if (Game.state === 'dead') return;
  var p = player, sk = currentSkin();

  // portal entry flash detection (visual only)
  if (p.mode !== lastMode) {
    fx.flash = 1;
    fx.flashColor = p.mode === 'ship' ? '#ff2fb9' : '#4dff88';
    lastMode = p.mode;
  }

  if (!LOW_POWER) {
    drawTrail();
    drawPlayerReflection(p, sk);
    drawPlayerAura(p, sk);
  }

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  // Keep the cube's proportions identical to the skin-changer tile.
  // Rotation is retained for gameplay, but the skin artwork is never squashed or stretched.
  ctx.shadowColor = sk.c1;
  ctx.shadowBlur = LOW_POWER ? 0 : 22;
  if (p.mode === 'cube') {
    // Use the exact same cube renderer as the menu skin previews on every device.
    // Low-power mode still disables the expensive glow/shadow above.
    drawSkinSprite(ctx, sk, CFG.BLOCK);
  } else {
    drawShip(sk);
  }
  ctx.restore();
}

function drawShip(sk) {
  var s = CFG.BLOCK;
  var c1 = hexToRgb(sk.c1);
  if (Input.held) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // outer plasma flame (flickering)
    var fl = s * (0.8 + Math.random() * 0.6);
    var fg = ctx.createLinearGradient(-s * 0.45, 0, -s * 0.45 - fl, 0);
    fg.addColorStop(0, 'rgba(255,240,180,0.95)');
    fg.addColorStop(0.4, 'rgba(255,160,60,0.8)');
    fg.addColorStop(1, 'rgba(255,60,120,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-s * 0.45, -s * 0.2);
    ctx.lineTo(-s * 0.45 - fl, 0);
    ctx.lineTo(-s * 0.45, s * 0.2);
    ctx.closePath(); ctx.fill();
    // inner hot core
    var fl2 = fl * 0.55;
    var fg2 = ctx.createLinearGradient(-s * 0.45, 0, -s * 0.45 - fl2, 0);
    fg2.addColorStop(0, 'rgba(255,255,255,0.95)');
    fg2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fg2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.45, -s * 0.1);
    ctx.lineTo(-s * 0.45 - fl2, 0);
    ctx.lineTo(-s * 0.45, s * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // smoke puffs (visual only)
    if (Math.random() < 0.5) {
      spawnParticle({ x: player.x - s * 0.6, y: player.y + rnd(-4, 4), vx: -rnd(60, 160), vy: rnd(-30, 10), life: rnd(0.3, 0.6), max: 0.6, size: rnd(5, 10), color: 'rgba(120,130,160,0.5)', g: -40, type: 'smoke' });
    }
  }
  // hull
  var g = ctx.createLinearGradient(-s * 0.5, 0, s * 0.5, 0);
  g.addColorStop(0, sk.c2); g.addColorStop(1, sk.c1);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(s * 0.55, 0);
  ctx.lineTo(-s * 0.4, -s * 0.36);
  ctx.lineTo(-s * 0.2, 0);
  ctx.lineTo(-s * 0.4, s * 0.36);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = Math.max(2, s * 0.06);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  // cockpit
  ctx.fillStyle = 'rgba(5,1,15,0.85)';
  ctx.beginPath(); ctx.arc(s * 0.12, 0, s * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rgb(c1, 0.9);
  ctx.beginPath(); ctx.arc(s * 0.12, 0, s * 0.06, 0, Math.PI * 2); ctx.fill();
}

function drawParticles() {
  var i, p, a, s;
  // additive pass (sparks, embers, lines, fireworks)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var viewLeft = Game.camX - 120, viewRight = Game.camX + viewW + 120;
  for (i = 0; i < particles.length; i++) {
    p = particles[i];
    if (p.x < viewLeft || p.x > viewRight || (LOW_POWER && p.type === 'smoke')) continue;
    if (p.type === 'smoke') continue;
    a = clamp(p.life / p.max, 0, 1);
    if (p.type === 'line') {
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * 0.4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.size * 2.2, p.y);
      ctx.stroke();
    } else if (p.type === 'ember') {
      ctx.globalAlpha = a * (0.6 + Math.random() * 0.4);
      ctx.fillStyle = p.color;
      s = p.size * a;
      ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'firework') {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      s = p.size * a;
      ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a * 0.4;
      ctx.beginPath(); ctx.arc(p.x, p.y, s * 2.2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      s = p.size * a;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }
  ctx.restore();

  // smoke pass (soft, normal blend)
  if (!LOW_POWER) for (i = 0; i < particles.length; i++) {
    p = particles[i];
    if (p.type !== 'smoke' || p.x < viewLeft || p.x > viewRight) continue;
    a = clamp(p.life / p.max, 0, 1);
    var rr = p.size * (1.4 - a * 0.6);
    var g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, rr);
    g.addColorStop(0, p.color.replace(/[\d.]+\)$/, (0.35 * a) + ')'));
    g.addColorStop(1, p.color.replace(/[\d.]+\)$/, '0)'));
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawVignette() {
  var w = canvas.width / DPR, h = canvas.height / DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  var pal = currentPalette();
  var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, rgb(mix(pal.sky2, [0, 0, 0], 0.4), 0.85));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

var lastRenderT = 0, prevState = 'menu', fireworkTimer = 0;
var previewCtx = null;

function updateVisuals(dt) {
  if (fx.flash > 0) fx.flash = Math.max(0, fx.flash - dt * 2.6);
  if (fx.crash) fx.crash.t += dt;

  // state transitions (visual hooks only)
  if (Game.state !== prevState) {
    if (Game.state === 'dead') {
      fx.crash = { x: player.x, y: player.y, t: 0 };
      trailPts.length = 0;
    }
    if (Game.state === 'playing' && (prevState === 'menu' || prevState === 'victory')) {
      lastMode = player.mode;
      trailPts.length = 0;
    }
    prevState = Game.state;
  }

  // ribbon trail sampling (visual only)
  if (Game.state === 'playing') {
    var last = trailPts[trailPts.length - 1];
    if (!last || Math.abs(player.x - last.x) > CFG.BLOCK * 4 || Math.abs(player.y - last.y) > CFG.BLOCK * 4) {
      if (last) trailPts.length = 0;
    }
    trailPts.push({ x: player.x, y: player.y });
    if (trailPts.length > 26) trailPts.shift();
  }

  // victory fireworks (visual only)
  if (Game.state === 'victory') {
    fx.victoryT += dt;
    fireworkTimer -= dt;
    if (fireworkTimer <= 0) {
      fireworkTimer = 0.35;
      var fx0 = player.x + rnd(-viewW * 0.3, viewW * 0.4);
      var fy0 = player.y - rnd(CFG.BLOCK * 2, CFG.BLOCK * 8);
      var hue = [ '#4dff88', '#ffe23d', '#22e6ff', '#ff2fb9', '#ff6a3d' ][(Math.random() * 5) | 0];
      for (var k = 0; k < 18; k++) {
        var ang = (k / 18) * Math.PI * 2;
        var spd = rnd(180, 420);
        spawnParticle({ x: fx0, y: fy0, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: rnd(0.6, 1.1), max: 1.1, size: rnd(3, 6), color: hue, g: 900, type: 'firework' });
      }
      Audio.blip(700, 1400, 0.18, 'triangle', 0.2);
    }
  }
}

function drawCrashFX() {
  if (!fx.crash) return;
  var t = fx.crash.t;
  if (t > 0.7) { fx.crash = null; return; }
  var prog = t / 0.7;
  var cx = fx.crash.x, cy = fx.crash.y;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (var r = 0; r < 2; r++) {
    var pr = clamp(prog - r * 0.15, 0, 1);
    if (pr <= 0) continue;
    var rad = pr * CFG.BLOCK * 7;
    ctx.globalAlpha = (1 - pr) * 0.8;
    ctx.strokeStyle = r ? '#ffffff' : currentSkin().c1;
    ctx.lineWidth = (1 - pr) * 8 + 1;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawFlash() {
  if (fx.flash <= 0) return;
  var w = canvas.width / DPR, h = canvas.height / DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var rg = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7);
  var a = fx.flash * 0.55;
  rg.addColorStop(0, rgb(hexToRgb(fx.flashColor), a));
  rg.addColorStop(1, rgb(hexToRgb(fx.flashColor), 0));
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawMenuPreview() {
  var cv = document.getElementById('skinPreview');
  if (!cv) return;
  if (!previewCtx) previewCtx = cv.getContext('2d');
  var c = previewCtx;
  var w = cv.width, h = cv.height;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, w, h);
  var sk = currentSkin();
  var beat = Audio.getBeat();
  var scale = 1 + Math.sin(renderTime * 2) * 0.04 + beat * 0.06;
  c.save();
  c.translate(w / 2, h / 2 + Math.sin(renderTime * 1.6) * 6);
  c.scale(scale, scale);
  // slow showcase rotation
  var rot = Math.sin(renderTime * 0.9) * 0.35;
  c.rotate(rot);
  c.shadowColor = sk.c1;
  c.shadowBlur = 30;
  drawSkinSprite(c, sk, w * 0.62);
  c.restore();
}

function render() {
  var now = performance.now() / 1000;
  var dt = lastRenderT ? (now - lastRenderT) : 0;
  lastRenderT = now;
  if (dt > 0.1) dt = 0.1;
  if (dt < 0) dt = 0;
  renderTime += dt;
  updateVisuals(dt);

  drawBackground();
  setWorldTransform();
  drawGrid();
  drawCheckpoint();

  var left = Game.camX - 200, right = Game.camX + viewW + 400;
  var i, e, firstVisible = firstEntityAt(left - 400);
  for (i = firstVisible; i < Game.ents.length; i++) {
    e = Game.ents[i];
    if (e.x > right) break;
    if (e.type === 'block') { if (e.x + e.w < left) continue; drawBlock(e); }
  }
  for (i = firstVisible; i < Game.ents.length; i++) {
    e = Game.ents[i];
    if (e.x > right) break;
    if (e.x + (e.w || CFG.BLOCK) < left) continue;
    if (e.type === 'spike') drawSpike(e);
    else if (e.type === 'pad') drawPad(e);
    else if (e.type === 'ring') drawRing(e);
    else if (e.type === 'shipPortal') drawPortal(e, '#ff2fb9', '#8a0a5a', 'SHIP');
    else if (e.type === 'cubePortal') drawPortal(e, '#4dff88', '#0a7a3a', 'CUBE');
    else if (e.type === 'endPortal') drawPortal(e, '#ffe23d', '#4dff88', 'END');
  }

  drawParticles();
  if (Game.state !== 'menu') drawPlayer();
  drawCrashFX();

  drawFlash();
  drawVignette();

  if (Game.state === 'menu') drawMenuPreview();
}

// ---------- Loop ----------
var lastT = 0, acc = 0;
function frame(now) {
  if (!lastT) lastT = now;
  var dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.05) dt = 0.05;
  if (dt < 0) dt = 0;

  if (Game.state === 'playing' || Game.state === 'dead') {
    acc += dt;
    var steps = 0;
    while (acc >= CFG.FIXED_DT && steps < 10) {
      var pressed = Input.consumePress();
      update(CFG.FIXED_DT, pressed);
      acc -= CFG.FIXED_DT;
      steps++;
    }
    if (steps >= 10) acc = 0;
  } else {
    acc = 0;
    Input.consumePress();
    update(dt, false);
  }
  // Render on every display refresh; fixed-step physics remains independent.
  render();
  requestAnimationFrame(frame);
}

// ---------- UI ----------
function buildSkinUI() {
  elSkins.innerHTML = '';
  for (var i = 0; i < SKINS.length; i++) {
    (function (i) {
      var s = SKINS[i];
      var unlocked = skinUnlocked(i);
      var div = document.createElement('div');
      div.className = 'skin' + (i === save.skin ? ' selected' : '') + (unlocked ? '' : ' locked');
      var lockText = s.unlock <= 100 ? s.unlock + '%' : 'ENDLESS ' + (s.unlock * 8) + 'm';
      if (!unlocked) div.setAttribute('data-lock', lockText);
      div.setAttribute('title', s.name + (unlocked ? '' : ' · Unlock: ' + lockText));
      div.setAttribute('aria-label', s.name + (unlocked ? ' skin' : ' locked'));
      var cv = document.createElement('canvas');
      cv.width = 96; cv.height = 96;
      var c2 = cv.getContext('2d');
      c2.translate(48, 48);
      drawSkinSprite(c2, s, 74);
      div.appendChild(cv);
      var nameTag = document.createElement('span');
      nameTag.className = 'skin-name';
      nameTag.textContent = s.name;
      div.appendChild(nameTag);
      if (unlocked) {
        div.addEventListener('click', function () {
          save.skin = i; persistSoon();
          Audio.start(); Audio.sfxRing();
          buildSkinUI();
        });
      }
      elSkins.appendChild(div);
    })(i);
  }
}

function wireUI() {
  var levelsPanel = document.getElementById('levelsPanel');
  document.getElementById('playStage').addEventListener('click', function () {
    levelsPanel.classList.remove('hidden');
    Audio.start();
  });
  document.getElementById('closeLevels').addEventListener('click', function () {
    levelsPanel.classList.add('hidden');
  });
  var levelButtons = document.querySelectorAll('[data-level]');
  for (var li = 0; li < levelButtons.length; li++) levelButtons[li].addEventListener('click', function () {
    Game.selectedLevel = Number(this.getAttribute('data-level')) || 0;
    Game.startRun('stage');
  });
  document.getElementById('playEndless').addEventListener('click', function () { Game.startRun('endless'); });
  elSoundBtn.addEventListener('click', function () { Audio.toggle(); });
  elPauseBtn.addEventListener('click', function () { Game.pause(); });
  document.getElementById('resumeBtn').addEventListener('click', function () { Game.resume(); });
  document.getElementById('restartBtn').addEventListener('click', function () { Game.restart(); });
  document.getElementById('quitBtn').addEventListener('click', function () { Game.quit(); });
  document.getElementById('victoryMenuBtn').addEventListener('click', function () { Game.quit(); });
  document.getElementById('victoryReplayBtn').addEventListener('click', function () { Game.restart(); });
  elPractice.addEventListener('change', function () { save.practice = elPractice.checked; persistSoon(); });
}

// ---------- Boot ----------
function boot() {
  resize();
  Input.init();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && Game.state === 'playing') Game.pause();
    lastT = 0; lastRenderT = 0; acc = 0;
  });
  wireUI();
  elPractice.checked = !!save.practice;
  updateSoundIcon();
  Game.refreshMenu();
  requestAnimationFrame(frame);
}
boot();

})();