import * as THREE from 'three';

// Shared geometry & single-pass Voronoi caustics shader across all river lanes
const WATER_GEO = new THREE.PlaneGeometry(1, 1, 16, 2);
WATER_GEO.rotateX(-Math.PI / 2);

const WATER_MAT = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
  uniforms: {
    uTime: { value: 0 },
    uShallowColor: { value: new THREE.Color(0x7dd3fc) },
    uDeepColor: { value: new THREE.Color(0x0ea5e9) },
    uCausticColor: { value: new THREE.Color(0xf0f9ff) },
    uRipple: { value: new THREE.Vector4(0, 0, -100, 0) },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    varying float vWave;

    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      float wave = sin(worldPos.x * 1.3 + uTime * 2.1 + worldPos.z * 0.8) * 0.022
                 + cos(worldPos.x * 2.1 - uTime * 1.6 + worldPos.z * 1.4) * 0.012;
      worldPos.y += wave;
      vWave = wave;
      vWorldPos = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uShallowColor;
    uniform vec3 uDeepColor;
    uniform vec3 uCausticColor;
    uniform vec4 uRipple;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    varying float vWave;

    vec2 hash22(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.xx + p3.yz) * p3.zy);
    }

    // Single-pass 3x3 Voronoi edge distance (f2 - f1) — ~4x faster than two-pass
    float voronoiEdge(vec2 x, float t) {
      vec2 n = floor(x);
      vec2 f = fract(x);
      float f1 = 8.0;
      float f2 = 8.0;

      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 o = hash22(n + g);
          o = 0.5 + 0.4 * sin(t + 6.2831 * o);
          vec2 r = g + o - f;
          float d = dot(r, r);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) {
            f2 = d;
          }
        }
      }
      return sqrt(f2) - sqrt(f1);
    }

    void main() {
      vec2 p = vWorldPos.xz;

      // Single-pass subtle Voronoi caustics
      float c1 = voronoiEdge(p * 1.25 + vec2(uTime * 0.12, 0.0), uTime * 1.0);
      float caustics = 1.0 - smoothstep(0.02, 0.12, c1);

      // Depth gradient from center to bank
      float edgeDist = abs(vUv.y - 0.5) * 2.0; // 0 in center, 1 at bank
      vec3 baseCol = mix(uDeepColor, uShallowColor, 0.32 + 0.42 * edgeDist + vWave * 3.5);

      // Animated shoreline foam along both river edges
      float foamWave = sin(p.x * 3.2 + uTime * 2.4) * 0.05 + cos(p.x * 5.7 - uTime * 1.7) * 0.03;
      float shoreMask = smoothstep(0.72 + foamWave, 0.92 + foamWave, edgeDist);
      float foamNoise = smoothstep(0.08, 0.28, c1);
      float bankFoam = clamp(shoreMask * (0.65 + 0.35 * foamNoise), 0.0, 1.0);

      // Expanding circular splash ripple from jumping off/on logs & lily pads
      float rippleAge = uTime - uRipple.z;
      float splashRing = 0.0;
      if (uRipple.w > 0.5 && rippleAge >= 0.0 && rippleAge < 0.9) {
        float dist = length(p - uRipple.xy);
        float radius = rippleAge * 1.85;
        float ring = exp(-abs(dist - radius) * 14.0);
        splashRing = ring * (1.0 - rippleAge / 0.9) * 0.85;
      }

      vec3 col = mix(baseCol, uCausticColor, clamp(caustics * 0.34 + bankFoam * 0.85 + splashRing, 0.0, 1.0));

      float alpha = mix(0.70, 0.92, clamp(caustics * 0.25 + bankFoam * 0.8 + splashRing * 0.6, 0.0, 1.0));
      gl_FragColor = vec4(col, alpha);
    }
  `,
});

export function updateWaterShader(elapsed) {
  WATER_MAT.uniforms.uTime.value = elapsed;
}

export function triggerWaterRipple(x, z, elapsed) {
  WATER_MAT.uniforms.uRipple.value.set(x, z, elapsed, 1.0);
}

export function createWaterStrip(width, depth = 1) {
  const mesh = new THREE.Mesh(WATER_GEO, WATER_MAT);
  mesh.scale.set(width, 1, depth);
  mesh.position.set(0, -0.07, 0);
  mesh.renderOrder = 2;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}
