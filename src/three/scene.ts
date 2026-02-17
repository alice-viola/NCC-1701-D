import * as THREE from 'three'

export interface SceneContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  clock: THREE.Clock
}

/** Compute FOV based on viewport aspect ratio — wider on portrait/narrow screens */
function responsiveFov(aspect: number): number {
  if (aspect < 0.75) return 90    // tall phone portrait
  if (aspect < 1.0)  return 80    // squarish portrait / tablet
  return 50                        // normal landscape
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000005)

  const aspect = window.innerWidth / window.innerHeight
  const camera = new THREE.PerspectiveCamera(
    responsiveFov(aspect),
    aspect,
    1.0,
    15000
  )
  camera.position.set(0, 2.5, 10)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
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
  camera.fov = responsiveFov(camera.aspect)
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}
