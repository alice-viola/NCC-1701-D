import * as THREE from 'three'

export interface HullTextures {
  diffuse: THREE.CanvasTexture
  emissive: THREE.CanvasTexture
  roughness: THREE.CanvasTexture
}

/**
 * Generates all procedural hull textures for the Enterprise-D.
 * These are canvas-based textures requiring no external image files.
 */
export function createHullTextures(): HullTextures {
  return {
    diffuse: createAztecDiffuseMap(),
    emissive: createWindowEmissiveMap(),
    roughness: createHullRoughnessMap(),
  }
}

// ---------------------------------------------------------------------------
// Aztec Hull Pattern - Diffuse Map
// ---------------------------------------------------------------------------
// The Galaxy-class Enterprise-D has a signature paneled hull with overlapping
// rectangular patches in subtly varying shades of blue-grey. This is the
// defining visual feature of the ship.

function createAztecDiffuseMap(): THREE.CanvasTexture {
  const size = 2048
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Base hull color - warm grey with blue tint
  ctx.fillStyle = '#b5c1cc'
  ctx.fillRect(0, 0, size, size)

  const panelShades = [
    '#a8b4c0', '#aeb8c4', '#b2bcc8', '#bac4ce',
    '#c0c8d0', '#a4b0bc', '#c4ccd4', '#9eaab6',
  ]

  // -- Layer 1: Large aztec panels --
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const w = 80 + Math.random() * 220
    const h = 50 + Math.random() * 140
    ctx.fillStyle = panelShades[Math.floor(Math.random() * panelShades.length)] ?? '#b5c1cc'
    ctx.globalAlpha = 0.18 + Math.random() * 0.14
    fillWrapped(ctx, x, y, w, h, size)
  }

  // -- Layer 2: Medium panels --
  for (let i = 0; i < 350; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const w = 25 + Math.random() * 90
    const h = 18 + Math.random() * 55
    ctx.fillStyle = panelShades[Math.floor(Math.random() * panelShades.length)] ?? '#b5c1cc'
    ctx.globalAlpha = 0.1 + Math.random() * 0.12
    fillWrapped(ctx, x, y, w, h, size)
  }

  // -- Layer 3: Fine detail panels --
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const w = 8 + Math.random() * 35
    const h = 6 + Math.random() * 22
    const shade = 0.88 + Math.random() * 0.24
    ctx.fillStyle = `rgb(${clamp(Math.floor(181 * shade))}, ${clamp(Math.floor(193 * shade))}, ${clamp(Math.floor(204 * shade))})`
    ctx.globalAlpha = 0.1 + Math.random() * 0.08
    ctx.fillRect(x, y, w, h)
  }

  ctx.globalAlpha = 1.0

  // -- Panel seam lines --
  // Thin dark lines suggesting hull section boundaries
  ctx.lineWidth = 1
  for (let i = 0; i < 180; i++) {
    ctx.beginPath()
    ctx.strokeStyle = `rgba(50, 60, 72, ${0.04 + Math.random() * 0.05})`
    const x = Math.random() * size
    const y = Math.random() * size
    const len = 50 + Math.random() * 350
    // Mostly horizontal and vertical lines (hull panels are rectilinear)
    const dir = Math.random()
    if (dir < 0.45) {
      // Horizontal
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y + (Math.random() - 0.5) * 3)
    } else if (dir < 0.9) {
      // Vertical
      ctx.moveTo(x, y)
      ctx.lineTo(x + (Math.random() - 0.5) * 3, y + len)
    } else {
      // Diagonal (rare)
      ctx.moveTo(x, y)
      ctx.lineTo(x + len * 0.7, y + len * 0.7)
    }
    ctx.stroke()
  }

  // -- Subtle micro-detail: tiny surface imperfections --
  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    ctx.fillStyle = `rgba(${140 + Math.floor(Math.random() * 50)}, ${150 + Math.floor(Math.random() * 50)}, ${160 + Math.floor(Math.random() * 50)}, 0.04)`
    ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(5, 5)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

// ---------------------------------------------------------------------------
// Window Emissive Map
// ---------------------------------------------------------------------------
// Small warm-yellow dots on black background. These represent illuminated
// windows and hull lights. Bright pixels will glow via the bloom pass.

function createWindowEmissiveMap(): THREE.CanvasTexture {
  const size = 2048
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Black background = no emission
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)

  // -- Window bands: horizontal rows suggesting deck levels --
  // Spread across the texture at regular intervals
  const bandCount = 14
  for (let b = 0; b < bandCount; b++) {
    const bandY = ((b + 0.5) / bandCount) * size
    const windowCount = 50 + Math.floor(Math.random() * 40)
    const spacing = size / windowCount

    for (let w = 0; w < windowCount; w++) {
      // Skip some windows randomly for organic look
      if (Math.random() < 0.3) continue

      const x = w * spacing + (Math.random() - 0.5) * spacing * 0.3
      const y = bandY + (Math.random() - 0.5) * 8
      const ww = 2 + Math.random() * 3
      const wh = 1.5 + Math.random() * 2

      // Warm window color with brightness variation
      const brightness = 0.5 + Math.random() * 0.5
      const r = Math.floor(255 * brightness)
      const g = Math.floor(235 * brightness)
      const b2 = Math.floor(180 * brightness)
      ctx.fillStyle = `rgb(${r}, ${g}, ${b2})`
      ctx.globalAlpha = 0.6 + Math.random() * 0.4
      ctx.fillRect(x, y, ww, wh)
    }
  }

  ctx.globalAlpha = 1.0

  // -- Scattered individual windows/hull lights between bands --
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const w = 1 + Math.random() * 2.5
    const h = 1 + Math.random() * 2
    const brightness = 0.3 + Math.random() * 0.7
    ctx.fillStyle = `rgba(${Math.floor(255 * brightness)}, ${Math.floor(225 * brightness)}, ${Math.floor(170 * brightness)}, ${0.4 + Math.random() * 0.6})`
    ctx.fillRect(x, y, w, h)
  }

  // -- Subtle phaser strip accents (thin amber horizontal lines) --
  for (let i = 0; i < 6; i++) {
    const y = Math.random() * size
    ctx.strokeStyle = `rgba(255, 180, 60, ${0.15 + Math.random() * 0.15})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(size, y + (Math.random() - 0.5) * 10)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(5, 5)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

// ---------------------------------------------------------------------------
// Hull Roughness Map
// ---------------------------------------------------------------------------
// Per-panel roughness variation so some sections appear shinier
// and others slightly more matte, adding visual depth under lighting.

function createHullRoughnessMap(): THREE.CanvasTexture {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Base roughness - medium grey (~0.5 roughness)
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, size, size)

  // Panel-level roughness variation
  for (let i = 0; i < 350; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const w = 20 + Math.random() * 110
    const h = 15 + Math.random() * 75
    // Roughness range: 0.25 (shiny) to 0.7 (matte)
    const roughness = 0.25 + Math.random() * 0.45
    const shade = Math.floor(roughness * 255)
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.2)`
    fillWrapped(ctx, x, y, w, h, size)
  }

  // Fine grain noise for micro-roughness
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const shade = 100 + Math.floor(Math.random() * 80)
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.08)`
    ctx.fillRect(x, y, 2 + Math.random() * 5, 2 + Math.random() * 5)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(5, 5)
  return texture
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fills a rect and wraps at canvas edges for seamless tiling. */
function fillWrapped(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  canvasSize: number,
): void {
  ctx.fillRect(x, y, w, h)
  if (x + w > canvasSize) ctx.fillRect(x - canvasSize, y, w, h)
  if (y + h > canvasSize) ctx.fillRect(x, y - canvasSize, w, h)
  if (x + w > canvasSize && y + h > canvasSize) {
    ctx.fillRect(x - canvasSize, y - canvasSize, w, h)
  }
}

/** Clamp RGB value to 0-255 range. */
function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
