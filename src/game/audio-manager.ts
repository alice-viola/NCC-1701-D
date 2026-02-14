import type { GameState } from './game-state'

/**
 * Audio manager using real Star Trek TNG sound samples.
 * Samples are loaded as AudioBuffers and played via the Web Audio API
 * for precise control over pitch, volume, and looping.
 */

// Sound file paths (relative to public/)
const SOUNDS = {
  // One-shot effects
  phaser:       '/audio/tng-phaser.mp3',
  shipPhaser:   '/audio/ship-phaser.mp3',
  torpedo:      '/audio/tng-torpedo.mp3',
  photonTorp:   '/audio/photon-torpedo.mp3',
  warpEngage:   '/audio/warp-engage.mp3',
  warpFlyby:    '/audio/warp-flyby.mp3',
  shieldOn:     '/audio/forcefield-on.mp3',
  shieldOff:    '/audio/forcefield-off.mp3',
  redAlert:     '/audio/red-alert.mp3',

  // Looping ambient
  bridgeAmbient:  '/audio/tng-bridge.mp3',
  engineHum:      '/audio/tng-engineering-hum.mp3',
  engineDrive:    '/audio/enterprise-engine.mp3',
  engineStrain:   '/audio/engine-strain.mp3',
} as const

export interface AudioManager {
  ctx: AudioContext | null
  masterGain: GainNode | null
  initialized: boolean
  buffers: Map<string, AudioBuffer>

  // Looping sources (need to track for stop/modify)
  bridgeSource: AudioBufferSourceNode | null
  bridgeGain: GainNode | null
  engineSource: AudioBufferSourceNode | null
  engineGain: GainNode | null
  warpSource: AudioBufferSourceNode | null
  warpGain: GainNode | null

  // State tracking for edge-triggered sounds
  prevWarp: boolean
  prevShields: boolean
  prevPhaserFiring: boolean
  enginePlaying: boolean

  // Rate-limiter for one-shots
  lastPhaserTime: number
  lastTorpedoTime: number
}

export function createAudioManager(): AudioManager {
  return {
    ctx: null,
    masterGain: null,
    initialized: false,
    buffers: new Map(),
    bridgeSource: null,
    bridgeGain: null,
    engineSource: null,
    engineGain: null,
    warpSource: null,
    warpGain: null,
    prevWarp: false,
    prevShields: false,
    prevPhaserFiring: false,
    enginePlaying: false,
    lastPhaserTime: 0,
    lastTorpedoTime: 0,
  }
}

// ---------------------------------------------------------------------------
// Init — must be called within a user gesture
// ---------------------------------------------------------------------------

export function initAudio(am: AudioManager): void {
  if (am.initialized) return
  try {
    am.ctx = new AudioContext()
    if (am.ctx.state === 'suspended') am.ctx.resume()

    am.masterGain = am.ctx.createGain()
    am.masterGain.gain.value = 0.7
    am.masterGain.connect(am.ctx.destination)

    am.initialized = true
    console.log('[Audio] AudioContext created, state:', am.ctx.state)

    // Load all samples in background
    loadAllSamples(am)
  } catch (err) {
    console.warn('[Audio] Init failed:', err)
  }
}

async function loadAllSamples(am: AudioManager): Promise<void> {
  if (!am.ctx) return

  const entries = Object.entries(SOUNDS)
  console.log(`[Audio] Loading ${entries.length} samples...`)

  const results = await Promise.allSettled(
    entries.map(async ([key, url]) => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const arrayBuffer = await response.arrayBuffer()
        const audioBuffer = await am.ctx!.decodeAudioData(arrayBuffer)
        am.buffers.set(key, audioBuffer)
      } catch (err) {
        console.warn(`[Audio] Failed to load ${key} (${url}):`, err)
      }
    })
  )

  const loaded = results.filter(r => r.status === 'fulfilled').length
  console.log(`[Audio] ${loaded}/${entries.length} samples loaded`)

  // Auto-start bridge ambient once loaded
  startBridgeAmbient(am)
}

// ---------------------------------------------------------------------------
// Dispose
// ---------------------------------------------------------------------------

export function disposeAudio(am: AudioManager): void {
  stopLoop(am, 'bridge')
  stopLoop(am, 'engine')
  stopLoop(am, 'warp')
  am.ctx?.close()
  am.ctx = null
  am.initialized = false
  am.buffers.clear()
}

// ---------------------------------------------------------------------------
// Frame update
// ---------------------------------------------------------------------------

export function updateAudio(am: AudioManager, state: GameState): void {
  if (!am.initialized || !am.ctx || !am.masterGain) return
  if (am.ctx.state === 'suspended') am.ctx.resume()

  const now = am.ctx.currentTime

  // --- Engine hum (loop) ---
  if (state.throttle > 0.01) {
    if (!am.enginePlaying) {
      startEngineLoop(am)
    }
    // Adjust engine volume and playback rate with speed
    if (am.engineGain) {
      const vol = 0.2 + Math.min(state.speed, 5) * 0.08
      am.engineGain.gain.setTargetAtTime(Math.min(vol, 0.7), now, 0.15)
    }
    if (am.engineSource) {
      const rate = 0.8 + state.speed * 0.08
      am.engineSource.playbackRate.setTargetAtTime(
        Math.min(rate, 2.0), now, 0.15
      )
    }
  } else if (am.enginePlaying) {
    stopEngineLoop(am)
  }

  // --- Warp (loop) ---
  if (state.isWarp && !am.prevWarp) {
    playOneShot(am, 'warpEngage', 0.6)
    // Start warp flyby loop after a short delay
    setTimeout(() => startWarpLoop(am), 300)
  } else if (!state.isWarp && am.prevWarp) {
    stopLoop(am, 'warp')
    // Warp disengage is the engage sound played in reverse pitch-down
    playOneShot(am, 'warpEngage', 0.4, 0.6) // lower pitch for disengage feel
  }
  am.prevWarp = state.isWarp

  // --- Shields ---
  if (state.shieldsActive && !am.prevShields) {
    playOneShot(am, 'shieldOn', 0.5)
  } else if (!state.shieldsActive && am.prevShields) {
    playOneShot(am, 'shieldOff', 0.5)
  }
  am.prevShields = state.shieldsActive

  // --- Phaser (rate-limited) ---
  if (state.phaserFiring && !am.prevPhaserFiring) {
    if (now - am.lastPhaserTime > 0.3) {
      // Alternate between the two phaser samples for variety
      const key = Math.random() > 0.5 ? 'phaser' : 'shipPhaser'
      playOneShot(am, key, 0.5)
      am.lastPhaserTime = now
    }
  }
  am.prevPhaserFiring = state.phaserFiring

  // --- Torpedo (rate-limited) ---
  if (state.torpedoFiring) {
    if (now - am.lastTorpedoTime > 0.4) {
      const key = Math.random() > 0.5 ? 'torpedo' : 'photonTorp'
      playOneShot(am, key, 0.6)
      am.lastTorpedoTime = now
    }
  }
}

// ---------------------------------------------------------------------------
// One-shot playback
// ---------------------------------------------------------------------------

function playOneShot(
  am: AudioManager,
  key: string,
  volume: number = 0.5,
  playbackRate: number = 1.0,
): void {
  if (!am.ctx || !am.masterGain) return
  const buffer = am.buffers.get(key)
  if (!buffer) return

  const source = am.ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = playbackRate

  const gain = am.ctx.createGain()
  gain.gain.value = volume

  source.connect(gain)
  gain.connect(am.masterGain)
  source.start()
}

// ---------------------------------------------------------------------------
// Looping sounds
// ---------------------------------------------------------------------------

function startBridgeAmbient(am: AudioManager): void {
  if (!am.ctx || !am.masterGain || am.bridgeSource) return
  const buffer = am.buffers.get('bridgeAmbient')
  if (!buffer) return

  am.bridgeSource = am.ctx.createBufferSource()
  am.bridgeSource.buffer = buffer
  am.bridgeSource.loop = true

  am.bridgeGain = am.ctx.createGain()
  am.bridgeGain.gain.value = 0.12 // subtle background

  am.bridgeSource.connect(am.bridgeGain)
  am.bridgeGain.connect(am.masterGain)
  am.bridgeSource.start()
  console.log('[Audio] Bridge ambient started')
}

function startEngineLoop(am: AudioManager): void {
  if (!am.ctx || !am.masterGain || am.engineSource) return

  // Try engineDrive first (long loop), fall back to engineHum
  const buffer = am.buffers.get('engineDrive') || am.buffers.get('engineHum')
  if (!buffer) return

  am.engineSource = am.ctx.createBufferSource()
  am.engineSource.buffer = buffer
  am.engineSource.loop = true

  am.engineGain = am.ctx.createGain()
  am.engineGain.gain.value = 0.0
  // Fade in
  am.engineGain.gain.setTargetAtTime(0.25, am.ctx.currentTime, 0.3)

  am.engineSource.connect(am.engineGain)
  am.engineGain.connect(am.masterGain)
  am.engineSource.start()
  am.enginePlaying = true
}

function stopEngineLoop(am: AudioManager): void {
  if (!am.ctx || !am.engineGain || !am.engineSource) return
  const now = am.ctx.currentTime
  // Fade out, then stop
  am.engineGain.gain.setTargetAtTime(0.0, now, 0.5)
  const src = am.engineSource
  setTimeout(() => {
    try { src.stop() } catch { /* ok */ }
  }, 2000)
  am.engineSource = null
  am.engineGain = null
  am.enginePlaying = false
}

function startWarpLoop(am: AudioManager): void {
  if (!am.ctx || !am.masterGain || am.warpSource) return
  const buffer = am.buffers.get('engineStrain') || am.buffers.get('warpFlyby')
  if (!buffer) return

  am.warpSource = am.ctx.createBufferSource()
  am.warpSource.buffer = buffer
  am.warpSource.loop = true

  am.warpGain = am.ctx.createGain()
  am.warpGain.gain.value = 0.0
  am.warpGain.gain.setTargetAtTime(0.3, am.ctx.currentTime, 0.4)

  am.warpSource.connect(am.warpGain)
  am.warpGain.connect(am.masterGain)
  am.warpSource.start()
}

function stopLoop(am: AudioManager, type: 'bridge' | 'engine' | 'warp'): void {
  let source: AudioBufferSourceNode | null = null
  let gain: GainNode | null = null

  switch (type) {
    case 'bridge':
      source = am.bridgeSource
      gain = am.bridgeGain
      am.bridgeSource = null
      am.bridgeGain = null
      break
    case 'engine':
      source = am.engineSource
      gain = am.engineGain
      am.engineSource = null
      am.engineGain = null
      am.enginePlaying = false
      break
    case 'warp':
      source = am.warpSource
      gain = am.warpGain
      am.warpSource = null
      am.warpGain = null
      break
  }

  if (gain && am.ctx) {
    gain.gain.setTargetAtTime(0.0, am.ctx.currentTime, 0.3)
  }
  if (source) {
    setTimeout(() => {
      try { source!.stop() } catch { /* ok */ }
    }, 1500)
  }
}
