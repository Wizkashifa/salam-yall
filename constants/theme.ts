/**
 * Design system constants for spacing, shape, and shadow.
 *
 * Apply these to new code and files edited in any PR. Do not mass-refactor
 * existing untouched code — adopt progressively.
 */

/** Border radius scale */
export const RADIUS = {
  chip:   8,   // chips, tags, filter badges
  button: 12,  // primary/secondary buttons
  card:   14,  // list cards, content containers
  sheet:  16,  // modal / bottom sheet top corners
  pill:   999, // fully round (avatars, status dots)
  icon:   10,  // small icon containers
} as const;

/** Shadow definitions — iOS only; Android uses elevation */
export const SHADOW = {
  subtle: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;
