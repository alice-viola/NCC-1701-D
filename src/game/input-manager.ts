/**
 * Tracks which keys are currently pressed for polling in the game loop.
 * Uses KeyboardEvent.code for layout-independent bindings.
 */
export class InputManager {
  private keys = new Set<string>()
  private justPressed = new Set<string>()

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.keys.clear()
    this.justPressed.clear()
  }

  /** True while the key is held down. */
  isPressed(code: string): boolean {
    return this.keys.has(code)
  }

  /** True only on the first frame the key is pressed (for toggle actions). */
  wasJustPressed(code: string): boolean {
    if (this.justPressed.has(code)) {
      this.justPressed.delete(code)
      return true
    }
    return false
  }

  /** Call at the end of each frame to clear one-shot flags. */
  endFrame(): void {
    // justPressed entries are consumed by wasJustPressed, nothing else needed
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Prevent default for game keys so page doesn't scroll
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault()
    }
    if (!this.keys.has(e.code)) {
      this.justPressed.add(e.code)
    }
    this.keys.add(e.code)
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code)
  }
}

/** Keys the game listens to — preventDefault on these to avoid scrolling. */
const GAME_KEYS = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE',
  'Space', 'KeyT', 'KeyM', 'KeyF', 'KeyR', 'KeyX',
  'CapsLock',
  'Comma', 'Period',
  'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
])
