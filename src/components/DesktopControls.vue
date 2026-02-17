<script setup lang="ts">
import { ref, computed } from 'vue'
import type { InputManager } from '../game/input-manager'
import type { HudState } from '../game/game-state'

const props = defineProps<{
  input: InputManager
  state: HudState
  voiceSupported: boolean
}>()

const emit = defineEmits<{
  (e: 'throttle', value: number): void
  (e: 'warp'): void
  (e: 'shields'): void
  (e: 'voice'): void
}>()

// ─── Speed Slider ────────────────────────────────────────────────────────────

const dragging = ref(false)
const sliderRef = ref<HTMLDivElement | null>(null)

const throttleStep = computed(() => Math.round(props.state.throttle * 9))

function updateSpeedFromMouse(clientX: number): void {
  if (!sliderRef.value) return
  const rect = sliderRef.value.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  const speed = Math.round(ratio * 9)
  emit('throttle', speed)
}

function onSliderDown(e: MouseEvent): void {
  e.preventDefault()
  dragging.value = true
  updateSpeedFromMouse(e.clientX)
  window.addEventListener('mousemove', onSliderDrag)
  window.addEventListener('mouseup', onSliderUp)
}

function onSliderDrag(e: MouseEvent): void {
  if (!dragging.value) return
  updateSpeedFromMouse(e.clientX)
}

function onSliderUp(): void {
  dragging.value = false
  window.removeEventListener('mousemove', onSliderDrag)
  window.removeEventListener('mouseup', onSliderUp)
}

// ─── Fire Phasers (hold) ─────────────────────────────────────────────────────

const phaserHeld = ref(false)

function onFireDown(e: MouseEvent): void {
  e.preventDefault()
  phaserHeld.value = true
  props.input.simulateKeyDown('Space')
  window.addEventListener('mouseup', onFireUp)
}

function onFireUp(): void {
  phaserHeld.value = false
  props.input.simulateKeyUp('Space')
  window.removeEventListener('mouseup', onFireUp)
}

// ─── Torpedo (click) ─────────────────────────────────────────────────────────

function onTorpedo(): void {
  props.input.simulateKeyDown('KeyT')
  setTimeout(() => props.input.simulateKeyUp('KeyT'), 100)
}
</script>

<template>
  <div class="desktop-controls">
    <div class="controls-bar">
      <!-- LCARS accent left -->
      <div class="lcars-end left" />

      <!-- Speed Slider Section -->
      <div class="control-section speed-section">
        <div class="section-label">IMPULSE</div>
        <div
          ref="sliderRef"
          class="speed-slider"
          @mousedown="onSliderDown"
        >
          <div class="speed-track">
            <div
              class="speed-fill"
              :class="{ warp: state.isWarp }"
              :style="{ width: (throttleStep / 9) * 100 + '%' }"
            />
            <div
              class="speed-thumb"
              :class="{ warp: state.isWarp }"
              :style="{ left: (throttleStep / 9) * 100 + '%' }"
            />
          </div>
          <div class="speed-marks">
            <span
              v-for="n in 10"
              :key="n"
              class="speed-mark"
              :class="{ active: n - 1 <= throttleStep }"
            >{{ n - 1 }}</span>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="lcars-divider" />

      <!-- Action Buttons -->
      <div class="control-section actions-section">
        <!-- Warp -->
        <button
          class="ctrl-btn warp-btn"
          :class="{ active: state.isWarp }"
          @click="emit('warp')"
        >
          <span class="btn-icon">&#x2726;</span>
          <span class="btn-label">WARP</span>
        </button>

        <!-- Shields -->
        <button
          class="ctrl-btn shields-btn"
          :class="{ active: state.shieldsActive }"
          @click="emit('shields')"
        >
          <span class="btn-icon">&#x25CE;</span>
          <span class="btn-label">SHIELDS</span>
        </button>

        <!-- Divider -->
        <div class="lcars-divider-thin" />

        <!-- Fire Phasers -->
        <button
          class="ctrl-btn fire-btn"
          :class="{ active: phaserHeld }"
          @mousedown="onFireDown"
        >
          <span class="btn-icon">&#x2739;</span>
          <span class="btn-label">PHASERS</span>
          <span class="btn-stat">{{ Math.round(state.phaserCharge) }}%</span>
        </button>

        <!-- Torpedo -->
        <button
          class="ctrl-btn torpedo-btn"
          :disabled="state.torpedoCount <= 0"
          @click="onTorpedo"
        >
          <span class="btn-icon">&#x25C8;</span>
          <span class="btn-label">TORPEDO</span>
          <span class="btn-stat">{{ state.torpedoCount }}</span>
        </button>

        <!-- Divider -->
        <div class="lcars-divider-thin" />

        <!-- Voice -->
        <button
          v-if="voiceSupported"
          class="ctrl-btn voice-btn"
          @click="emit('voice')"
        >
          <span class="btn-icon">&#x1F399;</span>
          <span class="btn-label">VOICE</span>
        </button>
      </div>

      <!-- LCARS accent right -->
      <div class="lcars-end right" />
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

.desktop-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 10;
  padding: 0 20px 14px;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
}

.controls-bar {
  display: flex;
  align-items: stretch;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(204, 136, 51, 0.15);
  border-radius: 12px;
  backdrop-filter: blur(6px);
  padding: 8px 4px;
  gap: 0;
  pointer-events: auto;
  max-width: 820px;
  width: 100%;
}

/* ── LCARS Accents ── */
.lcars-end {
  width: 8px;
  min-height: 100%;
  border-radius: 6px;
  flex-shrink: 0;
}

.lcars-end.left {
  background: linear-gradient(180deg, #cc8833, #996622);
  margin-right: 10px;
}

.lcars-end.right {
  background: linear-gradient(180deg, #3366aa, #224477);
  margin-left: 10px;
}

.lcars-divider {
  width: 3px;
  background: rgba(204, 136, 51, 0.2);
  border-radius: 2px;
  margin: 4px 12px;
  flex-shrink: 0;
}

.lcars-divider-thin {
  width: 1px;
  background: rgba(204, 136, 51, 0.1);
  margin: 8px 6px;
  flex-shrink: 0;
}

/* ── Sections ── */
.control-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-label {
  font-size: 0.5rem;
  letter-spacing: 0.15rem;
  color: rgba(204, 136, 51, 0.4);
  writing-mode: vertical-lr;
  text-orientation: mixed;
  transform: rotate(180deg);
  white-space: nowrap;
}

/* ── Speed Slider ── */
.speed-section {
  min-width: 200px;
  padding: 4px 8px;
}

.speed-slider {
  flex: 1;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  user-select: none;
}

.speed-track {
  height: 8px;
  background: rgba(80, 60, 30, 0.3);
  border-radius: 4px;
  position: relative;
  overflow: visible;
}

.speed-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #664411, #cc8833);
  transition: width 0.1s ease;
}

.speed-fill.warp {
  background: linear-gradient(90deg, #224488, #44aaff);
  box-shadow: 0 0 8px rgba(68, 170, 255, 0.4);
}

.speed-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 14px;
  height: 14px;
  background: #cc8833;
  border: 2px solid #ffaa44;
  border-radius: 50%;
  transition: left 0.1s ease;
  box-shadow: 0 0 6px rgba(204, 136, 51, 0.3);
}

.speed-thumb.warp {
  background: #3388cc;
  border-color: #55bbff;
  box-shadow: 0 0 10px rgba(68, 170, 255, 0.5);
}

.speed-marks {
  display: flex;
  justify-content: space-between;
  padding: 0 2px;
}

.speed-mark {
  font-size: 0.45rem;
  color: rgba(150, 130, 100, 0.3);
  transition: color 0.15s;
}

.speed-mark.active {
  color: rgba(204, 136, 51, 0.7);
}

/* ── Action Buttons ── */
.actions-section {
  gap: 6px;
  padding: 0 4px;
}

.ctrl-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 6px 12px;
  min-width: 60px;
  border-radius: 8px;
  border: 1px solid rgba(204, 136, 51, 0.2);
  background: rgba(20, 15, 10, 0.6);
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  overflow: hidden;
}

.ctrl-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0;
  transition: opacity 0.15s;
  border-radius: 7px;
}

.ctrl-btn:hover::before {
  opacity: 1;
}

.btn-icon {
  font-size: 0.85rem;
  line-height: 1;
  filter: grayscale(0.5);
}

.btn-label {
  font-size: 0.45rem;
  letter-spacing: 0.1rem;
  font-family: 'Share Tech Mono', monospace;
  white-space: nowrap;
}

.btn-stat {
  font-size: 0.4rem;
  font-family: 'Share Tech Mono', monospace;
  opacity: 0.6;
}

/* Warp */
.warp-btn {
  border-color: rgba(68, 136, 204, 0.25);
  color: rgba(100, 170, 255, 0.6);
}

.warp-btn:hover {
  border-color: rgba(68, 170, 255, 0.4);
  color: rgba(100, 180, 255, 0.8);
  background: rgba(30, 50, 80, 0.5);
}

.warp-btn.active {
  border-color: rgba(68, 170, 255, 0.7);
  color: #55ccff;
  background: rgba(20, 60, 100, 0.6);
  box-shadow: 0 0 14px rgba(68, 170, 255, 0.25), inset 0 0 12px rgba(68, 170, 255, 0.1);
}

/* Shields */
.shields-btn {
  border-color: rgba(68, 136, 204, 0.25);
  color: rgba(100, 170, 255, 0.6);
}

.shields-btn:hover {
  border-color: rgba(68, 170, 255, 0.4);
  color: rgba(100, 180, 255, 0.8);
  background: rgba(30, 50, 80, 0.5);
}

.shields-btn.active {
  border-color: rgba(68, 200, 255, 0.6);
  color: #66ddff;
  background: rgba(20, 70, 110, 0.5);
  box-shadow: 0 0 14px rgba(68, 200, 255, 0.2), inset 0 0 12px rgba(68, 200, 255, 0.08);
}

/* Fire (Phasers) */
.fire-btn {
  border-color: rgba(255, 120, 50, 0.3);
  color: rgba(255, 150, 80, 0.7);
  min-width: 72px;
}

.fire-btn:hover {
  border-color: rgba(255, 130, 50, 0.5);
  color: rgba(255, 170, 100, 0.9);
  background: rgba(80, 30, 10, 0.5);
}

.fire-btn.active,
.fire-btn:active {
  border-color: rgba(255, 100, 30, 0.8);
  color: #ff8833;
  background: rgba(100, 40, 10, 0.6);
  box-shadow: 0 0 18px rgba(255, 100, 30, 0.3), inset 0 0 14px rgba(255, 100, 30, 0.1);
}

/* Torpedo */
.torpedo-btn {
  border-color: rgba(255, 80, 30, 0.25);
  color: rgba(255, 100, 50, 0.6);
}

.torpedo-btn:hover {
  border-color: rgba(255, 80, 30, 0.45);
  color: rgba(255, 120, 60, 0.85);
  background: rgba(80, 20, 5, 0.5);
}

.torpedo-btn:active {
  border-color: rgba(255, 80, 30, 0.7);
  color: #ff6633;
  box-shadow: 0 0 12px rgba(255, 80, 30, 0.25);
}

.torpedo-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

/* Voice */
.voice-btn {
  border-color: rgba(68, 170, 255, 0.2);
  color: rgba(68, 170, 255, 0.5);
}

.voice-btn:hover {
  border-color: rgba(68, 170, 255, 0.4);
  color: rgba(68, 170, 255, 0.8);
  background: rgba(20, 50, 80, 0.4);
}

/* ── Hide on mobile (touch controls shown instead) ── */
@media (max-width: 768px), (orientation: portrait) {
  .desktop-controls {
    display: none;
  }
}
</style>
