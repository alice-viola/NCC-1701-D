import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Explosions — particle system
// ---------------------------------------------------------------------------

export interface Explosion {
  group: THREE.Group
  particles: THREE.Points
  velocities: Float32Array
  age: number
  maxAge: number
  /** Flash light */
  light: THREE.PointLight
}

/**
 * Creates a particle explosion at the given position.
 * @param position World position of the explosion
 * @param type 'phaser' for small orange sparks, 'torpedo' for big red-orange blast
 */
export function createExplosion(
  position: THREE.Vector3,
  type: 'phaser' | 'torpedo' = 'torpedo',
): Explosion {
  const group = new THREE.Group()
  group.position.copy(position)

  const count = type === 'torpedo' ? 20 : 8
  const speed = type === 'torpedo' ? 20 : 10
  const maxAge = type === 'torpedo' ? 0.8 : 0.3
  const size = type === 'torpedo' ? 0.8 : 0.35

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const velocities = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    // All start at center
    positions[i * 3] = 0
    positions[i * 3 + 1] = 0
    positions[i * 3 + 2] = 0

    // Random outward velocity (spherical)
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const v = speed * (0.3 + Math.random() * 0.7)
    velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * v
    velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * v
    velocities[i * 3 + 2] = Math.cos(phi) * v

    // Color: mix of orange, yellow, white for torpedo / orange sparks for phaser
    if (type === 'torpedo') {
      const t = Math.random()
      colors[i * 3] = 1.0
      colors[i * 3 + 1] = 0.3 + t * 0.5
      colors[i * 3 + 2] = t * 0.2
    } else {
      colors[i * 3] = 1.0
      colors[i * 3 + 1] = 0.5 + Math.random() * 0.3
      colors[i * 3 + 2] = 0.1
    }

    sizes[i] = size * (0.5 + Math.random() * 0.5)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

  const mat = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })

  const particles = new THREE.Points(geo, mat)
  group.add(particles)

  // Flash light
  const lightColor = type === 'torpedo' ? 0xff6622 : 0xff8833
  const lightIntensity = type === 'torpedo' ? 8 : 3
  const light = new THREE.PointLight(lightColor, lightIntensity, type === 'torpedo' ? 80 : 30)
  group.add(light)

  return { group, particles, velocities, age: 0, maxAge, light }
}

/**
 * Update an explosion each frame — move particles outward, fade out.
 */
export function updateExplosion(exp: Explosion, delta: number): void {
  exp.age += delta
  const lifeRatio = exp.age / exp.maxAge

  const posAttr = exp.particles.geometry.getAttribute('position') as THREE.BufferAttribute
  const positions = posAttr.array as Float32Array
  const count = positions.length / 3

  // Move particles outward, slow them down over time
  const drag = 1 - lifeRatio * 0.8
  for (let i = 0; i < count; i++) {
    positions[i * 3]! += exp.velocities[i * 3]! * delta * drag
    positions[i * 3 + 1]! += exp.velocities[i * 3 + 1]! * delta * drag
    positions[i * 3 + 2]! += exp.velocities[i * 3 + 2]! * delta * drag
  }
  posAttr.needsUpdate = true

  // Fade out
  const mat = exp.particles.material as THREE.PointsMaterial
  mat.opacity = Math.max(0, 1 - lifeRatio * lifeRatio)

  // Shrink particles
  mat.size = mat.size * (1 - delta * 1.5)

  // Fade light
  exp.light.intensity *= Math.max(0, 1 - delta * 4)
}

/**
 * Dispose explosion resources.
 */
export function disposeExplosion(exp: Explosion, scene: THREE.Scene): void {
  scene.remove(exp.group)
  exp.particles.geometry.dispose()
  ;(exp.particles.material as THREE.Material).dispose()
  exp.light.dispose()
}

// ---------------------------------------------------------------------------
// Phaser Beam
// ---------------------------------------------------------------------------

export interface PhaserBeam {
  mesh: THREE.Mesh
  age: number
  maxAge: number
}

const PHASER_LENGTH = 40
const PHASER_RADIUS = 0.02

/**
 * Creates a bright orange phaser beam mesh originating from the phaser strip
 * on the saucer and extending forward.
 */
export function createPhaserBeamMesh(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): PhaserBeam {
  const geo = new THREE.CylinderGeometry(PHASER_RADIUS, PHASER_RADIUS, PHASER_LENGTH, 8, 1, true)
  // Cylinder is along Y by default — rotate to align with Z
  geo.rotateX(Math.PI / 2)
  // For non-camera objects, lookAt makes +Z face the target.
  // So the beam geometry must extend along +Z to fire forward.
  geo.translate(0, 0, PHASER_LENGTH / 2)

  const mat = new THREE.MeshBasicMaterial({
    color: 0xff8833,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(origin)

  // Orient mesh so +Z faces the firing direction
  const target = origin.clone().add(direction)
  mesh.lookAt(target)

  return {
    mesh,
    age: 0,
    maxAge: 0.5,
  }
}

/**
 * Creates the inner bright core of the phaser beam for extra glow.
 */
export function createPhaserCoreMesh(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(PHASER_RADIUS * 2.5, PHASER_RADIUS * 2.5, PHASER_LENGTH, 8, 1, true)
  geo.rotateX(Math.PI / 2)
  geo.translate(0, 0, PHASER_LENGTH / 2)

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffcc88,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(origin)
  const target = origin.clone().add(direction)
  mesh.lookAt(target)

  return mesh
}

// ---------------------------------------------------------------------------
// Photon Torpedo
// ---------------------------------------------------------------------------

export interface PhotonTorpedo {
  mesh: THREE.Group
  velocity: THREE.Vector3
  age: number
  maxAge: number
  trail: THREE.Points
  /** Optional homing target — torpedo will steer toward this position */
  targetPosition?: THREE.Vector3
}

const TORPEDO_SPEED = 80 // units/sec

/**
 * Creates a glowing red-orange photon torpedo with a particle trail.
 */
export function createTorpedoMesh(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): PhotonTorpedo {
  const group = new THREE.Group()
  group.position.copy(origin)

  // Orient group so +Z faces the firing direction (non-camera lookAt convention)
  const target = origin.clone().add(direction)
  group.lookAt(target)

  // Main torpedo sphere
  const sphereGeo = new THREE.SphereGeometry(0.15, 12, 12)
  const sphereMat = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
  })
  const sphere = new THREE.Mesh(sphereGeo, sphereMat)
  group.add(sphere)

  // Outer glow sphere
  const glowGeo = new THREE.SphereGeometry(0.35, 12, 12)
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff6622,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  group.add(glow)

  // Particle trail — extends along local -Z (behind torpedo)
  const trailCount = 30
  const trailPositions = new Float32Array(trailCount * 3)
  const trailSizes = new Float32Array(trailCount)
  for (let i = 0; i < trailCount; i++) {
    trailPositions[i * 3] = 0
    trailPositions[i * 3 + 1] = 0
    trailPositions[i * 3 + 2] = -i * 0.2 // -Z = behind torpedo
    trailSizes[i] = 2.0 * (1 - i / trailCount)
  }
  const trailGeo = new THREE.BufferGeometry()
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3))
  trailGeo.setAttribute('size', new THREE.BufferAttribute(trailSizes, 1))

  const trailMat = new THREE.PointsMaterial({
    color: 0xff6633,
    size: 0.15,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const trail = new THREE.Points(trailGeo, trailMat)
  group.add(trail)

  const velocity = direction.clone().normalize().multiplyScalar(TORPEDO_SPEED)

  return {
    mesh: group,
    velocity,
    age: 0,
    maxAge: 5.0,
    trail,
  }
}

const TORPEDO_HOMING_TURN = 3.0 // radians/sec — how fast the torpedo can steer

/**
 * Updates torpedo position and trail each frame.
 * If a targetPosition is set, the torpedo will home toward it.
 */
export function updateTorpedo(torpedo: PhotonTorpedo, delta: number): void {
  // ── Homing steering ──
  if (torpedo.targetPosition) {
    const toTarget = new THREE.Vector3().subVectors(torpedo.targetPosition, torpedo.mesh.position)
    const dist = toTarget.length()

    if (dist > 1) {
      const desiredDir = toTarget.normalize()
      const currentDir = torpedo.velocity.clone().normalize()
      const currentSpeed = torpedo.velocity.length()

      // Slerp the direction toward the target
      const maxTurn = TORPEDO_HOMING_TURN * delta
      const angle = currentDir.angleTo(desiredDir)

      if (angle > 0.001) {
        const t = Math.min(maxTurn / angle, 1)
        currentDir.lerp(desiredDir, t).normalize()
      }

      torpedo.velocity.copy(currentDir).multiplyScalar(currentSpeed)

      // Update mesh orientation to face travel direction
      const lookTarget = torpedo.mesh.position.clone().add(torpedo.velocity)
      torpedo.mesh.lookAt(lookTarget)
    }
  }

  torpedo.mesh.position.addScaledVector(torpedo.velocity, delta)
  torpedo.age += delta

  // Fade out near end of life
  const lifeRatio = torpedo.age / torpedo.maxAge
  if (lifeRatio > 0.7) {
    const fade = 1 - (lifeRatio - 0.7) / 0.3
    torpedo.mesh.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshBasicMaterial
        mat.opacity = mat.opacity * fade
      }
    })
  }
}
