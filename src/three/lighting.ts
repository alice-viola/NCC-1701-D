import * as THREE from 'three'

export interface LightingSetup {
  lights: THREE.Light[]
  nacellePointLights: THREE.PointLight[]
  deflectorPointLight: THREE.PointLight
  impulsePointLight: THREE.PointLight
}

/**
 * Creates the lighting rig for the Enterprise scene.
 * Designed for a cinematic deep-space look: one key light (star),
 * subtle fills, and very soft colored point lights at engine positions.
 */
export function createLighting(scene: THREE.Scene): LightingSetup {
  const lights: THREE.Light[] = []

  // --- Key light: warm white simulating a distant star ---
  const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.0)
  keyLight.position.set(5, 8, 3)
  scene.add(keyLight)
  lights.push(keyLight)

  // --- Fill light: cool blue from the opposite side ---
  const fillLight = new THREE.DirectionalLight(0x8899cc, 0.5)
  fillLight.position.set(-4, 2, -3)
  scene.add(fillLight)
  lights.push(fillLight)

  // --- Rim/backlight: subtle silhouette edge ---
  const rimLight = new THREE.DirectionalLight(0xaabbdd, 0.4)
  rimLight.position.set(0, -2, -8)
  scene.add(rimLight)
  lights.push(rimLight)

  // --- Top fill for the saucer ---
  const topLight = new THREE.DirectionalLight(0xddeeff, 0.3)
  topLight.position.set(0, 10, 0)
  scene.add(topLight)
  lights.push(topLight)

  // --- Ambient: low fill to keep shadowed areas faintly visible ---
  const ambientLight = new THREE.AmbientLight(0x223344, 0.6)
  scene.add(ambientLight)
  lights.push(ambientLight)

  // --- Nacelle point lights: very soft blue tint on nearby hull ---
  const leftNacelleLight = new THREE.PointLight(0x3388ff, 1.5, 3, 2)
  leftNacelleLight.position.set(-0.95, 1.15, -0.5)
  scene.add(leftNacelleLight)

  const rightNacelleLight = new THREE.PointLight(0x3388ff, 1.5, 3, 2)
  rightNacelleLight.position.set(0.95, 1.15, -0.5)
  scene.add(rightNacelleLight)

  const nacellePointLights = [leftNacelleLight, rightNacelleLight]

  // --- Deflector point light: soft amber ---
  const deflectorPointLight = new THREE.PointLight(0xffaa22, 1.0, 2.5, 2)
  deflectorPointLight.position.set(0, -0.3, 1.8)
  scene.add(deflectorPointLight)

  // --- Impulse engine point light: soft red ---
  const impulsePointLight = new THREE.PointLight(0xff4422, 0.8, 2, 2)
  impulsePointLight.position.set(0, 0.35, -1.0)
  scene.add(impulsePointLight)

  return {
    lights,
    nacellePointLights,
    deflectorPointLight,
    impulsePointLight,
  }
}

/**
 * Creates a procedural space environment map for hull reflections.
 */
export function createSpaceEnvironment(
  renderer: THREE.WebGLRenderer
): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  pmremGenerator.compileEquirectangularShader()

  const envScene = new THREE.Scene()
  envScene.background = new THREE.Color(0x040810)

  // Dim environment lights for subtle reflections
  const envLight1 = new THREE.PointLight(0x4466aa, 80, 50)
  envLight1.position.set(10, 10, 10)
  envScene.add(envLight1)

  const envLight2 = new THREE.PointLight(0xaa6644, 40, 50)
  envLight2.position.set(-10, 5, -10)
  envScene.add(envLight2)

  const envMap = pmremGenerator.fromScene(envScene, 0.04).texture
  pmremGenerator.dispose()

  return envMap
}
