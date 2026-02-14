import * as THREE from 'three'

/**
 * Creates a large particle-based starfield that surrounds the scene.
 * Stars have varying sizes and brightness to create depth.
 * Supports speed-responsive elongation via uniforms.
 */
export function createStarfield(count: number = 15000): THREE.Points {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  // Random phase per star so twinkle is staggered, not synchronized
  const phases = new Float32Array(count)

  const color = new THREE.Color()

  for (let i = 0; i < count; i++) {
    const i3 = i * 3

    // Stars must be farther than any planet (planets go out to ~2500 units
    // from origin, camera can be up to ~3000 from them → need radius > 5500)
    const radius = 6000 + Math.random() * 2000
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)

    positions[i3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i3 + 2] = radius * Math.cos(phi)

    const starType = Math.random()
    if (starType < 0.6) {
      color.setHSL(0.6, 0.1 + Math.random() * 0.2, 0.7 + Math.random() * 0.3)
    } else if (starType < 0.8) {
      color.setHSL(0.15, 0.3 + Math.random() * 0.3, 0.6 + Math.random() * 0.3)
    } else if (starType < 0.92) {
      color.setHSL(0.62, 0.4 + Math.random() * 0.4, 0.7 + Math.random() * 0.3)
    } else {
      color.setHSL(0.05, 0.5 + Math.random() * 0.3, 0.5 + Math.random() * 0.3)
    }

    colors[i3] = color.r
    colors[i3 + 1] = color.g
    colors[i3 + 2] = color.b

    const sizeRoll = Math.random()
    if (sizeRoll < 0.85) {
      sizes[i] = 0.5 + Math.random() * 1.0
    } else if (sizeRoll < 0.97) {
      sizes[i] = 1.5 + Math.random() * 2.0
    } else {
      sizes[i] = 3.0 + Math.random() * 3.0
    }

    phases[i] = Math.random() * 6.283 // random 0-2PI
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uTime: { value: 0 },
      uSpeed: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      attribute float phase;
      varying vec3 vColor;
      varying float vStretch;
      varying float vBrightness;
      uniform float uPixelRatio;
      uniform float uTime;
      uniform float uSpeed;

      void main() {
        vColor = color;

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

        // Gentle twinkle at low speed, suppressed at warp
        float twinkleAmt = mix(0.08, 0.02, min(uSpeed / 3.0, 1.0));
        float twinkle = 1.0 - twinkleAmt + twinkleAmt * sin(uTime * 1.2 + phase);

        // Warp stretch — dramatic elongation into streaks
        // Impulse (0-1): subtle 1.0-1.3
        // Warp (1-8): dramatic 1.3-6.0
        float stretch = 1.0 + min(uSpeed, 8.0) * 0.7;
        vStretch = stretch;

        // Stars get brighter at warp (approaching light speed)
        vBrightness = 1.0 + min(uSpeed, 8.0) * 0.15;

        // Point size scales with stretch to form proper streaks
        float sizeMultiplier = 1.0 + (stretch - 1.0) * 0.5;
        gl_PointSize = size * uPixelRatio * (3000.0 / -mvPosition.z) * sizeMultiplier;

        vColor = color * twinkle;

        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vStretch;
      varying float vBrightness;

      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);

        // At warp: compress X into narrow vertical streaks
        float squash = max(vStretch, 1.0);
        coord.x *= squash;

        float dist = length(coord);
        if (dist > 0.5) discard;

        // Soft falloff — sharper core at warp for distinct streaks
        float falloffPow = mix(1.2, 0.6, min((vStretch - 1.0) / 4.0, 1.0));
        float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
        alpha = pow(alpha, falloffPow);

        // Bright core — more intense at warp
        float coreStrength = mix(0.4, 1.2, min((vStretch - 1.0) / 4.0, 1.0));
        float coreBrightness = smoothstep(0.25, 0.0, dist) * coreStrength;

        // Progressive blueshift at warp
        vec3 finalColor = vColor;
        if (vStretch > 1.5) {
          float blueShift = min((vStretch - 1.5) * 0.15, 0.6);
          finalColor = mix(finalColor, vec3(0.6, 0.75, 1.0), blueShift);
        }

        // Boost brightness at warp
        finalColor *= vBrightness;

        gl_FragColor = vec4(finalColor * (1.0 + coreBrightness), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true, // respect depth buffer — hidden by planets and ship
    blending: THREE.AdditiveBlending,
  })

  const stars = new THREE.Points(geometry, material)
  stars.frustumCulled = false

  return stars
}

/**
 * Update starfield uniforms each frame.
 */
export function updateStarfieldSpeed(
  starfield: THREE.Points,
  speed: number,
): void {
  const mat = starfield.material as THREE.ShaderMaterial
  if (mat.uniforms.uSpeed) mat.uniforms.uSpeed.value = speed
}
