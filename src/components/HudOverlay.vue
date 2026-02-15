<script setup lang="ts">
import { computed } from 'vue'
import type { HudState } from '../game/game-state'

const props = defineProps<{
  state: HudState
}>()

const heading = computed(() => String(props.state.heading).padStart(3, '0'))
const bearing = computed(() => String(Math.abs(props.state.bearing)).padStart(3, '0'))
const bearingSign = computed(() => props.state.bearing >= 0 ? '+' : '-')
const speedDisplay = computed(() => props.state.speedDisplay)
const throttlePct = computed(() => Math.round(props.state.throttle * 100))
const shieldsActive = computed(() => props.state.shieldsActive)
const shieldStrength = computed(() => Math.round(props.state.shieldStrength))
const phaserCharge = computed(() => Math.round(props.state.phaserCharge))
const torpedoCount = computed(() => props.state.torpedoCount)
const isWarp = computed(() => props.state.isWarp)
const speed = computed(() => props.state.speed)
</script>

<template>
  <div class="hud-overlay">
    <!-- Top bar -->
    <div class="hud-top">
      <div class="lcars-bracket left" />
      <div class="hud-title">
        <span class="title-main">USS ENTERPRISE</span>
        <span class="title-registry">NCC-1701-D</span>
      </div>
      <div class="lcars-bracket right" />
    </div>

    <!-- Center reticle -->
    <div class="reticle">
      <div class="reticle-ring" />
      <div class="reticle-dot" />
      <div class="reticle-line top" />
      <div class="reticle-line bottom" />
      <div class="reticle-line left" />
      <div class="reticle-line right" />
    </div>

    <!-- Bottom left panel: Navigation -->
    <div class="hud-panel bottom-left">
      <div class="panel-header">
        <div class="lcars-pill amber" />
        <span>NAVIGATION</span>
      </div>
      <div class="panel-body">
        <div class="data-row">
          <span class="data-label">HEADING</span>
          <span class="data-value">{{ heading }}&deg;</span>
        </div>
        <div class="data-row">
          <span class="data-label">BEARING</span>
          <span class="data-value">{{ bearingSign }}{{ bearing }}&deg;</span>
        </div>
        <div class="data-row">
          <span class="data-label">SPEED</span>
          <span class="data-value" :class="{ warp: isWarp }">{{ speedDisplay }}</span>
        </div>
        <div class="bar-row">
          <span class="data-label">THROTTLE</span>
          <div class="bar-container">
            <div
              class="bar-fill throttle"
              :class="{ warp: isWarp }"
              :style="{ width: throttlePct + '%' }"
            />
          </div>
          <span class="bar-value">{{ throttlePct }}%</span>
        </div>
      </div>
    </div>

    <!-- Bottom right panel: Tactical -->
    <div class="hud-panel bottom-right">
      <div class="panel-header">
        <div class="lcars-pill blue" />
        <span>TACTICAL</span>
      </div>
      <div class="panel-body">
        <div class="bar-row">
          <span class="data-label">SHIELDS</span>
          <div class="bar-container">
            <div
              class="bar-fill shields"
              :class="{ active: shieldsActive, low: shieldStrength < 25 }"
              :style="{ width: shieldStrength + '%' }"
            />
          </div>
          <span class="bar-value" :class="{ off: !shieldsActive }">
            {{ shieldsActive ? shieldStrength + '%' : 'OFF' }}
          </span>
        </div>
        <div class="bar-row">
          <span class="data-label">PHASERS</span>
          <div class="bar-container">
            <div
              class="bar-fill phaser"
              :class="{ low: phaserCharge < 20 }"
              :style="{ width: phaserCharge + '%' }"
            />
          </div>
          <span class="bar-value">{{ phaserCharge }}%</span>
        </div>
        <div class="data-row">
          <span class="data-label">TORPEDOES</span>
          <span class="data-value torpedo">{{ torpedoCount }}</span>
        </div>
      </div>
    </div>

    <!-- Speed edge lines (CSS warp streaks) -->
    <div v-if="speed > 0.3" class="speed-lines" :class="{ warp: isWarp }">
      <div class="speed-line left" :style="{ opacity: Math.min(speed * 0.4, 0.8) }" />
      <div class="speed-line right" :style="{ opacity: Math.min(speed * 0.4, 0.8) }" />
    </div>

    <!-- Controls hint -->
    <div class="controls-hint">
      <span>S/W: Pitch</span>
      <span>Q/E: Yaw</span>
      <span>A/D: Roll</span>
      <span>0-9: Speed</span>
      <span>CAPS: Warp</span>
      <span>X: Shields</span>
      <span>SPACE: Phasers</span>
      <span>T: Torpedo</span>
      <span>F: Photo Mode</span>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

.hud-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  z-index: 5;
  color: #ff9933;
}

/* ---- Top Bar ---- */
.hud-top {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
}

.hud-title {
  text-align: center;
}

.title-main {
  display: block;
  font-size: 0.95rem;
  letter-spacing: 0.35rem;
  color: #cc8833;
}

.title-registry {
  display: block;
  font-size: 0.7rem;
  letter-spacing: 0.25rem;
  color: #997744;
  margin-top: 2px;
}

.lcars-bracket {
  width: 80px;
  height: 4px;
  border-radius: 2px;
}

.lcars-bracket.left {
  background: linear-gradient(90deg, transparent, #cc8833);
}

.lcars-bracket.right {
  background: linear-gradient(90deg, #cc8833, transparent);
}

/* ---- Reticle ---- */
.reticle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 60px;
  height: 60px;
}

.reticle-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  border: 1px solid rgba(204, 136, 51, 0.25);
  border-radius: 50%;
}

.reticle-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 3px;
  height: 3px;
  background: rgba(204, 136, 51, 0.5);
  border-radius: 50%;
}

.reticle-line {
  position: absolute;
  background: rgba(204, 136, 51, 0.2);
}

.reticle-line.top {
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  height: 15px;
}

.reticle-line.bottom {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  height: 15px;
}

.reticle-line.left {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  width: 15px;
  height: 1px;
}

.reticle-line.right {
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  width: 15px;
  height: 1px;
}

/* ---- Panels ---- */
.hud-panel {
  position: absolute;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(204, 136, 51, 0.15);
  border-radius: 8px 2px 8px 2px;
  padding: 10px 14px;
  min-width: 220px;
  backdrop-filter: blur(2px);
}

.bottom-left {
  bottom: 20px;
  left: 20px;
}

.bottom-right {
  bottom: 20px;
  right: 20px;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.65rem;
  letter-spacing: 0.2rem;
  color: #aa8855;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(204, 136, 51, 0.1);
}

.lcars-pill {
  width: 40px;
  height: 8px;
  border-radius: 4px;
}

.lcars-pill.amber {
  background: linear-gradient(90deg, #cc8833, #ff9933);
}

.lcars-pill.blue {
  background: linear-gradient(90deg, #3366aa, #5588cc);
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.data-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.72rem;
}

.data-label {
  color: #887755;
  font-size: 0.62rem;
  letter-spacing: 0.1rem;
  min-width: 70px;
}

.data-value {
  color: #ddaa55;
  font-size: 0.78rem;
}

.data-value.warp {
  color: #66bbff;
  text-shadow: 0 0 8px rgba(102, 187, 255, 0.5);
}

.data-value.torpedo {
  color: #ff6633;
}

/* ---- Bars ---- */
.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
}

.bar-container {
  flex: 1;
  height: 6px;
  background: rgba(100, 80, 50, 0.2);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.15s ease;
}

.bar-fill.throttle {
  background: linear-gradient(90deg, #885511, #cc8833);
}

.bar-fill.throttle.warp {
  background: linear-gradient(90deg, #2266aa, #44aaff);
  box-shadow: 0 0 6px rgba(68, 170, 255, 0.5);
}

.bar-fill.shields {
  background: linear-gradient(90deg, #224488, #4488cc);
}

.bar-fill.shields.active {
  background: linear-gradient(90deg, #3366bb, #66aaff);
  box-shadow: 0 0 6px rgba(102, 170, 255, 0.4);
}

.bar-fill.shields.low {
  background: linear-gradient(90deg, #993322, #cc4433);
  box-shadow: 0 0 6px rgba(204, 68, 51, 0.4);
}

.bar-fill.phaser {
  background: linear-gradient(90deg, #885511, #ff8822);
}

.bar-fill.phaser.low {
  background: linear-gradient(90deg, #993322, #cc4433);
}

.bar-value {
  font-size: 0.65rem;
  color: #aa8855;
  min-width: 32px;
  text-align: right;
}

.bar-value.off {
  color: #665544;
}

/* ---- Speed Lines ---- */
.speed-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.speed-line {
  position: absolute;
  top: 0;
  height: 100%;
  width: 60px;
  transition: opacity 0.3s ease;
}

.speed-line.left {
  left: 0;
  background: linear-gradient(90deg, rgba(180, 160, 120, 0.08), transparent);
}

.speed-line.right {
  right: 0;
  background: linear-gradient(-90deg, rgba(180, 160, 120, 0.08), transparent);
}

.speed-lines.warp .speed-line.left {
  background: linear-gradient(90deg, rgba(100, 150, 255, 0.15), transparent);
  width: 120px;
}

.speed-lines.warp .speed-line.right {
  background: linear-gradient(-90deg, rgba(100, 150, 255, 0.15), transparent);
  width: 120px;
}

/* ---- Controls Hint ---- */
.controls-hint {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 16px;
  font-size: 0.65rem;
  letter-spacing: 0.08rem;
  color: rgba(150, 140, 120, 0.6);
}
</style>
