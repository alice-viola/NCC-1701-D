/**
 * Voice Command System — Star Trek style voice control.
 *
 * Uses the Web Speech API (browser built-in) for speech-to-text,
 * then matches recognized text against known Star Trek commands
 * using keyword scoring.
 *
 * Press C to toggle listening. Speak a command. The system parses
 * it and returns a structured VoiceCommand for execution.
 */

// ─── Command Types ───────────────────────────────────────────────────────────

export type CommandAction =
  | { type: 'SET_THROTTLE'; speed: number }
  | { type: 'ENGAGE_WARP' }
  | { type: 'DISENGAGE_WARP' }
  | { type: 'ALL_STOP' }
  | { type: 'SHIELDS_UP' }
  | { type: 'SHIELDS_DOWN' }
  | { type: 'FIRE_PHASERS' }
  | { type: 'FIRE_TORPEDO' }
  | { type: 'ENGAGE_ENEMY' }
  | { type: 'RED_ALERT' }
  | { type: 'START_MISSION' }
  | { type: 'DAMAGE_REPORT' }
  | { type: 'STATUS_REPORT' }
  | { type: 'NAVIGATE_TO'; target: string }

export interface VoiceCommand {
  /** The raw transcript from speech recognition */
  transcript: string
  /** Parsed command actions (may be multiple for compound commands) */
  actions: CommandAction[]
  /** Confidence score from speech recognition (0–1) */
  confidence: number
}

// ─── Voice Commander State ───────────────────────────────────────────────────

export interface VoiceCommanderState {
  /** Whether the system is currently listening */
  listening: boolean
  /** Current status for HUD display */
  status: 'idle' | 'listening' | 'processing' | 'success' | 'error'
  /** Last recognized transcript */
  lastTranscript: string
  /** Last confirmation message */
  lastConfirmation: string
  /** Timer to clear status display */
  statusTimer: number
  /** Queued commands waiting to be executed */
  commandQueue: CommandAction[]
  /** Whether Web Speech API is supported */
  supported: boolean
}

// SpeechRecognition may be vendor-prefixed
const SpeechRecognitionCtor: typeof SpeechRecognition | undefined =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

let recognition: SpeechRecognition | null = null

export function createVoiceCommander(): VoiceCommanderState {
  return {
    listening: false,
    status: 'idle',
    lastTranscript: '',
    lastConfirmation: '',
    statusTimer: 0,
    commandQueue: [],
    supported: !!SpeechRecognitionCtor,
  }
}

/**
 * Start listening for a voice command.
 */
export function startListening(vc: VoiceCommanderState): void {
  if (!SpeechRecognitionCtor || vc.listening) return

  recognition = new SpeechRecognitionCtor()
  recognition.lang = 'en-US'
  recognition.interimResults = false
  recognition.maxAlternatives = 1
  recognition.continuous = false

  vc.listening = true
  vc.status = 'listening'
  vc.lastTranscript = ''
  vc.lastConfirmation = ''

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const result = event.results[0]
    if (!result) return

    const transcript = result[0].transcript.toLowerCase().trim()
    const confidence = result[0].confidence

    vc.status = 'processing'
    vc.lastTranscript = transcript

    // Parse commands
    const actions = parseVoiceCommand(transcript)

    if (actions.length > 0) {
      vc.commandQueue.push(...actions)
      vc.lastConfirmation = buildConfirmation(actions)
      vc.status = 'success'
      vc.statusTimer = 3.0

      // Speak confirmation
      speakConfirmation(vc.lastConfirmation)
    } else {
      vc.lastConfirmation = 'Command not recognized'
      vc.status = 'error'
      vc.statusTimer = 2.5
    }
  }

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === 'no-speech') {
      vc.lastConfirmation = 'No speech detected'
    } else if (event.error === 'aborted') {
      // User cancelled — no error message needed
      vc.status = 'idle'
      vc.listening = false
      return
    } else {
      vc.lastConfirmation = `Voice error: ${event.error}`
    }
    vc.status = 'error'
    vc.statusTimer = 2.5
    vc.listening = false
  }

  recognition.onend = () => {
    vc.listening = false
    if (vc.status === 'listening') {
      // Ended without a result (e.g. silence timeout)
      vc.lastConfirmation = 'No command heard'
      vc.status = 'error'
      vc.statusTimer = 2.0
    }
  }

  recognition.start()
}

/**
 * Stop listening (cancel current recognition).
 */
export function stopListening(vc: VoiceCommanderState): void {
  if (recognition && vc.listening) {
    recognition.abort()
    recognition = null
    vc.listening = false
    vc.status = 'idle'
  }
}

/**
 * Toggle listening on/off.
 */
export function toggleListening(vc: VoiceCommanderState): void {
  if (vc.listening) {
    stopListening(vc)
  } else {
    startListening(vc)
  }
}

/**
 * Update timers each frame. Call from game loop.
 * Returns any queued commands that should be executed this frame.
 */
export function updateVoiceCommander(vc: VoiceCommanderState, delta: number): CommandAction[] {
  // Decay status timer
  if (vc.statusTimer > 0) {
    vc.statusTimer -= delta
    if (vc.statusTimer <= 0) {
      vc.statusTimer = 0
      if (vc.status === 'success' || vc.status === 'error') {
        vc.status = 'idle'
      }
    }
  }

  // Drain command queue
  if (vc.commandQueue.length > 0) {
    const commands = [...vc.commandQueue]
    vc.commandQueue.length = 0
    return commands
  }

  return []
}

/**
 * Dispose voice commander resources.
 */
export function disposeVoiceCommander(vc: VoiceCommanderState): void {
  if (recognition) {
    recognition.abort()
    recognition = null
  }
  vc.listening = false
  vc.status = 'idle'
}

// ─── Command Parser ──────────────────────────────────────────────────────────

interface CommandPattern {
  action: CommandAction | ((transcript: string) => CommandAction | null)
  /** Keywords that must be present (at least one group must match) */
  patterns: string[][]
  /** Priority — higher wins when multiple patterns match */
  priority: number
}

const COMMAND_PATTERNS: CommandPattern[] = [
  // ── Navigation ──
  {
    action: { type: 'ENGAGE_WARP' },
    patterns: [
      ['engage', 'warp'],
      ['warp', 'speed'],
      ['maximum', 'warp'],
      ['warp', 'engage'],
      ['go', 'warp'],
      ['jump', 'warp'],
      ['punch', 'it'],
      ['make', 'it', 'so'],
    ],
    priority: 10,
  },
  {
    action: { type: 'DISENGAGE_WARP' },
    patterns: [
      ['disengage', 'warp'],
      ['drop', 'warp'],
      ['stop', 'warp'],
      ['exit', 'warp'],
      ['warp', 'off'],
    ],
    priority: 10,
  },
  {
    action: { type: 'ALL_STOP' },
    patterns: [
      ['all', 'stop'],
      ['full', 'stop'],
      ['halt'],
      ['stop', 'ship'],
      ['engines', 'stop'],
      ['cut', 'engines'],
    ],
    priority: 10,
  },
  {
    action: (transcript: string) => {
      // "full impulse" / "maximum impulse"
      if (/\b(full|maximum)\s+(impulse|speed)\b/.test(transcript)) {
        return { type: 'SET_THROTTLE', speed: 9 }
      }
      // "half impulse"
      if (/\bhalf\s+impulse\b/.test(transcript)) {
        return { type: 'SET_THROTTLE', speed: 5 }
      }
      // "quarter impulse"
      if (/\bquarter\s+impulse\b/.test(transcript)) {
        return { type: 'SET_THROTTLE', speed: 3 }
      }
      // "one quarter impulse"
      if (/\bone\s+quarter\b/.test(transcript)) {
        return { type: 'SET_THROTTLE', speed: 3 }
      }
      // "speed 7" / "throttle 5" / "warp 3" etc.
      const speedMatch = transcript.match(/\b(?:speed|throttle|warp)\s+(\d)\b/)
      if (speedMatch) {
        return { type: 'SET_THROTTLE', speed: parseInt(speedMatch[1], 10) }
      }
      // "ahead full"
      if (/\bahead\s+full\b/.test(transcript)) {
        return { type: 'SET_THROTTLE', speed: 9 }
      }
      // "slow down"
      if (/\bslow\s+down\b/.test(transcript)) {
        return { type: 'SET_THROTTLE', speed: 3 }
      }
      return null
    },
    patterns: [
      ['impulse'],
      ['speed'],
      ['throttle'],
      ['ahead'],
      ['slow', 'down'],
    ],
    priority: 5,
  },

  // ── Tactical ──
  {
    action: { type: 'SHIELDS_UP' },
    patterns: [
      ['shields', 'up'],
      ['raise', 'shields'],
      ['activate', 'shields'],
      ['shields', 'on'],
      ['deflectors', 'up'],
    ],
    priority: 10,
  },
  {
    action: { type: 'SHIELDS_DOWN' },
    patterns: [
      ['shields', 'down'],
      ['lower', 'shields'],
      ['drop', 'shields'],
      ['shields', 'off'],
      ['deactivate', 'shields'],
    ],
    priority: 10,
  },
  {
    action: { type: 'FIRE_PHASERS' },
    patterns: [
      ['fire', 'phasers'],
      ['phasers', 'fire'],
      ['phasers'],
      ['fire', 'at', 'will'],
    ],
    priority: 8,
  },
  {
    action: { type: 'FIRE_TORPEDO' },
    patterns: [
      ['fire', 'torpedo'],
      ['fire', 'torpedoes'],
      ['torpedo'],
      ['torpedoes'],
      ['photon', 'torpedo'],
      ['launch', 'torpedo'],
    ],
    priority: 8,
  },
  {
    action: { type: 'RED_ALERT' },
    patterns: [
      ['red', 'alert'],
      ['battle', 'stations'],
      ['combat', 'alert'],
    ],
    priority: 12,
  },
  {
    action: { type: 'ENGAGE_ENEMY' },
    patterns: [
      ['engage', 'enemy'],
      ['engage', 'target'],
      ['attack'],
      ['engage', 'borg'],
      ['engage', 'reliant'],
      ['intercept'],
    ],
    priority: 9,
  },

  // ── Mission ──
  {
    action: { type: 'START_MISSION' },
    patterns: [
      ['start', 'mission'],
      ['begin', 'mission'],
      ['accept', 'mission'],
      ['ready', 'mission'],
    ],
    priority: 10,
  },

  // ── Reports ──
  {
    action: { type: 'DAMAGE_REPORT' },
    patterns: [
      ['damage', 'report'],
      ['hull', 'status'],
      ['ship', 'status'],
      ['how', 'ship'],
    ],
    priority: 6,
  },
  {
    action: { type: 'STATUS_REPORT' },
    patterns: [
      ['status', 'report'],
      ['report'],
      ['situation'],
      ['sitrep'],
    ],
    priority: 4,
  },

  // ── Navigation (destination-based) ──
  {
    action: (transcript: string) => {
      const target = extractNavigationTarget(transcript)
      if (target) return { type: 'NAVIGATE_TO' as const, target }
      return null
    },
    patterns: [
      ['go', 'to'],
      ['set', 'course'],
      ['course', 'for'],
      ['head', 'to'],
      ['head', 'for'],
      ['fly', 'to'],
      ['navigate', 'to'],
      ['proceed', 'to'],
      ['take', 'us', 'to'],
      ['plot', 'course'],
      ['heading', 'for'],
    ],
    priority: 9,
  },
]

// ─── Navigation Target Extraction ────────────────────────────────────────────

/** Known navigation targets and their synonyms */
const NAV_TARGETS: Record<string, string[]> = {
  earth: ['earth', 'home', 'terra'],
  mars: ['mars', 'red planet'],
  jupiter: ['jupiter'],
  saturn: ['saturn'],
  enemy: ['enemy', 'reliant', 'borg', 'target', 'hostile'],
}

function extractNavigationTarget(transcript: string): string | null {
  const text = transcript.toLowerCase()
  for (const [target, synonyms] of Object.entries(NAV_TARGETS)) {
    for (const syn of synonyms) {
      if (text.includes(syn)) return target
    }
  }
  return null
}

/**
 * Parse a voice transcript into game commands using keyword scoring.
 */
function parseVoiceCommand(transcript: string): CommandAction[] {
  const words = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
  const actions: CommandAction[] = []

  type Match = { action: CommandAction; priority: number; matchCount: number }
  const matches: Match[] = []

  for (const pattern of COMMAND_PATTERNS) {
    let bestMatchCount = 0

    for (const keywordGroup of pattern.patterns) {
      let matched = 0
      for (const keyword of keywordGroup) {
        if (words.includes(keyword)) {
          matched++
        }
      }
      // All keywords in the group must match
      if (matched === keywordGroup.length) {
        bestMatchCount = Math.max(bestMatchCount, matched)
      }
    }

    if (bestMatchCount > 0) {
      if (typeof pattern.action === 'function') {
        const result = pattern.action(transcript)
        if (result) {
          matches.push({
            action: result,
            priority: pattern.priority,
            matchCount: bestMatchCount,
          })
        }
      } else {
        matches.push({
          action: pattern.action,
          priority: pattern.priority,
          matchCount: bestMatchCount,
        })
      }
    }
  }

  // Sort by priority (descending), then by match count (descending)
  matches.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return b.matchCount - a.matchCount
  })

  // Take the best match (or the two best if they don't conflict)
  const usedTypes = new Set<string>()
  for (const m of matches) {
    if (!usedTypes.has(m.action.type)) {
      actions.push(m.action)
      usedTypes.add(m.action.type)
      // Allow up to 2 compound commands (e.g., "shields up, fire phasers")
      if (actions.length >= 2) break
    }
  }

  return actions
}

// ─── Confirmation Messages ───────────────────────────────────────────────────

const CONFIRMATIONS: Record<string, string> = {
  SET_THROTTLE: 'Aye Captain.',
  ENGAGE_WARP: 'Engaging warp drive.',
  DISENGAGE_WARP: 'Dropping out of warp.',
  ALL_STOP: 'All stop, aye.',
  SHIELDS_UP: 'Shields up.',
  SHIELDS_DOWN: 'Shields down.',
  FIRE_PHASERS: 'Firing phasers.',
  FIRE_TORPEDO: 'Torpedo away.',
  ENGAGE_ENEMY: 'Engaging the enemy.',
  RED_ALERT: 'Red alert! All hands to battle stations.',
  START_MISSION: 'Beginning mission briefing.',
  DAMAGE_REPORT: '',
  STATUS_REPORT: '',
  NAVIGATE_TO: '',
}

function buildConfirmation(actions: CommandAction[]): string {
  const parts: string[] = []
  for (const action of actions) {
    if (action.type === 'SET_THROTTLE') {
      if (action.speed === 9) {
        parts.push('Full impulse, aye.')
      } else if (action.speed === 0) {
        parts.push('All stop, aye.')
      } else {
        parts.push(`Setting speed to ${action.speed}, aye.`)
      }
    } else if (action.type === 'NAVIGATE_TO') {
      const name = action.target.charAt(0).toUpperCase() + action.target.slice(1)
      parts.push(`Setting course for ${name}, aye.`)
    } else {
      const msg = CONFIRMATIONS[action.type]
      if (msg) parts.push(msg)
    }
  }
  return parts.join(' ') || 'Acknowledged.'
}

/**
 * Speak a confirmation using the Web Speech API TTS.
 */
function speakConfirmation(text: string): void {
  if (!text || !window.speechSynthesis) return

  // Cancel any ongoing speech
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.0
  utterance.pitch = 0.9
  utterance.volume = 0.7

  // Try to pick a good English voice
  const voices = window.speechSynthesis.getVoices()
  const preferredVoice = voices.find(v =>
    v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Daniel')),
  ) || voices.find(v => v.lang.startsWith('en'))

  if (preferredVoice) {
    utterance.voice = preferredVoice
  }

  window.speechSynthesis.speak(utterance)
}
