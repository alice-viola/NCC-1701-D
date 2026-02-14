/**
 * NPC Ship System — spawns and manages NPC ships in the current star system.
 * Each NPC uses the real OBJ model, tinted per faction, scaled per ship type.
 */

import * as THREE from 'three'
import type { NpcShipDef, NpcShipType, NpcFaction, StarSystem } from './universe'
import { loadNpcModel, applyNpcMaterial } from '../three/npc-model-loader'

// ─── Runtime NPC State ────────────────────────────────────────────────────────

export interface NpcShip {
  def: NpcShipDef
  group: THREE.Group

  // AI state
  position: THREE.Vector3
  velocity: THREE.Vector3
  targetPosition: THREE.Vector3
  speed: number
  /** For orbit behavior — current angle */
  orbitAngle: number
  orbitRadius: number
  orbitSpeed: number
  /** For patrol behavior — waypoints */
  patrolPoints: THREE.Vector3[]
  patrolIndex: number
  /** For idle — gentle drift */
  driftDir: THREE.Vector3
}

export interface NpcSystemState {
  ships: NpcShip[]
  root: THREE.Group
}

// ─── Creation ─────────────────────────────────────────────────────────────────

export function createNpcSystem(): NpcSystemState {
  return {
    ships: [],
    root: new THREE.Group(),
  }
}

/**
 * Spawn NPC ships for the given star system.
 * Loads the real OBJ model (cached after first load) and tints per faction.
 */
export async function spawnNpcs(
  state: NpcSystemState,
  system: StarSystem,
): Promise<void> {
  // Clear existing NPCs
  disposeNpcs(state)

  for (const def of system.npcs) {
    // Load real model, apply faction color and ship-type scale
    let group: THREE.Group
    try {
      group = await loadNpcModel()
      const colors = FACTION_COLORS[def.faction]
      applyNpcMaterial(group, colors.hull, colors.glow)
      const shipScale = SHIP_TYPE_SCALE[def.type] ?? 5
      group.scale.multiplyScalar(shipScale)
    } catch {
      // Fallback to a simple placeholder if model fails to load
      group = createFallbackGeometry(def.faction)
    }
    group.name = def.name

    // Determine initial position based on behavior
    const position = new THREE.Vector3()
    let orbitRadius = 0
    let orbitAngle = Math.random() * Math.PI * 2
    const patrolPoints: THREE.Vector3[] = []

    switch (def.behavior) {
      case 'orbit': {
        const planetIdx = def.orbitTarget ?? 0
        const planet = system.planets[planetIdx]
        if (planet) {
          orbitRadius = planet.radius + 30 + Math.random() * 40
          const px = Math.cos(planet.orbitAngle) * planet.orbitRadius
          const pz = Math.sin(planet.orbitAngle) * planet.orbitRadius
          position.set(
            px + Math.cos(orbitAngle) * orbitRadius,
            (Math.random() - 0.5) * 20,
            pz + Math.sin(orbitAngle) * orbitRadius,
          )
        }
        break
      }
      case 'patrol': {
        // Create 3-5 random patrol waypoints in the system
        const numPoints = 3 + Math.floor(Math.random() * 3)
        for (let i = 0; i < numPoints; i++) {
          patrolPoints.push(new THREE.Vector3(
            (Math.random() - 0.5) * 1500,
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 1500,
          ))
        }
        position.copy(patrolPoints[0])
        break
      }
      case 'cruise': {
        // Start at random position, cruise in a direction
        position.set(
          (Math.random() - 0.5) * 1000,
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 1000,
        )
        // Set up cruise waypoints (far apart)
        for (let i = 0; i < 2; i++) {
          patrolPoints.push(new THREE.Vector3(
            (Math.random() - 0.5) * 3000,
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 3000,
          ))
        }
        break
      }
      case 'idle': {
        position.set(
          (Math.random() - 0.5) * 500 + 200,
          (Math.random() - 0.5) * 50,
          (Math.random() - 0.5) * 500,
        )
        break
      }
    }

    group.position.copy(position)

    const ship: NpcShip = {
      def,
      group,
      position: position.clone(),
      velocity: new THREE.Vector3(),
      targetPosition: patrolPoints[0]?.clone() ?? position.clone(),
      speed: getShipSpeed(def.type),
      orbitAngle,
      orbitRadius,
      orbitSpeed: 0.15 + Math.random() * 0.1,
      patrolPoints,
      patrolIndex: 0,
      driftDir: new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.3,
      ),
    }

    state.ships.push(ship)
    state.root.add(group)
  }
}

function getShipSpeed(type: NpcShipType): number {
  switch (type) {
    case 'cruiser': return 3.0
    case 'frigate': return 4.0
    case 'freighter': return 1.5
    case 'shuttle': return 2.5
    case 'science': return 2.0
    default: return 2.0
  }
}

/**
 * Update all NPC ships each frame.
 */
export function updateNpcs(
  state: NpcSystemState,
  system: StarSystem,
  delta: number,
  elapsed: number,
): void {
  for (const ship of state.ships) {
    switch (ship.def.behavior) {
      case 'orbit':
        updateOrbit(ship, system, delta, elapsed)
        break
      case 'patrol':
      case 'cruise':
        updatePatrol(ship, delta)
        break
      case 'idle':
        updateIdle(ship, delta, elapsed)
        break
    }

    // Sync 3D position
    ship.group.position.copy(ship.position)

    // Face movement direction
    if (ship.velocity.lengthSq() > 0.001) {
      const lookTarget = ship.position.clone().add(ship.velocity)
      ship.group.lookAt(lookTarget)
    }
  }
}

function updateOrbit(ship: NpcShip, system: StarSystem, delta: number, _elapsed: number): void {
  const planetIdx = ship.def.orbitTarget ?? 0
  const planet = system.planets[planetIdx]
  if (!planet) return

  ship.orbitAngle += ship.orbitSpeed * delta
  const px = Math.cos(planet.orbitAngle) * planet.orbitRadius
  const pz = Math.sin(planet.orbitAngle) * planet.orbitRadius

  const newX = px + Math.cos(ship.orbitAngle) * ship.orbitRadius
  const newZ = pz + Math.sin(ship.orbitAngle) * ship.orbitRadius
  ship.velocity.set(newX - ship.position.x, 0, newZ - ship.position.z).multiplyScalar(1 / delta)
  ship.position.set(newX, ship.position.y, newZ)
}

function updatePatrol(ship: NpcShip, delta: number): void {
  if (ship.patrolPoints.length === 0) return

  const target = ship.patrolPoints[ship.patrolIndex]
  const dir = target.clone().sub(ship.position)
  const dist = dir.length()

  if (dist < 20) {
    // Reached waypoint, go to next
    ship.patrolIndex = (ship.patrolIndex + 1) % ship.patrolPoints.length
  } else {
    dir.normalize()
    ship.velocity.copy(dir).multiplyScalar(ship.speed)
    ship.position.addScaledVector(ship.velocity, delta)
  }
}

function updateIdle(ship: NpcShip, delta: number, elapsed: number): void {
  // Gentle oscillation
  ship.position.x += Math.sin(elapsed * 0.3 + ship.orbitAngle) * 0.1 * delta
  ship.position.z += Math.cos(elapsed * 0.2 + ship.orbitAngle) * 0.1 * delta
  ship.velocity.set(0, 0, 0)
}

/**
 * Dispose all NPC ships and their geometry.
 */
export function disposeNpcs(state: NpcSystemState): void {
  for (const ship of state.ships) {
    ship.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else if (child.material) {
          child.material.dispose()
        }
      }
    })
    state.root.remove(ship.group)
  }
  state.ships = []
}

// ─── Ship Type Scale (base model is 1 unit) ──────────────────────────────────

const SHIP_TYPE_SCALE: Record<NpcShipType, number> = {
  cruiser:   7,    // large capital ship
  frigate:   5,    // medium vessel
  freighter: 4,    // cargo vessel
  shuttle:   2,    // small craft
  science:   4,    // research vessel
}

// ─── Faction Colors ───────────────────────────────────────────────────────────

const FACTION_COLORS: Record<NpcFaction, { hull: number; glow: number }> = {
  federation: { hull: 0x8899aa, glow: 0x334466 },
  civilian:   { hull: 0x999977, glow: 0x444422 },
  vulcan:     { hull: 0x887766, glow: 0x442211 },
  andorian:   { hull: 0x6688aa, glow: 0x224455 },
}

/** Simple fallback if the OBJ model fails to load */
function createFallbackGeometry(faction: NpcFaction): THREE.Group {
  const group = new THREE.Group()
  const colors = FACTION_COLORS[faction]
  const mat = new THREE.MeshStandardMaterial({
    color: colors.hull,
    metalness: 0.5,
    roughness: 0.4,
  })
  const geo = new THREE.ConeGeometry(1.5, 5, 8)
  geo.rotateX(Math.PI / 2)
  group.add(new THREE.Mesh(geo, mat))
  return group
}
