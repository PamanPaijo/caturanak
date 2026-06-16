// pieces.js — membangun bidak catur 3D bergaya mainan kayu yang ramah balita.
// Semua bidak dibangun dari bentuk dasar (silinder, bola, kotak, kerucut)
// agar gemuk, membulat, dan mudah dikenali anak.

import * as THREE from 'three';

// Warna "kayu" dua pasukan + aksen
export const TEAM = {
  l: { body: 0xF3D9A8, dark: 0xE3BE7E, name: 'Krem' },   // maple terang
  d: { body: 0xA9743F, dark: 0x8A5A2C, name: 'Cokelat' }, // walnut gelap
};

export const PIECE_NAMES = {
  pion: 'Pion', benteng: 'Benteng', kuda: 'Kuda',
  gajah: 'Gajah', ratu: 'Ratu', raja: 'Raja',
};

export const PIECE_VALUE = { pion: 1, kuda: 3, gajah: 3, benteng: 5, ratu: 9, raja: 100 };

function makeMaterial(hex) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.0 });
}

// helper menambahkan mesh ke grup dengan posisi
function add(group, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = false;
  group.add(m);
  return m;
}

// alas membulat dipakai semua bidak
function base(group, mat, r = 0.32, h = 0.18) {
  add(group, new THREE.CylinderGeometry(r, r * 1.05, h, 28), mat, 0, h / 2, 0);
}

function makePion(mat) {
  const g = new THREE.Group();
  base(g, mat, 0.26, 0.14);
  add(g, new THREE.CylinderGeometry(0.13, 0.2, 0.22, 24), mat, 0, 0.25, 0);
  add(g, new THREE.SphereGeometry(0.18, 24, 20), mat, 0, 0.46, 0);
  return g;
}

function makeBenteng(mat) {
  const g = new THREE.Group();
  base(g, mat, 0.3, 0.16);
  add(g, new THREE.CylinderGeometry(0.23, 0.27, 0.5, 24), mat, 0, 0.41, 0);
  // mahkota benteng: silinder lebar + empat "gigi" kotak
  add(g, new THREE.CylinderGeometry(0.28, 0.26, 0.12, 24), mat, 0, 0.72, 0);
  const tooth = new THREE.BoxGeometry(0.1, 0.14, 0.1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    add(g, tooth, mat, Math.cos(a) * 0.19, 0.83, Math.sin(a) * 0.19);
  }
  return g;
}

function makeGajah(mat) {
  const g = new THREE.Group();
  base(g, mat, 0.28, 0.16);
  add(g, new THREE.ConeGeometry(0.26, 0.6, 24), mat, 0, 0.46, 0);
  add(g, new THREE.SphereGeometry(0.15, 24, 20), mat, 0, 0.82, 0);
  add(g, new THREE.SphereGeometry(0.06, 16, 14), mat, 0, 0.98, 0);
  return g;
}

function makeKuda(mat) {
  const g = new THREE.Group();
  base(g, mat, 0.3, 0.16);
  add(g, new THREE.CylinderGeometry(0.2, 0.24, 0.3, 22), mat, 0, 0.31, 0);
  // leher miring
  add(g, new THREE.BoxGeometry(0.26, 0.5, 0.22), mat, 0, 0.6, 0.02, -0.35, 0, 0);
  // kepala/moncong ke depan
  const head = add(g, new THREE.BoxGeometry(0.34, 0.26, 0.5), mat, 0, 0.82, 0.14, 0.1, 0, 0);
  head.geometry.translate(0, 0, 0);
  // telinga
  const ear = new THREE.ConeGeometry(0.05, 0.14, 12);
  add(g, ear, mat, -0.1, 1.02, -0.05);
  add(g, ear, mat, 0.1, 1.02, -0.05);
  // mata (dua titik gelap)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.6 });
  const eye = new THREE.SphereGeometry(0.035, 12, 10);
  add(g, eye, eyeMat, -0.12, 0.86, 0.28);
  add(g, eye, eyeMat, 0.12, 0.86, 0.28);
  return g;
}

function makeRatu(mat) {
  const g = new THREE.Group();
  base(g, mat, 0.3, 0.16);
  add(g, new THREE.CylinderGeometry(0.15, 0.26, 0.7, 24), mat, 0, 0.51, 0);
  add(g, new THREE.SphereGeometry(0.16, 24, 20), mat, 0, 0.9, 0);
  // mahkota: bola-bola kecil melingkar
  const ball = new THREE.SphereGeometry(0.07, 16, 14);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(g, ball, mat, Math.cos(a) * 0.17, 1.04, Math.sin(a) * 0.17);
  }
  add(g, new THREE.SphereGeometry(0.08, 16, 14), mat, 0, 1.12, 0);
  return g;
}

function makeRaja(mat) {
  const g = new THREE.Group();
  base(g, mat, 0.32, 0.18);
  add(g, new THREE.CylinderGeometry(0.16, 0.28, 0.8, 24), mat, 0, 0.58, 0);
  add(g, new THREE.SphereGeometry(0.18, 24, 20), mat, 0, 1.05, 0);
  // salib di puncak
  add(g, new THREE.BoxGeometry(0.09, 0.34, 0.09), mat, 0, 1.32, 0);
  add(g, new THREE.BoxGeometry(0.26, 0.09, 0.09), mat, 0, 1.34, 0);
  return g;
}

const BUILDERS = {
  pion: makePion, benteng: makeBenteng, kuda: makeKuda,
  gajah: makeGajah, ratu: makeRatu, raja: makeRaja,
};

// Membuat satu bidak lengkap. color = 'l' | 'd'
export function makePiece(type, color) {
  const mat = makeMaterial(TEAM[color].body);
  const piece = BUILDERS[type](mat);
  const wrap = new THREE.Group();
  wrap.add(piece);
  wrap.userData = { type, color, isPiece: true, baseY: 0 };
  return wrap;
}

// Membuat papan 8x8 + nampan kayu. squareSize = 1.
export function makeBoard() {
  const group = new THREE.Group();
  const S = 1;
  const light = new THREE.MeshStandardMaterial({ color: 0xFFF3D6, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0xA8D88A, roughness: 0.7 });
  const tileGeo = new THREE.BoxGeometry(S, 0.2, S);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const m = new THREE.Mesh(tileGeo, (r + c) % 2 === 0 ? light : dark);
      m.position.set(c - 3.5, -0.1, r - 3.5);
      m.receiveShadow = true;
      m.userData = { isTile: true, r, c };
      group.add(m);
    }
  }
  // bingkai nampan
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9C6B3F, roughness: 0.6 });
  const tray = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.34, 9.2), frameMat);
  tray.position.set(0, -0.22, 0);
  tray.receiveShadow = true;
  group.add(tray);
  return group;
}

// posisi dunia dari koordinat papan
export function squareToWorld(r, c) {
  return new THREE.Vector3(c - 3.5, 0, r - 3.5);
}
