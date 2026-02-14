import * as THREE from 'three'
import type { EmissiveElement } from './model-loader'
import type { LightingSetup } from './lighting'
import type { PostProcessingSetup } from './post-processing'

export interface AnimationState {
  emissives: EmissiveElement[]
  lighting: LightingSetup
  starfield: THREE.Points | null
  /** Optional — set once post-processing is available */
  postProcessing?: PostProcessingSetup
  /** Current game speed (0-1 impulse, >1 warp). Updated from game loop. */
  speed?: number
  /** True when at warp */
  isWarp?: boolean
}

/**
 * Updates all animated elements each frame.
 * - Navigation light blinking
 * - Nacelle point light pulsing (intensity scales with speed)
 * - Deflector / impulse point light variation
 * - Starfield twinkling
 * - Post-processing bloom boost at warp
 * - Camera shake at high speed
 */
export function updateAnimations(
  state: AnimationState,
  elapsedTime: number,
  camera?: THREE.PerspectiveCamera,
): void {
  const speed = state.speed ?? 0
  const isWarp = state.isWarp ?? false

  // Animate emissive glow meshes (currently only nav lights)
  for (const emissive of state.emissives) {
    const mat = emissive.mesh.material as THREE.MeshStandardMaterial

    if (emissive.type === 'navlight') {
      // Classic blinking pattern: on for 1s, off for 0.5s
      const blinkCycle = elapsedTime % 1.5
      const isOn = blinkCycle < 1.0
      mat.emissiveIntensity = isOn ? emissive.baseIntensity : 0.1
      mat.opacity = isOn ? 1.0 : 0.2
      mat.transparent = true
    }
  }

  // Animate point lights for hull illumination — intensity scales with speed
  if (state.lighting) {
    const speedBoost = 1.0 + speed * 0.5 // 1x at stop, 1.5x at full impulse, higher at warp

    // Nacelle point lights - pulse with speed-dependent intensity
    const nacellePulse = Math.sin(elapsedTime * (1.5 + speed * 2)) * 0.1 + 1.0
    const nacelleBase = 1.5 * speedBoost
    for (const light of state.lighting.nacellePointLights) {
      light.intensity = nacelleBase * nacellePulse
    }

    // Deflector point light
    const deflectorPulse = Math.sin(elapsedTime * 0.8) * 0.15 + 1.0
    state.lighting.deflectorPointLight.intensity = 1.0 * deflectorPulse * speedBoost

    // Impulse engine point light - brighter when moving
    const impulseFlicker = Math.sin(elapsedTime * 8.0) * 0.05 + 1.0
    const impulseBase = 0.8 + speed * 1.5
    state.lighting.impulsePointLight.intensity = impulseBase * impulseFlicker
  }

  // Update starfield shader time uniform for twinkling
  if (state.starfield) {
    const starMat = state.starfield.material as THREE.ShaderMaterial
    if (starMat.uniforms.uTime) {
      starMat.uniforms.uTime.value = elapsedTime
    }
  }

  // Dynamic bloom at warp — dramatic glow
  if (state.postProcessing) {
    const targetStrength = isWarp ? 0.7 : 0.2
    const targetRadius = isWarp ? 0.4 : 0.2
    const currentStrength = state.postProcessing.bloomPass.strength
    const currentRadius = state.postProcessing.bloomPass.radius
    state.postProcessing.bloomPass.strength +=
      (targetStrength - currentStrength) * 0.06
    state.postProcessing.bloomPass.radius +=
      (targetRadius - currentRadius) * 0.06
  }

  // Camera shake at warp — subtle rumble
  if (camera && speed > 1.5) {
    const shakeIntensity = Math.min((speed - 1.5) * 0.002, 0.012)
    camera.position.x += (Math.random() - 0.5) * shakeIntensity
    camera.position.y += (Math.random() - 0.5) * shakeIntensity
  }
}
