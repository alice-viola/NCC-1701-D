<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { createScene, handleResize } from '../three/scene'
import { loadEnterpriseModel, createGlowElements } from '../three/model-loader'
import { createLighting, createSpaceEnvironment } from '../three/lighting'
import { createPostProcessing, resizePostProcessing } from '../three/post-processing'
import { createStarfield, updateStarfieldSpeed } from '../three/starfield'
import {
  createNebulaSkybox, updateSkybox,
  createSystemObjects, disposeSystemObjects,
} from '../three/space-environment'
import type { SkyboxLayer, SystemObjects } from '../three/space-environment'
import { updateAnimations } from '../three/animation'
import { createGameState, updateDerivedState, syncHudState } from '../game/game-state'
import type { HudState, GameState } from '../game/game-state'
import { InputManager } from '../game/input-manager'
import { updateShip } from '../game/ship-controller'
import { updateCamera } from '../game/camera-controller'
import { createWeaponSystem, updateWeapons, disposeWeapons } from '../game/weapon-system'
import type { WeaponSystemState } from '../game/weapon-system'
import { createShieldSystem, updateShields } from '../game/shield-system'
import type { ShieldSystemState } from '../game/shield-system'
import HudOverlay from './HudOverlay.vue'
import StarMap from './StarMap.vue'
import { createAudioManager, initAudio, updateAudio, disposeAudio } from '../game/audio-manager'
import type { AudioManager } from '../game/audio-manager'
import { updateWarpEffect } from '../three/warp-effect'
import {
  createFreeCameraState, enterPhotoMode, exitPhotoMode,
  resetPhotoCamera, updateFreeCamera,
  onFreeCameraMouseDown, onFreeCameraMouseMove, onFreeCameraMouseUp,
} from '../game/free-camera'
import type { FreeCameraState } from '../game/free-camera'
import type { SceneContext } from '../three/scene'
import type { PostProcessingSetup } from '../three/post-processing'
import type { AnimationState } from '../three/animation'

// Universe, NPC, and Mission systems
import {
  createUniverseState, setDestination, initiateWarp,
  updateTravel, clearDestination,
} from '../game/universe-manager'
import type { UniverseState } from '../game/universe-manager'
import { getSystem } from '../game/universe'
// NPC system disabled until proper models are available
// import { createNpcSystem, spawnNpcs, updateNpcs, disposeNpcs } from '../game/npc-system'
// import type { NpcSystemState } from '../game/npc-system'
import {
  createMissionState, checkMissionObjectives,
  getActiveMission, getNextObjective, getAvailableMissions, acceptMission,
} from '../game/mission-system'
import type { MissionState, Mission } from '../game/mission-system'

// ─── Reactive UI State ────────────────────────────────────────────────────────

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isLoading = ref(true)
const loadProgress = ref(0)
const warpFlash = ref(0)
const showStarMap = ref(false)
const photoMode = ref(false)
const showMissionBriefing = ref<Mission | null>(null)
const missionCompleteMsg = ref('')
const missionCompleteMsgTimer = ref(0)
const systemArrivalMsg = ref('')
const systemArrivalTimer = ref(0)

let prevWarpState = false

// Reactive HUD state — primitive values only, tracked by Vue
const hudState: HudState = reactive({
  heading: 0,
  bearing: 0,
  speedDisplay: 'All Stop',
  throttle: 0,
  speed: 0,
  isWarp: false,
  shieldsActive: false,
  shieldStrength: 100,
  phaserCharge: 100,
  torpedoCount: 64,
})

// Reactive universe info for HUD and StarMap
const currentSystemId = ref('sol')
const currentSystemName = ref('Sol')
const destinationId = ref<string | null>(null)
const destinationName = ref('')
const travelPhase = ref('idle')
const activeMissionTitle = ref('')
const activeMissionObjective = ref('')
const captainRating = ref('Ensign')
const availableMissionsAtStation = ref<Mission[]>([])

// ─── Non-reactive Game State ──────────────────────────────────────────────────

let sceneCtx: SceneContext | null = null
let postProc: PostProcessingSetup | null = null
let animState: AnimationState | null = null
let state: GameState | null = null
let input: InputManager | null = null
let shipGroup: THREE.Group | null = null
let starfield: THREE.Points | null = null
let skybox: SkyboxLayer | null = null
let systemObjs: SystemObjects | null = null
let weaponState: WeaponSystemState | null = null
let shieldState: ShieldSystemState | null = null
let audioMgr: AudioManager | null = null
let audioInitialized = false
let animFrameId = 0
let freeCam: FreeCameraState | null = null

// New systems
let universeState: UniverseState | null = null
let missionState: MissionState | null = null

// ─── System Loading ───────────────────────────────────────────────────────────

function loadSystem(systemId: string): void {
  if (!sceneCtx) return

  const system = getSystem(systemId)
  if (!system) return

  // Dispose old system objects
  if (systemObjs) {
    sceneCtx.scene.remove(systemObjs.root)
    disposeSystemObjects(systemObjs)
    systemObjs = null
  }

  // Create new system objects (planets + star, no NPCs/stations for now)
  systemObjs = createSystemObjects(system)
  sceneCtx.scene.add(systemObjs.root)

  // Update reactive info
  currentSystemId.value = systemId
  currentSystemName.value = system.name

  // Check available missions
  if (missionState) {
    availableMissionsAtStation.value = getAvailableMissions(missionState, systemId)
  }

  console.log(`[Universe] Loaded system: ${system.name} (${system.planets.length} planets, ${system.npcs.length} NPCs)`)
}

// ─── Game Loop ────────────────────────────────────────────────────────────────

function gameLoop(): void {
  animFrameId = requestAnimationFrame(gameLoop)
  if (!sceneCtx || !postProc || !animState || !state || !input || !shipGroup) return

  const delta = Math.min(sceneCtx.clock.getDelta(), 0.05) // cap at 50ms
  const elapsed = sceneCtx.clock.getElapsedTime()

  // Handle star map toggle (M key)
  if (input.wasJustPressed('KeyM')) {
    showStarMap.value = !showStarMap.value
  }

  // Toggle photo mode (F key)
  if (input.wasJustPressed('KeyF') && freeCam) {
    if (!freeCam.active) {
      enterPhotoMode(freeCam, sceneCtx.camera)
      photoMode.value = true
    } else {
      exitPhotoMode(freeCam)
      photoMode.value = false
    }
  }

  // Reset camera in photo mode (R key)
  if (input.wasJustPressed('KeyR') && freeCam?.active) {
    resetPhotoCamera(freeCam, sceneCtx.camera)
  }

  // Don't update game while star map is open (pause)
  if (showStarMap.value) {
    postProc.composer.render()
    input.endFrame()
    return
  }

  // 1. Update universe travel state
  if (universeState && state) {
    travelPhase.value = universeState.travelPhase

    const travelResult = updateTravel(universeState, state, delta)

    if (travelResult === 'started-warp') {
      // Warp jump started — visual flash
      warpFlash.value = 1.0
    }

    if (travelResult === 'arrived') {
      // Arrived at new system!
      loadSystem(universeState.currentSystemId)
      warpFlash.value = 1.0
      systemArrivalMsg.value = `Arrived at ${universeState.currentSystem.name}`
      systemArrivalTimer.value = 4.0
      destinationId.value = null
      destinationName.value = ''

      // Check mission objectives
      if (missionState) {
        const result = checkMissionObjectives(missionState, universeState.currentSystemId)
        if (result.completed && result.mission) {
          missionCompleteMsg.value = `Mission Complete: ${result.mission.title}`
          missionCompleteMsgTimer.value = 5.0
          // Apply rewards
          state.torpedoCount = Math.min(64, state.torpedoCount + result.mission.torpedoReward)
          state.shieldStrength = Math.min(100, state.shieldStrength + result.mission.shieldReward)
          activeMissionTitle.value = ''
          activeMissionObjective.value = ''
        }
        updateMissionHud()
        captainRating.value = missionState.rating
      }
    }
  }

  // 1b. Check if E key should trigger inter-system warp (destination set)
  if (universeState && universeState.destination && universeState.travelPhase === 'idle') {
    if (input.wasJustPressed('CapsLock')) {
      if (state.throttle < 0.3) state.throttle = 0.5
      initiateWarp(universeState, state)
    }
  }

  // 2. Update ship from input (skip in photo mode and inter-system warp)
  if (!freeCam?.active) {
    if (!universeState || universeState.travelPhase === 'idle') {
      updateShip(state, input, delta)
    }
  }

  // 3. Apply ship transform to the ship group
  shipGroup.position.copy(state.position)
  shipGroup.quaternion.copy(state.quaternion)

  // 4. Update camera — free camera in photo mode, follow camera otherwise
  if (freeCam?.active) {
    updateFreeCamera(freeCam, sceneCtx.camera, input, delta)
  } else {
    updateCamera(sceneCtx.camera, state, delta)
  }

  // 5. Keep starfield + skybox centered on camera (infinitely far objects)
  if (starfield) {
    starfield.position.copy(sceneCtx.camera.position)
    updateStarfieldSpeed(starfield, state.speed)
  }
  if (skybox) updateSkybox(skybox, sceneCtx.camera.position, elapsed)

  // 5b. Rotate planets
  if (systemObjs) {
    for (const group of systemObjs.planets) {
      const planet = group.children[0]
      if (planet?.userData.rotSpeed) {
        planet.rotation.y += planet.userData.rotSpeed as number
      }
    }
    // Update star shader time
    if (systemObjs.star?.userData.isStar) {
      const starMat = systemObjs.star.material as THREE.ShaderMaterial
      if (starMat.uniforms?.uTime) {
        starMat.uniforms.uTime.value = elapsed
      }
    }
  }

  // 5c. NPC ships disabled until proper models are available

  // 6. Update audio BEFORE weapons
  if (audioMgr) updateAudio(audioMgr, state)

  // 6b. Update weapons and shields
  if (weaponState) updateWeapons(weaponState, state, sceneCtx.scene, shipGroup, delta)
  if (shieldState) updateShields(shieldState, state, elapsed, delta)

  // 7. Update derived display state and sync to reactive HUD
  updateDerivedState(state)
  syncHudState(hudState, state)

  // 8. Update visual animations
  animState.speed = state.speed
  animState.isWarp = state.isWarp
  animState.postProcessing = postProc
  updateAnimations(animState, elapsed, sceneCtx.camera)

  // 8b. Warp post-processing effects
  if (postProc.warpEffect) {
    if (state.isWarp !== prevWarpState) {
      warpFlash.value = 1.0
      prevWarpState = state.isWarp
    }
    if (warpFlash.value > 0) {
      warpFlash.value = Math.max(0, warpFlash.value - 4.0 * delta)
    }
    updateWarpEffect(postProc.warpEffect, state.isWarp, state.speed, elapsed, delta)
  }

  // 8c. Decay notification timers
  if (missionCompleteMsgTimer.value > 0) {
    missionCompleteMsgTimer.value -= delta
    if (missionCompleteMsgTimer.value <= 0) missionCompleteMsg.value = ''
  }
  if (systemArrivalTimer.value > 0) {
    systemArrivalTimer.value -= delta
    if (systemArrivalTimer.value <= 0) systemArrivalMsg.value = ''
  }

  // 9. Render
  postProc.composer.render()

  // 10. End-of-frame input cleanup
  input.endFrame()
}

function updateMissionHud(): void {
  if (!missionState) return
  const mission = getActiveMission(missionState)
  if (mission) {
    activeMissionTitle.value = mission.title
    const nextObj = getNextObjective(missionState)
    activeMissionObjective.value = nextObj?.description ?? 'All objectives complete'
  } else {
    activeMissionTitle.value = ''
    activeMissionObjective.value = ''
  }
}

// ─── Star Map Events ──────────────────────────────────────────────────────────

function onSelectSystem(systemId: string): void {
  if (!universeState) return
  if (setDestination(universeState, systemId)) {
    const system = getSystem(systemId)
    destinationId.value = systemId
    destinationName.value = system?.name ?? ''
  }
}

function onEngageWarp(): void {
  if (!universeState || !state) return
  // Set throttle if needed
  if (state.throttle < 0.3) state.throttle = 0.5
  if (initiateWarp(universeState, state)) {
    showStarMap.value = false
  }
}

function onCloseStarMap(): void {
  showStarMap.value = false
}

function onAcceptMission(mission: Mission): void {
  if (!missionState) return
  if (acceptMission(missionState, mission.id)) {
    showMissionBriefing.value = null
    updateMissionHud()
  }
}

// ─── Window Resize ────────────────────────────────────────────────────────────

function onWindowResize(): void {
  if (!sceneCtx || !postProc) return
  handleResize(sceneCtx)
  resizePostProcessing(
    postProc,
    window.innerWidth,
    window.innerHeight,
    sceneCtx.renderer.getPixelRatio(),
  )
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  if (!canvasRef.value) return

  // Scene setup
  sceneCtx = createScene(canvasRef.value)
  postProc = createPostProcessing(sceneCtx.renderer, sceneCtx.scene, sceneCtx.camera)

  const envMap = createSpaceEnvironment(sceneCtx.renderer)
  sceneCtx.scene.environment = envMap

  // Starfield (particle layer — follows camera)
  starfield = createStarfield(15000)
  sceneCtx.scene.add(starfield)

  // Nebula skybox (shader sphere — follows camera)
  skybox = createNebulaSkybox()
  sceneCtx.scene.add(skybox.nebulaSphere)

  // Lighting
  const lighting = createLighting(sceneCtx.scene)

  // Animation state
  animState = {
    emissives: [],
    lighting,
    starfield,
  }

  // Game state + input + weapons
  state = createGameState()
  input = new InputManager()
  input.attach()
  weaponState = createWeaponSystem()
  shieldState = createShieldSystem()
  audioMgr = createAudioManager()

  // Initialize new systems
  freeCam = createFreeCameraState()
  universeState = createUniverseState()
  missionState = createMissionState()

  // Load starting system (Sol)
  loadSystem('sol')

  // Init audio on first user interaction
  const initAudioOnce = () => {
    if (!audioInitialized && audioMgr) {
      audioInitialized = true
      window.removeEventListener('keydown', initAudioOnce)
      window.removeEventListener('click', initAudioOnce)
      initAudio(audioMgr)
    }
  }
  window.addEventListener('keydown', initAudioOnce)
  window.addEventListener('click', initAudioOnce)

  // Ship group
  shipGroup = new THREE.Group()
  sceneCtx.scene.add(shipGroup)

  // Add shield mesh to ship group
  if (shieldState) shipGroup.add(shieldState.mesh)

  // Reparent ship-local point lights
  const pointLights = [
    ...lighting.nacellePointLights,
    lighting.deflectorPointLight,
    lighting.impulsePointLight,
  ]
  for (const light of pointLights) {
    sceneCtx.scene.remove(light)
    shipGroup.add(light)
  }

  // Start game loop immediately
  gameLoop()

  // Load Enterprise model
  try {
    const model = await loadEnterpriseModel((progress) => {
      loadProgress.value = Math.round(progress * 100)
    })
    shipGroup.add(model)

    const { group: glowGroup, emissives } = createGlowElements()
    shipGroup.add(glowGroup)
    animState.emissives = emissives

    isLoading.value = false
  } catch (err) {
    console.error('Failed to load Enterprise model:', err)
    isLoading.value = false
  }

  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  cancelAnimationFrame(animFrameId)
  window.removeEventListener('resize', onWindowResize)
  input?.detach()
  if (weaponState && sceneCtx) disposeWeapons(weaponState, sceneCtx.scene)
  if (audioMgr) disposeAudio(audioMgr)
  if (systemObjs) disposeSystemObjects(systemObjs)
  if (sceneCtx) {
    sceneCtx.renderer.dispose()
  }
})
</script>

<template>
  <div class="game-container">
    <canvas ref="canvasRef" class="game-canvas" />

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

    <!-- Warp flash overlay -->
    <div
      v-if="warpFlash > 0.01"
      class="warp-flash"
      :style="{ opacity: warpFlash }"
    />

    <!-- System arrival notification -->
    <Transition name="slide-down">
      <div v-if="systemArrivalMsg" class="system-arrival">
        <div class="arrival-label">SYSTEM ENTERED</div>
        <div class="arrival-name">{{ systemArrivalMsg }}</div>
      </div>
    </Transition>

    <!-- Mission complete notification -->
    <Transition name="slide-down">
      <div v-if="missionCompleteMsg" class="mission-complete">
        <div class="complete-icon">★</div>
        <div class="complete-text">{{ missionCompleteMsg }}</div>
      </div>
    </Transition>

    <!-- Star Map overlay -->
    <Transition name="fade-fast">
      <StarMap
        v-if="showStarMap"
        :currentSystemId="currentSystemId"
        :destinationId="destinationId"
        :travelPhase="travelPhase"
        @selectSystem="onSelectSystem"
        @engage="onEngageWarp"
        @close="onCloseStarMap"
      />
    </Transition>

    <!-- Mission briefing modal -->
    <Transition name="fade-fast">
      <div v-if="showMissionBriefing" class="mission-modal-overlay" @click.self="showMissionBriefing = null">
        <div class="mission-modal">
          <div class="modal-header">MISSION BRIEFING</div>
          <div class="modal-title">{{ showMissionBriefing.title }}</div>
          <div class="modal-briefing">{{ showMissionBriefing.briefing }}</div>
          <div class="modal-objectives">
            <div class="modal-obj-header">OBJECTIVES:</div>
            <div v-for="(obj, i) in showMissionBriefing.objectives" :key="i" class="modal-obj">
              {{ i + 1 }}. {{ obj.description }}
            </div>
          </div>
          <div class="modal-reward">REWARD: {{ showMissionBriefing.reward }}</div>
          <div class="modal-actions">
            <button class="lcars-btn accept" @click="onAcceptMission(showMissionBriefing!)">ACCEPT MISSION</button>
            <button class="lcars-btn decline" @click="showMissionBriefing = null">DECLINE</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- HUD overlay -->
    <HudOverlay :state="hudState" />

    <!-- System / Mission info bar -->
    <div class="info-bar">
      <div class="info-bar-left">
        <span class="info-system">📍 {{ currentSystemName }}</span>
        <span v-if="destinationName" class="info-dest">→ {{ destinationName }}</span>
        <span v-if="travelPhase !== 'idle'" class="info-travel">{{ travelPhase.toUpperCase() }}</span>
      </div>
      <div class="info-bar-center">
        <span v-if="activeMissionTitle" class="info-mission">
          MISSION: {{ activeMissionTitle }}
          <span class="info-obj">| {{ activeMissionObjective }}</span>
        </span>
      </div>
      <div class="info-bar-right">
        <span class="info-rating">{{ captainRating }}</span>
        <span class="info-map-hint">M: Star Map</span>
      </div>
    </div>

    <!-- Available missions indicator -->
    <div
      v-if="availableMissionsAtStation.length > 0 && !activeMissionTitle"
      class="missions-available"
    >
      <div class="missions-header">MISSIONS AVAILABLE</div>
      <div
        v-for="mission in availableMissionsAtStation"
        :key="mission.id"
        class="mission-item"
        @click="showMissionBriefing = mission"
      >
        <span class="mission-type">{{ mission.type.toUpperCase() }}</span>
        <span class="mission-name">{{ mission.title }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: #000;
}

.game-canvas {
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

.fade-fast-enter-active,
.fade-fast-leave-active {
  transition: opacity 0.3s ease;
}
.fade-fast-enter-from,
.fade-fast-leave-to {
  opacity: 0;
}

.slide-down-enter-active {
  transition: all 0.4s ease;
}
.slide-down-leave-active {
  transition: all 0.6s ease;
}
.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Warp engage/disengage flash */
.warp-flash {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
  background: radial-gradient(
    ellipse at center,
    rgba(180, 210, 255, 0.9) 0%,
    rgba(100, 160, 255, 0.6) 30%,
    rgba(40, 80, 200, 0.2) 60%,
    transparent 80%
  );
}

/* System arrival notification */
.system-arrival {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;
  z-index: 8;
}

.arrival-label {
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.3rem;
  color: #cc7700;
}

.arrival-name {
  font-family: 'Segoe UI', sans-serif;
  font-size: 1.5rem;
  font-weight: 300;
  letter-spacing: 0.4rem;
  color: #ddeeff;
  text-shadow: 0 0 20px rgba(100, 160, 255, 0.5);
}

/* Mission complete notification */
.mission-complete {
  position: absolute;
  top: 120px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 10px;
}

.complete-icon {
  font-size: 1.5rem;
  color: #ffcc00;
}

.complete-text {
  font-family: 'Segoe UI', sans-serif;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.2rem;
  color: #ffcc00;
  text-shadow: 0 0 10px rgba(255, 200, 0, 0.5);
}

/* Info bar at the top */
.info-bar {
  position: absolute;
  top: 40px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 20px;
  pointer-events: none;
  z-index: 6;
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.1rem;
}

.info-bar-left,
.info-bar-center,
.info-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-system {
  color: #cc7700;
  font-weight: 600;
}

.info-dest {
  color: #55aaff;
}

.info-travel {
  color: #ff6644;
  animation: blink 1s ease infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.info-mission {
  color: #88ccaa;
}

.info-obj {
  color: #668877;
}

.info-rating {
  color: #cc7700;
  font-weight: 600;
  letter-spacing: 0.15rem;
}

.info-map-hint {
  color: #445566;
}

/* Available missions panel */
.missions-available {
  position: absolute;
  top: 120px;
  right: 20px;
  background: rgba(0, 10, 20, 0.85);
  border: 1px solid #cc770040;
  border-radius: 8px;
  padding: 12px 16px;
  z-index: 7;
  font-family: 'Segoe UI', sans-serif;
  max-width: 280px;
}

.missions-header {
  font-size: 0.6rem;
  letter-spacing: 0.2rem;
  color: #cc7700;
  margin-bottom: 8px;
  font-weight: 700;
}

.mission-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.mission-item:hover {
  background: rgba(204, 119, 0, 0.15);
}

.mission-type {
  font-size: 0.5rem;
  letter-spacing: 0.1rem;
  color: #667788;
  background: rgba(100, 120, 140, 0.2);
  padding: 2px 6px;
  border-radius: 3px;
}

.mission-name {
  font-size: 0.7rem;
  color: #aabbcc;
}

/* Mission briefing modal */
.mission-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 10, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 25;
}

.mission-modal {
  background: rgba(8, 15, 25, 0.98);
  border: 1px solid #cc770050;
  border-radius: 12px;
  padding: 30px;
  max-width: 500px;
  width: 90%;
  font-family: 'Segoe UI', sans-serif;
}

.modal-header {
  font-size: 0.6rem;
  letter-spacing: 0.3rem;
  color: #cc7700;
  margin-bottom: 8px;
}

.modal-title {
  font-size: 1.3rem;
  font-weight: 600;
  color: #ddeeff;
  margin-bottom: 16px;
}

.modal-briefing {
  font-size: 0.8rem;
  color: #8899aa;
  line-height: 1.6;
  margin-bottom: 16px;
  font-style: italic;
}

.modal-objectives {
  margin-bottom: 16px;
}

.modal-obj-header {
  font-size: 0.6rem;
  letter-spacing: 0.2rem;
  color: #667788;
  margin-bottom: 6px;
}

.modal-obj {
  font-size: 0.75rem;
  color: #aabbcc;
  padding: 3px 0 3px 10px;
  border-left: 2px solid #cc770040;
}

.modal-reward {
  font-size: 0.7rem;
  color: #55cc88;
  letter-spacing: 0.1rem;
  margin-bottom: 20px;
}

.modal-actions {
  display: flex;
  gap: 12px;
}

.lcars-btn {
  border: none;
  padding: 10px 24px;
  border-radius: 16px;
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.2rem;
  cursor: pointer;
  transition: all 0.2s;
}

.lcars-btn.accept {
  background: #cc7700;
  color: #000;
}

.lcars-btn.accept:hover {
  background: #ff9900;
}

.lcars-btn.decline {
  background: #334455;
  color: #8899aa;
}

.lcars-btn.decline:hover {
  background: #445566;
}
</style>
