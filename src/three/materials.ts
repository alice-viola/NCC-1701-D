import * as THREE from 'three'
import type { HullTextures } from './textures'

/**
 * Primary hull material - metallic with aztec pattern textures.
 * Accepts procedurally generated texture maps for diffuse, emissive, and roughness.
 */
export function createHullMaterial(textures: HullTextures): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map: textures.diffuse,
    roughnessMap: textures.roughness,
    emissiveMap: textures.emissive,
    emissive: 0xffeedd,
    emissiveIntensity: 0.15,           // Very subtle window accents
    color: 0xc0ccd6,
    metalness: 0.3,
    roughness: 0.55,                   // Higher roughness = softer highlights
    clearcoat: 0.1,                    // Minimal clearcoat to avoid sharp hotspots
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.6,              // Reduced env reflections
    side: THREE.DoubleSide,
    flatShading: false,
  })
}

/**
 * Secondary hull material - for the small detail mesh group.
 * Uses the same textures with a slightly warmer tone.
 */
export function createSecondaryHullMaterial(textures: HullTextures): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map: textures.diffuse,
    roughnessMap: textures.roughness,
    emissiveMap: textures.emissive,
    emissive: 0xffeedd,
    emissiveIntensity: 0.15,
    color: 0xb4c2ce,
    metalness: 0.3,
    roughness: 0.55,
    clearcoat: 0.1,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.6,
    side: THREE.DoubleSide,
    flatShading: false,
  })
}

/**
 * Nacelle grille glow material - the iconic blue warp engine light.
 */
export function createNacelleGlowMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x3388ff,
    emissive: 0x3388ff,
    emissiveIntensity: 3.0,
    metalness: 0.0,
    roughness: 0.0,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
  })
}

/**
 * Bussard collector (ramscoop) material - red-orange glow at nacelle fronts.
 */
export function createBussardMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xff3300,
    emissive: 0xff3300,
    emissiveIntensity: 2.5,
    metalness: 0.0,
    roughness: 0.0,
    transparent: true,
    opacity: 0.9,
  })
}

/**
 * Deflector dish material - amber/gold glow.
 */
export function createDeflectorMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffaa22,
    emissive: 0xffaa22,
    emissiveIntensity: 2.5,
    metalness: 0.0,
    roughness: 0.0,
    transparent: true,
    opacity: 0.9,
  })
}

/**
 * Impulse engine glow material.
 */
export function createImpulseMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xff4422,
    emissive: 0xff4422,
    emissiveIntensity: 2.0,
    metalness: 0.0,
    roughness: 0.0,
    transparent: true,
    opacity: 0.85,
  })
}

/**
 * Navigation running light material.
 */
export function createNavLightMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 3.0,
    metalness: 0.0,
    roughness: 0.0,
  })
}
