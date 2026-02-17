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
import { createExplosion, updateExplosion, disposeExplosion } from '../three/effects'
import type { Explosion } from '../three/effects'
import { createShieldSystem, updateShields } from '../game/shield-system'
import type { ShieldSystemState } from '../game/shield-system'
import HudOverlay from './HudOverlay.vue'
import TouchControls from './TouchControls.vue'
import DesktopControls from './DesktopControls.vue'
import { createAudioManager, prefetchAudio, resumeAudio, updateAudio, disposeAudio } from '../game/audio-manager'
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
import { getSystem } from '../game/universe'

// Combat & Enemy
import { createCombatState, syncPlayerShields, updateCombatTimers, checkPhaserHits, checkTorpedoHits } from '../game/combat-system'
import type { CombatState } from '../game/combat-system'
import { createEnemyShip, updateEnemyAI, disposeEnemy } from '../game/enemy-ai'
import type { EnemyShip } from '../game/enemy-ai'

// Voice Commands
import {
  createVoiceCommander, toggleListening, updateVoiceCommander, disposeVoiceCommander,
} from '../game/voice-commander'
import type { VoiceCommanderState } from '../game/voice-commander'
import { executeVoiceCommand } from '../game/voice-executor'

// ─── Reactive UI State ────────────────────────────────────────────────────────

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isLoading = ref(true)
const loadProgress = ref(0)
const warpFlash = ref(0)
const photoMode = ref(false)
const isTouchDevice = ref(false)

let prevWarpState = false

// Reactive HUD state
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

// ─── Mission State ────────────────────────────────────────────────────────────

const missionPhase = ref<'free' | 'briefing' | 'active' | 'victory' | 'defeat'>('free')
const briefingText = ref('')
const briefingCharIndex = ref(0)
const showStartButton = ref(true)
const playerHull = ref(100)
const enemyHull = ref(100)
const enemyDistance = ref(0)
const damageFlash = ref(0)
const enemyBehavior = ref<string>('idle')

// Briefing text content
const BRIEFING_FULL_TEXT =
  `Captain Picard. Starfleet Command has issued an urgent directive. ` +
  `Long-range sensors have detected the USS Reliant, a Federation Miranda-class vessel ` +
  `reported missing near the Saturnian system. Telemetry confirms the ship has been ` +
  `assimilated by the Borg. The Reliant is operating under Borg control beyond Saturn's orbit. ` +
  `Your orders are clear: proceed to Saturn, intercept the Reliant, and neutralize the threat ` +
  `before it can reach Earth. The Enterprise is the only ship in range. ` +
  `Engage at maximum warp. Good luck, Captain. Picard out.`

let briefingTimer = 0

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
let animFrameId = 0
let freeCam: FreeCameraState | null = null
let combatState: CombatState | null = null
let enemy: EnemyShip | null = null
const explosions: Explosion[] = []
let voiceCmd: VoiceCommanderState | null = null

// Reactive voice HUD state
const voiceStatus = ref<'idle' | 'listening' | 'processing' | 'success' | 'error'>('idle')
const voiceTranscript = ref('')
const voiceConfirmation = ref('')
const voiceSupported = ref(false)

/** Timer to auto-fire phasers for a burst when triggered by voice */
let voicePhaserBurstTimer = 0

/** Auto-pilot: target position to fly toward (set by NAVIGATE_TO voice command) */
let autoPilotTarget: THREE.Vector3 | null = null
const AUTO_PILOT_TURN_SPEED = 0.8 // rad/s

/** Reusable vector for collision detection (avoid GC) */
const _collisionVec = new THREE.Vector3()

// ─── Briefing Voice ──────────────────────────────────────────────────────────


function startBriefing(): void {
  showStartButton.value = false
  missionPhase.value = 'briefing'
  briefingText.value = ''
  briefingCharIndex.value = 0
  briefingTimer = 0

  // Start text-to-speech
  if ('speechSynthesis' in window) {
    const utter = new SpeechSynthesisUtterance(BRIEFING_FULL_TEXT)
    utter.rate = 0.95
    utter.pitch = 0.9
    utter.volume = 0.8
    // Try to pick a deep male voice
    const voices = speechSynthesis.getVoices()
    const preferred = voices.find(v =>
      v.name.includes('Daniel') || v.name.includes('Male') ||
      v.name.includes('James') || v.name.includes('Google UK English Male'),
    )
    if (preferred) utter.voice = preferred
    utter.onend = () => {
      // Ensure all text is shown
      briefingText.value = BRIEFING_FULL_TEXT
      briefingCharIndex.value = BRIEFING_FULL_TEXT.length
    }
    speechSynthesis.speak(utter)
    // utterance is managed by speechSynthesis
  }
}

function skipBriefing(): void {
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel()
  }
  briefingText.value = BRIEFING_FULL_TEXT
  briefingCharIndex.value = BRIEFING_FULL_TEXT.length
}

function startMission(): void {
  missionPhase.value = 'active'

  // Spawn enemy ship
  if (sceneCtx && !enemy) {
    combatState = createCombatState()
    enemy = createEnemyShip(sceneCtx.scene)
  }
}

// ─── Navigation Target Resolution ────────────────────────────────────────────

/** Planet orbit data from universe definitions (Sol system) */
const PLANET_POSITIONS: Record<string, { orbitRadius: number; orbitAngle: number }> = {
  earth:   { orbitRadius: 400, orbitAngle: 0 },
  mars:    { orbitRadius: 700, orbitAngle: 2.1 },
  jupiter: { orbitRadius: 1400, orbitAngle: 3.8 },
  saturn:  { orbitRadius: 2200, orbitAngle: 1.5 },
}

function resolveNavTarget(target: string): THREE.Vector3 | null {
  // Named planet
  const planetData = PLANET_POSITIONS[target]
  if (planetData) {
    return new THREE.Vector3(
      Math.cos(planetData.orbitAngle) * planetData.orbitRadius,
      0,
      Math.sin(planetData.orbitAngle) * planetData.orbitRadius,
    )
  }

  // "enemy" — navigate toward enemy ship
  if (target === 'enemy' && enemy) {
    return enemy.position.clone()
  }

  return null
}

// ─── Game Loop ────────────────────────────────────────────────────────────────

function gameLoop(): void {
  animFrameId = requestAnimationFrame(gameLoop)
  if (!sceneCtx || !postProc || !animState || !state || !input || !shipGroup) return

  const delta = Math.min(sceneCtx.clock.getDelta(), 0.05)
  const elapsed = sceneCtx.clock.getElapsedTime()

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

  // ── Voice Commands (C key) ──
  if (input.wasJustPressed('KeyC') && voiceCmd) {
    toggleListening(voiceCmd)
  }

  if (voiceCmd) {
    const commands = updateVoiceCommander(voiceCmd, delta)

    // Execute any queued voice commands
    for (const action of commands) {
      if (state) {
        const reportText = executeVoiceCommand(action, {
          gameState: state,
          onStartMission: () => {
            if (missionPhase.value === 'free') startBriefing()
          },
          onNavigateTo: (target: string) => {
            // Resolve target to a world position
            const pos = resolveNavTarget(target)
            if (pos) {
              autoPilotTarget = pos
              return true
            }
            return false
          },
          onDamageReport: () => {
            const hullPct = combatState ? Math.round(combatState.playerHealth.hull) : 100
            const shields = state!.shieldsActive
              ? `Shields are up at ${Math.round(state!.shieldStrength)} percent.`
              : 'Shields are down.'
            return `Hull integrity at ${hullPct} percent. ${shields} Phaser banks at ${Math.round(state!.phaserCharge)} percent. ${state!.torpedoCount} torpedoes remaining.`
          },
          onStatusReport: () => {
            const speed = state!.speedDisplay
            const shields = state!.shieldsActive ? 'Shields up' : 'Shields down'
            const dist = enemy ? Math.round(enemy.position.distanceTo(state!.position)) : 'unknown'
            return `Speed: ${speed}. Heading ${state!.heading}. ${shields}. Enemy distance: ${dist}.`
          },
        })

        // For voice-triggered phasers, fire a sustained burst
        if (action.type === 'FIRE_PHASERS') {
          voicePhaserBurstTimer = 2.0
        }

        // Speak report results
        if (reportText && window.speechSynthesis) {
          window.speechSynthesis.cancel()
          const utterance = new SpeechSynthesisUtterance(reportText)
          utterance.rate = 1.0
          utterance.pitch = 0.9
          utterance.volume = 0.7
          window.speechSynthesis.speak(utterance)
          voiceCmd.lastConfirmation = reportText
        }
      }
    }

    // Sync voice state to reactive refs for HUD
    voiceStatus.value = voiceCmd.status
    voiceTranscript.value = voiceCmd.lastTranscript
    voiceConfirmation.value = voiceCmd.lastConfirmation
  }

  // Voice-triggered phaser burst (fire for a few seconds then stop)
  if (voicePhaserBurstTimer > 0 && state) {
    state.phaserFiring = true
    voicePhaserBurstTimer -= delta
    if (voicePhaserBurstTimer <= 0) {
      voicePhaserBurstTimer = 0
      // Don't force-stop if player is also holding Space
      if (!input.isPressed('Space')) {
        state.phaserFiring = false
      }
    }
  }

  // ── Auto-pilot (voice navigation) ──
  if (autoPilotTarget && state) {
    const toTarget = new THREE.Vector3().subVectors(autoPilotTarget, state.position)
    const distToTarget = toTarget.length()

    if (distToTarget < 50) {
      // Arrived — disengage auto-pilot
      autoPilotTarget = null
    } else {
      // Turn toward target
      const lookMatrix = new THREE.Matrix4()
      lookMatrix.lookAt(state.position, autoPilotTarget, new THREE.Vector3(0, 1, 0))
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix)

      const t = Math.min(AUTO_PILOT_TURN_SPEED * delta, 1)
      state.quaternion.slerp(targetQuat, t)
      state.quaternion.normalize()

      // Cancel auto-pilot if player manually steers (any WASDQE input)
      if (
        input.isPressed('KeyW') || input.isPressed('KeyS') ||
        input.isPressed('KeyA') || input.isPressed('KeyD') ||
        input.isPressed('KeyQ') || input.isPressed('KeyE')
      ) {
        autoPilotTarget = null
      }
    }
  }

  // ── Briefing text typewriter ──
  if (missionPhase.value === 'briefing') {
    briefingTimer += delta
    const charsPerSecond = 40
    const targetIndex = Math.min(
      Math.floor(briefingTimer * charsPerSecond),
      BRIEFING_FULL_TEXT.length,
    )
    if (targetIndex > briefingCharIndex.value) {
      briefingCharIndex.value = targetIndex
      briefingText.value = BRIEFING_FULL_TEXT.slice(0, targetIndex)
    }
  }

  // ── Update ship (skip in photo mode) ──
  if (!freeCam?.active) {
    updateShip(state, input, delta)
  }

  // ── Planet collision detection ──
  if (systemObjs) {
    for (const planetGroup of systemObjs.planets) {
      const radius = planetGroup.userData.collisionRadius as number
      if (!radius) continue

      const toShip = _collisionVec.subVectors(state.position, planetGroup.position)
      const dist = toShip.length()
      const minDist = radius + 2 // 2 units buffer for ship size

      if (dist < minDist) {
        // Push ship out to the surface
        toShip.normalize().multiplyScalar(minDist)
        state.position.copy(planetGroup.position).add(toShip)
        // Kill velocity to prevent sliding through
        state.speed = Math.min(state.speed, 0.1)
        state.throttle = Math.min(state.throttle, 0.1)
        if (state.isWarp) state.isWarp = false
      }
    }

    // Also check the star
    if (systemObjs.star) {
      const starRadius = (systemObjs.star.geometry as THREE.SphereGeometry).parameters.radius
      const toShip = _collisionVec.subVectors(state.position, systemObjs.star.position)
      const dist = toShip.length()
      const minDist = starRadius + 5

      if (dist < minDist) {
        toShip.normalize().multiplyScalar(minDist)
        state.position.copy(systemObjs.star.position).add(toShip)
        state.speed = Math.min(state.speed, 0.1)
        state.throttle = Math.min(state.throttle, 0.1)
        if (state.isWarp) state.isWarp = false
      }
    }
  }

  // Apply ship transform
  shipGroup.position.copy(state.position)
  shipGroup.quaternion.copy(state.quaternion)

  // ── Camera ──
  if (freeCam?.active) {
    updateFreeCamera(freeCam, sceneCtx.camera, input, delta)
  } else {
    updateCamera(sceneCtx.camera, state, delta)
  }

  // ── Starfield + Skybox ──
  if (starfield) {
    starfield.position.copy(sceneCtx.camera.position)
    updateStarfieldSpeed(starfield, state.speed)
  }
  if (skybox) updateSkybox(skybox, sceneCtx.camera.position, elapsed)

  // ── Rotate planets ──
  if (systemObjs) {
    for (const group of systemObjs.planets) {
      const planet = group.children[0]
      if (planet?.userData.rotSpeed) {
        planet.rotation.y += planet.userData.rotSpeed as number
      }
    }
    if (systemObjs.star?.userData.isStar) {
      const starMat = systemObjs.star.material as THREE.ShaderMaterial
      if (starMat.uniforms?.uTime) {
        starMat.uniforms.uTime.value = elapsed
      }
    }
  }

  // ── Audio ──
  if (audioMgr) updateAudio(audioMgr, state)

  // ── Weapons & Shields ──
  // Pass enemy position for auto-aim when in active combat
  const aimTarget = (missionPhase.value === 'active' && enemy && !combatState?.enemyHealth.isDestroyed)
    ? enemy.position
    : undefined
  if (weaponState) updateWeapons(weaponState, state, sceneCtx.scene, shipGroup, delta, aimTarget)
  if (shieldState) updateShields(shieldState, state, elapsed, delta)

  // ── Enemy AI & Combat (only during active mission) ──
  if (missionPhase.value === 'active' && enemy && combatState && state) {
    // Sync player shields
    syncPlayerShields(combatState, state)

    // Update enemy AI
    updateEnemyAI(enemy, state, combatState, sceneCtx.scene, delta)

    // Check player weapons hitting enemy
    const phaserHit = checkPhaserHits(combatState, state, enemy.position, delta)

    // Phaser hit sparks (throttled — ~2 per second)
    if (phaserHit && Math.random() < delta * 2) {
      const sparkPos = enemy.position.clone().add(
        new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4),
      )
      const exp = createExplosion(sparkPos, 'phaser')
      sceneCtx.scene.add(exp.group)
      explosions.push(exp)
    }

    // Check torpedo hits
    if (weaponState && weaponState.torpedoes.length > 0) {
      const torpPositions = weaponState.torpedoes.map(t => t.mesh.position.clone())
      const hits = checkTorpedoHits(combatState, torpPositions, enemy.position)
      // Remove hit torpedoes and spawn explosions (reverse order)
      for (let i = hits.length - 1; i >= 0; i--) {
        const idx = hits[i]!
        const torp = weaponState.torpedoes[idx]!
        // Spawn torpedo explosion at impact point
        const exp = createExplosion(torp.mesh.position.clone(), 'torpedo')
        sceneCtx.scene.add(exp.group)
        explosions.push(exp)
        // Remove torpedo
        sceneCtx.scene.remove(torp.mesh)
        torp.mesh.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
            child.geometry.dispose()
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose())
            } else {
              child.material.dispose()
            }
          }
        })
        weaponState.torpedoes.splice(idx, 1)
      }
    }

    // Spawn explosion when enemy fires torpedo at player
    if (enemy.torpedoJustFired) {
      const playerHitPos = state.position.clone().add(
        new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3),
      )
      const exp = createExplosion(playerHitPos, 'torpedo')
      sceneCtx.scene.add(exp.group)
      explosions.push(exp)
    }

    // Update combat timers
    updateCombatTimers(combatState, delta)

    // Sync to reactive state
    playerHull.value = Math.round(combatState.playerHealth.hull)
    enemyHull.value = Math.round(combatState.enemyHealth.hull)
    enemyDistance.value = Math.round(enemy.position.distanceTo(state.position))
    enemyBehavior.value = enemy.behavior

    // Damage flash on player
    if (combatState.playerHealth.damageFlash > 0) {
      damageFlash.value = combatState.playerHealth.damageFlash
    } else {
      damageFlash.value = Math.max(0, damageFlash.value - 3 * delta)
    }

    // Sync player hull back into game state shield strength
    state.shieldStrength = combatState.playerHealth.shieldStrength
    if (combatState.playerHealth.shieldStrength <= 0) {
      state.shieldsActive = false
    }

    // Game over check
    if (combatState.gameOver === 'victory' && missionPhase.value === 'active') {
      missionPhase.value = 'victory'
    } else if (combatState.gameOver === 'defeat' && missionPhase.value === 'active') {
      missionPhase.value = 'defeat'
    }
  }

  // ── Update explosions ──
  for (let i = explosions.length - 1; i >= 0; i--) {
    const exp = explosions[i]!
    updateExplosion(exp, delta)
    if (exp.age >= exp.maxAge) {
      disposeExplosion(exp, sceneCtx.scene)
      explosions.splice(i, 1)
    }
  }

  // ── Derived state + HUD ──
  updateDerivedState(state)
  syncHudState(hudState, state)

  // ── Visual animations ──
  animState.speed = state.speed
  animState.isWarp = state.isWarp
  animState.postProcessing = postProc
  updateAnimations(animState, elapsed, sceneCtx.camera)

  // ── Warp post-processing ──
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

  // ── Render ──
  postProc.composer.render()

  // ── End frame ──
  input.endFrame()
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

// ─── Touch Control Handlers ──────────────────────────────────────────────────

function onTouchThrottle(speed: number): void {
  if (!state) return
  state.throttle = speed === 0 ? 0 : speed / 9
}

function onTouchWarp(): void {
  if (!input) return
  input.simulateKeyDown('CapsLock')
  setTimeout(() => input?.simulateKeyUp('CapsLock'), 100)
}

function onTouchShields(): void {
  if (!input) return
  input.simulateKeyDown('KeyX')
  setTimeout(() => input?.simulateKeyUp('KeyX'), 100)
}

function onTouchVoice(): void {
  if (!input) return
  input.simulateKeyDown('KeyC')
  setTimeout(() => input?.simulateKeyUp('KeyC'), 100)
}

// ─── Restart Game ─────────────────────────────────────────────────────────────

function restartGame(): void {
  // Clean up enemy
  if (enemy && sceneCtx) {
    disposeEnemy(enemy, sceneCtx.scene)
    enemy = null
  }
  combatState = null

  // Reset game state
  if (state) {
    state.position.set(0, 0, 0)
    state.quaternion.identity()
    state.velocity.set(0, 0, 0)
    state.throttle = 0
    state.speed = 0
    state.isWarp = false
    state.shieldsActive = false
    state.shieldStrength = 100
    state.phaserCharge = 100
    state.torpedoCount = 64
    state.phaserFiring = false
    state.torpedoFiring = false
  }

  // Reset UI
  missionPhase.value = 'free'
  showStartButton.value = true
  playerHull.value = 100
  enemyHull.value = 100
  damageFlash.value = 0
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  if (!canvasRef.value) return

  // Detect touch device
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  // Scene setup
  sceneCtx = createScene(canvasRef.value)
  postProc = createPostProcessing(sceneCtx.renderer, sceneCtx.scene, sceneCtx.camera)

  const envMap = createSpaceEnvironment(sceneCtx.renderer)
  sceneCtx.scene.environment = envMap

  // Starfield
  starfield = createStarfield(1000)
  sceneCtx.scene.add(starfield)

  // Nebula skybox
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

  // Game state
  state = createGameState()
  input = new InputManager()
  input.attach()
  weaponState = createWeaponSystem()
  shieldState = createShieldSystem()
  audioMgr = createAudioManager()

  // Free camera
  freeCam = createFreeCameraState()

  // Voice command system
  voiceCmd = createVoiceCommander()
  voiceSupported.value = voiceCmd.supported

  // Load Sol system (our playground)
  const solSystem = getSystem('sol')
  if (solSystem) {
    systemObjs = createSystemObjects(solSystem)
    sceneCtx.scene.add(systemObjs.root)
  }

  // Start prefetching audio files immediately (no user gesture needed)
  if (audioMgr) {
    prefetchAudio(audioMgr)
  }

  // Create AudioContext on first user gesture (required on iOS/mobile)
  const resumeAudioOnce = () => {
    if (audioMgr) {
      resumeAudio(audioMgr) // creates context if needed, resumes if suspended
    }
    if (audioMgr?.ctx?.state === 'running') {
      window.removeEventListener('keydown', resumeAudioOnce)
      window.removeEventListener('click', resumeAudioOnce)
      window.removeEventListener('touchstart', resumeAudioOnce)
    }
  }
  window.addEventListener('keydown', resumeAudioOnce)
  window.addEventListener('click', resumeAudioOnce)
  window.addEventListener('touchstart', resumeAudioOnce)

  // Ship group
  shipGroup = new THREE.Group()
  sceneCtx.scene.add(shipGroup)

  // Shield mesh
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

  // Start game loop
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

  // Mouse events for free camera
  const canvas = canvasRef.value!
  canvas.addEventListener('mousedown', (e) => { if (freeCam) onFreeCameraMouseDown(freeCam, e) })
  canvas.addEventListener('mousemove', (e) => { if (freeCam) onFreeCameraMouseMove(freeCam, e) })
  canvas.addEventListener('mouseup', () => { if (freeCam) onFreeCameraMouseUp(freeCam) })

  // Preload voices for speech synthesis
  speechSynthesis.getVoices()
})

onUnmounted(() => {
  cancelAnimationFrame(animFrameId)
  window.removeEventListener('resize', onWindowResize)
  input?.detach()
  if (weaponState && sceneCtx) disposeWeapons(weaponState, sceneCtx.scene)
  if (audioMgr) disposeAudio(audioMgr)
  if (systemObjs) disposeSystemObjects(systemObjs)
  if (enemy && sceneCtx) disposeEnemy(enemy, sceneCtx.scene)
  if (sceneCtx) {
    for (const exp of explosions) disposeExplosion(exp, sceneCtx.scene)
    explosions.length = 0
  }
  if (voiceCmd) disposeVoiceCommander(voiceCmd)
  if (speechSynthesis.speaking) speechSynthesis.cancel()
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
          <div class="loading-disclaimer">
            Unofficial fan project. Star Trek and related marks are trademarks of Paramount Global. Not affiliated with or endorsed by Paramount.
          </div>
          <a
            class="github-link loading-github"
            href="https://github.com/alice-viola/NCC-1701-D"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg class="github-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            <span>View on GitHub</span>
          </a>
        </div>
      </div>
    </Transition>

    <!-- Warp flash overlay -->
    <div
      v-if="warpFlash > 0.01"
      class="warp-flash"
      :style="{ opacity: warpFlash }"
    />

    <!-- Damage flash overlay (red) -->
    <div
      v-if="damageFlash > 0.01"
      class="damage-flash"
      :style="{ opacity: damageFlash * 0.4 }"
    />

    <!-- Photo mode indicator -->
    <div v-if="photoMode" class="photo-mode-indicator">
      <div class="photo-label">PHOTO MODE</div>
      <div class="photo-controls">
        WASD: Move | Q/E: Up/Down | Mouse Drag: Look | ,/.: Zoom | R: Reset | F: Exit
      </div>
    </div>

    <!-- Start Mission button (free exploration phase) -->
    <Transition name="fade-fast">
      <div v-if="showStartButton && !isLoading" class="start-mission-container">
        <div class="start-mission-subtitle">USS Enterprise NCC-1701-D</div>
        <div class="start-mission-hint">Explore freely or begin your mission</div>
        <button class="start-mission-btn" @click="startBriefing">
          START MISSION
        </button>
      </div>
    </Transition>

    <!-- Mission Briefing overlay -->
    <Transition name="fade-fast">
      <div v-if="missionPhase === 'briefing'" class="briefing-overlay">
        <div class="briefing-panel">
          <div class="briefing-header">
            <div class="briefing-starfleet">STARFLEET COMMAND</div>
            <div class="briefing-priority">PRIORITY ONE</div>
          </div>
          <div class="briefing-text">{{ briefingText }}<span class="briefing-cursor">|</span></div>
          <div class="briefing-actions" v-if="briefingCharIndex >= BRIEFING_FULL_TEXT.length">
            <button class="lcars-btn engage" @click="startMission">ENGAGE</button>
          </div>
          <div class="briefing-actions" v-else>
            <button class="lcars-btn skip" @click="skipBriefing">SKIP</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Combat HUD (during active mission) -->
    <div v-if="missionPhase === 'active'" class="combat-hud">
      <!-- Player hull -->
      <div class="hull-bar player-hull">
        <div class="hull-label">ENTERPRISE HULL</div>
        <div class="hull-track">
          <div
            class="hull-fill"
            :class="{ critical: playerHull < 30 }"
            :style="{ width: playerHull + '%' }"
          />
        </div>
        <div class="hull-value">{{ playerHull }}%</div>
      </div>

      <!-- Enemy hull -->
      <div class="hull-bar enemy-hull">
        <div class="hull-label">USS RELIANT (BORG)</div>
        <div class="hull-track">
          <div
            class="hull-fill enemy"
            :class="{ critical: enemyHull < 30 }"
            :style="{ width: enemyHull + '%' }"
          />
        </div>
        <div class="hull-value">{{ enemyHull }}%</div>
      </div>

      <!-- Enemy info -->
      <div class="enemy-info">
        <span class="enemy-dist">RANGE: {{ enemyDistance }}m</span>
        <span class="enemy-status" :class="enemyBehavior">{{ enemyBehavior.toUpperCase() }}</span>
      </div>
    </div>

    <!-- Victory screen -->
    <Transition name="fade-fast">
      <div v-if="missionPhase === 'victory'" class="endgame-overlay victory">
        <div class="endgame-panel">
          <div class="endgame-icon">&#9733;</div>
          <div class="endgame-title">VICTORY</div>
          <div class="endgame-subtitle">The Borg threat has been neutralized.</div>
          <div class="endgame-text">
            The USS Reliant has been destroyed. The Sol system is safe.
            Starfleet Command sends their congratulations, Captain.
          </div>
          <div class="endgame-stats">
            <div>Enterprise Hull Remaining: {{ playerHull }}%</div>
          </div>
          <button class="lcars-btn engage" @click="restartGame">RETURN TO BRIDGE</button>
        </div>
      </div>
    </Transition>

    <!-- Defeat screen -->
    <Transition name="fade-fast">
      <div v-if="missionPhase === 'defeat'" class="endgame-overlay defeat">
        <div class="endgame-panel">
          <div class="endgame-icon">&#9760;</div>
          <div class="endgame-title">SHIP DESTROYED</div>
          <div class="endgame-subtitle">The Enterprise has been lost.</div>
          <div class="endgame-text">
            The Borg-controlled Reliant has overwhelmed the Enterprise.
            All hands lost. The Federation mourns this day.
          </div>
          <button class="lcars-btn engage" @click="restartGame">TRY AGAIN</button>
        </div>
      </div>
    </Transition>

    <!-- Touch Controls (mobile only) -->
    <TouchControls
      v-if="!isLoading && isTouchDevice && input"
      :input="input"
      @throttle="onTouchThrottle"
      @warp="onTouchWarp"
      @shields="onTouchShields"
      @voice="onTouchVoice"
    />

    <!-- Desktop Controls (keyboard + mouse bar) -->
    <DesktopControls
      v-if="!isLoading && !isTouchDevice && input"
      :input="input"
      :state="hudState"
      :voice-supported="voiceSupported"
      @throttle="onTouchThrottle"
      @warp="onTouchWarp"
      @shields="onTouchShields"
      @voice="onTouchVoice"
    />

    <!-- GitHub corner link -->
    <a
      v-if="!isLoading"
      class="github-link github-corner"
      href="https://github.com/alice-viola/NCC-1701-D"
      target="_blank"
      rel="noopener noreferrer"
      title="View on GitHub"
    >
      <svg class="github-icon" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
    </a>

    <!-- HUD overlay -->
    <HudOverlay
      v-if="!isLoading"
      :state="hudState"
      :voice-status="voiceStatus"
      :voice-transcript="voiceTranscript"
      :voice-confirmation="voiceConfirmation"
      :voice-supported="voiceSupported"
      :mission-active="missionPhase === 'active'"
      :hide-controls="true"
    />
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

.loading-disclaimer {
  margin-top: 2.5rem;
  font-size: 0.5rem;
  letter-spacing: 0.05rem;
  color: #334455;
  max-width: 400px;
  line-height: 1.5;
}

/* GitHub link */
.github-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: #667788;
  transition: all 0.2s;
  pointer-events: auto;
}

.github-link:hover {
  color: #aabbcc;
}

.github-icon {
  width: 18px;
  height: 18px;
}

.loading-github {
  margin-top: 1.5rem;
  padding: 6px 14px;
  border: 1px solid rgba(100, 120, 140, 0.25);
  border-radius: 6px;
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.6rem;
  letter-spacing: 0.05rem;
  background: rgba(100, 120, 140, 0.08);
}

.loading-github:hover {
  background: rgba(100, 120, 140, 0.15);
  border-color: rgba(100, 120, 140, 0.4);
}

.github-corner {
  position: absolute;
  top: 14px;
  right: 20px;
  z-index: 6;
  opacity: 0.25;
  padding: 6px;
}

.github-corner:hover {
  opacity: 0.7;
}

.github-corner .github-icon {
  width: 22px;
  height: 22px;
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

/* Warp flash */
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

/* Damage flash */
.damage-flash {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 50, 20, 0.8) 0%,
    rgba(200, 30, 10, 0.4) 40%,
    transparent 80%
  );
}

/* Photo mode */
.photo-mode-indicator {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;
  z-index: 8;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #cc770060;
  border-radius: 8px;
  padding: 8px 20px;
}

.photo-label {
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.3rem;
  color: #cc7700;
}

.photo-controls {
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.55rem;
  letter-spacing: 0.1rem;
  color: #8899aa;
  margin-top: 4px;
}

/* ─── Start Mission Button ───────────────────────────────────────────────── */

.start-mission-container {
  position: absolute;
  top: 16px;
  left: 20px;
  text-align: left;
  z-index: 8;
}

.start-mission-subtitle {
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.5rem;
  letter-spacing: 0.2rem;
  color: #6688aa;
  margin-bottom: 2px;
}

.start-mission-hint {
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.45rem;
  letter-spacing: 0.1rem;
  color: #445566;
  margin-bottom: 8px;
}

.start-mission-btn {
  background: linear-gradient(135deg, #cc7700, #ff9900);
  color: #000;
  border: none;
  padding: 8px 24px;
  border-radius: 16px;
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.2rem;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 0 20px rgba(204, 119, 0, 0.25);
}

.start-mission-btn:hover {
  background: linear-gradient(135deg, #ff9900, #ffbb33);
  box-shadow: 0 0 30px rgba(255, 153, 0, 0.4);
  transform: scale(1.05);
}

/* ─── Mission Briefing ───────────────────────────────────────────────────── */

.briefing-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 10, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

.briefing-panel {
  background: rgba(5, 10, 20, 0.98);
  border: 1px solid #cc770040;
  border-left: 4px solid #cc7700;
  border-radius: 4px;
  padding: 40px;
  max-width: 650px;
  width: 90%;
  font-family: 'Segoe UI', sans-serif;
}

.briefing-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.briefing-starfleet {
  font-size: 0.6rem;
  letter-spacing: 0.4rem;
  color: #cc7700;
  font-weight: 700;
}

.briefing-priority {
  font-size: 0.55rem;
  letter-spacing: 0.2rem;
  color: #ff4444;
  animation: blink 1s ease infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.briefing-text {
  font-size: 0.85rem;
  color: #aabbcc;
  line-height: 1.8;
  min-height: 150px;
}

.briefing-cursor {
  color: #cc7700;
  animation: blink 0.6s ease infinite;
}

.briefing-actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.lcars-btn {
  border: none;
  padding: 12px 32px;
  border-radius: 20px;
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.25rem;
  cursor: pointer;
  transition: all 0.2s;
}

.lcars-btn.engage {
  background: #cc7700;
  color: #000;
}

.lcars-btn.engage:hover {
  background: #ff9900;
}

.lcars-btn.skip {
  background: #334455;
  color: #8899aa;
}

.lcars-btn.skip:hover {
  background: #445566;
}

/* ─── Combat HUD ─────────────────────────────────────────────────────────── */

.combat-hud {
  position: absolute;
  top: 40px;
  left: 0;
  right: 0;
  padding: 0 20px;
  pointer-events: none;
  z-index: 7;
  font-family: 'Segoe UI', sans-serif;
}

.hull-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.hull-bar.player-hull {
  justify-content: flex-start;
}

.hull-bar.enemy-hull {
  justify-content: flex-start;
}

.hull-label {
  font-size: 0.55rem;
  letter-spacing: 0.15rem;
  color: #8899aa;
  min-width: 140px;
  text-align: right;
}

.hull-track {
  width: 200px;
  height: 6px;
  background: rgba(100, 120, 140, 0.2);
  border-radius: 3px;
  overflow: hidden;
}

.hull-fill {
  height: 100%;
  background: linear-gradient(90deg, #3388ff, #55ccff);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.hull-fill.enemy {
  background: linear-gradient(90deg, #00cc44, #44ff88);
}

.hull-fill.critical {
  background: linear-gradient(90deg, #ff3322, #ff6644);
  animation: pulse-critical 0.5s ease infinite;
}

@keyframes pulse-critical {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.hull-value {
  font-size: 0.6rem;
  color: #aabbcc;
  font-weight: 600;
  min-width: 35px;
}

.enemy-info {
  margin-left: 150px;
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 2px;
}

.enemy-dist {
  font-size: 0.5rem;
  letter-spacing: 0.1rem;
  color: #667788;
}

.enemy-status {
  font-size: 0.5rem;
  letter-spacing: 0.15rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 3px;
}

.enemy-status.idle {
  color: #88aa88;
  background: rgba(100, 150, 100, 0.15);
}

.enemy-status.alert {
  color: #ffaa00;
  background: rgba(255, 170, 0, 0.15);
  animation: blink 1s ease infinite;
}

.enemy-status.attack {
  color: #ff4444;
  background: rgba(255, 60, 40, 0.2);
}

.enemy-status.evasive {
  color: #ff8844;
  background: rgba(255, 130, 60, 0.15);
}

/* ─── End Game Screens ───────────────────────────────────────────────────── */

.endgame-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 25;
}

.endgame-overlay.victory {
  background: rgba(0, 10, 5, 0.85);
}

.endgame-overlay.defeat {
  background: rgba(15, 0, 0, 0.85);
}

.endgame-panel {
  text-align: center;
  font-family: 'Segoe UI', sans-serif;
  max-width: 500px;
  width: 90%;
}

.endgame-icon {
  font-size: 4rem;
  margin-bottom: 16px;
}

.victory .endgame-icon {
  color: #ffcc00;
  text-shadow: 0 0 40px rgba(255, 200, 0, 0.5);
}

.defeat .endgame-icon {
  color: #ff3322;
  text-shadow: 0 0 40px rgba(255, 50, 30, 0.5);
}

.endgame-title {
  font-size: 2.2rem;
  font-weight: 300;
  letter-spacing: 0.6rem;
  margin-bottom: 8px;
}

.victory .endgame-title {
  color: #ddeeff;
}

.defeat .endgame-title {
  color: #ff8877;
}

.endgame-subtitle {
  font-size: 0.8rem;
  letter-spacing: 0.2rem;
  color: #8899aa;
  margin-bottom: 20px;
}

.endgame-text {
  font-size: 0.8rem;
  line-height: 1.7;
  color: #778899;
  margin-bottom: 24px;
}

.endgame-stats {
  font-size: 0.7rem;
  color: #aabbcc;
  margin-bottom: 24px;
  letter-spacing: 0.1rem;
}

.endgame-panel .lcars-btn {
  margin-top: 8px;
}

/* ─── Mobile / Portrait Overrides ─────────────────────────────────────────── */
@media (max-width: 768px), (orientation: portrait) {
  /* Move start mission to top, below HUD panels */
  .start-mission-container {
    top: 50px;
    right: 50%;
    transform: translateX(50%);
  }

  .start-mission-subtitle,
  .start-mission-hint {
    display: none;
  }

  /* Compact combat HUD */
  .combat-hud {
    top: 55px;
    padding: 0 8px;
  }

  .hull-bar {
    gap: 4px;
    margin-bottom: 3px;
  }

  .hull-label {
    font-size: 0.42rem;
    min-width: 80px;
    letter-spacing: 0.08rem;
  }

  .hull-track {
    width: 100px;
    height: 4px;
  }

  .hull-value {
    font-size: 0.48rem;
    min-width: 26px;
  }

  .enemy-info {
    margin-left: 84px;
    gap: 6px;
  }

  .enemy-dist {
    font-size: 0.4rem;
  }

  .enemy-status {
    font-size: 0.4rem;
    padding: 1px 4px;
  }

  /* Compact briefing panel */
  .briefing-panel {
    padding: 20px;
  }

  .briefing-text {
    font-size: 0.72rem;
    line-height: 1.6;
    min-height: 100px;
  }

  .briefing-starfleet {
    font-size: 0.5rem;
  }

  .briefing-priority {
    font-size: 0.45rem;
  }

  /* Compact endgame */
  .endgame-icon {
    font-size: 2.5rem;
  }

  .endgame-title {
    font-size: 1.4rem;
    letter-spacing: 0.3rem;
  }

  .endgame-subtitle {
    font-size: 0.65rem;
  }

  .endgame-text {
    font-size: 0.65rem;
  }

  .endgame-stats {
    font-size: 0.55rem;
  }

  .loading-title {
    font-size: 1.5rem;
    letter-spacing: 0.4rem;
  }

  .loading-subtitle {
    font-size: 0.8rem;
    letter-spacing: 0.3rem;
  }

  .loading-bar-container {
    width: 200px;
  }
}
</style>
