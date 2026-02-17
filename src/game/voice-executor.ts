/**
 * Voice Command Executor — translates parsed VoiceCommands into GameState mutations.
 *
 * Each command action maps to the same state changes as the keyboard controls,
 * so the game behaves identically whether you press a key or speak a command.
 */

import type { GameState } from './game-state'
import type { CommandAction } from './voice-commander'

export interface VoiceExecutionContext {
  gameState: GameState
  /** Callback to start the mission briefing (from EnterpriseGame) */
  onStartMission?: () => void
  /** Callback to get a damage report string */
  onDamageReport?: () => string
  /** Callback to get a status report string */
  onStatusReport?: () => string
  /** Callback to navigate to a target — returns true if target found */
  onNavigateTo?: (target: string) => boolean
}

/**
 * Execute a single voice command action against the game state.
 * Returns a spoken response string for reports (or empty for action commands).
 */
export function executeVoiceCommand(
  action: CommandAction,
  ctx: VoiceExecutionContext,
): string {
  const gs = ctx.gameState

  switch (action.type) {
    case 'SET_THROTTLE':
      gs.throttle = action.speed === 0 ? 0 : action.speed / 9
      return ''

    case 'ENGAGE_WARP':
      if (gs.throttle < 0.1) {
        // Need some speed first — set to max
        gs.throttle = 1.0
      }
      gs.isWarp = true
      return ''

    case 'DISENGAGE_WARP':
      gs.isWarp = false
      return ''

    case 'ALL_STOP':
      gs.throttle = 0
      gs.isWarp = false
      return ''

    case 'SHIELDS_UP':
      gs.shieldsActive = true
      return ''

    case 'SHIELDS_DOWN':
      gs.shieldsActive = false
      return ''

    case 'FIRE_PHASERS':
      // Set phaserFiring for a sustained burst (the game loop will handle it)
      gs.phaserFiring = true
      return ''

    case 'FIRE_TORPEDO':
      if (gs.torpedoCount > 0) {
        gs.torpedoFiring = true
      }
      return ''

    case 'RED_ALERT':
      // Shields up + prepare for combat
      gs.shieldsActive = true
      return ''

    case 'ENGAGE_ENEMY':
      // Shields up + full impulse toward enemy
      gs.shieldsActive = true
      if (gs.throttle < 0.5) {
        gs.throttle = 1.0
      }
      return ''

    case 'NAVIGATE_TO':
      if (ctx.onNavigateTo) {
        ctx.onNavigateTo(action.target)
      }
      // Also set full impulse if stopped
      if (gs.throttle < 0.5) {
        gs.throttle = 1.0
      }
      return ''

    case 'START_MISSION':
      ctx.onStartMission?.()
      return ''

    case 'DAMAGE_REPORT':
      return ctx.onDamageReport?.() ?? buildDamageReport(gs)

    case 'STATUS_REPORT':
      return ctx.onStatusReport?.() ?? buildStatusReport(gs)

    default:
      return ''
  }
}

function buildDamageReport(gs: GameState): string {
  const shields = gs.shieldsActive
    ? `Shields are up at ${Math.round(gs.shieldStrength)} percent.`
    : 'Shields are down.'
  return `Hull integrity stable. ${shields} Phaser banks at ${Math.round(gs.phaserCharge)} percent. ${gs.torpedoCount} torpedoes remaining.`
}

function buildStatusReport(gs: GameState): string {
  const speed = gs.speedDisplay
  const shields = gs.shieldsActive ? 'Shields up' : 'Shields down'
  return `Current speed: ${speed}. Heading ${gs.heading}. ${shields}. ${gs.torpedoCount} torpedoes.`
}
