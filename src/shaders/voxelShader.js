import * as THREE from 'three';

// Shared uniforms updated once per frame for biome-aware Minecraft-style lighting
export const voxelLightingUniforms = {
  uSkyTint: { value: new THREE.Color(0xbae6fd) },
  uSunTint: { value: new THREE.Color(0xfff7ed) },
  uAoStrength: { value: 0.28 },
  uNightFactor: { value: 0.0 },
};

/**
 * Enhances a MeshLambertMaterial with Minecraft-style vertex/world AO,
 * cool sky-tinted shadows, and warm emissive/headlight glow while keeping
 * Three.js directional shadow maps & fog intact.
 */
export function applyMinecraftVoxelShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSkyTint = voxelLightingUniforms.uSkyTint;
    shader.uniforms.uSunTint = voxelLightingUniforms.uSunTint;
    shader.uniforms.uAoStrength = voxelLightingUniforms.uAoStrength;
    shader.uniforms.uNightFactor = voxelLightingUniforms.uNightFactor;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vMcWorldPos;
        varying vec3 vMcWorldNormal;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 mcWp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mcWp = instanceMatrix * mcWp;
        #endif
        mcWp = modelMatrix * mcWp;
        vMcWorldPos = mcWp.xyz;
        vMcWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSkyTint;
        uniform vec3 uSunTint;
        uniform float uAoStrength;
        uniform float uNightFactor;
        varying vec3 vMcWorldPos;
        varying vec3 vMcWorldNormal;`
      )
      .replace(
        '#include <opaque_fragment>',
        `
        // Ground & crevice ambient occlusion (grounds props, vehicles, and lane seams)
        float skyExposure = smoothstep(-0.28, 0.85, vMcWorldPos.y);
        float normalLift = clamp(vMcWorldNormal.y * 0.5 + 0.5, 0.0, 1.0);
        float mcAo = mix(1.0 - uAoStrength, 1.0, skyExposure * (0.65 + 0.35 * normalLift));
        outgoingLight *= mcAo;

        // Cool sky-tint in shadow/side faces + subtle warm sun lift on top faces
        vec3 shadowTint = mix(vec3(1.0), uSkyTint, 0.14 + 0.12 * uNightFactor);
        outgoingLight *= mix(shadowTint, uSunTint, normalLift * 0.45);

        // Night-time warm emissive boost for headlights/taillights/windows (high-saturation warm/bright hues)
        #ifdef USE_COLOR
          float lum = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
          float isLamp = smoothstep(0.78, 0.96, lum) * step(0.15, vColor.r - vColor.b);
          outgoingLight += vColor.rgb * isLamp * (0.25 + 0.85 * uNightFactor);
        #endif

        #include <opaque_fragment>`
      );
  };
  material.customProgramCacheKey = () => 'mc_voxel_lambert_v1';
  return material;
}
