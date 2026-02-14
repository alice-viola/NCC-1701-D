/**
 * Mission System — defines, tracks, and evaluates missions.
 *
 * Missions are offered at starbases and tracked in the captain's log.
 * Each mission has objectives that are checked each frame.
 */

import type { StarSystem } from './universe'
import { getSystem } from './universe'

// ─── Mission Types ────────────────────────────────────────────────────────────

export type MissionType =
  | 'explore'       // Visit an unexplored system
  | 'patrol'        // Visit multiple systems in sequence
  | 'survey'        // Fly near a specific planet
  | 'transport'     // Reach a destination system
  | 'scan'          // Get close to a specific object

export type MissionStatus = 'available' | 'active' | 'completed' | 'failed'

export interface MissionObjective {
  description: string
  /** System the objective is in */
  systemId: string
  /** For 'survey' — planet index to approach */
  planetIndex?: number
  /** Is this objective done? */
  completed: boolean
}

export interface Mission {
  id: string
  title: string
  type: MissionType
  description: string
  briefing: string
  status: MissionStatus
  /** System where this mission is offered */
  sourceSystemId: string
  objectives: MissionObjective[]
  /** Reward description */
  reward: string
  /** Torpedo resupply amount on completion */
  torpedoReward: number
  /** Shield repair percentage on completion */
  shieldReward: number
}

// ─── Mission State ────────────────────────────────────────────────────────────

export interface MissionState {
  /** All known missions */
  missions: Mission[]
  /** Currently active mission (if any) */
  activeMissionId: string | null
  /** Log of completed missions */
  completedCount: number
  /** Captain's rating */
  rating: string
}

// ─── Predefined Missions ─────────────────────────────────────────────────────

const MISSION_TEMPLATES: Omit<Mission, 'id'>[] = [
  {
    title: 'First Contact at Vulcan',
    type: 'explore',
    description: 'Starfleet Command has ordered us to establish contact with the Vulcan High Council.',
    briefing: 'Captain, set course for the Vulcan system. The High Council awaits our arrival. This is a diplomatic mission — proceed with all due caution.',
    status: 'available',
    sourceSystemId: 'sol',
    objectives: [
      { description: 'Travel to the Vulcan system', systemId: 'vulcan', completed: false },
    ],
    reward: 'Diplomatic commendation + 10 torpedoes',
    torpedoReward: 10,
    shieldReward: 0,
  },
  {
    title: 'Wolf 359 Memorial Patrol',
    type: 'patrol',
    description: 'Patrol the Wolf 359 sector in remembrance of those lost in the Borg engagement.',
    briefing: 'The annual memorial patrol. Visit Wolf 359, then return to Sol. A solemn duty, Captain.',
    status: 'available',
    sourceSystemId: 'sol',
    objectives: [
      { description: 'Travel to Wolf 359', systemId: 'wolf359', completed: false },
      { description: 'Return to Sol', systemId: 'sol', completed: false },
    ],
    reward: 'Torpedo resupply + Shield recharge',
    torpedoReward: 15,
    shieldReward: 50,
  },
  {
    title: 'Supply Run to Alpha Centauri',
    type: 'transport',
    description: 'Deliver medical supplies to the colony at Alpha Centauri.',
    briefing: 'The colonists need supplies, Captain. Make best speed to Alpha Centauri. Time is of the essence.',
    status: 'available',
    sourceSystemId: 'sol',
    objectives: [
      { description: 'Deliver supplies to Alpha Centauri', systemId: 'alpha-centauri', completed: false },
    ],
    reward: '8 torpedoes',
    torpedoReward: 8,
    shieldReward: 0,
  },
  {
    title: 'Survey the Rigel System',
    type: 'survey',
    description: 'Conduct a stellar survey of the Rigel system\'s planets.',
    briefing: 'Science division has requested a detailed survey of the Rigel system. Chart all planetary bodies and report back.',
    status: 'available',
    sourceSystemId: 'vulcan',
    objectives: [
      { description: 'Travel to the Rigel system', systemId: 'rigel', completed: false },
      { description: 'Return data to Vulcan', systemId: 'vulcan', completed: false },
    ],
    reward: 'Full torpedo resupply + Shield repair',
    torpedoReward: 20,
    shieldReward: 100,
  },
  {
    title: 'Andorian Alliance',
    type: 'explore',
    description: 'Strengthen ties with the Andorian Imperial Guard.',
    briefing: 'The Andorians have requested a Federation presence in their system. Proceed to Andoria and make contact.',
    status: 'available',
    sourceSystemId: 'vulcan',
    objectives: [
      { description: 'Visit the Andoria system', systemId: 'andoria', completed: false },
    ],
    reward: '12 torpedoes + Shield repair',
    torpedoReward: 12,
    shieldReward: 30,
  },
  {
    title: 'Frontier Reconnaissance',
    type: 'explore',
    description: 'Explore the uncharted nebula beyond Deep Space 5.',
    briefing: 'Captain, long-range sensors have detected unusual readings from beyond the frontier. You\'re ordered to investigate. No Federation ship has been this far out. Be careful.',
    status: 'available',
    sourceSystemId: 'deep-space-5',
    objectives: [
      { description: 'Explore the Uncharted Nebula', systemId: 'frontier', completed: false },
      { description: 'Report back to Deep Space 5', systemId: 'deep-space-5', completed: false },
    ],
    reward: 'Full resupply + Captain\'s commendation',
    torpedoReward: 30,
    shieldReward: 100,
  },
  {
    title: 'Starbase 74 Inspection',
    type: 'transport',
    description: 'Conduct a routine inspection of Starbase 74.',
    briefing: 'Admiral Nakamura has ordered an inspection of Starbase 74. Proceed at your discretion, Captain.',
    status: 'available',
    sourceSystemId: 'sol',
    objectives: [
      { description: 'Travel to Starbase 74', systemId: 'starbase74', completed: false },
    ],
    reward: '10 torpedoes',
    torpedoReward: 10,
    shieldReward: 0,
  },
  {
    title: 'Betazed Diplomacy',
    type: 'patrol',
    description: 'Escort a diplomatic envoy via Alpha Centauri to Betazed.',
    briefing: 'Ambassador Troi requires transport to Betazed via Alpha Centauri. Ensure a safe journey.',
    status: 'available',
    sourceSystemId: 'sol',
    objectives: [
      { description: 'Stop at Alpha Centauri', systemId: 'alpha-centauri', completed: false },
      { description: 'Arrive at Betazed', systemId: 'betazed', completed: false },
    ],
    reward: 'Full shield recharge + 15 torpedoes',
    torpedoReward: 15,
    shieldReward: 100,
  },
]

// ─── State Management ─────────────────────────────────────────────────────────

export function createMissionState(): MissionState {
  return {
    missions: MISSION_TEMPLATES.map((t, i) => ({
      ...t,
      id: `mission-${i}`,
      objectives: t.objectives.map(o => ({ ...o })),
    })),
    activeMissionId: null,
    completedCount: 0,
    rating: 'Ensign',
  }
}

/**
 * Get missions available at the current system's station.
 */
export function getAvailableMissions(state: MissionState, systemId: string): Mission[] {
  return state.missions.filter(
    m => m.status === 'available' && m.sourceSystemId === systemId,
  )
}

/**
 * Accept a mission (set it as active).
 */
export function acceptMission(state: MissionState, missionId: string): boolean {
  if (state.activeMissionId) return false // already have an active mission

  const mission = state.missions.find(m => m.id === missionId)
  if (!mission || mission.status !== 'available') return false

  mission.status = 'active'
  state.activeMissionId = missionId
  return true
}

/**
 * Check mission objectives when arriving at a system.
 * Call this whenever the player enters a new system.
 */
export function checkMissionObjectives(
  state: MissionState,
  currentSystemId: string,
): { completed: boolean; mission: Mission | null } {
  if (!state.activeMissionId) return { completed: false, mission: null }

  const mission = state.missions.find(m => m.id === state.activeMissionId)
  if (!mission || mission.status !== 'active') return { completed: false, mission: null }

  // Check objectives in order — only the first incomplete one can be completed
  for (const obj of mission.objectives) {
    if (!obj.completed && obj.systemId === currentSystemId) {
      obj.completed = true
      break // only one objective per arrival
    }
  }

  // Check if all objectives are done
  const allDone = mission.objectives.every(o => o.completed)
  if (allDone) {
    mission.status = 'completed'
    state.activeMissionId = null
    state.completedCount++
    updateRating(state)
    return { completed: true, mission }
  }

  return { completed: false, mission }
}

/**
 * Get the currently active mission.
 */
export function getActiveMission(state: MissionState): Mission | null {
  if (!state.activeMissionId) return null
  return state.missions.find(m => m.id === state.activeMissionId) ?? null
}

/**
 * Get the next incomplete objective for the active mission.
 */
export function getNextObjective(state: MissionState): MissionObjective | null {
  const mission = getActiveMission(state)
  if (!mission) return null
  return mission.objectives.find(o => !o.completed) ?? null
}

function updateRating(state: MissionState): void {
  const count = state.completedCount
  if (count >= 7) state.rating = 'Admiral'
  else if (count >= 5) state.rating = 'Captain'
  else if (count >= 3) state.rating = 'Commander'
  else if (count >= 1) state.rating = 'Lieutenant'
  else state.rating = 'Ensign'
}
