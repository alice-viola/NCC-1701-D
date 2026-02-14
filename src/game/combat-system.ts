import * as THREE from 'three'
import type { GameState } from './game-state'

/**
 * Combat & damage system.
 *
 * Tracks hull integrity for the player ship and an enemy ship.
 * Detects weapon hits (phaser beams and torpedoes) via proximity checks
 * and applies damage. Shield absorption reduces incoming damage.
 */

// ─── Damage Constants ────────────────────────────────────────────────────────

const PHASER_DPS = 8            // damage per second while beam is hitting
const TORPEDO_DAMAGE = 18       // single torpedo hit damage
const HIT_DISTANCE_PHASER = 20  // max distance for phaser hit check
const HIT_DISTANCE_TORPEDO = 12 // torpedo proximity detonation
const SHIELD_ABSORPTION = 0.7   // shields absorb 70% of damage

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShipHealth {
  hull: number        // 0–100
  maxHull: number
  shieldsUp: boolean
  shieldStrength: number // 0–100
  isDestroyed: boolean
  /** Visual damage flash timer (decays to 0) */
  damageFlash: number
}

export interface CombatState {
  playerHealth: ShipHealth
  enemyHealth: ShipHealth
  /** Set when a game-ending condition is reached */
  gameOver: 'victory' | 'defeat' | null
}

// ─── API ─────────────────────────────────────────────────────────────────────

export function createCombatState(): CombatState {
  return {
    playerHealth: createShipHealth(100),
    enemyHealth: createShipHealth(100),
    gameOver: null,
  }
}

function createShipHealth(maxHull: number): ShipHealth {
  return {
    hull: maxHull,
    maxHull,
    shieldsUp: false,
    shieldStrength: 100,
    isDestroyed: false,
    damageFlash: 0,
  }
}

/**
 * Apply raw damage to a ship, accounting for shields.
 */
export function applyDamage(health: ShipHealth, rawDamage: number): void {
  if (health.isDestroyed) return

  let effectiveDamage = rawDamage
  if (health.shieldsUp && health.shieldStrength > 0) {
    const absorbed = rawDamage * SHIELD_ABSORPTION
    health.shieldStrength = Math.max(0, health.shieldStrength - absorbed * 0.5)
    effectiveDamage = rawDamage - absorbed
    if (health.shieldStrength <= 0) {
      health.shieldsUp = false
    }
  }

  health.hull = Math.max(0, health.hull - effectiveDamage)
  health.damageFlash = 1.0

  if (health.hull <= 0) {
    health.isDestroyed = true
  }
}

/**
 * Check if the player's phaser beams hit the enemy ship.
 * Called every frame — applies DPS-based damage.
 */
export function checkPhaserHits(
  combat: CombatState,
  playerState: GameState,
  enemyPosition: THREE.Vector3,
  delta: number,
): boolean {
  if (!playerState.phaserFiring || combat.enemyHealth.isDestroyed) return false

  // Check if enemy is roughly in front of the player and within range
  const toEnemy = new THREE.Vector3().subVectors(enemyPosition, playerState.position)
  const dist = toEnemy.length()

  if (dist > 200) return false // too far

  // Check if phaser beam direction (ship forward) roughly points at enemy
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerState.quaternion)
  toEnemy.normalize()
  const dot = forward.dot(toEnemy)

  // Phaser beam has some spread — wider at close range
  const minDot = Math.max(0.85, 1.0 - (30 / Math.max(dist, 1)))

  if (dot > minDot) {
    applyDamage(combat.enemyHealth, PHASER_DPS * delta)
    return true
  }
  return false
}

/**
 * Check if any active torpedo hits the enemy.
 * Returns indices of torpedoes that hit (so they can be removed).
 */
export function checkTorpedoHits(
  combat: CombatState,
  torpedoPositions: THREE.Vector3[],
  enemyPosition: THREE.Vector3,
): number[] {
  if (combat.enemyHealth.isDestroyed) return []

  const hits: number[] = []
  for (let i = 0; i < torpedoPositions.length; i++) {
    const dist = torpedoPositions[i].distanceTo(enemyPosition)
    if (dist < HIT_DISTANCE_TORPEDO) {
      applyDamage(combat.enemyHealth, TORPEDO_DAMAGE)
      hits.push(i)
    }
  }
  return hits
}

/**
 * Check if enemy weapons hit the player.
 * Called from enemy AI when it fires.
 */
export function applyEnemyDamageToPlayer(
  combat: CombatState,
  damage: number,
): void {
  // Sync player shield state from game state before applying
  applyDamage(combat.playerHealth, damage)
}

/**
 * Sync player's shield state from GameState into combat health.
 */
export function syncPlayerShields(combat: CombatState, gs: GameState): void {
  combat.playerHealth.shieldsUp = gs.shieldsActive
  combat.playerHealth.shieldStrength = gs.shieldStrength
}

/**
 * Decay damage flash timers each frame.
 */
export function updateCombatTimers(combat: CombatState, delta: number): void {
  if (combat.playerHealth.damageFlash > 0) {
    combat.playerHealth.damageFlash = Math.max(0, combat.playerHealth.damageFlash - 3 * delta)
  }
  if (combat.enemyHealth.damageFlash > 0) {
    combat.enemyHealth.damageFlash = Math.max(0, combat.enemyHealth.damageFlash - 3 * delta)
  }

  // Check game-over conditions
  if (!combat.gameOver) {
    if (combat.enemyHealth.isDestroyed) {
      combat.gameOver = 'victory'
    } else if (combat.playerHealth.isDestroyed) {
      combat.gameOver = 'defeat'
    }
  }
}
