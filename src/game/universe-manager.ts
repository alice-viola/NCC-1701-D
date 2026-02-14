/**
 * Universe Manager — tracks which star system the player is in,
 * handles warp travel between systems, and manages discovery.
 */

import { getSystem, getMapDistance, getConnectedSystems } from './universe'
import type { StarSystem } from './universe'
import type { GameState } from './game-state'

export type TravelPhase = 'idle' | 'charging' | 'warping' | 'arriving'

export interface UniverseState {
  currentSystemId: string
  currentSystem: StarSystem

  /** Selected destination (null if none) */
  destinationId: string | null
  destination: StarSystem | null

  /** Travel state machine */
  travelPhase: TravelPhase
  /** Travel progress 0-1 during 'warping' phase */
  travelProgress: number
  /** Duration of current warp in seconds */
  travelDuration: number
  /** Time spent in current phase */
  travelTimer: number

  /** Is the star map open? */
  starMapOpen: boolean
}

const WARP_CHARGE_TIME = 2.0    // seconds to charge before jump
const WARP_MIN_DURATION = 3.0   // minimum warp travel time
const WARP_SPEED_FACTOR = 0.025 // map distance → seconds
const ARRIVAL_TIME = 1.5        // seconds for deceleration

export function createUniverseState(): UniverseState {
  const startSystem = getSystem('sol')!
  return {
    currentSystemId: 'sol',
    currentSystem: startSystem,
    destinationId: null,
    destination: null,
    travelPhase: 'idle',
    travelProgress: 0,
    travelDuration: 0,
    travelTimer: 0,
    starMapOpen: false,
  }
}

/**
 * Set a destination system for warp travel.
 * Only allows connected systems (direct warp routes).
 */
export function setDestination(state: UniverseState, systemId: string): boolean {
  if (systemId === state.currentSystemId) return false

  // Must be a connected system
  const connected = getConnectedSystems(state.currentSystemId)
  const target = connected.find(s => s.id === systemId)
  if (!target) return false

  state.destinationId = systemId
  state.destination = target
  return true
}

/** Clear the current destination */
export function clearDestination(state: UniverseState): void {
  state.destinationId = null
  state.destination = null
  if (state.travelPhase === 'idle') {
    state.travelTimer = 0
  }
}

/**
 * Initiate warp travel to the selected destination.
 * The ship must have a destination set and be in idle phase.
 * Returns true if warp was initiated.
 */
export function initiateWarp(
  uState: UniverseState,
  gameState: GameState,
): boolean {
  if (!uState.destination) return false
  if (uState.travelPhase !== 'idle') return false
  if (gameState.throttle < 0.1) return false

  // Calculate travel duration based on map distance
  const dist = getMapDistance(uState.currentSystem, uState.destination)
  uState.travelDuration = Math.max(WARP_MIN_DURATION, dist * WARP_SPEED_FACTOR)

  uState.travelPhase = 'charging'
  uState.travelTimer = 0
  uState.travelProgress = 0

  return true
}

/**
 * Update the warp travel state machine each frame.
 * Returns 'arrived' when the ship reaches the destination.
 */
export function updateTravel(
  uState: UniverseState,
  gameState: GameState,
  delta: number,
): 'none' | 'started-warp' | 'arrived' {
  if (uState.travelPhase === 'idle') return 'none'

  uState.travelTimer += delta

  switch (uState.travelPhase) {
    case 'charging': {
      // Charging phase — build up energy before jump
      if (uState.travelTimer >= WARP_CHARGE_TIME) {
        uState.travelPhase = 'warping'
        uState.travelTimer = 0
        gameState.isWarp = true
        return 'started-warp'
      }
      break
    }

    case 'warping': {
      // In warp — update progress
      uState.travelProgress = Math.min(1, uState.travelTimer / uState.travelDuration)
      gameState.isWarp = true
      gameState.speed = 5.0 + uState.travelProgress * 3.0 // high warp speed

      if (uState.travelProgress >= 1) {
        uState.travelPhase = 'arriving'
        uState.travelTimer = 0
      }
      break
    }

    case 'arriving': {
      // Deceleration phase
      gameState.isWarp = false
      gameState.speed = Math.max(0.3, 1.0 - uState.travelTimer / ARRIVAL_TIME)

      if (uState.travelTimer >= ARRIVAL_TIME) {
        // Arrive at destination
        return arriveAtDestination(uState, gameState)
      }
      break
    }
  }

  return 'none'
}

/**
 * Complete the arrival at the destination system.
 */
function arriveAtDestination(
  uState: UniverseState,
  gameState: GameState,
): 'arrived' {
  if (!uState.destination) {
    uState.travelPhase = 'idle'
    return 'arrived'
  }

  // Update current system
  uState.currentSystemId = uState.destination.id
  uState.currentSystem = uState.destination

  // Mark as discovered
  uState.currentSystem.discovered = true

  // Reset player position in the new system
  gameState.position.set(0, 0, 0)
  gameState.speed = 0.3
  gameState.throttle = 0.3
  gameState.isWarp = false

  // Clear destination
  uState.destinationId = null
  uState.destination = null
  uState.travelPhase = 'idle'
  uState.travelTimer = 0
  uState.travelProgress = 0

  return 'arrived'
}

/**
 * Cancel an in-progress warp (only during charging phase).
 */
export function cancelWarp(uState: UniverseState, gameState: GameState): boolean {
  if (uState.travelPhase === 'charging') {
    uState.travelPhase = 'idle'
    uState.travelTimer = 0
    return true
  }
  return false // can't cancel mid-warp
}
