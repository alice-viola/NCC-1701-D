import * as THREE from 'three'

/**
 * Central game state. Mutable — updated each frame by the various controllers.
 */
export interface GameState {
  // Ship transform
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  velocity: THREE.Vector3

  // Speed
  throttle: number  // 0 – 1 (impulse range)
  speed: number     // current speed scalar (0-1 impulse, >1 warp)
  isWarp: boolean

  // Shields
  shieldsActive: boolean
  shieldStrength: number // 0 – 100

  // Weapons
  phaserCharge: number   // 0 – 100, recharges over time
  torpedoCount: number   // finite ammo
  phaserFiring: boolean
  torpedoFiring: boolean

  // Derived display values (updated each frame)
  heading: number  // yaw in degrees (0-360)
  bearing: number  // pitch in degrees (-90 to 90)
  speedDisplay: string // "Full Impulse", "Warp 2", etc.
}

/**
 * Primitive-only subset of GameState for the HUD overlay.
 * Kept as a Vue reactive() object so computed properties re-evaluate.
 */
export interface HudState {
  heading: number
  bearing: number
  speedDisplay: string
  throttle: number
  speed: number
  isWarp: boolean
  shieldsActive: boolean
  shieldStrength: number
  phaserCharge: number
  torpedoCount: number
}

const INITIAL_TORPEDO_COUNT = 64

export function createGameState(): GameState {
  return {
    position: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    velocity: new THREE.Vector3(0, 0, 0),

    throttle: 0,
    speed: 0,
    isWarp: false,

    shieldsActive: false,
    shieldStrength: 100,

    phaserCharge: 100,
    torpedoCount: INITIAL_TORPEDO_COUNT,
    phaserFiring: false,
    torpedoFiring: false,

    heading: 0,
    bearing: 0,
    speedDisplay: 'All Stop',
  }
}

/**
 * Updates the derived heading/bearing/speedDisplay from the quaternion and speed.
 */
export function updateDerivedState(state: GameState): void {
  // Extract euler angles from quaternion
  const euler = new THREE.Euler().setFromQuaternion(state.quaternion, 'YXZ')

  // Heading: yaw angle in degrees (0-360)
  let headingDeg = THREE.MathUtils.radToDeg(-euler.y) % 360
  if (headingDeg < 0) headingDeg += 360
  state.heading = Math.round(headingDeg)

  // Bearing: pitch angle in degrees
  state.bearing = Math.round(THREE.MathUtils.radToDeg(-euler.x))

  // Speed display
  if (state.speed < 0.001) {
    state.speedDisplay = 'All Stop'
  } else if (!state.isWarp) {
    const pct = Math.round(state.speed * 100)
    if (pct >= 95) {
      state.speedDisplay = 'Full Impulse'
    } else {
      state.speedDisplay = `Impulse ${pct}%`
    }
  } else {
    const warpFactor = 1 + (state.speed - 1) * 2
    state.speedDisplay = `Warp ${warpFactor.toFixed(1)}`
  }
}

/**
 * Syncs primitive game-state values into the reactive HUD state object.
 */
export function syncHudState(hud: HudState, gs: GameState): void {
  hud.heading = gs.heading
  hud.bearing = gs.bearing
  hud.speedDisplay = gs.speedDisplay
  hud.throttle = gs.throttle
  hud.speed = gs.speed
  hud.isWarp = gs.isWarp
  hud.shieldsActive = gs.shieldsActive
  hud.shieldStrength = gs.shieldStrength
  hud.phaserCharge = gs.phaserCharge
  hud.torpedoCount = gs.torpedoCount
}
