import * as THREE from 'three'

export interface SceneContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  clock: THREE.Clock
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000005)

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    1.0,   // Raised from 0.1 — nearest object is ship hull at ~3 units
    15000
  )
  camera.position.set(0, 2.5, 10)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // SMAA post-processing handles AA — no need for MSAA
    powerPreference: 'high-performance',
  })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const clock = new THREE.Clock()

  return { scene, camera, renderer, clock }
}

export function handleResize(ctx: SceneContext): void {
  const { camera, renderer } = ctx
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}
