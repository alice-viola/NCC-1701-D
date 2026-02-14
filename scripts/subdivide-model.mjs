#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// subdivide-model.mjs — Mesh subdivision + Taubin smoothing for OBJ models
// ═══════════════════════════════════════════════════════════════════════════
//
// Strategy (robust for imperfect / non-manifold meshes):
//
//   1. Parse OBJ into vertices + triangle faces
//   2. Midpoint subdivision: split each triangle into 4 by inserting a new
//      vertex at the midpoint of each edge. Original vertices keep their
//      positions — no distortion of existing features.
//   3. Taubin λ|μ smoothing: alternating positive (λ) and negative (μ)
//      Laplacian passes. This smooths the surface WITHOUT shrinking it
//      (unlike plain Laplacian smoothing which deflates the mesh).
//   4. Write the smoothed OBJ
//
// This approach is far more forgiving than Loop subdivision when the input
// mesh has boundary edges, non-manifold topology, or high-valence vertices.
//
// Usage:  node scripts/subdivide-model.mjs [subdivisions] [smoothPasses]
//         Default: 1 subdivision, 10 smooth passes
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const INPUT  = join(ROOT, 'public', 'models', 'enterprise-d', '3d-model.obj')
const OUTPUT = join(ROOT, 'public', 'models', 'enterprise-d', '3d-model-smooth.obj')

const SUBDIVISIONS  = parseInt(process.argv[2] || '1', 10)
const SMOOTH_PASSES = parseInt(process.argv[3] || '10', 10)

// Taubin smoothing parameters
const LAMBDA = 0.5    // positive smoothing factor
const MU    = -0.53   // negative smoothing factor (|μ| > λ to avoid shrinkage)

console.log(`Midpoint Subdivision + Taubin Smoothing`)
console.log(`  Input:       ${INPUT}`)
console.log(`  Output:      ${OUTPUT}`)
console.log(`  Subdivisions:  ${SUBDIVISIONS}`)
console.log(`  Smooth passes: ${SMOOTH_PASSES} (λ=${LAMBDA}, μ=${MU})`)
console.log()

// ─── OBJ Parser ──────────────────────────────────────────────────────────

function parseOBJ(text) {
  const lines = text.split('\n')
  const vertices = []
  const groups   = []
  let currentGroup = null

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    const cmd = parts[0]

    if (cmd === 'v') {
      vertices.push({
        x: parseFloat(parts[1]),
        y: parseFloat(parts[2]),
        z: parseFloat(parts[3]),
      })
    } else if (cmd === 'g') {
      currentGroup = { name: parts[1] || 'default', material: '', faces: [] }
      groups.push(currentGroup)
    } else if (cmd === 'usemtl') {
      if (currentGroup) currentGroup.material = parts[1]
    } else if (cmd === 'f') {
      if (!currentGroup) {
        currentGroup = { name: 'default', material: '', faces: [] }
        groups.push(currentGroup)
      }
      const faceVerts = parts.slice(1).map(p => parseInt(p.split('/')[0], 10) - 1)
      // Triangulate polygons via fan
      for (let i = 1; i < faceVerts.length - 1; i++) {
        currentGroup.faces.push([faceVerts[0], faceVerts[i], faceVerts[i + 1]])
      }
    }
  }

  return { vertices, groups }
}

// ─── Canonical edge key ──────────────────────────────────────────────────

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

// ─── Mesh topology diagnostics ───────────────────────────────────────────

function diagnose(vertices, faces) {
  const edgeFaceCount = new Map()
  for (const [a, b, c] of faces) {
    for (const [v1, v2] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(v1, v2)
      edgeFaceCount.set(key, (edgeFaceCount.get(key) || 0) + 1)
    }
  }
  let boundary = 0, interior = 0, nonManifold = 0
  for (const count of edgeFaceCount.values()) {
    if (count === 1) boundary++
    else if (count === 2) interior++
    else nonManifold++
  }
  console.log(`    Edges: ${edgeFaceCount.size} total — ${interior} interior, ${boundary} boundary, ${nonManifold} non-manifold`)
  return { boundary, nonManifold }
}

// ─── Midpoint Subdivision (one iteration) ────────────────────────────────
// Splits each triangle into 4 by inserting midpoint vertices on each edge.
// Original vertex positions are UNCHANGED — no distortion.
//
//        a                 a
//       / \               /|\
//      /   \      →     ab - ca
//     /     \           /|\ /|\
//    b───────c         b─bc──c
//

function midpointSubdivide(vertices, faces) {
  const newVertices = vertices.map(v => ({ ...v }))
  const edgeMidpoints = new Map()

  // Create midpoint vertex for each unique edge
  for (const [a, b, c] of faces) {
    for (const [v1, v2] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(v1, v2)
      if (!edgeMidpoints.has(key)) {
        const p1 = vertices[v1], p2 = vertices[v2]
        const idx = newVertices.length
        newVertices.push({
          x: 0.5 * (p1.x + p2.x),
          y: 0.5 * (p1.y + p2.y),
          z: 0.5 * (p1.z + p2.z),
        })
        edgeMidpoints.set(key, idx)
      }
    }
  }

  // Split each triangle into 4
  const newFaces = []
  for (const [a, b, c] of faces) {
    const ab = edgeMidpoints.get(edgeKey(a, b))
    const bc = edgeMidpoints.get(edgeKey(b, c))
    const ca = edgeMidpoints.get(edgeKey(c, a))

    newFaces.push([a, ab, ca])
    newFaces.push([b, bc, ab])
    newFaces.push([c, ca, bc])
    newFaces.push([ab, bc, ca])
  }

  return { vertices: newVertices, faces: newFaces }
}

// ─── Taubin λ|μ Smoothing ────────────────────────────────────────────────
// Alternates a positive Laplacian step (λ) that smooths, with a negative
// step (μ) that counteracts shrinkage. The pair preserves volume while
// removing high-frequency noise.
//
// Boundary vertices (on edges with only 1 face) are NOT moved, so the
// mesh boundary shape is preserved.

function taubinSmooth(vertices, faces, passes, lambda, mu) {
  // Build adjacency: vertex → Set<neighbor vertices>
  const neighbors = new Map()
  const edgeFaceCount = new Map()

  for (const [a, b, c] of faces) {
    for (const [v1, v2] of [[a, b], [b, c], [c, a]]) {
      if (!neighbors.has(v1)) neighbors.set(v1, new Set())
      if (!neighbors.has(v2)) neighbors.set(v2, new Set())
      neighbors.get(v1).add(v2)
      neighbors.get(v2).add(v1)

      const key = edgeKey(v1, v2)
      edgeFaceCount.set(key, (edgeFaceCount.get(key) || 0) + 1)
    }
  }

  // Mark boundary vertices (on edges shared by only 1 face) as fixed
  const isBoundary = new Set()
  for (const [key, count] of edgeFaceCount) {
    if (count !== 2) {
      const [a, b] = key.split('|').map(Number)
      isBoundary.add(a)
      isBoundary.add(b)
    }
  }

  console.log(`    Smoothing: ${isBoundary.size} boundary vertices fixed, ${vertices.length - isBoundary.size} smoothable`)

  // Working copy
  let current = vertices.map(v => ({ x: v.x, y: v.y, z: v.z }))

  for (let pass = 0; pass < passes; pass++) {
    // λ step (smooth)
    current = laplacianStep(current, neighbors, isBoundary, lambda)
    // μ step (inflate back)
    current = laplacianStep(current, neighbors, isBoundary, mu)
  }

  return current
}

function laplacianStep(vertices, neighbors, isBoundary, factor) {
  const result = vertices.map(v => ({ x: v.x, y: v.y, z: v.z }))

  for (const [vi, nbrs] of neighbors) {
    if (isBoundary.has(vi)) continue  // don't move boundary vertices
    if (nbrs.size === 0) continue

    const p = vertices[vi]
    let cx = 0, cy = 0, cz = 0
    for (const ni of nbrs) {
      cx += vertices[ni].x
      cy += vertices[ni].y
      cz += vertices[ni].z
    }
    cx /= nbrs.size
    cy /= nbrs.size
    cz /= nbrs.size

    // Move vertex toward (λ>0) or away from (μ<0) the neighbor centroid
    result[vi] = {
      x: p.x + factor * (cx - p.x),
      y: p.y + factor * (cy - p.y),
      z: p.z + factor * (cz - p.z),
    }
  }

  return result
}

// ─── Main ────────────────────────────────────────────────────────────────

const text = readFileSync(INPUT, 'utf-8')
const { vertices: globalVerts, groups } = parseOBJ(text)

console.log(`Parsed: ${globalVerts.length} global vertices, ${groups.length} group(s)`)
for (const g of groups) {
  console.log(`  Group "${g.name}": ${g.faces.length} triangles (material: ${g.material})`)
}

const outputParts = [
  '# Subdivided + Taubin-smoothed OBJ model',
  `# Source: 3d-model.obj`,
  `# Subdivisions: ${SUBDIVISIONS}, Smooth passes: ${SMOOTH_PASSES}`,
  '',
  'mtllib 3d-model.mtl',
  '',
]

let globalVertexOffset = 0

for (const group of groups) {
  console.log(`\nProcessing group "${group.name}" ...`)

  // Extract local vertex subset
  const usedSet = new Set()
  for (const face of group.faces) {
    for (const vi of face) usedSet.add(vi)
  }
  const usedGlobalIndices = [...usedSet].sort((a, b) => a - b)

  const g2l = new Map()
  const localVerts = []
  for (let i = 0; i < usedGlobalIndices.length; i++) {
    g2l.set(usedGlobalIndices[i], i)
    const gv = globalVerts[usedGlobalIndices[i]]
    localVerts.push({ x: gv.x, y: gv.y, z: gv.z })
  }

  let verts = localVerts
  let faces = group.faces.map(f => f.map(vi => g2l.get(vi)))

  console.log(`  Input: ${verts.length} vertices, ${faces.length} triangles`)
  diagnose(verts, faces)

  // Step 1: Midpoint subdivision
  for (let iter = 0; iter < SUBDIVISIONS; iter++) {
    const t0 = performance.now()
    const result = midpointSubdivide(verts, faces)
    verts = result.vertices
    faces = result.faces
    const ms = (performance.now() - t0).toFixed(0)
    console.log(`  Subdivision ${iter + 1}: ${verts.length} vertices, ${faces.length} triangles (${ms} ms)`)
    diagnose(verts, faces)
  }

  // Step 2: Taubin smoothing
  if (SMOOTH_PASSES > 0) {
    const t0 = performance.now()
    verts = taubinSmooth(verts, faces, SMOOTH_PASSES, LAMBDA, MU)
    const ms = (performance.now() - t0).toFixed(0)
    console.log(`  Taubin smoothing (${SMOOTH_PASSES} passes): done (${ms} ms)`)
  }

  // Write group
  outputParts.push(`#`)
  outputParts.push(`# object ${group.name}`)
  outputParts.push(`#`)
  outputParts.push('')

  for (const v of verts) {
    outputParts.push(`v  ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`)
  }
  outputParts.push(`# ${verts.length} vertices`)
  outputParts.push('')

  outputParts.push(`g ${group.name}`)
  if (group.material) outputParts.push(`usemtl ${group.material}`)
  outputParts.push('s 1')
  outputParts.push('')

  for (const [a, b, c] of faces) {
    outputParts.push(`f ${a + 1 + globalVertexOffset} ${b + 1 + globalVertexOffset} ${c + 1 + globalVertexOffset}`)
  }
  outputParts.push(`# ${faces.length} triangles`)
  outputParts.push('')

  globalVertexOffset += verts.length
}

const output = outputParts.join('\n')
writeFileSync(OUTPUT, output, 'utf-8')

const sizeMB = (Buffer.byteLength(output, 'utf-8') / 1024 / 1024).toFixed(1)
console.log(`\nDone! Wrote ${OUTPUT}`)
console.log(`  Total vertices: ${globalVertexOffset}`)
console.log(`  File size: ${sizeMB} MB`)
