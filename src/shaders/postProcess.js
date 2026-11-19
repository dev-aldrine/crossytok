import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const AtmosphereGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.04 },
    uVignette: { value: 0.32 },
    uWarmth: { value: new THREE.Color(1.04, 1.0, 0.95) },
    uSunGlow: { value: new THREE.Color(0xfffbeb) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uVignette;
    uniform vec3 uWarmth;
    uniform vec3 uSunGlow;
    varying vec2 vUv;

    // ACES Filmic curve (prevents white-out on snow/clouds & preserves night contrast)
    vec3 acesFilm(vec3 x) {
      float a = 2.51;
      float b = 0.03;
      float c = 2.43;
      float d = 0.59;
      float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb * uExposure * uWarmth;

      // Subtle Minecraft-style diagonal sun-glare / atmospheric haze from top-right
      float sunDir = clamp(dot(vUv - vec2(0.15, 0.15), vec2(0.7, 0.7)), 0.0, 1.0);
      col += uSunGlow * pow(sunDir, 2.2) * 0.085;

      // Vibrant saturation & contrast boost
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.18);
      col = (col - 0.5) * 1.06 + 0.5;
      col = max(col, 0.0);

      // Soft screen-space vignette
      vec2 centered = vUv - 0.5;
      float vig = 1.0 - dot(centered, centered) * uVignette * 2.4;
      col *= clamp(vig, 0.62, 1.0);

      col = acesFilm(col);
      // sRGB gamma encode
      col = pow(col, vec3(1.0 / 2.2));
      gl_FragColor = vec4(col, tex.a);
    }
  `,
};

export class PostPipeline {
  constructor(renderer, scene, camera, width, height) {
    this.renderer = renderer;
    this.enabled = true;

    const rt = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Subtle dreamy bloom on sunlit surfaces, coins, headlights, and water foam
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.44, // strength
      0.45, // radius
      0.66  // threshold
    );
    this.composer.addPass(this.bloomPass);

    this.gradePass = new ShaderPass(AtmosphereGradeShader);
    this.composer.addPass(this.gradePass);
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  setAtmosphere(exposure, warmthColor, bloomStrength = 0.44) {
    this.gradePass.uniforms.uExposure.value = exposure;
    this.gradePass.uniforms.uWarmth.value.copy(warmthColor);
    this.bloomPass.strength = bloomStrength;
  }

  render(scene, camera) {
    if (this.enabled) {
      this.composer.render();
    } else {
      this.renderer.render(scene, camera);
    }
  }
}
