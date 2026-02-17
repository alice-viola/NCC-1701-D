import * as THREE from 'three'
import type { StarSystem } from '../game/universe'
import { PLANET_TEXTURES, STAR_COLORS } from '../game/universe'

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Skybox layer — follows the camera every frame (objects at "infinity").
 */
export interface SkyboxLayer {
  nebulaSphere: THREE.Mesh
}

/**
 * All 3D objects for a star system — can be added/removed from scene.
 */
export interface SystemObjects {
  /** Container group for all system objects */
  root: THREE.Group
  /** Individual planet groups (for rotation updates) */
  planets: THREE.Group[]
  /** Central star mesh */
  star: THREE.Mesh
}

// ---------------------------------------------------------------------------
// Skybox (follows camera)
// ---------------------------------------------------------------------------

export function createNebulaSkybox(): SkyboxLayer {
  const geo = new THREE.SphereGeometry(8000, 32, 32)

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
    },
    vertexShader: NEBULA_VERT,
    fragmentShader: NEBULA_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  })

  const nebulaSphere = new THREE.Mesh(geo, mat)
  nebulaSphere.frustumCulled = false

  return { nebulaSphere }
}

export function updateSkybox(
  skybox: SkyboxLayer,
  cameraPosition: THREE.Vector3,
  elapsed: number,
): void {
  skybox.nebulaSphere.position.copy(cameraPosition)
  const mat = skybox.nebulaSphere.material as THREE.ShaderMaterial
  mat.uniforms.uTime!.value = elapsed
}

// ---------------------------------------------------------------------------
// System Generation — creates all 3D objects for a star system
// ---------------------------------------------------------------------------

/**
 * Generate all 3D objects for the given star system definition.
 * Returns a SystemObjects that can be added to the scene and later disposed.
 */
export function createSystemObjects(system: StarSystem): SystemObjects {
  const root = new THREE.Group()
  root.name = `system-${system.id}`

  // Central star
  const star = createStar(system)
  root.add(star)

  // Planets at their orbital positions
  const planets: THREE.Group[] = []
  for (const pDef of system.planets) {
    const textureUrl = resolveTexture(pDef.texture)
    const atmoColor = pDef.hasAtmosphere && pDef.atmosphereColor
      ? new THREE.Color(pDef.atmosphereColor)
      : new THREE.Color(0.3, 0.3, 0.4)

    const group = createPlanetGroup({
      radius: pDef.radius,
      x: Math.cos(pDef.orbitAngle) * pDef.orbitRadius,
      y: (Math.random() - 0.5) * 40, // slight Y variation
      z: Math.sin(pDef.orbitAngle) * pDef.orbitRadius,
      textureUrl,
      atmosphereColor: atmoColor,
      tilt: pDef.type === 'terran' ? 0.41 : pDef.type === 'ringed' ? 0.47 : undefined,
    })
    group.position.set(
      Math.cos(pDef.orbitAngle) * pDef.orbitRadius,
      (Math.random() - 0.5) * 40,
      Math.sin(pDef.orbitAngle) * pDef.orbitRadius,
    )
    // Store collision radius on the group for collision detection
    group.userData.collisionRadius = pDef.radius

    // Override rotation speed from definition
    const planetMesh = group.children[0]
    if (planetMesh) {
      planetMesh.userData.rotSpeed = pDef.rotationSpeed
      planetMesh.userData.planetName = pDef.name
    }

    // Add rings if defined
    if (pDef.rings) {
      const ring = createRing(pDef.rings.innerRadius, pDef.rings.outerRadius, pDef.rings.color)
      group.add(ring)
    }

    root.add(group)
    planets.push(group)
  }

  // System-local lighting (point light from the star)
  const starLight = new THREE.PointLight(
    new THREE.Color(STAR_COLORS[system.star.class]),
    system.star.intensity * 2.0,
    5000,
    0.5,
  )
  starLight.position.set(0, 0, 0)
  root.add(starLight)

  return { root, planets, star }
}

/**
 * Dispose all resources for a system's objects.
 */
export function disposeSystemObjects(objs: SystemObjects): void {
  objs.root.traverse(child => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose())
      } else if (child.material) {
        child.material.dispose()
      }
    }
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────

function resolveTexture(key: string): string {
  return (PLANET_TEXTURES as Record<string, string>)[key] ?? PLANET_TEXTURES.moon ?? ''
}

function createStar(system: StarSystem): THREE.Mesh {
  const starRadius = system.star.size * 50
  const geo = new THREE.SphereGeometry(starRadius, 24, 24)
  const color = new THREE.Color(STAR_COLORS[system.star.class])

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        float fresnel = 1.0 - max(dot(vNormal, vViewDir), 0.0);
        fresnel = pow(fresnel, 2.0);

        // Glowing core
        vec3 core = uColor * 1.5;
        vec3 edge = uColor * 0.6 + vec3(0.1, 0.05, 0.0);

        vec3 color = mix(core, edge, fresnel);

        // Subtle pulsation
        float pulse = 1.0 + sin(uTime * 0.5) * 0.03;
        color *= pulse;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.userData.isStar = true

  // Add a glow sprite
  const glowGeo = new THREE.SphereGeometry(starRadius * 2.5, 16, 16)
  const glowMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float fresnel = 1.0 - max(dot(vNormal, vViewDir), 0.0);
        float alpha = pow(fresnel, 3.0) * 0.4;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  mesh.add(glow)

  return mesh
}

function createRing(innerRadius: number, outerRadius: number, colorHex: string): THREE.Mesh {
  const geo = new THREE.RingGeometry(innerRadius, outerRadius, 48)
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.rotation.x = -Math.PI / 2  // lay flat
  return mesh
}

// ============================================================================
// NEBULA SHADER — fBm noise-based photorealistic nebula
// ============================================================================

const NEBULA_VERT = /* glsl */ `
varying vec3 vWorldDir;

void main() {
  vWorldDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const NEBULA_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vWorldDir;

// ---- Noise functions ----

vec3 hash33(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float gnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(
      mix(dot(hash33(i + vec3(0,0,0)), f - vec3(0,0,0)),
          dot(hash33(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
      mix(dot(hash33(i + vec3(0,1,0)), f - vec3(0,1,0)),
          dot(hash33(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x),
      u.y),
    mix(
      mix(dot(hash33(i + vec3(0,0,1)), f - vec3(0,0,1)),
          dot(hash33(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
      mix(dot(hash33(i + vec3(0,1,1)), f - vec3(0,1,1)),
          dot(hash33(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x),
      u.y),
    u.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  vec3 shift = vec3(100.0);
  for (int i = 0; i < 4; i++) {
    v += a * gnoise(p);
    p = p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

// ---- Main ----

void main() {
  vec3 dir = normalize(vWorldDir);

  // Slow drift so the nebula breathes subtly
  vec3 p = dir * 3.0 + uTime * 0.002;

  // Large-scale structure
  float n1 = fbm(p);
  // Medium detail at offset
  float n2 = fbm(p * 2.0 + vec3(42.0, 17.0, 33.0));
  // Fine filament detail
  float n3 = fbm(p * 4.5 + vec3(84.0, 51.0, 66.0));

  // Dark dust lanes
  float dust = fbm(p * 3.0 + vec3(21.0, 63.0, 9.0));
  float dustMask = smoothstep(-0.1, 0.3, dust);

  // Create nebula emission regions — concentrate in one hemisphere
  // by biasing with dir.z so there's a focal nebula area
  float regionBias = smoothstep(-0.3, 0.5, dir.z + dir.y * 0.3) * 0.7 + 0.3;
  float nebulaStrength = smoothstep(-0.15, 0.45, n1) * regionBias;

  // Hydrogen-alpha emission (pink/red)
  float halpha = smoothstep(0.0, 0.6, n2 + n1 * 0.3) * nebulaStrength;
  vec3 emissionColor = vec3(0.85, 0.18, 0.28) * halpha;

  // Hot core / reflection nebula (blue-white)
  float core = smoothstep(0.3, 0.7, n2) * smoothstep(0.2, 0.5, n1);
  vec3 reflectionColor = vec3(0.5, 0.55, 0.85) * core * nebulaStrength * 0.6;

  // Purple fringe (mix of red and blue at edges)
  float fringe = smoothstep(-0.1, 0.3, n1) * (1.0 - smoothstep(0.3, 0.6, n1));
  vec3 fringeColor = vec3(0.4, 0.15, 0.5) * fringe * regionBias * 0.4;

  // Warm center glow
  float warmCore = smoothstep(0.35, 0.65, n1) * smoothstep(0.2, 0.5, n2);
  vec3 warmColor = vec3(0.9, 0.75, 0.6) * warmCore * nebulaStrength * 0.3;

  // Combine emission
  vec3 nebula = emissionColor + reflectionColor + fringeColor + warmColor;

  // Apply dust absorption (dark lanes cut through bright areas)
  nebula *= mix(0.15, 1.0, dustMask);

  // Fine filament detail adds texture
  nebula *= (0.7 + 0.3 * smoothstep(-0.3, 0.3, n3));

  // Overall brightness control — space is mostly dark
  nebula *= 0.35;

  // Very subtle ambient glow everywhere (not pure black)
  vec3 ambient = vec3(0.008, 0.006, 0.015);

  vec3 color = ambient + nebula;

  gl_FragColor = vec4(color, 1.0);
}
`

// ============================================================================
// PLANET GENERATION
// ============================================================================

interface PlanetConfig {
  radius: number
  x: number; y: number; z: number
  textureUrl: string
  atmosphereColor: THREE.Color
  tilt?: number // axial tilt in radians
}

function createPlanetGroup(cfg: PlanetConfig): THREE.Group {
  const group = new THREE.Group()

  // Planet body — real texture
  const planet = createPlanetMesh(cfg.radius, cfg.textureUrl)
  if (cfg.tilt) planet.rotation.z = cfg.tilt
  group.add(planet)

  return group
}

function createPlanetMesh(
  radius: number,
  textureUrl: string,
): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 32, 32)

  // Load real NASA-based texture
  const loader = new THREE.TextureLoader()
  const tex = loader.load(textureUrl)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8 // sharper at oblique angles

  // Custom shader: half-lit by a sun direction so the planet always
  // looks realistic regardless of scene lighting. Adds subtle rim
  // lighting for depth and a specular highlight for shine.
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uSunDir: { value: new THREE.Vector3(0.5, 0.3, 0.8).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vec3 normal = normalize(vNormal);
        vec4 texColor = texture2D(uMap, vUv);

        // Diffuse lighting from sun
        float diffuse = max(dot(normal, uSunDir), 0.0);
        float lighting = 0.08 + diffuse * 0.92;

        // Subtle specular highlight
        vec3 halfDir = normalize(uSunDir + vViewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 40.0);
        vec3 specColor = vec3(0.15) * spec * diffuse;

        // Rim lighting for depth (subtle backlight on edges)
        float rim = 1.0 - max(dot(normal, vViewDir), 0.0);
        rim = pow(rim, 4.0) * 0.15;

        vec3 color = texColor.rgb * lighting + specColor + vec3(rim);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.userData.rotSpeed = 0.0002 + Math.random() * 0.0003
  return mesh
}

