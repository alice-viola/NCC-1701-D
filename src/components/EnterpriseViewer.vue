<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { createScene, handleResize } from '../three/scene'
import { loadEnterpriseModel, createGlowElements } from '../three/model-loader'
import { createLighting, createSpaceEnvironment } from '../three/lighting'
import { createPostProcessing, resizePostProcessing } from '../three/post-processing'
import { createStarfield, createNebula } from '../three/starfield'
import { updateAnimations } from '../three/animation'
import type { SceneContext } from '../three/scene'
import type { PostProcessingSetup } from '../three/post-processing'
import type { AnimationState } from '../three/animation'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isLoading = ref(true)
const loadProgress = ref(0)

let sceneCtx: SceneContext | null = null
let postProc: PostProcessingSetup | null = null
let animState: AnimationState | null = null
let animFrameId: number = 0

function animate(): void {
  animFrameId = requestAnimationFrame(animate)

  if (!sceneCtx || !postProc || !animState) return

  const elapsed = sceneCtx.clock.getElapsedTime()

  // Update orbit controls
  sceneCtx.controls.update()

  // Update animated elements
  updateAnimations(animState, elapsed)

  // Render via post-processing composer
  postProc.composer.render()
}

function onWindowResize(): void {
  if (!sceneCtx || !postProc) return
  handleResize(sceneCtx)
  resizePostProcessing(postProc, window.innerWidth, window.innerHeight)
}

onMounted(async () => {
  if (!canvasRef.value) return

  // 1. Create the base scene
  sceneCtx = createScene(canvasRef.value)

  // 2. Set up post-processing (bloom)
  postProc = createPostProcessing(
    sceneCtx.renderer,
    sceneCtx.scene,
    sceneCtx.camera
  )

  // 3. Create space environment for reflections
  const envMap = createSpaceEnvironment(sceneCtx.renderer)
  sceneCtx.scene.environment = envMap

  // 4. Add starfield and nebula background
  const starfield = createStarfield(15000)
  sceneCtx.scene.add(starfield)

  const nebula = createNebula()
  sceneCtx.scene.add(nebula)

  // 5. Set up lighting
  const lighting = createLighting(sceneCtx.scene)

  // 6. Initialize animation state
  animState = {
    emissives: [],
    lighting,
    starfield,
  }

  // 7. Start animation loop (even before model loads, for the starfield)
  animate()

  // 8. Load the Enterprise-D model
  try {
    const model = await loadEnterpriseModel((progress) => {
      loadProgress.value = Math.round(progress * 100)
    })
    sceneCtx.scene.add(model)

    // 9. Add glow elements (nacelles, deflector, etc.)
    const { group: glowGroup, emissives } = createGlowElements()
    sceneCtx.scene.add(glowGroup)
    animState.emissives = emissives

    isLoading.value = false
  } catch (err) {
    console.error('Failed to load Enterprise model:', err)
    isLoading.value = false
  }

  // 10. Listen for window resize
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  cancelAnimationFrame(animFrameId)
  window.removeEventListener('resize', onWindowResize)

  if (sceneCtx) {
    sceneCtx.renderer.dispose()
    sceneCtx.controls.dispose()
  }
})
</script>

<template>
  <div class="viewer-container">
    <canvas ref="canvasRef" class="viewer-canvas" />

    <!-- Loading overlay -->
    <Transition name="fade">
      <div v-if="isLoading" class="loading-overlay">
        <div class="loading-content">
          <div class="loading-title">USS ENTERPRISE</div>
          <div class="loading-subtitle">NCC-1701-D</div>
          <div class="loading-bar-container">
            <div class="loading-bar" :style="{ width: loadProgress + '%' }" />
          </div>
          <div class="loading-text">INITIALIZING SYSTEMS... {{ loadProgress }}%</div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.viewer-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: #000;
}

.viewer-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse at center, #0a0a1a 0%, #000000 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.loading-content {
  text-align: center;
  color: #88aacc;
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
}

.loading-title {
  font-size: 2.5rem;
  font-weight: 300;
  letter-spacing: 0.8rem;
  color: #aaccee;
  margin-bottom: 0.3rem;
}

.loading-subtitle {
  font-size: 1.2rem;
  font-weight: 300;
  letter-spacing: 0.5rem;
  color: #6688aa;
  margin-bottom: 2rem;
}

.loading-bar-container {
  width: 300px;
  height: 2px;
  background: rgba(100, 130, 170, 0.2);
  margin: 0 auto 1rem;
  border-radius: 1px;
  overflow: hidden;
}

.loading-bar {
  height: 100%;
  background: linear-gradient(90deg, #3388ff, #88ccff);
  border-radius: 1px;
  transition: width 0.3s ease;
  box-shadow: 0 0 10px rgba(51, 136, 255, 0.5);
}

.loading-text {
  font-size: 0.75rem;
  letter-spacing: 0.3rem;
  color: #556677;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 1.5s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
