import * as THREE from 'three'
import type { GameState } from './game-state'

// Camera offset behind and above the ship (in ship-local space)
const BASE_OFFSET = new THREE.Vector3(0, 3.0, 11)
const WARP_OFFSET = new THREE.Vector3(0, 3.0, 12)  // pull back further at warp

// Smoothing factor (lower = smoother/laggier, higher = snappier)
const POSITION_LERP = 3.0
const ROTATION_LERP = 4.0

// FOV range — dramatic zoom at warp
const FOV_MIN = 50    // stationary
const FOV_MAX = 90    // warp speed (tunnel vision effect)

const _desiredPos = new THREE.Vector3()
const _offset = new THREE.Vector3()
const _lookTarget = new THREE.Vector3()
const _shipForward = new THREE.Vector3()

/**
 * Updates the camera to follow behind the ship with smooth interpolation.
 * Call each frame after updateShip().
 */
export function updateCamera(
  camera: THREE.PerspectiveCamera,
  state: GameState,
  delta: number,
): void {
  // Compute world-space offset: lerp between normal and warp camera positions
  const warpLerp = state.isWarp ? Math.min(state.speed / 4, 1) : 0
  _offset.lerpVectors(BASE_OFFSET, WARP_OFFSET, warpLerp)
  _offset.applyQuaternion(state.quaternion)
  _desiredPos.copy(state.position).add(_offset)

  // Smooth position follow
  const posAlpha = 1 - Math.exp(-POSITION_LERP * delta)
  camera.position.lerp(_desiredPos, posAlpha)

  // Look at a point slightly ahead of the ship
  _shipForward.set(0, 0, -1).applyQuaternion(state.quaternion)
  _lookTarget.copy(state.position).addScaledVector(_shipForward, 3)

  // Smooth rotation by looking at an interpolated target
  const rotAlpha = 1 - Math.exp(-ROTATION_LERP * delta)
  const currentTarget = new THREE.Vector3()
  camera.getWorldDirection(currentTarget)
  currentTarget.multiplyScalar(10).add(camera.position)
  currentTarget.lerp(_lookTarget, rotAlpha)
  camera.lookAt(currentTarget)

  // Dynamic FOV based on speed — noticeable at impulse, dramatic at warp
  const speedNorm = Math.min(state.speed / 3, 1) // hits max faster
  const eased = speedNorm * speedNorm // quadratic for punch at higher speeds
  const targetFov = FOV_MIN + (FOV_MAX - FOV_MIN) * eased
  camera.fov += (targetFov - camera.fov) * posAlpha
  camera.updateProjectionMatrix()
}
