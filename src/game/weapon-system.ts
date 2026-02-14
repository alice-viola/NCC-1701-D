import * as THREE from 'three'
import type { GameState } from './game-state'
import {
  createPhaserBeamMesh,
  createPhaserCoreMesh,
  updateTorpedo,
  createTorpedoMesh,
} from '../three/effects'
import type { PhaserBeam, PhotonTorpedo } from '../three/effects'

// Phaser strip position (on the saucer dorsal, forward)
const PHASER_ORIGIN_OFFSET = new THREE.Vector3(0, 0.6, -3.5)
// Torpedo launcher position (lower engineering hull)
const TORPEDO_ORIGIN_OFFSET = new THREE.Vector3(0, -0.4, -2.5)

const PHASER_DRAIN_RATE = 35 // charge units per second while firing
const PHASER_COOLDOWN = 0.15 // seconds between beam refreshes

export interface WeaponSystemState {
  phaserBeams: PhaserBeam[]
  phaserCores: THREE.Mesh[]
  torpedoes: PhotonTorpedo[]
  phaserCooldown: number
}

export function createWeaponSystem(): WeaponSystemState {
  return {
    phaserBeams: [],
    phaserCores: [],
    torpedoes: [],
    phaserCooldown: 0,
  }
}

const _origin = new THREE.Vector3()
const _direction = new THREE.Vector3()

/**
 * Updates weapon state each frame — fires, ages, and removes projectiles.
 */
export function updateWeapons(
  ws: WeaponSystemState,
  gameState: GameState,
  scene: THREE.Scene,
  shipGroup: THREE.Group,
  delta: number,
): void {
  // --- Phaser beams ---
  ws.phaserCooldown = Math.max(0, ws.phaserCooldown - delta)

  if (gameState.phaserFiring && gameState.phaserCharge > 5 && ws.phaserCooldown <= 0) {
    // Compute world-space phaser origin
    _origin.copy(PHASER_ORIGIN_OFFSET).applyQuaternion(gameState.quaternion).add(gameState.position)
    _direction.set(0, 0, -1).applyQuaternion(gameState.quaternion)

    const beam = createPhaserBeamMesh(_origin, _direction)
    scene.add(beam.mesh)
    ws.phaserBeams.push(beam)

    const core = createPhaserCoreMesh(_origin, _direction)
    scene.add(core)
    ws.phaserCores.push(core)

    ws.phaserCooldown = PHASER_COOLDOWN
  }

  // Drain phaser charge while firing
  if (gameState.phaserFiring) {
    gameState.phaserCharge = Math.max(0, gameState.phaserCharge - PHASER_DRAIN_RATE * delta)
    if (gameState.phaserCharge <= 0) {
      gameState.phaserFiring = false
    }
  }

  // Age and remove expired beams
  for (let i = ws.phaserBeams.length - 1; i >= 0; i--) {
    const beam = ws.phaserBeams[i]!
    beam.age += delta

    // Fade out
    const mat = beam.mesh.material as THREE.MeshBasicMaterial
    mat.opacity = Math.max(0, 0.9 * (1 - beam.age / beam.maxAge))

    if (beam.age >= beam.maxAge) {
      scene.remove(beam.mesh)
      beam.mesh.geometry.dispose()
      ;(beam.mesh.material as THREE.Material).dispose()
      ws.phaserBeams.splice(i, 1)
    }
  }

  // Age and remove expired cores
  for (let i = ws.phaserCores.length - 1; i >= 0; i--) {
    const core = ws.phaserCores[i]!
    // Cores share same lifetime as beams — track via opacity
    const mat = core.material as THREE.MeshBasicMaterial
    mat.opacity -= delta * 0.6
    if (mat.opacity <= 0) {
      scene.remove(core)
      core.geometry.dispose()
      ;(core.material as THREE.Material).dispose()
      ws.phaserCores.splice(i, 1)
    }
  }

  // --- Photon torpedoes ---
  if (gameState.torpedoFiring && gameState.torpedoCount > 0) {
    _origin.copy(TORPEDO_ORIGIN_OFFSET).applyQuaternion(gameState.quaternion).add(gameState.position)
    _direction.set(0, 0, -1).applyQuaternion(gameState.quaternion)

    const torpedo = createTorpedoMesh(_origin, _direction)
    scene.add(torpedo.mesh)
    ws.torpedoes.push(torpedo)
    gameState.torpedoCount--
    gameState.torpedoFiring = false
  }

  // Update active torpedoes
  for (let i = ws.torpedoes.length - 1; i >= 0; i--) {
    const torp = ws.torpedoes[i]!
    updateTorpedo(torp, delta)

    if (torp.age >= torp.maxAge) {
      scene.remove(torp.mesh)
      // Dispose torpedo meshes
      torp.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
      ws.torpedoes.splice(i, 1)
    }
  }
}

/**
 * Clean up all active projectiles.
 */
export function disposeWeapons(ws: WeaponSystemState, scene: THREE.Scene): void {
  for (const beam of ws.phaserBeams) {
    scene.remove(beam.mesh)
    beam.mesh.geometry.dispose()
    ;(beam.mesh.material as THREE.Material).dispose()
  }
  for (const core of ws.phaserCores) {
    scene.remove(core)
    core.geometry.dispose()
    ;(core.material as THREE.Material).dispose()
  }
  for (const torp of ws.torpedoes) {
    scene.remove(torp.mesh)
  }
  ws.phaserBeams.length = 0
  ws.phaserCores.length = 0
  ws.torpedoes.length = 0
}
