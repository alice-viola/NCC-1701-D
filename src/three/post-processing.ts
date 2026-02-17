import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { createWarpEffectPass } from './warp-effect'
import type { WarpEffectState } from './warp-effect'

export interface PostProcessingSetup {
  composer: EffectComposer
  bloomPass: UnrealBloomPass
  smaaPass: SMAAPass
  warpEffect: WarpEffectState
}

/**
 * Sets up post-processing with SMAA, UnrealBloomPass, and warp effects.
 * CRITICAL: EffectComposer must render at full device-pixel resolution
 * (CSS pixels × devicePixelRatio), otherwise on Retina displays the
 * scene renders at half resolution causing massive aliasing.
 */
export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): PostProcessingSetup {
  const w = window.innerWidth
  const h = window.innerHeight
  const dpr = renderer.getPixelRatio()

  // Render target at FULL device pixel resolution (not CSS pixels)
  const pw = Math.floor(w * dpr)
  const ph = Math.floor(h * dpr)

  const renderTarget = new THREE.WebGLRenderTarget(pw, ph, {
    type: THREE.HalfFloatType,
    colorSpace: THREE.SRGBColorSpace,
  })

  const composer = new EffectComposer(renderer, renderTarget)
  // Tell the composer about pixel ratio so setSize works correctly
  composer.setPixelRatio(dpr)
  composer.setSize(w, h)

  // Base render pass
  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  // Bloom pass at half resolution (bloom is a blur — no visual loss, big perf gain)
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.floor(pw / 2), Math.floor(ph / 2)),
    0.2,  // strength
    0.2,  // radius
    0.95  // threshold
  )
  composer.addPass(bloomPass)

  // SMAA pass at full device pixel resolution
  const smaaPass = new (SMAAPass as any)(pw, ph) as SMAAPass
  composer.addPass(smaaPass)

  // Warp effects pass (chromatic aberration, tunnel vignette, radial blur)
  const warpEffect = createWarpEffectPass()
  composer.addPass(warpEffect.pass)

  // Output pass for correct color space
  const outputPass = new OutputPass()
  composer.addPass(outputPass)

  return { composer, bloomPass, smaaPass, warpEffect }
}

/**
 * Resizes the post-processing pipeline when the window resizes.
 */
export function resizePostProcessing(
  setup: PostProcessingSetup,
  width: number,
  height: number,
  pixelRatio: number = 1,
): void {
  const pw = Math.floor(width * pixelRatio)
  const ph = Math.floor(height * pixelRatio)
  setup.composer.setSize(width, height)
  setup.bloomPass.resolution.set(Math.floor(pw / 2), Math.floor(ph / 2))
  setup.smaaPass.setSize(pw, ph)
}
