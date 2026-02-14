import * as THREE from 'three'
import type { InputManager } from './input-manager'

/**
 * Free Camera mode for screenshots.
 *
 * When active, WASDQE moves the camera freely in world space,
 * comma/period zoom in/out, and the ship is frozen.
 *
 * Controls:
 *   W/S   — Move forward / backward
 *   A/D   — Strafe left / right
 *   Q/E   — Move up / down
 *   ,     — Zoom in (decrease FOV)
 *   .     — Zoom out (increase FOV)
 *   Mouse — Look around (drag to orbit)
 *   R     — Reset camera to ship follow position
 *   F     — Exit photo mode
 */

const MOVE_SPEED = 20.0
const LOOK_SPEED = 0.003
const ZOOM_SPEED = 30.0
const FOV_MIN = 20
const FOV_MAX = 120

export interface FreeCameraState {
  active: boolean
  /** Euler angles for look direction */
  yaw: number
  pitch: number
  /** Saved ship-follow camera position/rotation for reset */
  savedPosition: THREE.Vector3
  savedFov: number
  /** Mouse state */
  isDragging: boolean
  lastMouseX: number
  lastMouseY: number
}

export function createFreeCameraState(): FreeCameraState {
  return {
    active: false,
    yaw: 0,
    pitch: 0,
    savedPosition: new THREE.Vector3(),
    savedFov: 50,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
  }
}

/**
 * Enter photo mode — snapshot current camera state.
 */
export function enterPhotoMode(
  state: FreeCameraState,
  camera: THREE.PerspectiveCamera,
): void {
  state.active = true
  state.savedPosition.copy(camera.position)
  state.savedFov = camera.fov

  // Extract current look direction as euler
  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  state.yaw = Math.atan2(-dir.x, -dir.z)
  state.pitch = Math.asin(dir.y)
}

/**
 * Exit photo mode — restore camera (the follow camera will take over next frame).
 */
export function exitPhotoMode(state: FreeCameraState): void {
  state.active = false
}

/**
 * Reset camera to the saved (ship-follow) position.
 */
export function resetPhotoCamera(
  state: FreeCameraState,
  camera: THREE.PerspectiveCamera,
): void {
  camera.position.copy(state.savedPosition)
  camera.fov = state.savedFov
  camera.updateProjectionMatrix()

  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  state.yaw = Math.atan2(-dir.x, -dir.z)
  state.pitch = Math.asin(dir.y)
}

/**
 * Update free camera each frame. Call INSTEAD of the normal camera update.
 */
export function updateFreeCamera(
  state: FreeCameraState,
  camera: THREE.PerspectiveCamera,
  input: InputManager,
  delta: number,
): void {
  if (!state.active) return

  // --- Mouse look (handled via events, pitch/yaw already updated) ---

  // Build look direction from euler angles
  const forward = new THREE.Vector3(
    -Math.sin(state.yaw) * Math.cos(state.pitch),
    Math.sin(state.pitch),
    -Math.cos(state.yaw) * Math.cos(state.pitch),
  ).normalize()

  const right = new THREE.Vector3()
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

  const up = new THREE.Vector3(0, 1, 0)

  // --- Movement (WASDQE) ---
  const speed = MOVE_SPEED * delta

  if (input.isPressed('KeyW')) camera.position.addScaledVector(forward, speed)
  if (input.isPressed('KeyS')) camera.position.addScaledVector(forward, -speed)
  if (input.isPressed('KeyA')) camera.position.addScaledVector(right, -speed)
  if (input.isPressed('KeyD')) camera.position.addScaledVector(right, speed)
  if (input.isPressed('KeyQ')) camera.position.addScaledVector(up, -speed)
  if (input.isPressed('KeyE')) camera.position.addScaledVector(up, speed)

  // --- Zoom (comma / period) ---
  if (input.isPressed('Comma')) {
    camera.fov = Math.max(FOV_MIN, camera.fov - ZOOM_SPEED * delta)
    camera.updateProjectionMatrix()
  }
  if (input.isPressed('Period')) {
    camera.fov = Math.min(FOV_MAX, camera.fov + ZOOM_SPEED * delta)
    camera.updateProjectionMatrix()
  }

  // --- Apply look direction ---
  const lookTarget = camera.position.clone().add(forward)
  camera.lookAt(lookTarget)
}

/**
 * Handle mouse events for free camera look.
 * Call these from the component's mouse event handlers.
 */
export function onFreeCameraMouseDown(state: FreeCameraState, e: MouseEvent): void {
  if (!state.active) return
  state.isDragging = true
  state.lastMouseX = e.clientX
  state.lastMouseY = e.clientY
}

export function onFreeCameraMouseMove(state: FreeCameraState, e: MouseEvent): void {
  if (!state.active || !state.isDragging) return

  const dx = e.clientX - state.lastMouseX
  const dy = e.clientY - state.lastMouseY
  state.lastMouseX = e.clientX
  state.lastMouseY = e.clientY

  state.yaw -= dx * LOOK_SPEED
  state.pitch = Math.max(
    -Math.PI / 2 + 0.01,
    Math.min(Math.PI / 2 - 0.01, state.pitch + dy * LOOK_SPEED),
  )
}

export function onFreeCameraMouseUp(state: FreeCameraState): void {
  state.isDragging = false
}
