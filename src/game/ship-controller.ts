import * as THREE from 'three'
import type { GameState } from './game-state'
import type { InputManager } from './input-manager'

// Rotation speeds (radians per second)
const PITCH_SPEED = 0.8
const YAW_SPEED = 0.8
const ROLL_SPEED = 1.0

// Throttle
const IMPULSE_MAX_SPEED = 1.0
const WARP_MULTIPLIER = 8.0

// Movement scale (world units per second at speed=1)
const MOVEMENT_SCALE = 15.0

// Phaser recharge rate (per second)
const PHASER_RECHARGE = 10

// Helper vectors (reused to avoid GC)
const _tempQuat = new THREE.Quaternion()
const _forward = new THREE.Vector3()

/**
 * Reads input each frame and updates the game state's ship transform,
 * speed, and weapon triggers.
 *
 * Controls:
 *   S/W   — Pitch (nose up / down)
 *   Q/E   — Yaw (turn left / right)
 *   A/D   — Roll (bank left / right)
 *   0-9   — Set throttle directly
 *   Caps  — Toggle warp
 *   Shift — Toggle shields
 *   Space — Fire phasers (hold)
 *   T     — Fire torpedo (press)
 */
export function updateShip(
  state: GameState,
  input: InputManager,
  delta: number,
): void {
  // --- Rotation (WASDQE) ---
  let pitchDelta = 0
  let yawDelta = 0
  let rollDelta = 0

  if (input.isPressed('KeyS'))  pitchDelta = +PITCH_SPEED * delta
  if (input.isPressed('KeyW'))  pitchDelta = -PITCH_SPEED * delta
  if (input.isPressed('KeyQ'))  yawDelta = +YAW_SPEED * delta
  if (input.isPressed('KeyE'))  yawDelta = -YAW_SPEED * delta
  if (input.isPressed('KeyA'))  rollDelta = +ROLL_SPEED * delta
  if (input.isPressed('KeyD'))  rollDelta = -ROLL_SPEED * delta

  // Apply rotations in local space (pitch around X, yaw around Y, roll around Z)
  if (pitchDelta !== 0) {
    _tempQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchDelta)
    state.quaternion.multiply(_tempQuat)
  }
  if (yawDelta !== 0) {
    _tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawDelta)
    state.quaternion.multiply(_tempQuat)
  }
  if (rollDelta !== 0) {
    _tempQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rollDelta)
    state.quaternion.multiply(_tempQuat)
  }
  state.quaternion.normalize()

  // --- Throttle (number keys 0-9) ---
  for (let d = 0; d <= 9; d++) {
    if (input.wasJustPressed(`Digit${d}`)) {
      state.throttle = d === 0 ? 0 : d / 9
    }
  }

  // --- Warp toggle (CapsLock) ---
  if (input.wasJustPressed('CapsLock')) {
    if (!state.isWarp && state.throttle > 0.1) {
      state.isWarp = true
    } else {
      state.isWarp = false
    }
  }
  // Auto-disengage warp if throttle drops too low
  if (state.isWarp && state.throttle <= 0.05) {
    state.isWarp = false
  }

  // Compute effective speed with smooth acceleration
  const targetSpeed = state.throttle * IMPULSE_MAX_SPEED
  const effectiveTarget = state.isWarp ? targetSpeed * WARP_MULTIPLIER : targetSpeed
  const accelRate = 2.5 // how fast speed ramps (units per second)
  if (state.speed < effectiveTarget) {
    state.speed = Math.min(effectiveTarget, state.speed + accelRate * delta)
  } else if (state.speed > effectiveTarget) {
    state.speed = Math.max(effectiveTarget, state.speed - accelRate * delta)
  }

  // --- Position ---
  // Ship forward is -Z in local space (Three.js convention)
  _forward.set(0, 0, -1).applyQuaternion(state.quaternion)
  state.velocity.copy(_forward).multiplyScalar(state.speed * MOVEMENT_SCALE)
  state.position.addScaledVector(state.velocity, delta)

  // --- Weapons ---
  // Phaser recharge
  if (state.phaserCharge < 100) {
    state.phaserCharge = Math.min(100, state.phaserCharge + PHASER_RECHARGE * delta)
  }

  // Phaser fire (hold Space)
  state.phaserFiring = input.isPressed('Space') && state.phaserCharge > 5

  // Torpedo fire (single press T)
  state.torpedoFiring = input.wasJustPressed('KeyT') && state.torpedoCount > 0

  // --- Shields toggle (X) ---
  if (input.wasJustPressed('KeyX')) {
    state.shieldsActive = !state.shieldsActive
  }

  // Shield drain when active
  if (state.shieldsActive && state.shieldStrength > 0) {
    state.shieldStrength = Math.max(0, state.shieldStrength - 0.5 * delta)
    if (state.shieldStrength <= 0) {
      state.shieldsActive = false
    }
  }
}
