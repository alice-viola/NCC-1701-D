import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import type { GameState } from './game-state'
import type { CombatState } from './combat-system'
import { applyEnemyDamageToPlayer } from './combat-system'

/**
 * Enemy ship AI — a Borg-controlled Federation vessel.
 *
 * Behaviors:
 *   - Idle: Orbits slowly near Saturn until the player approaches
 *   - Alert: Turns to face the player, raises shields
 *   - Attack: Pursues the player, fires phasers and torpedoes
 *   - Evasive: Dodges when hull is low
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const ENEMY_SPEED = 8.0          // world units/s
const ENEMY_TURN_SPEED = 0.6     // rad/s
const DETECTION_RANGE = 500      // units — enemy wakes up
const ATTACK_RANGE = 150         // units — starts shooting
const PHASER_RANGE = 120         // units — phaser effective range
const PHASER_COOLDOWN = 2.0      // seconds between phaser bursts
const TORPEDO_COOLDOWN = 5.0     // seconds between torpedoes
const PHASER_BURST_DPS = 6       // damage per second of enemy phasers
const TORPEDO_DAMAGE = 15        // damage per torpedo hit
const EVASIVE_HULL_THRESHOLD = 30 // go evasive below this hull%

// Enemy ship colors — normal grey hull, subtle green hint
const BORG_HULL_COLOR = 0xaaaaaa
const BORG_EMISSIVE_COLOR = 0x334433

// ─── Types ───────────────────────────────────────────────────────────────────

export type EnemyBehavior = 'idle' | 'alert' | 'attack' | 'evasive'

export interface EnemyShip {
  group: THREE.Group
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  behavior: EnemyBehavior
  speed: number
  /** Weapon cooldowns */
  phaserCooldown: number
  torpedoCooldown: number
  /** Is currently firing phasers (for visual/audio) */
  phaserFiring: boolean
  /** Torpedo just fired this frame */
  torpedoJustFired: boolean
  /** Alert timer — delay before attacking */
  alertTimer: number
  /** For idle orbit */
  orbitAngle: number
  orbitCenter: THREE.Vector3
  orbitRadius: number
  /** Model loaded? */
  modelReady: boolean
  /** Phaser beam visual */
  phaserBeam: THREE.Mesh | null
  phaserBeamAge: number
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Create the enemy ship, positioned beyond Saturn.
 * Saturn's orbit in Sol system: radius 2200, angle 1.5
 */
export function createEnemyShip(scene: THREE.Scene): EnemyShip {
  const group = new THREE.Group()
  group.name = 'USS Reliant (Borg-Controlled)'

  // Position beyond Saturn (orbit radius 2200, angle 1.5)
  const saturnAngle = 1.5
  const beyondSaturnRadius = 2800
  const startPos = new THREE.Vector3(
    Math.cos(saturnAngle) * beyondSaturnRadius,
    20,
    Math.sin(saturnAngle) * beyondSaturnRadius,
  )

  group.position.copy(startPos)
  scene.add(group)

  // Subtle light around enemy ship
  const borgLight = new THREE.PointLight(0xccddcc, 1.5, 150)
  borgLight.position.set(0, 0, 0)
  group.add(borgLight)

  const enemy: EnemyShip = {
    group,
    position: startPos.clone(),
    quaternion: new THREE.Quaternion(),
    behavior: 'idle',
    speed: 0,
    phaserCooldown: 0,
    torpedoCooldown: 0,
    phaserFiring: false,
    torpedoJustFired: false,
    alertTimer: 0,
    orbitAngle: 0,
    orbitCenter: startPos.clone(),
    orbitRadius: 60,
    modelReady: false,
    phaserBeam: null,
    phaserBeamAge: 0,
  }

  // Load the NPC-2 OBJ model directly, with procedural fallback
  const loader = new OBJLoader()
  loader.load(
    '/models/npc-2/3d-model.obj',
    (obj) => {
      // Recompute normals
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.computeVertexNormals()
        }
      })

      // Center and normalize
      const box = new THREE.Box3().setFromObject(obj)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.translate(-center.x, -center.y, -center.z)
        }
      })

      // Scale so the ship is roughly 12 units long
      const targetSize = 12
      const scaleFactor = targetSize / maxDim
      obj.scale.setScalar(scaleFactor)

      // Apply Borg material
      const borgMat = new THREE.MeshStandardMaterial({
        color: BORG_HULL_COLOR,
        metalness: 0.5,
        roughness: 0.3,
        emissive: new THREE.Color(BORG_EMISSIVE_COLOR),
        emissiveIntensity: 0.5,
      })
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.material = borgMat
        }
      })

      group.add(obj)
      enemy.modelReady = true

      let meshCount = 0
      obj.traverse(c => { if ((c as THREE.Mesh).isMesh) meshCount++ })
      console.log(`[Enemy] NPC-2 model loaded: ${meshCount} meshes, maxDim=${maxDim.toFixed(0)}, scale=${scaleFactor.toFixed(6)}`)
    },
    undefined,
    (err) => {
      console.warn('[Enemy] NPC-2 OBJ failed, using procedural ship:', err)
      buildProceduralBorgShip(group)
      enemy.modelReady = true
    },
  )

  return enemy
}

const _toPlayer = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _targetQuat = new THREE.Quaternion()
const _lookMatrix = new THREE.Matrix4()
const _evasiveDir = new THREE.Vector3()

/**
 * Update enemy AI each frame.
 */
export function updateEnemyAI(
  enemy: EnemyShip,
  playerState: GameState,
  combat: CombatState,
  scene: THREE.Scene,
  delta: number,
): void {
  if (combat.enemyHealth.isDestroyed) {
    // Destroyed — could add explosion effects here
    enemy.speed = 0
    enemy.phaserFiring = false
    // Spin and fade
    enemy.group.rotation.x += delta * 0.5
    enemy.group.rotation.z += delta * 0.3
    enemy.group.scale.multiplyScalar(Math.max(0, 1 - delta * 0.3))
    return
  }

  // Distance to player
  _toPlayer.subVectors(playerState.position, enemy.position)
  const distToPlayer = _toPlayer.length()

  // Reset per-frame flags
  enemy.phaserFiring = false
  enemy.torpedoJustFired = false

  // Cooldown timers
  enemy.phaserCooldown = Math.max(0, enemy.phaserCooldown - delta)
  enemy.torpedoCooldown = Math.max(0, enemy.torpedoCooldown - delta)

  // ── Behavior State Machine ──

  switch (enemy.behavior) {
    case 'idle':
      // Orbit slowly
      enemy.orbitAngle += delta * 0.15
      enemy.position.set(
        enemy.orbitCenter.x + Math.cos(enemy.orbitAngle) * enemy.orbitRadius,
        enemy.orbitCenter.y,
        enemy.orbitCenter.z + Math.sin(enemy.orbitAngle) * enemy.orbitRadius,
      )
      enemy.speed = 0

      // Detect player
      if (distToPlayer < DETECTION_RANGE) {
        enemy.behavior = 'alert'
        enemy.alertTimer = 2.0 // 2 seconds before attacking
        console.log('[Enemy] Player detected! Going to alert.')
      }
      break

    case 'alert':
      // Turn to face player
      turnToward(enemy, playerState.position, delta)
      enemy.speed = 0
      enemy.alertTimer -= delta

      // Raise shields
      combat.enemyHealth.shieldsUp = true

      if (enemy.alertTimer <= 0) {
        enemy.behavior = 'attack'
        console.log('[Enemy] Engaging!')
      }
      break

    case 'attack':
      // Pursue and attack player
      if (combat.enemyHealth.hull < EVASIVE_HULL_THRESHOLD) {
        enemy.behavior = 'evasive'
        break
      }

      turnToward(enemy, playerState.position, delta)

      // Approach or maintain distance
      if (distToPlayer > ATTACK_RANGE) {
        // Close in
        enemy.speed = ENEMY_SPEED
      } else if (distToPlayer < ATTACK_RANGE * 0.4) {
        // Too close, slow down
        enemy.speed = ENEMY_SPEED * 0.3
      } else {
        // Good range
        enemy.speed = ENEMY_SPEED * 0.5
      }

      // Fire weapons if in range and facing player
      _forward.set(0, 0, -1).applyQuaternion(enemy.quaternion)
      _toPlayer.normalize()
      const facingDot = _forward.dot(_toPlayer)

      if (facingDot > 0.8 && distToPlayer < PHASER_RANGE) {
        // Fire phasers
        if (enemy.phaserCooldown <= 0) {
          enemy.phaserFiring = true
          applyEnemyDamageToPlayer(combat, PHASER_BURST_DPS * delta)
          // Phaser fires for a burst, then cooldown
          if (Math.random() < delta * 0.8) {
            enemy.phaserCooldown = PHASER_COOLDOWN
          }
        }
      }

      if (facingDot > 0.9 && distToPlayer < ATTACK_RANGE && enemy.torpedoCooldown <= 0) {
        // Fire torpedo
        enemy.torpedoJustFired = true
        enemy.torpedoCooldown = TORPEDO_COOLDOWN
        applyEnemyDamageToPlayer(combat, TORPEDO_DAMAGE)
      }

      break

    case 'evasive':
      // Fly erratically, still shooting
      _evasiveDir.set(
        Math.sin(Date.now() * 0.001) * 0.5,
        Math.cos(Date.now() * 0.0015) * 0.3,
        -1,
      ).normalize()
      _evasiveDir.applyQuaternion(enemy.quaternion)

      const targetPos = enemy.position.clone().addScaledVector(_evasiveDir, 50)
      turnToward(enemy, targetPos, delta * 1.5)
      enemy.speed = ENEMY_SPEED * 1.2

      // Still fire if opportunity arises
      _forward.set(0, 0, -1).applyQuaternion(enemy.quaternion)
      _toPlayer.subVectors(playerState.position, enemy.position).normalize()
      const evDot = _forward.dot(_toPlayer)

      if (evDot > 0.7 && distToPlayer < PHASER_RANGE && enemy.phaserCooldown <= 0) {
        enemy.phaserFiring = true
        applyEnemyDamageToPlayer(combat, PHASER_BURST_DPS * delta * 0.5)
        if (Math.random() < delta * 0.5) {
          enemy.phaserCooldown = PHASER_COOLDOWN * 1.5
        }
      }

      // Return to attack if hull recovers a bit (shields recharge)
      if (combat.enemyHealth.hull > EVASIVE_HULL_THRESHOLD + 10 || distToPlayer > DETECTION_RANGE) {
        enemy.behavior = 'attack'
      }
      break
  }

  // ── Move ──
  if (enemy.speed > 0) {
    _forward.set(0, 0, -1).applyQuaternion(enemy.quaternion)
    enemy.position.addScaledVector(_forward, enemy.speed * delta)
  }

  // ── Apply transform ──
  enemy.group.position.copy(enemy.position)
  enemy.group.quaternion.copy(enemy.quaternion)

  // ── Update enemy phaser beam visual ──
  updateEnemyPhaserBeam(enemy, playerState, scene, delta)
}

/**
 * Turn the enemy ship toward a target point.
 */
function turnToward(enemy: EnemyShip, target: THREE.Vector3, delta: number): void {
  _toPlayer.subVectors(target, enemy.position)
  if (_toPlayer.lengthSq() < 0.01) return

  // Compute target quaternion (look at player)
  _lookMatrix.lookAt(enemy.position, target, new THREE.Vector3(0, 1, 0))
  _targetQuat.setFromRotationMatrix(_lookMatrix)

  // Slerp toward target
  const t = Math.min(ENEMY_TURN_SPEED * delta, 1)
  enemy.quaternion.slerp(_targetQuat, t)
  enemy.quaternion.normalize()
}

/**
 * Create/update/remove the enemy phaser beam visual.
 */
function updateEnemyPhaserBeam(
  enemy: EnemyShip,
  playerState: GameState,
  scene: THREE.Scene,
  delta: number,
): void {
  if (enemy.phaserFiring) {
    // Create beam if not exists
    if (!enemy.phaserBeam) {
      const geo = new THREE.CylinderGeometry(0.08, 0.08, 1, 6, 1, true)
      geo.rotateX(Math.PI / 2)
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00ff44, // Borg green
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      enemy.phaserBeam = new THREE.Mesh(geo, mat)
      scene.add(enemy.phaserBeam)
    }

    // Position beam from enemy to player
    const from = enemy.position.clone().add(new THREE.Vector3(0, 0, -3).applyQuaternion(enemy.quaternion))
    const to = playerState.position.clone()
    const mid = from.clone().add(to).multiplyScalar(0.5)
    const dist = from.distanceTo(to)

    enemy.phaserBeam.position.copy(mid)
    enemy.phaserBeam.lookAt(to)
    enemy.phaserBeam.scale.set(1, 1, dist)

    enemy.phaserBeamAge = 0.3 // keep visible for a bit
  } else if (enemy.phaserBeam) {
    enemy.phaserBeamAge -= delta
    if (enemy.phaserBeamAge <= 0) {
      scene.remove(enemy.phaserBeam)
      enemy.phaserBeam.geometry.dispose()
      ;(enemy.phaserBeam.material as THREE.Material).dispose()
      enemy.phaserBeam = null
    } else {
      // Fade out
      const mat = enemy.phaserBeam.material as THREE.MeshBasicMaterial
      mat.opacity = enemy.phaserBeamAge / 0.3 * 0.8
    }
  }
}

/**
 * Build a procedural Borg-assimilated Miranda-class ship.
 */
function buildProceduralBorgShip(group: THREE.Group): void {
  const borgMat = new THREE.MeshStandardMaterial({
    color: BORG_HULL_COLOR,
    metalness: 0.6,
    roughness: 0.25,
    emissive: new THREE.Color(BORG_EMISSIVE_COLOR),
    emissiveIntensity: 0.5,
  })
  const borgGlowMat = new THREE.MeshStandardMaterial({
    color: 0x334433,
    metalness: 0.7,
    roughness: 0.3,
    emissive: new THREE.Color(0x00ff22),
    emissiveIntensity: 0.8,
  })

  // Saucer
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.8, 32), borgMat)
  group.add(saucer)

  // Engineering hull
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2, 10), borgMat)
  hull.position.set(0, -1.5, 1)
  group.add(hull)

  // Nacelle pylons + nacelles
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 6), borgMat)
    pylon.position.set(side * 3.5, -1, 0)
    group.add(pylon)

    const nacelleGeo = new THREE.CylinderGeometry(0.6, 0.6, 7, 12)
    nacelleGeo.rotateX(Math.PI / 2)
    const nacelle = new THREE.Mesh(nacelleGeo, borgGlowMat)
    nacelle.position.set(side * 3.5, -1, 0)
    group.add(nacelle)
  }

  // Borg implant cubes
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1)
  for (const [cx, cy, cz] of [[0, 0.5, 0], [2, 0.3, -1], [-1.5, 0.4, 1.5], [0, -1, 3], [1, -1, -2]]) {
    const cube = new THREE.Mesh(cubeGeo, borgGlowMat)
    cube.position.set(cx, cy, cz)
    cube.rotation.set(Math.random(), Math.random(), Math.random())
    group.add(cube)
  }
}

/**
 * Dispose enemy resources.
 */
export function disposeEnemy(enemy: EnemyShip, scene: THREE.Scene): void {
  scene.remove(enemy.group)
  enemy.group.traverse(child => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose())
      } else if (child.material) {
        child.material.dispose()
      }
    }
  })
  if (enemy.phaserBeam) {
    scene.remove(enemy.phaserBeam)
    enemy.phaserBeam.geometry.dispose()
    ;(enemy.phaserBeam.material as THREE.Material).dispose()
  }
}
