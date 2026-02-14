import * as THREE from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

/**
 * Custom warp visual effects shader:
 * - Chromatic aberration (RGB channel separation radiating from center)
 * - Radial blur / speed lines
 * - Blue-tinted vignette tunnel
 * - Screen-space streaking
 *
 * All effects are controlled by a single `uIntensity` uniform (0 = off, 1 = full warp).
 */
const WarpShader = {
  name: 'WarpShader',
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.0 },    // 0-1 warp ramp
    uTime: { value: 0.0 },
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
    uniform float uIntensity;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5);
      vec2 dir = vUv - center;
      float dist = length(dir);

      // --- Chromatic Aberration ---
      // RGB channels sample at slightly different offsets from center
      float caStrength = uIntensity * 0.012; // max ~1.2% offset
      vec2 caOffset = dir * caStrength;

      float r = texture2D(tDiffuse, vUv + caOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - caOffset).b;

      vec3 color = vec3(r, g, b);

      // --- Radial blur (subtle, speed-line like) ---
      float blurStrength = uIntensity * 0.008;
      vec2 blurDir = normalize(dir) * blurStrength;
      // Accumulate samples along radial direction
      vec3 blur = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        float t = float(i) / 6.0;
        blur += texture2D(tDiffuse, vUv - blurDir * t * dist).rgb;
      }
      blur /= 6.0;
      // Mix radial blur in at the edges more
      float edgeMask = smoothstep(0.1, 0.6, dist);
      color = mix(color, blur, edgeMask * uIntensity * 0.5);

      // --- Blue-tinted tunnel vignette ---
      float vignette = smoothstep(0.2, 0.8, dist);
      vec3 warpTint = vec3(0.3, 0.5, 1.0); // blue warp color
      color = mix(color, color * warpTint, vignette * uIntensity * 0.35);

      // Darken edges for tunnel effect
      float tunnelDarken = smoothstep(0.3, 0.95, dist);
      color *= 1.0 - tunnelDarken * uIntensity * 0.3;

      // --- Subtle pulsing brightness at warp ---
      float pulse = 1.0 + sin(uTime * 3.0) * 0.03 * uIntensity;
      color *= pulse;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

export interface WarpEffectState {
  pass: ShaderPass
  /** Current transition intensity (0-1), smoothly animated */
  intensity: number
  /** Target intensity (0 or 1) */
  targetIntensity: number
  /** Warp flash brightness (decays quickly) */
  flash: number
}

/**
 * Creates the warp effect shader pass. Insert BEFORE the output pass.
 */
export function createWarpEffectPass(): WarpEffectState {
  const pass = new ShaderPass(WarpShader)
  return {
    pass,
    intensity: 0,
    targetIntensity: 0,
    flash: 0,
  }
}

/**
 * Call each frame to smoothly ramp the warp effect in/out
 * and handle the flash on engage/disengage.
 */
export function updateWarpEffect(
  warpState: WarpEffectState,
  isWarp: boolean,
  speed: number,
  elapsed: number,
  delta: number,
): void {
  const prevTarget = warpState.targetIntensity

  // Target based on warp state
  warpState.targetIntensity = isWarp ? 1.0 : 0.0

  // Detect engage/disengage transition
  if (warpState.targetIntensity !== prevTarget) {
    warpState.flash = 1.0 // trigger flash
  }

  // Smooth ramp — engage is fast (0.3s), disengage is slightly slower (0.5s)
  const rampSpeed = isWarp ? 3.5 : 2.0
  const diff = warpState.targetIntensity - warpState.intensity
  warpState.intensity += diff * Math.min(rampSpeed * delta, 1.0)

  // Clamp
  warpState.intensity = Math.max(0, Math.min(1, warpState.intensity))

  // Decay flash quickly
  warpState.flash *= Math.max(0, 1 - 5.0 * delta)
  if (warpState.flash < 0.01) warpState.flash = 0

  // Scale intensity by throttle for proportional effect
  const throttleScale = Math.min(speed / 2, 1)
  const effectiveIntensity = warpState.intensity * throttleScale

  // Update shader uniforms
  const uniforms = warpState.pass.material.uniforms
  uniforms.uIntensity.value = effectiveIntensity
  uniforms.uTime.value = elapsed
}
