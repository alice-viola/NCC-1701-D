import * as THREE from 'three'
import type { GameState } from './game-state'

export interface ShieldSystemState {
  mesh: THREE.Mesh
  active: boolean
  /** Tracks the pulse animation when shields are toggled */
  pulseTime: number
}

// Shield bubble slightly larger than the ship bounding box (~10 units long)
const SHIELD_RADIUS = 6.5
const SHIELD_SEGMENTS = 64

/**
 * Creates the shield sphere mesh with a custom hex-grid shader.
 * The mesh is initially invisible and gets added to the ship group.
 */
export function createShieldSystem(): ShieldSystemState {
  const geo = new THREE.SphereGeometry(SHIELD_RADIUS, SHIELD_SEGMENTS, SHIELD_SEGMENTS)

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uStrength: { value: 1.0 },
      uPulse: { value: 0 },
      uColor: { value: new THREE.Color(0x3388ff) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uStrength;
      uniform float uPulse;
      uniform vec3 uColor;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

      // Hex grid pattern
      float hexGrid(vec2 p) {
        vec2 q = vec2(p.x * 2.0, p.y * 2.0 * 1.1547);
        vec2 pi = floor(q);
        vec2 pf = fract(q) - 0.5;

        float isOdd = mod(pi.x + pi.y, 2.0);
        pf.x += isOdd * 0.5;
        pf = fract(pf + 0.5) - 0.5;

        float d = length(pf);
        float edge = smoothstep(0.4, 0.45, d);
        return edge;
      }

      void main() {
        // Strong fresnel — only edges visible, center nearly invisible
        float fresnel = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
        fresnel = pow(fresnel, 4.0);

        // Animated hex grid — very faint
        vec2 hexCoord = vPosition.xy * 1.5 + vec2(vPosition.z * 0.3);
        float hex = hexGrid(hexCoord + uTime * 0.1);

        // Only show hex lines at edges
        float alpha = uOpacity * (fresnel * 0.5 + hex * fresnel * 0.1);

        // Strength-based color shift (weaker = more red)
        vec3 color = mix(vec3(1.0, 0.3, 0.2), uColor, uStrength);

        // Pulse effect on toggle (brief flash)
        alpha += uPulse * fresnel * 0.3;

        // Very subtle energy flow at edges only
        float flow = sin(vPosition.y * 4.0 + uTime * 2.0) * 0.02;
        alpha += flow * uOpacity * fresnel;

        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.25));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.visible = false

  return {
    mesh,
    active: false,
    pulseTime: 0,
  }
}

/**
 * Updates shield visuals each frame.
 */
export function updateShields(
  shield: ShieldSystemState,
  gameState: GameState,
  elapsed: number,
  delta: number,
): void {
  const mat = shield.mesh.material as THREE.ShaderMaterial

  // Sync active state
  const wasActive = shield.active
  shield.active = gameState.shieldsActive

  // Trigger pulse on toggle
  if (shield.active !== wasActive) {
    shield.pulseTime = 0.5
  }

  // Decay pulse
  if (shield.pulseTime > 0) {
    shield.pulseTime = Math.max(0, shield.pulseTime - delta)
  }

  // Animate opacity (smooth on/off)
  const targetOpacity = shield.active ? 0.3 : 0
  const currentOpacity = mat.uniforms.uOpacity!.value as number
  mat.uniforms.uOpacity!.value = currentOpacity + (targetOpacity - currentOpacity) * Math.min(1, delta * 5)

  // Show/hide mesh
  if (mat.uniforms.uOpacity!.value > 0.001) {
    shield.mesh.visible = true
  } else {
    shield.mesh.visible = false
  }

  // Update uniforms
  mat.uniforms.uTime!.value = elapsed
  mat.uniforms.uStrength!.value = gameState.shieldStrength / 100
  mat.uniforms.uPulse!.value = shield.pulseTime * 2 // 0 to 1
}
