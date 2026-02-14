<script setup lang="ts">
import { computed, ref } from 'vue'
import { STAR_SYSTEMS, getConnectedSystems, getMapDistance, STAR_COLORS } from '../game/universe'
import type { StarSystem } from '../game/universe'

const props = defineProps<{
  currentSystemId: string
  destinationId: string | null
  travelPhase: string
}>()

const emit = defineEmits<{
  selectSystem: [systemId: string]
  engage: []
  close: []
}>()

const hoveredSystem = ref<string | null>(null)

// Center the map view on all systems
const mapBounds = computed(() => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const sys of STAR_SYSTEMS) {
    minX = Math.min(minX, sys.mapX)
    maxX = Math.max(maxX, sys.mapX)
    minY = Math.min(minY, sys.mapY)
    maxY = Math.max(maxY, sys.mapY)
  }
  const padX = (maxX - minX) * 0.15
  const padY = (maxY - minY) * 0.15
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY }
})

// Convert map coordinates to SVG viewBox coordinates
function toSvgX(mapX: number): number {
  const b = mapBounds.value
  return ((mapX - b.minX) / (b.maxX - b.minX)) * 800
}

function toSvgY(mapY: number): number {
  const b = mapBounds.value
  return ((mapY - b.minY) / (b.maxY - b.minY)) * 500
}

// Connection lines between systems
const connections = computed(() => {
  const lines: { x1: number; y1: number; x2: number; y2: number; active: boolean }[] = []
  const seen = new Set<string>()
  for (const sys of STAR_SYSTEMS) {
    for (const connId of sys.connections) {
      const key = [sys.id, connId].sort().join('-')
      if (seen.has(key)) continue
      seen.add(key)
      const target = STAR_SYSTEMS.find(s => s.id === connId)
      if (!target) continue
      const active =
        (sys.id === props.currentSystemId && connId === props.destinationId) ||
        (connId === props.currentSystemId && sys.id === props.destinationId)
      lines.push({
        x1: toSvgX(sys.mapX), y1: toSvgY(sys.mapY),
        x2: toSvgX(target.mapX), y2: toSvgY(target.mapY),
        active,
      })
    }
  }
  return lines
})

// Info panel for hovered or selected system
const infoSystem = computed<StarSystem | null>(() => {
  const id = hoveredSystem.value ?? props.destinationId
  if (!id) return null
  return STAR_SYSTEMS.find(s => s.id === id) ?? null
})

const distanceToHovered = computed(() => {
  if (!infoSystem.value) return null
  const current = STAR_SYSTEMS.find(s => s.id === props.currentSystemId)
  if (!current || current.id === infoSystem.value.id) return null
  return getMapDistance(current, infoSystem.value).toFixed(0)
})

const isReachable = computed(() => {
  if (!infoSystem.value) return false
  const connected = getConnectedSystems(props.currentSystemId)
  return connected.some(s => s.id === infoSystem.value!.id)
})

const canEngage = computed(() => {
  return props.destinationId !== null && props.travelPhase === 'idle'
})

function onSystemClick(sys: StarSystem) {
  if (sys.id === props.currentSystemId) return
  emit('selectSystem', sys.id)
}
</script>

<template>
  <div class="star-map-overlay" @click.self="emit('close')">
    <!-- LCARS frame -->
    <div class="star-map-frame">
      <!-- Header -->
      <div class="map-header">
        <div class="lcars-elbow top-left" />
        <div class="header-title">
          <span class="map-title">STELLAR CARTOGRAPHY</span>
          <span class="map-subtitle">FEDERATION STAR CHART — SECTORS ALPHA / BETA / FRONTIER</span>
        </div>
        <div class="lcars-elbow top-right" />
      </div>

      <!-- Main content -->
      <div class="map-content">
        <!-- SVG star map -->
        <div class="map-svg-container">
          <svg viewBox="0 0 800 500" class="map-svg">
            <!-- Grid lines -->
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(100,140,180,0.08)" stroke-width="0.5" />
              </pattern>
            </defs>
            <rect width="800" height="500" fill="url(#grid)" />

            <!-- Sector labels -->
            <text
              v-for="sector in ['Alpha Quadrant', 'Beta Quadrant', 'Frontier']"
              :key="sector"
              :x="sector === 'Alpha Quadrant' ? 500 : sector === 'Beta Quadrant' ? 180 : 320"
              :y="sector === 'Frontier' ? 440 : 30"
              class="sector-label"
            >{{ sector.toUpperCase() }}</text>

            <!-- Warp route lines -->
            <line
              v-for="(conn, i) in connections"
              :key="'conn-' + i"
              :x1="conn.x1" :y1="conn.y1"
              :x2="conn.x2" :y2="conn.y2"
              :class="['route-line', { active: conn.active }]"
            />

            <!-- Star system nodes -->
            <g
              v-for="sys in STAR_SYSTEMS"
              :key="sys.id"
              class="system-node"
              :class="{
                current: sys.id === currentSystemId,
                destination: sys.id === destinationId,
                discovered: sys.discovered,
                hovered: sys.id === hoveredSystem,
              }"
              @click="onSystemClick(sys)"
              @mouseenter="hoveredSystem = sys.id"
              @mouseleave="hoveredSystem = null"
            >
              <!-- Glow behind star -->
              <circle
                :cx="toSvgX(sys.mapX)" :cy="toSvgY(sys.mapY)"
                :r="sys.star.size * 12"
                :fill="sys.id === currentSystemId ? '#ff990030' : sys.id === destinationId ? '#3388ff20' : STAR_COLORS[sys.star.class] + '15'"
                class="star-glow"
              />
              <!-- Star circle -->
              <circle
                :cx="toSvgX(sys.mapX)" :cy="toSvgY(sys.mapY)"
                :r="sys.star.size * 5 + 2"
                :fill="STAR_COLORS[sys.star.class]"
                class="star-dot"
              />
              <!-- Current system indicator ring -->
              <circle
                v-if="sys.id === currentSystemId"
                :cx="toSvgX(sys.mapX)" :cy="toSvgY(sys.mapY)"
                :r="14"
                class="current-ring"
              />
              <!-- Destination indicator ring -->
              <circle
                v-if="sys.id === destinationId"
                :cx="toSvgX(sys.mapX)" :cy="toSvgY(sys.mapY)"
                :r="14"
                class="destination-ring"
              />
              <!-- System name -->
              <text
                :x="toSvgX(sys.mapX)"
                :y="toSvgY(sys.mapY) + sys.star.size * 5 + 16"
                class="system-name"
              >{{ sys.discovered || sys.id === currentSystemId ? sys.name : '???' }}</text>
            </g>
          </svg>
        </div>

        <!-- Info panel on the right -->
        <div class="map-info-panel">
          <template v-if="infoSystem">
            <div class="info-header">
              <div class="lcars-pill" :style="{ background: STAR_COLORS[infoSystem.star.class] }" />
              <span class="info-system-name">{{ infoSystem.name }}</span>
            </div>
            <div class="info-sector">{{ infoSystem.sector }}</div>
            <div class="info-divider" />
            <div class="info-row">
              <span class="info-label">STAR CLASS</span>
              <span class="info-value" :style="{ color: STAR_COLORS[infoSystem.star.class] }">
                {{ infoSystem.star.class }} — {{ infoSystem.star.name }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">PLANETS</span>
              <span class="info-value">{{ infoSystem.planets.length }}</span>
            </div>
            <div class="info-row" v-if="infoSystem.station">
              <span class="info-label">STATION</span>
              <span class="info-value station">{{ infoSystem.station.name }}</span>
            </div>
            <div class="info-row" v-if="distanceToHovered">
              <span class="info-label">DISTANCE</span>
              <span class="info-value">{{ distanceToHovered }} LY</span>
            </div>
            <div class="info-row">
              <span class="info-label">STATUS</span>
              <span class="info-value" :class="infoSystem.discovered ? 'discovered' : 'undiscovered'">
                {{ infoSystem.id === currentSystemId ? 'CURRENT LOCATION' : infoSystem.discovered ? 'EXPLORED' : 'UNEXPLORED' }}
              </span>
            </div>
            <div class="info-divider" />
            <p class="info-description">{{ infoSystem.description }}</p>

            <!-- Planet list -->
            <div class="info-planet-header">PLANETARY BODIES</div>
            <div
              v-for="planet in infoSystem.planets"
              :key="planet.name"
              class="info-planet"
            >
              <span class="planet-name">{{ planet.name }}</span>
              <span class="planet-type">{{ planet.type.replace('-', ' ') }}</span>
            </div>

            <!-- Action buttons -->
            <div class="info-actions" v-if="infoSystem.id !== currentSystemId">
              <button
                v-if="isReachable"
                class="lcars-btn set-course"
                @click="emit('selectSystem', infoSystem.id)"
              >SET COURSE</button>
              <span v-else class="no-route">NO DIRECT ROUTE</span>
            </div>
          </template>

          <template v-else>
            <div class="info-placeholder">
              <p>SELECT A STAR SYSTEM</p>
              <p class="info-hint">Click a system on the map to view details.</p>
              <p class="info-hint">Connected systems can be reached via warp.</p>
            </div>
          </template>

          <!-- Engage button -->
          <div class="engage-section">
            <div class="info-divider" />
            <div v-if="destinationId" class="engage-destination">
              COURSE SET: {{ STAR_SYSTEMS.find(s => s.id === destinationId)?.name ?? '—' }}
            </div>
            <button
              class="lcars-btn engage"
              :class="{ disabled: !canEngage }"
              :disabled="!canEngage"
              @click="emit('engage')"
            >
              {{ travelPhase === 'idle' ? '■ ENGAGE' : travelPhase === 'charging' ? 'CHARGING...' : 'IN WARP' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="map-footer">
        <div class="lcars-elbow bottom-left" />
        <div class="footer-content">
          <span>CURRENT: {{ STAR_SYSTEMS.find(s => s.id === currentSystemId)?.name ?? 'Unknown' }}</span>
          <span>PRESS M TO CLOSE</span>
        </div>
        <div class="lcars-elbow bottom-right" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.star-map-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 20;
  background: rgba(0, 0, 10, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.star-map-frame {
  width: 90vw;
  max-width: 1200px;
  height: 80vh;
  max-height: 700px;
  display: flex;
  flex-direction: column;
}

/* ── Header ────────────────────────────────────────────────────────────── */

.map-header {
  display: flex;
  align-items: stretch;
  gap: 0;
  height: 48px;
}

.lcars-elbow {
  width: 60px;
  min-height: 48px;
  border-radius: 0;
}

.lcars-elbow.top-left {
  background: #cc7700;
  border-radius: 18px 0 0 0;
}

.lcars-elbow.top-right {
  background: #cc7700;
  border-radius: 0 18px 0 0;
}

.lcars-elbow.bottom-left {
  background: #5577aa;
  border-radius: 0 0 0 18px;
}

.lcars-elbow.bottom-right {
  background: #5577aa;
  border-radius: 0 0 18px 0;
}

.header-title {
  flex: 1;
  background: #cc7700;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 20px;
}

.map-title {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.4rem;
  color: #000;
}

.map-subtitle {
  font-size: 0.6rem;
  letter-spacing: 0.2rem;
  color: #00000088;
  margin-top: 2px;
}

/* ── Content ───────────────────────────────────────────────────────────── */

.map-content {
  flex: 1;
  display: flex;
  gap: 0;
  border-left: 6px solid #cc7700;
  border-right: 6px solid #cc7700;
  overflow: hidden;
}

.map-svg-container {
  flex: 1;
  background: radial-gradient(ellipse at center, #060a14 0%, #020308 100%);
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-svg {
  width: 100%;
  height: 100%;
}

/* ── SVG Elements ──────────────────────────────────────────────────────── */

.sector-label {
  fill: rgba(100, 140, 180, 0.2);
  font-size: 12px;
  letter-spacing: 4px;
  text-anchor: middle;
  font-weight: 600;
}

.route-line {
  stroke: rgba(80, 120, 160, 0.2);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.route-line.active {
  stroke: #3388ff;
  stroke-width: 2;
  stroke-dasharray: none;
  filter: drop-shadow(0 0 4px #3388ff);
}

.system-node {
  cursor: pointer;
}

.star-glow {
  opacity: 0.6;
  transition: opacity 0.2s;
}

.system-node:hover .star-glow,
.system-node.hovered .star-glow {
  opacity: 1;
}

.star-dot {
  transition: r 0.2s;
}

.system-node:hover .star-dot {
  filter: drop-shadow(0 0 6px currentColor);
}

.current-ring {
  fill: none;
  stroke: #ffaa00;
  stroke-width: 2;
  stroke-dasharray: 4 2;
  animation: rotate 8s linear infinite;
}

@keyframes rotate {
  from { transform-origin: center; }
}

.destination-ring {
  fill: none;
  stroke: #3388ff;
  stroke-width: 2;
  animation: pulse-ring 1.5s ease infinite;
}

@keyframes pulse-ring {
  0%, 100% { opacity: 1; r: 14; }
  50% { opacity: 0.5; r: 18; }
}

.system-name {
  fill: #8899aa;
  font-size: 9px;
  text-anchor: middle;
  letter-spacing: 1px;
  pointer-events: none;
}

.system-node.current .system-name {
  fill: #ffaa44;
  font-weight: 600;
}

.system-node.destination .system-name {
  fill: #55aaff;
  font-weight: 600;
}

.system-node.hovered .system-name {
  fill: #ffffff;
}

/* ── Info Panel ────────────────────────────────────────────────────────── */

.map-info-panel {
  width: 280px;
  background: rgba(8, 12, 24, 0.95);
  border-left: 3px solid #cc770060;
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.lcars-pill {
  width: 8px;
  height: 20px;
  border-radius: 4px;
}

.info-system-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #ddeeff;
  letter-spacing: 0.15rem;
}

.info-sector {
  font-size: 0.65rem;
  color: #667788;
  letter-spacing: 0.2rem;
  margin-bottom: 8px;
  padding-left: 18px;
}

.info-divider {
  height: 1px;
  background: linear-gradient(90deg, #cc770040, transparent);
  margin: 8px 0;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
}

.info-label {
  font-size: 0.6rem;
  color: #667788;
  letter-spacing: 0.15rem;
}

.info-value {
  font-size: 0.75rem;
  color: #aabbcc;
  font-weight: 500;
}

.info-value.station {
  color: #88ccff;
}

.info-value.discovered {
  color: #55cc88;
}

.info-value.undiscovered {
  color: #cc8844;
}

.info-description {
  font-size: 0.7rem;
  color: #7788aa;
  line-height: 1.5;
  margin: 8px 0;
}

.info-planet-header {
  font-size: 0.6rem;
  color: #cc7700;
  letter-spacing: 0.2rem;
  margin: 8px 0 4px;
}

.info-planet {
  display: flex;
  justify-content: space-between;
  padding: 2px 0 2px 8px;
  border-left: 2px solid #cc770030;
}

.planet-name {
  font-size: 0.7rem;
  color: #99aabb;
}

.planet-type {
  font-size: 0.6rem;
  color: #556677;
  text-transform: uppercase;
  letter-spacing: 0.05rem;
}

.info-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #556677;
}

.info-placeholder p {
  font-size: 0.8rem;
  letter-spacing: 0.2rem;
  margin: 4px 0;
}

.info-hint {
  font-size: 0.65rem !important;
  letter-spacing: 0.05rem !important;
  color: #445566 !important;
}

.info-actions {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}

.no-route {
  font-size: 0.65rem;
  color: #886644;
  letter-spacing: 0.1rem;
}

/* ── Buttons ───────────────────────────────────────────────────────────── */

.lcars-btn {
  border: none;
  padding: 8px 20px;
  border-radius: 16px;
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.2rem;
  cursor: pointer;
  transition: all 0.2s;
}

.lcars-btn.set-course {
  background: #3366aa;
  color: #ddeeff;
}

.lcars-btn.set-course:hover {
  background: #4488cc;
}

.engage-section {
  margin-top: auto;
  padding-top: 8px;
}

.engage-destination {
  font-size: 0.6rem;
  color: #55aaff;
  letter-spacing: 0.15rem;
  text-align: center;
  margin-bottom: 8px;
}

.lcars-btn.engage {
  width: 100%;
  background: #cc7700;
  color: #000;
  font-size: 0.85rem;
  padding: 12px;
  letter-spacing: 0.3rem;
}

.lcars-btn.engage:hover:not(.disabled) {
  background: #ff9900;
  box-shadow: 0 0 20px #ff990040;
}

.lcars-btn.engage.disabled {
  background: #333;
  color: #666;
  cursor: not-allowed;
}

/* ── Footer ────────────────────────────────────────────────────────────── */

.map-footer {
  display: flex;
  align-items: stretch;
  height: 32px;
}

.footer-content {
  flex: 1;
  background: #5577aa;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.15rem;
  color: #000;
}
</style>
