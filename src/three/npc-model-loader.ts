/**
 * Loads the NPC ship OBJ model once, then clones it for each NPC instance.
 * The model is normalized, centered, and given a metallic hull material
 * with color tinting per faction.
 */

import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

const NPC_MODEL_PATH = '/models/npc/3d-model.obj'

/** Cached prototype — loaded once, cloned for each NPC */
let cachedPrototype: THREE.Group | null = null
let loadingPromise: Promise<THREE.Group> | null = null

/**
 * Load the NPC ship model (or return cached).
 * The model is centered at origin and scaled so its longest axis is ~1 unit,
 * making it easy to rescale per ship type.
 */
export async function loadNpcModel(): Promise<THREE.Group> {
  if (cachedPrototype) return cachedPrototype.clone()

  if (!loadingPromise) {
    loadingPromise = new Promise<THREE.Group>((resolve, reject) => {
      const loader = new OBJLoader()
      loader.load(
        NPC_MODEL_PATH,
        (object) => {
          console.log('[NPC Model] OBJ loaded, processing...')

          // Recompute normals
          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              ;(child.geometry as THREE.BufferGeometry).computeVertexNormals()
            }
          })

          // Center and normalize scale
          const box = new THREE.Box3().setFromObject(object)
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z)
          const scale = 1.0 / maxDim  // normalize to 1 unit

          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.translate(-center.x, -center.y, -center.z)
            }
          })
          object.scale.setScalar(scale)

          console.log(`[NPC Model] Normalized: ${size.x.toFixed(0)} x ${size.y.toFixed(0)} x ${size.z.toFixed(0)} → scale ${scale.toFixed(6)}`)

          cachedPrototype = object
          resolve(object.clone())
        },
        undefined,
        (error) => {
          console.error('[NPC Model] Failed to load:', error)
          reject(error)
        },
      )
    })
  }

  return loadingPromise.then(m => {
    // After first load, subsequent calls clone from cache
    return cachedPrototype ? cachedPrototype.clone() : m
  })
}

/**
 * Create a colored NPC ship by cloning the loaded model and applying
 * a tinted hull material.
 */
export function applyNpcMaterial(
  model: THREE.Group,
  hullColor: number,
  emissiveColor: number,
  metalness: number = 0.6,
): void {
  const mat = new THREE.MeshPhysicalMaterial({
    color: hullColor,
    metalness,
    roughness: 0.35,
    emissive: new THREE.Color(emissiveColor),
    emissiveIntensity: 0.15,
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
  })

  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = mat
    }
  })
}
