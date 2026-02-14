import * as THREE from 'three'

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

/**
 * Updates torpedo position and trail each frame.
 */
export function updateTorpedo(torpedo: PhotonTorpedo, delta: number): void {
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
