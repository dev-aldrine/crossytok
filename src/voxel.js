import * as THREE from 'three';
import { applyMinecraftVoxelShader } from './shaders/voxelShader.js';

// Shared unit geometry and material cache to minimize draw overhead & GC
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const BASE_BOX = UNIT_BOX.toNonIndexed();
const BASE_POS = BASE_BOX.attributes.position.array;
const BASE_NORM = BASE_BOX.attributes.normal.array;
const VERTS_PER_BOX = 36;

const COIN_GEO = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12);
const MAT_CACHE = new Map();
const VERTEX_COLOR_MAT = applyMinecraftVoxelShader(
  new THREE.MeshLambertMaterial({ vertexColors: true })
);
const GEO_CACHE = new Map();
const TMP_COLOR = new THREE.Color();

export class VoxelBatch {
  constructor() {
    this.boxes = [];
  }

  add(w, h, d, x, y, z, color) {
    this.boxes.push(w, h, d, x, y, z, color);
  }

  toGeometry() {
    const count = this.boxes.length / 7;
    const positions = new Float32Array(count * VERTS_PER_BOX * 3);
    const normals = new Float32Array(count * VERTS_PER_BOX * 3);
    const colors = new Float32Array(count * VERTS_PER_BOX * 3);

    for (let b = 0; b < count; b++) {
      const idx = b * 7;
      const w = this.boxes[idx];
      const h = this.boxes[idx + 1];
      const d = this.boxes[idx + 2];
      const px = this.boxes[idx + 3];
      const py = this.boxes[idx + 4];
      const pz = this.boxes[idx + 5];
      TMP_COLOR.setHex(this.boxes[idx + 6]);
      const r = TMP_COLOR.r;
      const g = TMP_COLOR.g;
      const bl = TMP_COLOR.b;

      const outBase = b * VERTS_PER_BOX * 3;
      for (let v = 0; v < VERTS_PER_BOX; v++) {
        const vi = v * 3;
        const oi = outBase + vi;
        positions[oi] = BASE_POS[vi] * w + px;
        positions[oi + 1] = BASE_POS[vi + 1] * h + py;
        positions[oi + 2] = BASE_POS[vi + 2] * d + pz;

        normals[oi] = BASE_NORM[vi];
        normals[oi + 1] = BASE_NORM[vi + 1];
        normals[oi + 2] = BASE_NORM[vi + 2];

        colors[oi] = r;
        colors[oi + 1] = g;
        colors[oi + 2] = bl;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }

  toMesh(castShadow = true, receiveShadow = true) {
    if (this.boxes.length === 0) return null;
    const mesh = new THREE.Mesh(this.toGeometry(), VERTEX_COLOR_MAT);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

function getCachedVehicleMesh(key, buildFn, castShadow = true, receiveShadow = false) {
  let geo = GEO_CACHE.get(key);
  if (!geo) {
    const batch = new VoxelBatch();
    buildFn(batch);
    geo = batch.toGeometry();
    GEO_CACHE.set(key, geo);
  }
  const mesh = new THREE.Mesh(geo, VERTEX_COLOR_MAT);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

export function getMaterial(color, emissive = 0x000000) {
  const key = `${color}_${emissive}`;
  let mat = MAT_CACHE.get(key);
  if (!mat) {
    mat = applyMinecraftVoxelShader(new THREE.MeshLambertMaterial({ color, emissive }));
    MAT_CACHE.set(key, mat);
  }
  return mat;
}

export function addBox(parent, w, h, d, x, y, z, color, castShadow = true, receiveShadow = false, emissive = 0x000000) {
  const mesh = new THREE.Mesh(UNIT_BOX, getMaterial(color, emissive));
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}

export const CHARACTER_SKINS = ['chicken', 'duck', 'frog', 'fox', 'robot'];

export function createCharacter(skin = 'chicken') {
  if (skin === 'chicken') return createChicken();

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  if (skin === 'duck') {
    addBox(body, 0.08, 0.14, 0.08, -0.11, 0.07, 0.02, 0xf97316);
    addBox(body, 0.08, 0.14, 0.08, 0.11, 0.07, 0.02, 0xf97316);
    addBox(body, 0.46, 0.34, 0.52, 0, 0.31, 0, 0xfacc15);
    addBox(body, 0.08, 0.18, 0.28, -0.26, 0.31, 0.02, 0xeab308);
    addBox(body, 0.08, 0.18, 0.28, 0.26, 0.31, 0.02, 0xeab308);
    addBox(body, 0.32, 0.3, 0.3, 0, 0.61, -0.06, 0x16a34a);
    addBox(body, 0.22, 0.08, 0.18, 0, 0.58, -0.27, 0xf97316);
    addBox(body, 0.05, 0.06, 0.05, -0.15, 0.65, -0.14, 0x0f172a, false);
    addBox(body, 0.05, 0.06, 0.05, 0.15, 0.65, -0.14, 0x0f172a, false);
  } else if (skin === 'frog') {
    addBox(body, 0.14, 0.1, 0.16, -0.2, 0.05, 0.06, 0x16a34a);
    addBox(body, 0.14, 0.1, 0.16, 0.2, 0.05, 0.06, 0x16a34a);
    addBox(body, 0.48, 0.34, 0.48, 0, 0.28, 0, 0x22c55e);
    addBox(body, 0.36, 0.18, 0.44, 0, 0.19, -0.04, 0xbef264);
    addBox(body, 0.16, 0.16, 0.16, -0.15, 0.5, -0.1, 0xffffff);
    addBox(body, 0.16, 0.16, 0.16, 0.15, 0.5, -0.1, 0xffffff);
    addBox(body, 0.08, 0.08, 0.08, -0.15, 0.51, -0.17, 0x0f172a, false);
    addBox(body, 0.08, 0.08, 0.08, 0.15, 0.51, -0.17, 0x0f172a, false);
  } else if (skin === 'fox') {
    addBox(body, 0.09, 0.16, 0.09, -0.12, 0.08, 0.02, 0x1e293b);
    addBox(body, 0.09, 0.16, 0.09, 0.12, 0.08, 0.02, 0x1e293b);
    addBox(body, 0.44, 0.34, 0.52, 0, 0.32, 0, 0xf97316);
    addBox(body, 0.2, 0.16, 0.26, 0, 0.34, 0.34, 0xffffff);
    addBox(body, 0.36, 0.3, 0.32, 0, 0.62, -0.06, 0xf97316);
    addBox(body, 0.16, 0.1, 0.16, 0, 0.56, -0.26, 0xffffff);
    addBox(body, 0.08, 0.06, 0.06, 0, 0.59, -0.34, 0x0f172a, false);
    addBox(body, 0.1, 0.14, 0.08, -0.12, 0.82, -0.04, 0xea580c);
    addBox(body, 0.1, 0.14, 0.08, 0.12, 0.82, -0.04, 0xea580c);
    addBox(body, 0.05, 0.06, 0.05, -0.17, 0.65, -0.14, 0x0f172a, false);
    addBox(body, 0.05, 0.06, 0.05, 0.17, 0.65, -0.14, 0x0f172a, false);
  } else {
    // Robot
    addBox(body, 0.1, 0.16, 0.1, -0.12, 0.08, 0, 0x475569);
    addBox(body, 0.1, 0.16, 0.1, 0.12, 0.08, 0, 0x475569);
    addBox(body, 0.46, 0.38, 0.44, 0, 0.34, 0, 0x94a3b8);
    addBox(body, 0.22, 0.16, 0.06, 0, 0.36, -0.23, 0x38bdf8, false, false, 0x0284c7);
    addBox(body, 0.36, 0.32, 0.34, 0, 0.68, -0.02, 0xcbd5e1);
    addBox(body, 0.26, 0.1, 0.06, 0, 0.7, -0.19, 0xfef08a, false, false, 0xca8a04);
    addBox(body, 0.06, 0.16, 0.06, 0, 0.9, -0.02, 0xef4444, false, false, 0x991b1b);
  }

  root.userData.body = body;
  return root;
}

export function createChicken() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Legs
  addBox(body, 0.08, 0.14, 0.08, -0.11, 0.07, 0.02, 0xf97316);
  addBox(body, 0.08, 0.14, 0.08, 0.11, 0.07, 0.02, 0xf97316);

  // Main torso
  addBox(body, 0.46, 0.36, 0.5, 0, 0.32, 0, 0xffffff);
  // Wings
  addBox(body, 0.08, 0.2, 0.28, -0.26, 0.32, 0.02, 0xe2e8f0);
  addBox(body, 0.08, 0.2, 0.28, 0.26, 0.32, 0.02, 0xe2e8f0);
  // Tail
  addBox(body, 0.26, 0.16, 0.12, 0, 0.4, 0.28, 0xf1f5f9);

  // Head
  addBox(body, 0.34, 0.32, 0.32, 0, 0.64, -0.06, 0xffffff);
  // Red comb
  addBox(body, 0.1, 0.12, 0.22, 0, 0.85, -0.06, 0xef4444);
  // Beak
  addBox(body, 0.14, 0.09, 0.14, 0, 0.62, -0.27, 0xf59e0b);
  // Wattle
  addBox(body, 0.08, 0.1, 0.08, 0, 0.53, -0.22, 0xef4444);
  // Eyes
  addBox(body, 0.05, 0.06, 0.05, -0.16, 0.68, -0.14, 0x0f172a, false);
  addBox(body, 0.05, 0.06, 0.05, 0.16, 0.68, -0.14, 0x0f172a, false);

  root.userData.body = body;
  return root;
}

export function appendTreeBoxes(batch, ox, oz, variant = 0) {
  batch.add(0.34, 0.42, 0.34, ox, 0.21, oz, 0x78350f);
  if (variant === 0) {
    batch.add(0.82, 0.42, 0.82, ox, 0.62, oz, 0x16a34a);
    batch.add(0.64, 0.38, 0.64, ox, 1.0, oz, 0x22c55e);
    batch.add(0.38, 0.28, 0.38, ox, 1.32, oz, 0x4ade80);
  } else if (variant === 1) {
    batch.add(0.78, 0.52, 0.78, ox, 0.68, oz, 0x15803d);
    batch.add(0.52, 0.46, 0.52, ox, 1.15, oz, 0x22c55e);
  } else {
    batch.add(0.84, 0.46, 0.84, ox, 0.38, oz, 0x22c55e);
    batch.add(0.56, 0.22, 0.56, ox, 0.66, oz, 0x4ade80);
  }
}

export function appendSnowPineBoxes(batch, ox, oz) {
  batch.add(0.32, 0.42, 0.32, ox, 0.21, oz, 0x78350f);
  batch.add(0.82, 0.4, 0.82, ox, 0.6, oz, 0x0f766e);
  batch.add(0.64, 0.34, 0.64, ox, 0.96, oz, 0x14b8a6);
  batch.add(0.44, 0.16, 0.44, ox, 1.21, oz, 0xf8fafc);
}

export function appendCactusBoxes(batch, ox, oz) {
  batch.add(0.32, 0.95, 0.32, ox, 0.47, oz, 0x15803d);
  batch.add(0.22, 0.18, 0.22, ox - 0.26, 0.5, oz, 0x16a34a);
  batch.add(0.18, 0.36, 0.18, ox - 0.32, 0.72, oz, 0x16a34a);
  batch.add(0.22, 0.18, 0.22, ox + 0.26, 0.4, oz, 0x16a34a);
  batch.add(0.18, 0.32, 0.18, ox + 0.32, 0.58, oz, 0x16a34a);
}

export function appendRockBoxes(batch, ox, oz, variant = 0) {
  if (variant % 2 === 0) {
    batch.add(0.78, 0.4, 0.74, ox, 0.18, oz, 0x94a3b8);
    batch.add(0.52, 0.26, 0.5, ox - 0.06, 0.46, oz + 0.04, 0xcbd5e1);
    batch.add(0.32, 0.22, 0.32, ox + 0.28, 0.09, oz - 0.25, 0x64748b);
  } else {
    batch.add(0.68, 0.48, 0.66, ox + 0.04, 0.22, oz, 0x64748b);
    batch.add(0.46, 0.24, 0.44, ox + 0.02, 0.53, oz - 0.04, 0x94a3b8);
    batch.add(0.32, 0.24, 0.34, ox - 0.26, 0.1, oz + 0.22, 0xcbd5e1);
  }
}

export function createTree(variant = 0) {
  const g = new THREE.Group();
  // Trunk
  addBox(g, 0.34, 0.42, 0.34, 0, 0.21, 0, 0x78350f);

  if (variant === 0) {
    addBox(g, 0.82, 0.42, 0.82, 0, 0.62, 0, 0x16a34a);
    addBox(g, 0.64, 0.38, 0.64, 0, 1.0, 0, 0x22c55e);
    addBox(g, 0.38, 0.28, 0.38, 0, 1.32, 0, 0x4ade80);
  } else if (variant === 1) {
    addBox(g, 0.78, 0.52, 0.78, 0, 0.68, 0, 0x15803d);
    addBox(g, 0.52, 0.46, 0.52, 0, 1.15, 0, 0x22c55e);
  } else {
    // Low hedge/bush
    addBox(g, 0.84, 0.46, 0.84, 0, 0.38, 0, 0x22c55e);
    addBox(g, 0.56, 0.22, 0.56, 0, 0.66, 0, 0x4ade80);
  }
  return g;
}

export function createSnowPine() {
  const g = new THREE.Group();
  addBox(g, 0.32, 0.42, 0.32, 0, 0.21, 0, 0x78350f);
  addBox(g, 0.82, 0.4, 0.82, 0, 0.6, 0, 0x0f766e);
  addBox(g, 0.64, 0.34, 0.64, 0, 0.96, 0, 0x14b8a6);
  addBox(g, 0.44, 0.16, 0.44, 0, 1.21, 0, 0xf8fafc);
  return g;
}

export function createCactus() {
  const g = new THREE.Group();
  addBox(g, 0.32, 0.95, 0.32, 0, 0.47, 0, 0x15803d);
  addBox(g, 0.22, 0.18, 0.22, -0.26, 0.5, 0, 0x16a34a);
  addBox(g, 0.18, 0.36, 0.18, -0.32, 0.72, 0, 0x16a34a);
  addBox(g, 0.22, 0.18, 0.22, 0.26, 0.4, 0, 0x16a34a);
  addBox(g, 0.18, 0.32, 0.18, 0.32, 0.58, 0, 0x16a34a);
  return g;
}

export function createRock(variant = 0) {
  const g = new THREE.Group();
  if (variant % 2 === 0) {
    addBox(g, 0.78, 0.4, 0.74, 0, 0.18, 0, 0x94a3b8);
    addBox(g, 0.52, 0.26, 0.5, -0.06, 0.46, 0.04, 0xcbd5e1);
    addBox(g, 0.32, 0.22, 0.32, 0.28, 0.09, -0.25, 0x64748b);
  } else {
    addBox(g, 0.68, 0.48, 0.66, 0.04, 0.22, 0, 0x64748b);
    addBox(g, 0.46, 0.24, 0.44, 0.02, 0.53, -0.04, 0x94a3b8);
    addBox(g, 0.32, 0.24, 0.34, -0.26, 0.1, 0.22, 0xcbd5e1);
  }
  return g;
}

export function createLilyPad(withFlower = false) {
  const g = new THREE.Group();
  // Centered inside 1x1 tile with clean water margin around edges
  addBox(g, 0.68, 0.06, 0.68, 0, 0, 0, 0x22c55e, false, true);
  addBox(g, 0.48, 0.04, 0.48, 0, 0.04, 0, 0x4ade80, false, true);
  if (withFlower) {
    addBox(g, 0.16, 0.09, 0.16, -0.14, 0.09, 0.14, 0xf472b6, false, false);
    addBox(g, 0.08, 0.07, 0.08, -0.14, 0.15, 0.14, 0xfef08a, false, false);
  }
  g.position.y = -0.05;
  g.userData.baseY = -0.05;
  g.userData.sink = 0;
  return g;
}

const CAR_COLORS = [0xef4444, 0x3b82f6, 0xf59e0b, 0xa855f7, 0x10b981, 0xec4899];

export function createCar(colorIndex = 0) {
  const ci = colorIndex % CAR_COLORS.length;
  return getCachedVehicleMesh(`car_${ci}`, (b) => {
    const color = CAR_COLORS[ci];
    b.add(1.45, 0.34, 0.76, 0, 0.27, 0, color);
    b.add(0.78, 0.28, 0.66, -0.06, 0.56, 0, 0xf8fafc);
    b.add(0.82, 0.16, 0.68, -0.06, 0.54, 0, 0x38bdf8);
    b.add(0.06, 0.1, 0.14, 0.73, 0.28, -0.24, 0xfef08a);
    b.add(0.06, 0.1, 0.14, 0.73, 0.28, 0.24, 0xfef08a);
    b.add(0.06, 0.1, 0.14, -0.73, 0.28, -0.24, 0xef4444);
    b.add(0.06, 0.1, 0.14, -0.73, 0.28, 0.24, 0xef4444);
    for (const [wx, wz] of [
      [-0.44, -0.36],
      [0.44, -0.36],
      [-0.44, 0.36],
      [0.44, 0.36],
    ]) {
      b.add(0.24, 0.22, 0.1, wx, 0.11, wz, 0x1e293b);
    }
  });
}

export function createSportsCar(colorIndex = 0) {
  const palette = [0xef4444, 0xfacc15, 0x06b6d4, 0xa855f7];
  const ci = colorIndex % palette.length;
  return getCachedVehicleMesh(`sports_${ci}`, (b) => {
    const color = palette[ci];
    b.add(1.52, 0.24, 0.78, 0, 0.21, 0, color);
    b.add(0.68, 0.22, 0.64, -0.08, 0.42, 0, 0xf8fafc);
    b.add(0.72, 0.13, 0.66, -0.08, 0.41, 0, 0x38bdf8);
    b.add(0.14, 0.12, 0.74, -0.66, 0.39, 0, 0x1e293b);
    b.add(0.06, 0.08, 0.14, 0.76, 0.22, -0.24, 0xfef08a);
    b.add(0.06, 0.08, 0.14, 0.76, 0.22, 0.24, 0xfef08a);
    b.add(0.06, 0.08, 0.14, -0.76, 0.22, -0.24, 0xef4444);
    b.add(0.06, 0.08, 0.14, -0.76, 0.22, 0.24, 0xef4444);
    for (const [wx, wz] of [
      [-0.48, -0.37],
      [0.48, -0.37],
      [-0.48, 0.37],
      [0.48, 0.37],
    ]) {
      b.add(0.24, 0.2, 0.1, wx, 0.1, wz, 0x0f172a);
    }
  });
}

export function createBus(colorIndex = 0) {
  const ci = colorIndex % 2;
  return getCachedVehicleMesh(`bus_${ci}`, (b) => {
    const bodyColor = ci === 0 ? 0xfacc15 : 0x38bdf8;
    b.add(2.55, 0.68, 0.82, 0, 0.46, 0, bodyColor);
    b.add(2.38, 0.1, 0.74, 0, 0.84, 0, 0xf8fafc);
    b.add(2.2, 0.2, 0.84, 0.05, 0.56, 0, 0x1e293b);
    b.add(0.06, 0.1, 0.16, 1.28, 0.24, -0.24, 0xfef08a);
    b.add(0.06, 0.1, 0.16, 1.28, 0.24, 0.24, 0xfef08a);
    b.add(0.06, 0.1, 0.16, -1.28, 0.24, -0.24, 0xef4444);
    b.add(0.06, 0.1, 0.16, -1.28, 0.24, 0.24, 0xef4444);
    for (const wx of [-0.9, 0.9]) {
      b.add(0.28, 0.24, 0.1, wx, 0.12, -0.38, 0x0f172a);
      b.add(0.28, 0.24, 0.1, wx, 0.12, 0.38, 0x0f172a);
    }
  });
}

const TRUCK_COLORS = [0x0ea5e9, 0xf97316, 0x14b8a6, 0xe11d48];

export function createTruck(colorIndex = 0) {
  const ci = colorIndex % TRUCK_COLORS.length;
  return getCachedVehicleMesh(`truck_${ci}`, (b) => {
    const cabColor = TRUCK_COLORS[ci];
    b.add(1.75, 0.68, 0.82, -0.35, 0.5, 0, 0xf1f5f9);
    b.add(1.77, 0.14, 0.84, -0.35, 0.5, 0, cabColor);
    b.add(0.62, 0.52, 0.78, 0.88, 0.42, 0, cabColor);
    b.add(0.12, 0.22, 0.68, 1.15, 0.52, 0, 0x38bdf8);
    b.add(0.06, 0.1, 0.14, 1.2, 0.26, -0.24, 0xfef08a);
    b.add(0.06, 0.1, 0.14, 1.2, 0.26, 0.24, 0xfef08a);
    for (const wx of [-0.95, -0.35, 0.85]) {
      b.add(0.26, 0.24, 0.12, wx, 0.12, -0.38, 0x1e293b);
      b.add(0.26, 0.24, 0.12, wx, 0.12, 0.38, 0x1e293b);
    }
  });
}

export function createLog(length = 2.6) {
  const mesh = getCachedVehicleMesh(
    `log_${length}`,
    (b) => {
      b.add(length, 0.26, 0.74, 0, -0.02, 0, 0x92400e);
      b.add(length - 0.16, 0.06, 0.56, 0, 0.12, 0, 0xb45309);
    },
    false,
    true
  );
  mesh.userData.baseY = 0;
  mesh.userData.sink = 0;
  return mesh;
}

export function createTrain() {
  return getCachedVehicleMesh('train', (b) => {
    const segments = 3;
    const segLen = 2.6;
    const gap = 0.2;
    const totalOffset = ((segments - 1) * (segLen + gap)) / 2;

    for (let i = 0; i < segments; i++) {
      const x = i * (segLen + gap) - totalOffset;
      const isFront = i === segments - 1;
      b.add(segLen, 0.74, 0.84, x, 0.48, 0, isFront ? 0xef4444 : 0x334155);
      b.add(segLen - 0.1, 0.12, 0.74, x, 0.9, 0, 0x94a3b8);
      b.add(segLen - 0.3, 0.22, 0.86, x, 0.58, 0, 0xfef08a);
      if (isFront) {
        b.add(0.2, 0.22, 0.68, x + segLen * 0.5 + 0.05, 0.26, 0, 0xfacc15);
      }
    }
  });
}

export function createCoin() {
  const mesh = new THREE.Mesh(COIN_GEO, getMaterial(0xfacc15, 0x713f12));
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = 0.36;
  mesh.castShadow = true;
  return mesh;
}

export function createParticleCube(color) {
  const mesh = new THREE.Mesh(UNIT_BOX, getMaterial(color));
  mesh.scale.setScalar(0.14);
  mesh.castShadow = false;
  return mesh;
}
