import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/700.css';
import '@fontsource/alegreya-sc/400.css';
import '@fontsource/alegreya-sc/500.css';
import './style.css';

import { generateWorld } from './sim/world.js';
import { Game } from './sim/game.js';
import { View } from './render/view.js';
import { Hud } from './ui/hud.js';
import { Strip } from './ui/strip.js';
import { WindowModes } from './ui/modes.js';
import { Audio } from './audio.js';

const SAVE_KEY = 'deckstop.save.v1';

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const saved = loadSave();
const seed = saved?.seed ?? Math.floor(Math.random() * 1e9);
const world = generateWorld(seed);
const game = new Game(world, saved);
game.s.minigameCageId = null; // A haul in progress does not survive a reload.

const app = document.getElementById('app');
const canvas = document.getElementById('view');
const stripCanvas = document.getElementById('strip');
const hudRoot = document.getElementById('hud');

const audio = new Audio();
const view = new View(canvas, world);
const strip = new Strip(stripCanvas, game);

const modes = new WindowModes({ app, onChange: () => onModeChange() });
const hud = new Hud({ root: hudRoot, game, world, view, audio, modes });

hud.onNewGame = () => {
  localStorage.removeItem(SAVE_KEY);
  skipSave = true;
  location.reload();
};

// ---- screen mode plumbing ---------------------------------------------------
const away = document.getElementById('away');
away.innerHTML = `<div><h2>DECK · STOP</h2><p>Your boat is out there, working.</p>
  <button class="btn" id="bring-back">Bring back the full view</button></div>`;
document.getElementById('bring-back').addEventListener('click', () => modes.set('large'));

function syncSize() {
  const r = app.getBoundingClientRect();
  if (modes.mode === 'taskbar') strip.resize(r.width, r.height);
  else view.resize(r.width, r.height);
}

function onModeChange() {
  view.setQuality(modes.mode === 'large' ? 'high' : 'low');
  view.zoomTarget = modes.mode === 'large' ? 38 : 26;
  syncSize();
  attachWindowListeners(modes.win);
  loopWindowChanged();
}

new ResizeObserver(syncSize).observe(app);
modes.applyClasses();

// ---- input -------------------------------------------------------------------
const listening = new WeakSet();
function attachWindowListeners(win) {
  if (listening.has(win)) return;
  listening.add(win);
  win.addEventListener('keydown', (e) => hud.onKey(e, true));
  win.addEventListener('keyup', (e) => hud.onKey(e, false));
  win.addEventListener('blur', () => hud.setTurn(0));
  win.addEventListener('resize', syncSize);
}
attachWindowListeners(window);

let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (e.button !== 2) return;
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  view.addYaw(e.clientX - lastX, e.clientY - lastY);
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener('pointerup', () => {
  dragging = false;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.addZoom(e.deltaY);
}, { passive: false });

// ---- simulation clock ----------------------------------------------------------
// A worker timer keeps the sim ticking at full rate when the tab is hidden, since
// browsers throttle rAF and page timers there. This is what makes it a background
// game: rAF only draws, and it also ticks so that motion stays smooth.
let lastTick = performance.now();
let titleCount = -1;

function tick() {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (hud.showTitle) return;
  game.advance(dt);
  for (const e of game.drainEvents()) {
    hud.handleEvent(e);
    view.handleEvent(e);
    audio.handleEvent(e);
    strip.handleEvent(e);
  }
  audio.setStorm(game.s.weather.storm);
  const ready = game.s.cages.filter((c) => c.ready).length;
  if (ready !== titleCount) {
    titleCount = ready;
    document.title = ready ? `(${ready}) Deckstop: cages ready` : 'Deckstop';
  }
}

const timerSource = 'setInterval(() => postMessage(0), 100);';
const worker = new Worker(URL.createObjectURL(new Blob([timerSource], { type: 'text/javascript' })));
worker.onmessage = tick;

// ---- render loop -----------------------------------------------------------------
let lastFrame = performance.now();
let rafWin = window;
let rafId = 0;

function loop() {
  rafId = rafWin.requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  tick();
  if (modes.mode === 'taskbar') strip.frame(dt);
  else view.frame(game, dt);
  hud.update();
}

function loopWindowChanged() {
  rafWin.cancelAnimationFrame?.(rafId);
  rafWin = modes.win;
  rafId = rafWin.requestAnimationFrame(loop);
}

syncSize();
rafId = requestAnimationFrame(loop);

// ---- saving ------------------------------------------------------------------------
let skipSave = false;
function save() {
  if (skipSave || hud.showTitle) return;
  try {
    localStorage.setItem(SAVE_KEY, game.serialize());
  } catch {
    /* Private mode or a full disk: the game simply is not saved. */
  }
}
setInterval(save, 10000);
window.addEventListener('beforeunload', save);

// Handy for debugging and tuning from the console.
window.__deckstop = { game, world, view, hud, modes, strip };
