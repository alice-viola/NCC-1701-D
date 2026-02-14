/**
 * Universe data — defines star systems, sectors, and the galaxy structure.
 *
 * The universe is organised into sectors (Alpha, Beta, Gamma quadrants).
 * Each sector contains star systems that the player can warp between.
 * Each star system has a central star, planets, optional stations, and NPC spawns.
 */

// ─── Star Types ───────────────────────────────────────────────────────────────

export type StarClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M'

export interface StarDef {
  class: StarClass
  name: string
  color: string       // hex color
  size: number        // relative size multiplier (1 = Sol-like)
  intensity: number   // light intensity
}

// ─── Planet Types ─────────────────────────────────────────────────────────────

export type PlanetType =
  | 'terran'      // Earth-like (M-class)
  | 'gas-giant'   // Jupiter/Saturn
  | 'ice-giant'   // Neptune/Uranus
  | 'desert'      // Mars-like
  | 'volcanic'    // Io-like
  | 'barren'      // Moon-like
  | 'ocean'       // Water world
  | 'ringed'      // With rings

export interface PlanetDef {
  name: string
  type: PlanetType
  radius: number          // world units
  orbitRadius: number     // distance from center of system
  orbitAngle: number      // starting angle (radians)
  rotationSpeed: number   // rotation rate
  texture: string         // texture key
  hasAtmosphere: boolean
  atmosphereColor?: string
  rings?: { innerRadius: number; outerRadius: number; color: string }
  description?: string
}

// ─── Station ──────────────────────────────────────────────────────────────────

export interface StationDef {
  name: string
  type: 'starbase' | 'outpost' | 'spacedock'
  orbitRadius: number
  orbitAngle: number
  services: ('repair' | 'rearm' | 'missions')[]
}

// ─── NPC Ship Templates ──────────────────────────────────────────────────────

export type NpcShipType =
  | 'cruiser'       // Galaxy/Excelsior class
  | 'frigate'       // Miranda/Intrepid class
  | 'freighter'     // Cargo vessel
  | 'shuttle'       // Small runabout
  | 'science'       // Oberth/Nova class

export type NpcFaction = 'federation' | 'civilian' | 'vulcan' | 'andorian'

export interface NpcShipDef {
  type: NpcShipType
  faction: NpcFaction
  name: string
  behavior: 'orbit' | 'patrol' | 'cruise' | 'idle'
  /** Index of the planet to orbit (if behavior === 'orbit') */
  orbitTarget?: number
}

// ─── Star System ──────────────────────────────────────────────────────────────

export interface StarSystem {
  id: string
  name: string
  sector: string
  /** 2D position on the galaxy map (arbitrary units, used for map layout) */
  mapX: number
  mapY: number
  star: StarDef
  planets: PlanetDef[]
  station?: StationDef
  npcs: NpcShipDef[]
  /** IDs of directly connected systems (warp routes) */
  connections: string[]
  /** Has the player visited this system? */
  discovered: boolean
  description: string
}

// ─── Planet Texture Map ───────────────────────────────────────────────────────
// Maps texture keys to real planet texture URLs

export const PLANET_TEXTURES: Record<string, string> = {
  earth:    '/textures/planets/earth.jpg',
  jupiter:  '/textures/planets/jupiter.jpg',
  mars:     '/textures/planets/mars.jpg',
  neptune:  '/textures/planets/neptune.jpg',
  moon:     '/textures/planets/moon.jpg',
  saturn:   '/textures/planets/saturn.jpg',
  venus:    '/textures/planets/venus.jpg',
  mercury:  '/textures/planets/mercury.jpg',
  uranus:   '/textures/planets/uranus.jpg',
}

// ─── Star Color Map ───────────────────────────────────────────────────────────

export const STAR_COLORS: Record<StarClass, string> = {
  O: '#9bb0ff',   // blue
  B: '#aabfff',   // blue-white
  A: '#cad7ff',   // white
  F: '#f8f7ff',   // yellow-white
  G: '#fff4ea',   // yellow (Sol)
  K: '#ffd2a1',   // orange
  M: '#ffcc6f',   // red-orange
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSE DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

export const STAR_SYSTEMS: StarSystem[] = [
  // ── Sol System (Starting Location) ──────────────────────────────────────
  {
    id: 'sol',
    name: 'Sol',
    sector: 'Alpha Quadrant',
    mapX: 0,
    mapY: 0,
    star: { class: 'G', name: 'Sol', color: '#fff4ea', size: 1.0, intensity: 1.0 },
    planets: [
      {
        name: 'Earth',
        type: 'terran',
        radius: 80,
        orbitRadius: 600,
        orbitAngle: 0,
        rotationSpeed: 0.0003,
        texture: 'earth',
        hasAtmosphere: true,
        atmosphereColor: '#4488ff',
        description: 'The cradle of humanity, capital of the United Federation of Planets.',
      },
      {
        name: 'Mars',
        type: 'desert',
        radius: 50,
        orbitRadius: 900,
        orbitAngle: 2.1,
        rotationSpeed: 0.00028,
        texture: 'mars',
        hasAtmosphere: true,
        atmosphereColor: '#cc8844',
        description: 'The Utopia Planitia Fleet Yards orbit above the red planet.',
      },
      {
        name: 'Jupiter',
        type: 'gas-giant',
        radius: 150,
        orbitRadius: 1600,
        orbitAngle: 4.2,
        rotationSpeed: 0.0005,
        texture: 'jupiter',
        hasAtmosphere: false,
        description: 'The largest planet in the Sol system.',
      },
      {
        name: 'Saturn',
        type: 'ringed',
        radius: 130,
        orbitRadius: 2200,
        orbitAngle: 1.5,
        rotationSpeed: 0.00045,
        texture: 'saturn',
        hasAtmosphere: false,
        rings: { innerRadius: 160, outerRadius: 240, color: '#c8b07a' },
        description: 'The ringed giant, with Titan base in its orbit.',
      },
    ],
    station: {
      name: 'Spacedock',
      type: 'spacedock',
      orbitRadius: 400,
      orbitAngle: 1.0,
      services: ['repair', 'rearm', 'missions'],
    },
    npcs: [
      { type: 'cruiser', faction: 'federation', name: 'USS Yamato', behavior: 'patrol' },
      { type: 'shuttle', faction: 'federation', name: 'Shuttle Galileo', behavior: 'cruise' },
      { type: 'freighter', faction: 'civilian', name: 'SS Manila', behavior: 'cruise' },
    ],
    connections: ['vulcan', 'alpha-centauri', 'wolf359'],
    discovered: true,
    description: 'Home of Starfleet Command and Earth, capital world of the Federation.',
  },

  // ── Vulcan System ───────────────────────────────────────────────────────
  {
    id: 'vulcan',
    name: 'Vulcan',
    sector: 'Alpha Quadrant',
    mapX: -180,
    mapY: -120,
    star: { class: 'K', name: '40 Eridani A', color: '#ffd2a1', size: 0.85, intensity: 0.9 },
    planets: [
      {
        name: 'Vulcan',
        type: 'desert',
        radius: 75,
        orbitRadius: 500,
        orbitAngle: 0.8,
        rotationSpeed: 0.00025,
        texture: 'mars',
        hasAtmosphere: true,
        atmosphereColor: '#dd9955',
        description: 'Homeworld of the Vulcan people. Logic above all.',
      },
      {
        name: 'T\'Khut',
        type: 'volcanic',
        radius: 70,
        orbitRadius: 350,
        orbitAngle: 3.5,
        rotationSpeed: 0.0002,
        texture: 'mercury',
        hasAtmosphere: false,
        description: 'Vulcan\'s sister planet, tidally locked and volcanic.',
      },
    ],
    station: {
      name: 'ShiKahr Orbital',
      type: 'starbase',
      orbitRadius: 600,
      orbitAngle: 2.0,
      services: ['repair', 'missions'],
    },
    npcs: [
      { type: 'science', faction: 'vulcan', name: 'VSS T\'Plana-Hath', behavior: 'orbit', orbitTarget: 0 },
      { type: 'cruiser', faction: 'federation', name: 'USS Intrepid', behavior: 'patrol' },
    ],
    connections: ['sol', 'andoria', 'rigel'],
    discovered: false,
    description: 'The Vulcan home system, one of the founding worlds of the Federation.',
  },

  // ── Alpha Centauri ──────────────────────────────────────────────────────
  {
    id: 'alpha-centauri',
    name: 'Alpha Centauri',
    sector: 'Alpha Quadrant',
    mapX: 120,
    mapY: -80,
    star: { class: 'G', name: 'Alpha Centauri A', color: '#fff4ea', size: 1.1, intensity: 1.05 },
    planets: [
      {
        name: 'Centauri Prime',
        type: 'terran',
        radius: 85,
        orbitRadius: 650,
        orbitAngle: 1.2,
        rotationSpeed: 0.0003,
        texture: 'earth',
        hasAtmosphere: true,
        atmosphereColor: '#55aaff',
        description: 'A thriving Federation colony world.',
      },
      {
        name: 'Centauri III',
        type: 'ice-giant',
        radius: 100,
        orbitRadius: 1200,
        orbitAngle: 3.8,
        rotationSpeed: 0.0004,
        texture: 'neptune',
        hasAtmosphere: false,
        description: 'An ice giant with spectacular ring fragments.',
      },
    ],
    npcs: [
      { type: 'freighter', faction: 'civilian', name: 'SS Botany Bay', behavior: 'cruise' },
      { type: 'shuttle', faction: 'federation', name: 'Runabout Danube', behavior: 'cruise' },
    ],
    connections: ['sol', 'betazed'],
    discovered: false,
    description: 'The closest star system to Sol, home to a major Federation colony.',
  },

  // ── Wolf 359 ────────────────────────────────────────────────────────────
  {
    id: 'wolf359',
    name: 'Wolf 359',
    sector: 'Alpha Quadrant',
    mapX: 60,
    mapY: 100,
    star: { class: 'M', name: 'Wolf 359', color: '#ffcc6f', size: 0.3, intensity: 0.5 },
    planets: [
      {
        name: 'Wolf 359-I',
        type: 'barren',
        radius: 35,
        orbitRadius: 400,
        orbitAngle: 0.5,
        rotationSpeed: 0.0002,
        texture: 'moon',
        hasAtmosphere: false,
        description: 'A barren rock, witness to the devastating Borg attack.',
      },
    ],
    npcs: [
      { type: 'frigate', faction: 'federation', name: 'USS Melbourne', behavior: 'patrol' },
    ],
    connections: ['sol', 'starbase74'],
    discovered: false,
    description: 'Site of the catastrophic battle against the Borg. A solemn memorial.',
  },

  // ── Andoria ─────────────────────────────────────────────────────────────
  {
    id: 'andoria',
    name: 'Andoria',
    sector: 'Beta Quadrant',
    mapX: -280,
    mapY: -40,
    star: { class: 'A', name: 'Procyon', color: '#cad7ff', size: 1.5, intensity: 1.3 },
    planets: [
      {
        name: 'Andoria',
        type: 'ice-giant',
        radius: 90,
        orbitRadius: 700,
        orbitAngle: 2.7,
        rotationSpeed: 0.0003,
        texture: 'neptune',
        hasAtmosphere: true,
        atmosphereColor: '#88bbff',
        description: 'Ice moon of a gas giant, homeworld of the Andorian people.',
      },
      {
        name: 'Andoria Prime',
        type: 'gas-giant',
        radius: 170,
        orbitRadius: 1400,
        orbitAngle: 0.3,
        rotationSpeed: 0.00055,
        texture: 'jupiter',
        hasAtmosphere: false,
        description: 'A massive gas giant around which Andoria orbits.',
      },
    ],
    station: {
      name: 'Andorian Imperial Station',
      type: 'starbase',
      orbitRadius: 500,
      orbitAngle: 4.0,
      services: ['repair', 'rearm', 'missions'],
    },
    npcs: [
      { type: 'cruiser', faction: 'andorian', name: 'IGS Shran', behavior: 'patrol' },
      { type: 'frigate', faction: 'andorian', name: 'IGS Kumari', behavior: 'orbit', orbitTarget: 0 },
      { type: 'freighter', faction: 'civilian', name: 'SS Arctic One', behavior: 'cruise' },
    ],
    connections: ['vulcan', 'deep-space-5'],
    discovered: false,
    description: 'A founding world of the Federation, home of the fierce but loyal Andorians.',
  },

  // ── Rigel ───────────────────────────────────────────────────────────────
  {
    id: 'rigel',
    name: 'Rigel',
    sector: 'Beta Quadrant',
    mapX: -200,
    mapY: -220,
    star: { class: 'B', name: 'Rigel', color: '#aabfff', size: 2.5, intensity: 1.8 },
    planets: [
      {
        name: 'Rigel VII',
        type: 'terran',
        radius: 95,
        orbitRadius: 900,
        orbitAngle: 1.8,
        rotationSpeed: 0.00025,
        texture: 'earth',
        hasAtmosphere: true,
        atmosphereColor: '#66bb77',
        description: 'A primitive world, site of Captain Pike\'s famous mission.',
      },
      {
        name: 'Rigel XII',
        type: 'desert',
        radius: 55,
        orbitRadius: 1500,
        orbitAngle: 4.5,
        rotationSpeed: 0.0002,
        texture: 'venus',
        hasAtmosphere: true,
        atmosphereColor: '#ddaa66',
        description: 'A mining colony, known for its lithium deposits.',
      },
      {
        name: 'Rigel Outer',
        type: 'gas-giant',
        radius: 180,
        orbitRadius: 2500,
        orbitAngle: 0.7,
        rotationSpeed: 0.0006,
        texture: 'jupiter',
        hasAtmosphere: false,
        description: 'A massive gas giant in the outer reaches.',
      },
    ],
    npcs: [
      { type: 'science', faction: 'federation', name: 'USS Bradbury', behavior: 'orbit', orbitTarget: 0 },
      { type: 'freighter', faction: 'civilian', name: 'SS Horizon', behavior: 'cruise' },
    ],
    connections: ['vulcan', 'deep-space-5'],
    discovered: false,
    description: 'A blue supergiant system with diverse worlds, at the edge of explored space.',
  },

  // ── Betazed ─────────────────────────────────────────────────────────────
  {
    id: 'betazed',
    name: 'Betazed',
    sector: 'Alpha Quadrant',
    mapX: 200,
    mapY: -180,
    star: { class: 'F', name: 'Betazed', color: '#f8f7ff', size: 1.2, intensity: 1.1 },
    planets: [
      {
        name: 'Betazed',
        type: 'terran',
        radius: 82,
        orbitRadius: 600,
        orbitAngle: 0.3,
        rotationSpeed: 0.00028,
        texture: 'earth',
        hasAtmosphere: true,
        atmosphereColor: '#77aadd',
        description: 'Lush homeworld of the telepathic Betazoid people.',
      },
      {
        name: 'Darona',
        type: 'ocean',
        radius: 60,
        orbitRadius: 950,
        orbitAngle: 2.9,
        rotationSpeed: 0.00035,
        texture: 'neptune',
        hasAtmosphere: true,
        atmosphereColor: '#3366cc',
        description: 'A water world, popular resort destination.',
      },
    ],
    station: {
      name: 'Betazed Orbital',
      type: 'outpost',
      orbitRadius: 450,
      orbitAngle: 1.5,
      services: ['repair', 'missions'],
    },
    npcs: [
      { type: 'cruiser', faction: 'federation', name: 'USS Titan', behavior: 'patrol' },
      { type: 'shuttle', faction: 'federation', name: 'Shuttle Picard', behavior: 'cruise' },
    ],
    connections: ['alpha-centauri', 'starbase74'],
    discovered: false,
    description: 'Home of Counselor Troi\'s people. A world of beauty and empathy.',
  },

  // ── Starbase 74 ─────────────────────────────────────────────────────────
  {
    id: 'starbase74',
    name: 'Starbase 74',
    sector: 'Alpha Quadrant',
    mapX: 140,
    mapY: 30,
    star: { class: 'K', name: 'Tarsas', color: '#ffd2a1', size: 0.8, intensity: 0.85 },
    planets: [
      {
        name: 'Tarsas III',
        type: 'barren',
        radius: 40,
        orbitRadius: 500,
        orbitAngle: 1.0,
        rotationSpeed: 0.0002,
        texture: 'moon',
        hasAtmosphere: false,
        description: 'Barren world, but the station makes up for it.',
      },
    ],
    station: {
      name: 'Starbase 74',
      type: 'spacedock',
      orbitRadius: 350,
      orbitAngle: 2.5,
      services: ['repair', 'rearm', 'missions'],
    },
    npcs: [
      { type: 'cruiser', faction: 'federation', name: 'USS Hood', behavior: 'idle' },
      { type: 'frigate', faction: 'federation', name: 'USS Bozeman', behavior: 'patrol' },
      { type: 'freighter', faction: 'civilian', name: 'SS Xhosa', behavior: 'cruise' },
      { type: 'shuttle', faction: 'federation', name: 'Shuttle Magellan', behavior: 'cruise' },
    ],
    connections: ['wolf359', 'betazed', 'deep-space-5'],
    discovered: false,
    description: 'A major Federation spacedock. The Enterprise was once hijacked by the Bynars here.',
  },

  // ── Deep Space 5 ────────────────────────────────────────────────────────
  {
    id: 'deep-space-5',
    name: 'Deep Space 5',
    sector: 'Beta Quadrant',
    mapX: -100,
    mapY: 120,
    star: { class: 'F', name: 'Iota Boötis', color: '#f8f7ff', size: 1.0, intensity: 1.0 },
    planets: [
      {
        name: 'Iota Boötis IV',
        type: 'terran',
        radius: 70,
        orbitRadius: 700,
        orbitAngle: 3.2,
        rotationSpeed: 0.0003,
        texture: 'earth',
        hasAtmosphere: true,
        atmosphereColor: '#55cc88',
        description: 'A colony world on the frontier.',
      },
      {
        name: 'Iota Boötis VII',
        type: 'gas-giant',
        radius: 160,
        orbitRadius: 1800,
        orbitAngle: 0.9,
        rotationSpeed: 0.0005,
        texture: 'saturn',
        hasAtmosphere: false,
        rings: { innerRadius: 190, outerRadius: 280, color: '#aabb99' },
        description: 'A ringed gas giant, used for fuel harvesting.',
      },
    ],
    station: {
      name: 'Deep Space 5',
      type: 'outpost',
      orbitRadius: 500,
      orbitAngle: 0.5,
      services: ['repair', 'rearm', 'missions'],
    },
    npcs: [
      { type: 'frigate', faction: 'federation', name: 'USS Crazy Horse', behavior: 'patrol' },
      { type: 'science', faction: 'federation', name: 'USS Grissom', behavior: 'orbit', orbitTarget: 0 },
      { type: 'freighter', faction: 'civilian', name: 'SS Kobayashi Maru', behavior: 'cruise' },
    ],
    connections: ['andoria', 'rigel', 'starbase74', 'frontier'],
    discovered: false,
    description: 'A frontier outpost at the edge of Federation space. Gateway to the unknown.',
  },

  // ── The Frontier (Deep Space) ───────────────────────────────────────────
  {
    id: 'frontier',
    name: 'Uncharted Nebula',
    sector: 'Frontier',
    mapX: -50,
    mapY: 260,
    star: { class: 'O', name: 'NGC-4725 Core', color: '#9bb0ff', size: 3.0, intensity: 2.0 },
    planets: [
      {
        name: 'Nebula World Alpha',
        type: 'ocean',
        radius: 110,
        orbitRadius: 800,
        orbitAngle: 0.0,
        rotationSpeed: 0.0004,
        texture: 'neptune',
        hasAtmosphere: true,
        atmosphereColor: '#9966ff',
        description: 'A mysterious water world shrouded in the nebula.',
      },
      {
        name: 'Nebula World Beta',
        type: 'volcanic',
        radius: 60,
        orbitRadius: 500,
        orbitAngle: 3.0,
        rotationSpeed: 0.00025,
        texture: 'venus',
        hasAtmosphere: true,
        atmosphereColor: '#ff6633',
        description: 'A volcanic world with unusual energy readings.',
      },
      {
        name: 'The Colossus',
        type: 'gas-giant',
        radius: 250,
        orbitRadius: 2800,
        orbitAngle: 1.5,
        rotationSpeed: 0.0007,
        texture: 'jupiter',
        hasAtmosphere: false,
        description: 'The largest gas giant ever catalogued by Starfleet.',
      },
    ],
    npcs: [],
    connections: ['deep-space-5'],
    discovered: false,
    description: 'An uncharted nebula at the frontier. No Federation presence — you\'re on your own.',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Look up a system by ID */
export function getSystem(id: string): StarSystem | undefined {
  return STAR_SYSTEMS.find(s => s.id === id)
}

/** Get all systems connected to the given system */
export function getConnectedSystems(systemId: string): StarSystem[] {
  const sys = getSystem(systemId)
  if (!sys) return []
  return sys.connections
    .map(id => getSystem(id))
    .filter((s): s is StarSystem => s !== undefined)
}

/** Get all sectors in the universe */
export function getSectors(): string[] {
  return [...new Set(STAR_SYSTEMS.map(s => s.sector))]
}

/** Get all systems in a sector */
export function getSystemsInSector(sector: string): StarSystem[] {
  return STAR_SYSTEMS.filter(s => s.sector === sector)
}

/** Calculate map distance between two systems (for warp travel time) */
export function getMapDistance(a: StarSystem, b: StarSystem): number {
  const dx = a.mapX - b.mapX
  const dy = a.mapY - b.mapY
  return Math.sqrt(dx * dx + dy * dy)
}
