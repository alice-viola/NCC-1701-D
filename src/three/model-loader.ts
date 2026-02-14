import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import {
  createHullMaterial,
  createSecondaryHullMaterial,
  createNavLightMaterial,
} from './materials'
import { createHullTextures } from './textures'

// ---------------------------------------------------------------------------
// UV Generation
// ---------------------------------------------------------------------------

/**
 * Generates triplanar UV coordinates for a BufferGeometry that has no usable UVs.
 *
 * For each vertex, the dominant normal axis determines the projection plane:
 *   - Normal faces Y  →  project from XZ plane  (saucer top/bottom)
 *   - Normal faces X  →  project from YZ plane  (nacelle sides)
 *   - Normal faces Z  →  project from XY plane  (fore/aft surfaces)
 *
 * UVs are normalized to [0,1] based on the model's bounding size so that
 * texture repeat values control the tiling density.
 *
 * Must be called AFTER computeVertexNormals() and geometry centering,
 * but BEFORE the object is scaled.
 */
function generateTriplanarUVs(
  geometry: THREE.BufferGeometry,
  modelSize: THREE.Vector3,
): void {
  const positions = geometry.attributes.position as THREE.BufferAttribute
  const normals = geometry.attributes.normal as THREE.BufferAttribute
  if (!positions || !normals) return

  const count = positions.count
  const uvs = new Float32Array(count * 2)

  // Full-sizes for normalization (geometry is centered at origin)
  const hx = modelSize.x || 1
  const hy = modelSize.y || 1
  const hz = modelSize.z || 1

  for (let i = 0; i < count; i++) {
    const nx = Math.abs(normals.getX(i))
    const ny = Math.abs(normals.getY(i))
    const nz = Math.abs(normals.getZ(i))

    const px = positions.getX(i)
    const py = positions.getY(i)
    const pz = positions.getZ(i)

    if (ny >= nx && ny >= nz) {
      // Face points up/down → project from Y axis (use XZ as UV)
      uvs[i * 2]     = px / hx + 0.5
      uvs[i * 2 + 1] = pz / hz + 0.5
    } else if (nx >= ny && nx >= nz) {
      // Face points left/right → project from X axis (use ZY as UV)
      uvs[i * 2]     = pz / hz + 0.5
      uvs[i * 2 + 1] = py / hy + 0.5
    } else {
      // Face points forward/back → project from Z axis (use XY as UV)
      uvs[i * 2]     = px / hx + 0.5
      uvs[i * 2 + 1] = py / hy + 0.5
    }
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
}

// ---------------------------------------------------------------------------
// Model Loading
// ---------------------------------------------------------------------------

/**
 * Loads the Enterprise-D OBJ model, recomputes normals, generates UVs,
 * normalizes position/scale, and applies textured hull materials.
 */
export async function loadEnterpriseModel(
  onProgress?: (progress: number) => void
): Promise<THREE.Group> {
  const loader = new OBJLoader()

  return new Promise((resolve, reject) => {
    loader.load(
      '/models/enterprise-d/3d-model-smooth.obj',
      (object) => {
        console.log('[Enterprise] OBJ loaded, processing meshes...')

        let meshCount = 0
        let totalVerts = 0

        // Step 1: Recompute normals (OBJ only has 1 shared normal)
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const geometry = child.geometry as THREE.BufferGeometry
            geometry.computeVertexNormals()
            meshCount++
            totalVerts += geometry.attributes.position?.count ?? 0
          }
        })

        console.log(`[Enterprise] Found ${meshCount} meshes, ${totalVerts} total vertices`)

        // Step 2: Compute bounding box and center the geometry
        const box = new THREE.Box3().setFromObject(object)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        console.log(`[Enterprise] Bounding box size: ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`)
        console.log(`[Enterprise] Center: ${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)}`)

        // Translate geometry vertices directly to center at origin
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.translate(-center.x, -center.y, -center.z)
          }
        })

        // Step 3: Generate triplanar UVs (after centering, before scaling)
        console.log('[Enterprise] Generating triplanar UV coordinates...')
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            generateTriplanarUVs(child.geometry as THREE.BufferGeometry, size)
          }
        })

        // Step 4: Scale to fit within ~10 units
        const maxDim = Math.max(size.x, size.y, size.z)
        const scale = 10 / maxDim
        object.scale.setScalar(scale)
        console.log(`[Enterprise] Scale factor: ${scale.toFixed(6)}, maxDim: ${maxDim.toFixed(1)}`)

        // Verify final bounding box
        const finalBox = new THREE.Box3().setFromObject(object)
        const finalCenter = finalBox.getCenter(new THREE.Vector3())
        const finalSize = finalBox.getSize(new THREE.Vector3())
        console.log(`[Enterprise] Final size: ${finalSize.x.toFixed(2)} x ${finalSize.y.toFixed(2)} x ${finalSize.z.toFixed(2)}`)
        console.log(`[Enterprise] Final center: ${finalCenter.x.toFixed(2)}, ${finalCenter.y.toFixed(2)}, ${finalCenter.z.toFixed(2)}`)

        // Step 5: Generate procedural textures and apply materials
        console.log('[Enterprise] Generating hull textures...')
        const textures = createHullTextures()
        const hullMat = createHullMaterial(textures)
        const secondaryMat = createSecondaryHullMaterial(textures)
        let meshIndex = 0

        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = meshIndex === 0 ? hullMat : secondaryMat
            child.castShadow = false
            child.receiveShadow = false
            meshIndex++
          }
        })

        console.log('[Enterprise] Model ready, added to scene')

        resolve(object)
      },
      (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(event.loaded / event.total)
        }
      },
      (error) => {
        reject(error)
      }
    )
  })
}

// ---------------------------------------------------------------------------
// Glow Elements
// ---------------------------------------------------------------------------

export interface EmissiveElement {
  mesh: THREE.Mesh
  baseIntensity: number
  type: 'nacelle' | 'bussard' | 'deflector' | 'impulse' | 'navlight'
}

/**
 * Creates emissive glow objects for the ship's key features:
 * nacelle grilles, bussard collectors, deflector dish, impulse engines, and nav lights.
 *
 * Positions are approximate based on Enterprise-D proportions.
 * The model is normalized to ~10 units total length, centered at origin.
 */
export function createGlowElements(): {
  group: THREE.Group
  emissives: EmissiveElement[]
} {
  const group = new THREE.Group()
  const emissives: EmissiveElement[] = []

  // Note: Nacelle glow cylinders and bussard collector spheres removed --
  // the model's own nacelle geometry is now visible and textured, so
  // separate glow meshes were redundant and mispositioned. The point
  // lights in lighting.ts still provide blue/red spillover onto the hull.

  // --- Navigation Lights ---
  const navGeo = new THREE.SphereGeometry(0.03, 8, 8)

  // Port (left) - red — positioned at the actual saucer tip
  const portLight = new THREE.Mesh(navGeo, createNavLightMaterial(0xff0000))
  portLight.position.set(-3.85, 0.72, -2.14)
  group.add(portLight)
  emissives.push({ mesh: portLight, baseIntensity: 3.0, type: 'navlight' })

  // Starboard (right) - green — positioned at the actual saucer tip
  const starboardLight = new THREE.Mesh(navGeo.clone(), createNavLightMaterial(0x00ff00))
  starboardLight.position.set(3.85, 0.72, -2.14)
  group.add(starboardLight)
  emissives.push({ mesh: starboardLight, baseIntensity: 3.0, type: 'navlight' })

  return { group, emissives }
}
