<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { InputManager } from '../game/input-manager'

const props = defineProps<{
  input: InputManager
}>()

const emit = defineEmits<{
  (e: 'throttle', value: number): void
  (e: 'warp'): void
  (e: 'shields'): void
  (e: 'voice'): void
}>()

// ─── Joystick State ──────────────────────────────────────────────────────────

const joystickActive = ref(false)
const joystickX = ref(0) // -1 to 1 (yaw)
const joystickY = ref(0) // -1 to 1 (pitch)
const joyBaseX = ref(0)
const joyBaseY = ref(0)
const joyTouchId = ref<number | null>(null)

const JOYSTICK_RADIUS = 70 // pixels

function onJoystickStart(e: TouchEvent): void {
  e.preventDefault()
  const touch = e.changedTouches[0]
  if (!touch) return
  joyTouchId.value = touch.identifier
  joystickActive.value = true
  joyBaseX.value = touch.clientX
  joyBaseY.value = touch.clientY
  joystickX.value = 0
  joystickY.value = 0
}

function onJoystickMove(e: TouchEvent): void {
  if (joyTouchId.value === null) return
  e.preventDefault()
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i]!
    if (touch.identifier === joyTouchId.value) {
      const dx = touch.clientX - joyBaseX.value
      const dy = touch.clientY - joyBaseY.value
      // Clamp to radius and normalize to -1..1
      const dist = Math.sqrt(dx * dx + dy * dy)
      const clampedDist = Math.min(dist, JOYSTICK_RADIUS)
      const angle = Math.atan2(dy, dx)
      joystickX.value = (clampedDist * Math.cos(angle)) / JOYSTICK_RADIUS
      joystickY.value = (clampedDist * Math.sin(angle)) / JOYSTICK_RADIUS
      break
    }
  }
}

function onJoystickEnd(e: TouchEvent): void {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i]!.identifier === joyTouchId.value) {
      joystickActive.value = false
      joystickX.value = 0
      joystickY.value = 0
      joyTouchId.value = null
      break
    }
  }
}

// ─── Roll (hold) ─────────────────────────────────────────────────────────────

function onRollLeftStart(e: TouchEvent): void {
  e.preventDefault()
  props.input.simulateKeyDown('KeyA')
}

function onRollLeftEnd(e: TouchEvent): void {
  e.preventDefault()
  props.input.simulateKeyUp('KeyA')
}

function onRollRightStart(e: TouchEvent): void {
  e.preventDefault()
  props.input.simulateKeyDown('KeyD')
}

function onRollRightEnd(e: TouchEvent): void {
  e.preventDefault()
  props.input.simulateKeyUp('KeyD')
}

// ─── Phaser (hold) ───────────────────────────────────────────────────────────

const phaserActive = ref(false)

function onPhaserStart(e: TouchEvent): void {
  e.preventDefault()
  phaserActive.value = true
  props.input.simulateKeyDown('Space')
}

function onPhaserEnd(e: TouchEvent): void {
  e.preventDefault()
  phaserActive.value = false
  props.input.simulateKeyUp('Space')
}

// ─── Torpedo (tap) ───────────────────────────────────────────────────────────

function onTorpedo(e: TouchEvent): void {
  e.preventDefault()
  props.input.simulateKeyDown('KeyT')
  setTimeout(() => props.input.simulateKeyUp('KeyT'), 100)
}

// ─── Speed Slider ────────────────────────────────────────────────────────────

const currentSpeed = ref(0)
const sliderTouchId = ref<number | null>(null)
const sliderRef = ref<HTMLDivElement | null>(null)

function updateSpeedFromTouch(clientY: number): void {
  if (!sliderRef.value) return
  const rect = sliderRef.value.getBoundingClientRect()
  // Invert: top = 9, bottom = 0
  const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
  const speed = Math.round(ratio * 9)
  currentSpeed.value = speed
  emit('throttle', speed)
}

function onSliderStart(e: TouchEvent): void {
  e.preventDefault()
  const touch = e.changedTouches[0]
  if (!touch) return
  sliderTouchId.value = touch.identifier
  updateSpeedFromTouch(touch.clientY)
}

function onSliderMove(e: TouchEvent): void {
  if (sliderTouchId.value === null) return
  e.preventDefault()
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i]!
    if (touch.identifier === sliderTouchId.value) {
      updateSpeedFromTouch(touch.clientY)
      break
    }
  }
}

function onSliderEnd(e: TouchEvent): void {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i]!.identifier === sliderTouchId.value) {
      sliderTouchId.value = null
      break
    }
  }
}

// ─── Map joystick to key simulation each frame ──────────────────────────────

const DEADZONE = 0.2
let rafId = 0

function updateLoop(): void {
  rafId = requestAnimationFrame(updateLoop)

  // Yaw from joystick X axis
  if (joystickX.value < -DEADZONE) {
    props.input.simulateKeyDown('KeyQ')
    props.input.simulateKeyUp('KeyE')
  } else if (joystickX.value > DEADZONE) {
    props.input.simulateKeyDown('KeyE')
    props.input.simulateKeyUp('KeyQ')
  } else {
    props.input.simulateKeyUp('KeyQ')
    props.input.simulateKeyUp('KeyE')
  }

  // Pitch from joystick Y axis (up = pitch up = KeyS, down = pitch down = KeyW)
  if (joystickY.value < -DEADZONE) {
    props.input.simulateKeyDown('KeyS')
    props.input.simulateKeyUp('KeyW')
  } else if (joystickY.value > DEADZONE) {
    props.input.simulateKeyDown('KeyW')
    props.input.simulateKeyUp('KeyS')
  } else {
    props.input.simulateKeyUp('KeyS')
    props.input.simulateKeyUp('KeyW')
  }
}

onMounted(() => {
  rafId = requestAnimationFrame(updateLoop)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  // Release all simulated keys
  for (const key of ['KeyQ', 'KeyE', 'KeyS', 'KeyW', 'KeyA', 'KeyD', 'Space']) {
    props.input.simulateKeyUp(key)
  }
})
</script>

<template>
  <div class="touch-controls">
    <!-- Left: Virtual Joystick + Roll buttons -->
    <div class="helm-group">
      <!-- Roll buttons above joystick -->
      <div class="roll-buttons">
        <div
          class="roll-btn"
          @touchstart="onRollLeftStart"
          @touchend="onRollLeftEnd"
          @touchcancel="onRollLeftEnd"
        >&#x21B6;</div>
        <div class="roll-label">ROLL</div>
        <div
          class="roll-btn"
          @touchstart="onRollRightStart"
          @touchend="onRollRightEnd"
          @touchcancel="onRollRightEnd"
        >&#x21B7;</div>
      </div>

      <!-- Joystick -->
      <div
        class="joystick-zone"
        @touchstart="onJoystickStart"
        @touchmove="onJoystickMove"
        @touchend="onJoystickEnd"
        @touchcancel="onJoystickEnd"
      >
        <div class="joystick-base">
          <div
            class="joystick-knob"
            :style="{
              transform: `translate(${joystickX * JOYSTICK_RADIUS}px, ${joystickY * JOYSTICK_RADIUS}px)`,
              opacity: joystickActive ? 1 : 0.5,
            }"
          />
        </div>
        <div class="joystick-label">HELM</div>
      </div>
    </div>

    <!-- Right side: Action Buttons -->
    <div class="action-buttons">
      <!-- Fire phasers (large, hold) -->
      <div
        class="action-btn fire-btn"
        :class="{ active: phaserActive }"
        @touchstart="onPhaserStart"
        @touchend="onPhaserEnd"
        @touchcancel="onPhaserEnd"
      >
        FIRE
      </div>

      <!-- Torpedo -->
      <div
        class="action-btn torpedo-btn"
        @touchstart="onTorpedo"
      >
        TORP
      </div>

      <!-- Shields toggle -->
      <div
        class="action-btn shields-btn"
        @touchstart.prevent="emit('shields')"
      >
        SHLD
      </div>

      <!-- Warp toggle -->
      <div
        class="action-btn warp-btn"
        @touchstart.prevent="emit('warp')"
      >
        WARP
      </div>

      <!-- Voice command -->
      <div
        class="action-btn voice-btn"
        @touchstart.prevent="emit('voice')"
      >
        MIC
      </div>
    </div>

    <!-- Bottom center: Speed slider -->
    <div class="speed-control">
      <div class="speed-label">SPD</div>
      <div
        ref="sliderRef"
        class="speed-slider"
        @touchstart="onSliderStart"
        @touchmove="onSliderMove"
        @touchend="onSliderEnd"
        @touchcancel="onSliderEnd"
      >
        <div class="speed-track">
          <div
            class="speed-fill"
            :style="{ height: (currentSpeed / 9) * 100 + '%' }"
          />
          <div
            class="speed-thumb"
            :style="{ bottom: (currentSpeed / 9) * 100 + '%' }"
          />
        </div>
        <div class="speed-ticks">
          <span v-for="n in 10" :key="n" class="speed-tick">{{ 10 - n }}</span>
        </div>
      </div>
      <div class="speed-value">{{ currentSpeed }}</div>
    </div>
  </div>
</template>

<style scoped>
.touch-controls {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

/* ── Helm group (roll + joystick) ── */
.helm-group {
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.roll-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
  touch-action: none;
}

.roll-btn {
  width: 40px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid rgba(204, 136, 51, 0.3);
  background: rgba(0, 0, 0, 0.4);
  color: rgba(204, 136, 51, 0.7);
  font-size: 1rem;
  backdrop-filter: blur(2px);
  transition: all 0.1s;
}

.roll-btn:active {
  background: rgba(204, 136, 51, 0.2);
  border-color: rgba(204, 136, 51, 0.6);
  color: #ff9933;
}

.roll-label {
  font-size: 0.45rem;
  color: rgba(204, 136, 51, 0.4);
  letter-spacing: 0.1rem;
}

/* ── Joystick ── */
.joystick-zone {
  width: 180px;
  height: 180px;
  pointer-events: auto;
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}

.joystick-base {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  border: 2px solid rgba(204, 136, 51, 0.3);
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.joystick-knob {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(204, 136, 51, 0.6) 0%, rgba(204, 136, 51, 0.2) 100%);
  border: 2px solid rgba(204, 136, 51, 0.5);
  transition: opacity 0.15s;
}

.joystick-label {
  font-size: 0.55rem;
  color: rgba(204, 136, 51, 0.5);
  letter-spacing: 0.15rem;
  margin-top: 4px;
}

/* ── Action Buttons ── */
.action-buttons {
  position: absolute;
  bottom: 30px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
  pointer-events: auto;
  touch-action: none;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 0.6rem;
  letter-spacing: 0.1rem;
  font-weight: bold;
  border: 1px solid rgba(204, 136, 51, 0.3);
  background: rgba(0, 0, 0, 0.4);
  color: rgba(204, 136, 51, 0.7);
  backdrop-filter: blur(2px);
  transition: all 0.1s;
}

.action-btn:active,
.action-btn.active {
  background: rgba(204, 136, 51, 0.2);
  border-color: rgba(204, 136, 51, 0.6);
  color: #ff9933;
}

.fire-btn {
  width: 70px;
  height: 56px;
  font-size: 0.7rem;
  border-color: rgba(255, 100, 50, 0.4);
  color: rgba(255, 136, 51, 0.8);
}

.fire-btn:active,
.fire-btn.active {
  background: rgba(255, 100, 50, 0.25);
  border-color: rgba(255, 100, 50, 0.7);
  color: #ff6633;
  box-shadow: 0 0 12px rgba(255, 100, 50, 0.3);
}

.torpedo-btn {
  width: 56px;
  height: 40px;
  border-color: rgba(255, 68, 0, 0.4);
  color: rgba(255, 100, 50, 0.7);
}

.torpedo-btn:active {
  background: rgba(255, 68, 0, 0.25);
  border-color: rgba(255, 68, 0, 0.7);
}

.shields-btn {
  width: 56px;
  height: 40px;
  border-color: rgba(68, 136, 204, 0.4);
  color: rgba(100, 170, 255, 0.7);
}

.shields-btn:active {
  background: rgba(68, 136, 204, 0.25);
  border-color: rgba(68, 170, 255, 0.7);
  color: #44aaff;
}

.warp-btn {
  width: 56px;
  height: 40px;
  border-color: rgba(68, 136, 204, 0.4);
  color: rgba(100, 170, 255, 0.7);
}

.warp-btn:active {
  background: rgba(68, 170, 255, 0.2);
  border-color: rgba(68, 170, 255, 0.7);
  color: #66ccff;
  box-shadow: 0 0 10px rgba(68, 170, 255, 0.3);
}

.voice-btn {
  width: 56px;
  height: 40px;
  border-color: rgba(68, 170, 255, 0.3);
  color: rgba(68, 170, 255, 0.6);
}

.voice-btn:active {
  background: rgba(68, 170, 255, 0.2);
  color: #44aaff;
}

/* ── Speed Slider ── */
.speed-control {
  position: absolute;
  right: 210px;
  bottom: 35px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: auto;
  touch-action: none;
}

.speed-label {
  font-size: 0.5rem;
  color: rgba(204, 136, 51, 0.5);
  letter-spacing: 0.15rem;
}

.speed-slider {
  display: flex;
  gap: 6px;
  height: 130px;
  align-items: stretch;
}

.speed-track {
  width: 18px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(204, 136, 51, 0.25);
  border-radius: 9px;
  position: relative;
  overflow: hidden;
}

.speed-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(204, 136, 51, 0.4), rgba(204, 136, 51, 0.15));
  border-radius: 0 0 9px 9px;
  transition: height 0.1s;
}

.speed-thumb {
  position: absolute;
  left: 50%;
  transform: translate(-50%, 50%);
  width: 24px;
  height: 8px;
  background: rgba(204, 136, 51, 0.6);
  border-radius: 4px;
  border: 1px solid rgba(204, 136, 51, 0.4);
  transition: bottom 0.1s;
}

.speed-ticks {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 0.45rem;
  color: rgba(150, 140, 120, 0.4);
}

.speed-tick {
  line-height: 1;
}

.speed-value {
  font-size: 0.65rem;
  color: rgba(204, 136, 51, 0.7);
}
</style>
