// app.js — orkestrasi: scene 3D, kamera orbit sederhana, sentuh, animasi, suara, mode.
import * as THREE from 'three';
import { makePiece, makeBoard, squareToWorld, PIECE_NAMES, TEAM } from './pieces.js';
import { startPosition, legalMoves, applyMove, findKing, pickAiMove } from './chess.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Renderer / Scene / Camera ----------
const canvasHost = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

// orbit manual (tanpa addon)
const orbit = { radius: 11.5, theta: 0, phi: 0.85, target: new THREE.Vector3(0, 0.3, 0) };
function applyCamera() {
  const { radius, theta, phi, target } = orbit;
  camera.position.set(
    target.x + radius * Math.sin(phi) * Math.sin(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * Math.sin(phi) * Math.cos(theta)
  );
  camera.lookAt(target);
}

// pencahayaan hangat
const hemi = new THREE.HemisphereLight(0xffffff, 0xbfe6c4, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4dd, 1.0);
sun.position.set(4, 11, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -7; sun.shadow.camera.right = 7;
sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 30;
sun.shadow.bias = -0.0005;
scene.add(sun);

const board = makeBoard();
scene.add(board);

// ---------- State ----------
let mode = 'meet';
let muted = false;
let pieceMeshes = [];   // {group wrap dengan userData}
let markerMeshes = [];
let demoType = 'kuda';
let gameBoard = null;
let turn = 'l';
let selected = null;     // {wrap, r, c} di mode main
let busy = false;        // mengunci input saat animasi/AI
const tweens = [];

// ---------- Tween ----------
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function tween(dur, onUpdate, onDone, ease = easeOutCubic) {
  if (reduceMotion) dur = Math.min(dur, 0.12);
  tweens.push({ t: 0, dur, onUpdate, onDone, ease });
}
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.onUpdate(tw.ease(k), k);
    if (k >= 1) { tweens.splice(i, 1); tw.onDone && tw.onDone(); }
  }
}

// ---------- Suara ----------
let voices = [];
function loadVoices() { voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }
if (window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
function speak(text) {
  if (muted || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const id = voices.find(v => /^id/i.test(v.lang));
    if (id) u.voice = id;
    u.lang = 'id-ID';
    u.rate = 0.92; u.pitch = 1.25;
    window.speechSynthesis.speak(u);
  } catch (e) { /* tetap berjalan tanpa suara */ }
}

let audioCtx = null;
function blip(freq = 520) {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.24);
  } catch (e) {}
}

// ---------- Helper bidak & penanda ----------
function clearPieces() {
  for (const w of pieceMeshes) scene.remove(w);
  pieceMeshes = [];
}
function clearMarkers() {
  for (const m of markerMeshes) scene.remove(m);
  markerMeshes = [];
}
function addPiece(type, color, r, c) {
  const w = makePiece(type, color);
  const p = squareToWorld(r, c);
  w.position.set(p.x, 0, p.z);
  w.userData.r = r; w.userData.c = c;
  scene.add(w);
  pieceMeshes.push(w);
  return w;
}
function pieceAt(r, c) { return pieceMeshes.find(w => w.userData.r === r && w.userData.c === c); }
// jika pion promosi (jadi ratu), ganti bentuk 3D-nya
function maybePromote(wrap) {
  const { r, c } = wrap.userData;
  const logical = gameBoard && gameBoard[r][c];
  if (logical && logical.type !== wrap.userData.type) {
    scene.remove(wrap);
    pieceMeshes = pieceMeshes.filter(w => w !== wrap);
    const nw = addPiece(logical.type, logical.color, r, c);
    popPiece(nw);
    speak('Pion jadi Ratu!');
  }
}

const markerGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 24);
const markerMat = new THREE.MeshStandardMaterial({ color: 0xFFD23F, emissive: 0xFFB703, emissiveIntensity: 0.6, roughness: 0.4 });
function showMarkers(list) {
  clearMarkers();
  for (const [r, c] of list) {
    const m = new THREE.Mesh(markerGeo, markerMat);
    const p = squareToWorld(r, c);
    m.position.set(p.x, 0.13, p.z);
    m.userData = { isMarker: true, r, c };
    scene.add(m);
    markerMeshes.push(m);
  }
}

// pop / bounce saat disentuh
function popPiece(wrap) {
  const baseRot = wrap.rotation.y;
  blip(620);
  tween(reduceMotion ? 0.15 : 0.7, (e, k) => {
    wrap.position.y = Math.sin(k * Math.PI) * (reduceMotion ? 0 : 0.5);
    const s = 1 + Math.sin(k * Math.PI) * 0.18;
    wrap.scale.setScalar(s);
    wrap.rotation.y = baseRot + (reduceMotion ? 0 : k * Math.PI * 2);
  }, () => { wrap.position.y = 0; wrap.scale.setScalar(1); }, t => t);
}

// gerak bidak meluncur + lompatan kecil
function movePieceMesh(wrap, tr, tc, onDone) {
  const from = wrap.position.clone();
  const to = squareToWorld(tr, tc);
  blip(480);
  tween(0.55, (e) => {
    wrap.position.x = from.x + (to.x - from.x) * e;
    wrap.position.z = from.z + (to.z - from.z) * e;
    wrap.position.y = reduceMotion ? 0 : Math.sin(e * Math.PI) * 0.7;
  }, () => { wrap.position.set(to.x, 0, to.z); wrap.userData.r = tr; wrap.userData.c = tc; onDone && onDone(); });
}
function removePieceMesh(wrap, onDone) {
  tween(0.3, (e) => { wrap.scale.setScalar(1 - e); }, () => {
    scene.remove(wrap);
    pieceMeshes = pieceMeshes.filter(w => w !== wrap);
    onDone && onDone();
  });
}

// ---------- HUD ----------
const elTitle = document.getElementById('title');
const elSub = document.getElementById('subtitle');
const btnNext = document.getElementById('btn-next');
const btnReset = document.getElementById('btn-reset');
const btnMute = document.getElementById('btn-mute');
function setTitle(t, s = '') { elTitle.textContent = t; elSub.textContent = s; }

// ---------- Mode ----------
function clearScene() { clearPieces(); clearMarkers(); selected = null; busy = false; }

function setupMeet() {
  clearScene();
  const types = ['pion', 'kuda', 'gajah', 'benteng', 'ratu', 'raja'];
  types.forEach((t, i) => addPiece(t, i % 2 === 0 ? 'l' : 'd', 4, 1 + i));
  setTitle('Sentuh bidaknya!', 'Kenali nama setiap bidak catur');
  btnNext.classList.add('hidden');
  btnReset.classList.add('hidden');
}

function placeDemo() {
  clearPieces(); clearMarkers();
  const w = addPiece(demoType, 'l', 4, 3);
  const tmp = Array.from({ length: 8 }, () => Array(8).fill(null));
  tmp[4][3] = { type: demoType, color: 'l' };
  showMarkers(legalMoves(tmp, 4, 3));
  setTitle(`Ke mana ${PIECE_NAMES[demoType]} pergi?`, 'Sentuh kotak bersinar');
  return w;
}
function setupMoves() {
  clearScene();
  demoType = 'kuda';
  placeDemo();
  btnNext.classList.remove('hidden');
  btnReset.classList.add('hidden');
  speak(`Ini ${PIECE_NAMES[demoType]}`);
}

function setupPlay() {
  clearScene();
  gameBoard = startPosition();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = gameBoard[r][c];
    if (p) addPiece(p.type, p.color, r, c);
  }
  turn = 'l';
  setTitle('Giliranmu!', 'Sentuh bidak Krem-mu');
  btnNext.classList.add('hidden');
  btnReset.classList.remove('hidden');
}

function switchMode(m) {
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  if (m === 'meet') setupMeet();
  else if (m === 'moves') setupMoves();
  else setupPlay();
}

// ---------- Interaksi mode "Bagaimana Jalannya" ----------
function handleMovesTap(hit) {
  if (busy) return;
  if (hit && hit.isMarker) {
    busy = true;
    clearMarkers();
    const w = pieceMeshes[0];
    movePieceMesh(w, hit.r, hit.c, () => {
      const tmp = Array.from({ length: 8 }, () => Array(8).fill(null));
      tmp[hit.r][hit.c] = { type: demoType, color: 'l' };
      showMarkers(legalMoves(tmp, hit.r, hit.c));
      busy = false;
    });
    speak(['Bagus!', 'Hebat!', 'Pintar!', 'Yei!'][Math.floor(Math.random() * 4)]);
  } else if (hit && hit.isPiece) {
    popPiece(pieceMeshes[0]);
    speak(`Ini ${PIECE_NAMES[demoType]}`);
  }
}

// ---------- Interaksi mode "Main" ----------
function refreshSelectionMarkers() {
  if (!selected) { clearMarkers(); return; }
  showMarkers(legalMoves(gameBoard, selected.r, selected.c));
}
function aiTurn() {
  const mv = pickAiMove(gameBoard, 'd');
  if (!mv) { endGame('l'); return; }
  const w = pieceAt(mv.fr, mv.fc);
  const target = pieceAt(mv.tr, mv.tc);
  const captured = applyMove(gameBoard, mv.fr, mv.fc, mv.tr, mv.tc);
  const finish = () => {
    movePieceMesh(w, mv.tr, mv.tc, () => {
      maybePromote(w);
      if (captured && captured.type === 'raja') { endGame('d'); return; }
      turn = 'l'; busy = false;
      setTitle('Giliranmu!', 'Sentuh bidak Krem-mu');
    });
  };
  if (target) removePieceMesh(target, finish); else finish();
}
// menjalankan langkah pemain ke kotak (tr,tc), termasuk memakan bidak lawan
function doPlayerMove(tr, tc) {
  busy = true;
  const w = selected.wrap;
  const targetMesh = pieceAt(tr, tc);          // ambil bidak lawan sebelum papan berubah
  const captured = applyMove(gameBoard, selected.r, selected.c, tr, tc);
  clearMarkers();
  selected = null;
  const after = () => {
    movePieceMesh(w, tr, tc, () => {
      maybePromote(w);
      if (captured && captured.type === 'raja') { endGame('l'); return; }
      turn = 'd';
      setTitle('Giliran Cokelat...', 'Tunggu sebentar ya');
      setTimeout(aiTurn, 650);
    });
  };
  if (targetMesh) { speak('Hap!'); removePieceMesh(targetMesh, after); } else after();
}

function handlePlayTap(hit) {
  if (busy || turn !== 'l') return;

  // Kotak tujuan bisa berasal dari penanda ATAU dari bidak lawan yang berdiri di atasnya.
  let dest = null;
  if (hit && hit.isMarker) dest = [hit.r, hit.c];
  else if (hit && hit.isPiece) dest = [hit.wrap.userData.r, hit.wrap.userData.c];

  // Sudah memilih bidak dan tujuan adalah langkah legal -> jalankan (termasuk makan).
  if (selected && dest) {
    const legal = legalMoves(gameBoard, selected.r, selected.c)
      .some(([r, c]) => r === dest[0] && c === dest[1]);
    if (legal) { doPlayerMove(dest[0], dest[1]); return; }
  }

  // Menyentuh bidak sendiri -> pilih.
  if (hit && hit.isPiece && hit.wrap.userData.color === 'l') {
    selected = { wrap: hit.wrap, r: hit.wrap.userData.r, c: hit.wrap.userData.c };
    blip(620);
    refreshSelectionMarkers();
    setTitle('Mau ke mana?', 'Sentuh kotak bersinar');
  } else {
    selected = null; clearMarkers();
    setTitle('Giliranmu!', 'Sentuh bidak Krem-mu');
  }
}
function endGame(winner) {
  busy = true; clearMarkers(); selected = null;
  if (winner === 'l') { setTitle('Kamu Menang! 🎉', 'Sentuh "Mulai lagi" untuk main lagi'); speak('Hore! Kamu menang!'); blip(880); }
  else { setTitle('Cokelat Menang', 'Coba lagi ya, kamu pasti bisa!'); speak('Ayo coba lagi'); }
}

// ---------- Raycast tap ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pickAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects([...markerMeshes, ...pieceMeshes], true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && !o.userData.isMarker && !o.userData.isPiece) o = o.parent;
  if (!o) return null;
  if (o.userData.isMarker) return { isMarker: true, r: o.userData.r, c: o.userData.c };
  return { isPiece: true, wrap: o };
}
function onTap(clientX, clientY) {
  const hit = pickAt(clientX, clientY);
  if (mode === 'meet') {
    if (hit && hit.isPiece) { popPiece(hit.wrap); speak(`Ini ${PIECE_NAMES[hit.wrap.userData.type]}`); }
  } else if (mode === 'moves') handleMovesTap(hit);
  else handlePlayTap(hit);
}

// ---------- Pointer: orbit + tap ----------
const pointers = new Map();
let dragMoved = false, lastX = 0, lastY = 0, pinchDist = 0;
const el = renderer.domElement;
el.style.touchAction = 'none';

el.addEventListener('pointerdown', e => {
  el.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  lastX = e.clientX; lastY = e.clientY; dragMoved = false;
  if (pointers.size === 2) {
    const p = [...pointers.values()];
    pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }
});
el.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const p = [...pointers.values()];
    const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    orbit.radius = THREE.MathUtils.clamp(orbit.radius - (d - pinchDist) * 0.03, 7, 17);
    pinchDist = d; dragMoved = true; applyCamera();
    return;
  }
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true;
  orbit.theta -= dx * 0.006;
  orbit.phi = THREE.MathUtils.clamp(orbit.phi - dy * 0.006, 0.35, 1.2);
  lastX = e.clientX; lastY = e.clientY;
  if (dragMoved) applyCamera();
});
function endPointer(e) {
  if (pointers.size === 1 && !dragMoved) onTap(e.clientX, e.clientY);
  pointers.delete(e.pointerId);
}
el.addEventListener('pointerup', endPointer);
el.addEventListener('pointercancel', e => pointers.delete(e.pointerId));
el.addEventListener('wheel', e => {
  e.preventDefault();
  orbit.radius = THREE.MathUtils.clamp(orbit.radius + Math.sign(e.deltaY) * 0.8, 7, 17);
  applyCamera();
}, { passive: false });

// ---------- Tombol ----------
document.querySelectorAll('.mode-btn').forEach(b =>
  b.addEventListener('click', () => { blip(700); switchMode(b.dataset.mode); }));
btnNext.addEventListener('click', () => {
  const order = ['pion', 'kuda', 'gajah', 'benteng', 'ratu', 'raja'];
  demoType = order[(order.indexOf(demoType) + 1) % order.length];
  placeDemo();
  speak(`Ini ${PIECE_NAMES[demoType]}`);
});
btnReset.addEventListener('click', () => { blip(700); setupPlay(); });
btnMute.addEventListener('click', () => {
  muted = !muted;
  if (muted && window.speechSynthesis) window.speechSynthesis.cancel();
  btnMute.textContent = muted ? '🔇' : '🔊';
  btnMute.setAttribute('aria-label', muted ? 'Suara mati' : 'Suara nyala');
});

// ---------- Loop ----------
let prev = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  updateTweens(dt);
  // denyut penanda
  const pulse = 1 + Math.sin(now * 0.006) * 0.12;
  for (const m of markerMeshes) m.scale.set(pulse, 1, pulse);
  // putaran lembut bidak di mode "Kenali"
  if (mode === 'meet' && !reduceMotion)
    for (const w of pieceMeshes) if (!tweens.length) w.rotation.y += dt * 0.5;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---------- Resize ----------
function resize() {
  const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- Mulai ----------
resize(); applyCamera(); switchMode('meet'); requestAnimationFrame(loop);

// daftarkan service worker (PWA / offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
