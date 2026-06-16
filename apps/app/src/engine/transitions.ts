/**
 * Pure transition math. Given a transition + its progress (0..1), compute the
 * gain and EQ targets for the outgoing and incoming decks. No audio nodes here —
 * `RealEngine` reads these and writes them onto GainNode/BiquadFilter params.
 *
 * Kept pure so the curves are unit-testable and identical between the browser
 * v0 and a future native v1.
 */

import type { CueTransition, TransitionType } from "@/types";

/** Per-deck audio targets at a moment in a transition. All linear gains 0..1. */
export interface DeckTargets {
  /** master post-EQ gain 0..1 */
  gain: number;
  /** low-shelf gain in dB (0 = neutral, negative = bass cut) */
  lowDb: number;
  /** high-pass cutoff Hz (20 = effectively off) */
  highpassHz: number;
  /** feedback-delay (echo) send 0..1 — only echo_out uses it */
  echoSend: number;
}

export interface TransitionTargets {
  from: DeckTargets;
  to: DeckTargets;
}

const NEUTRAL: DeckTargets = { gain: 1, lowDb: 0, highpassHz: 20, echoSend: 0 };

export function neutralTargets(): DeckTargets {
  return { ...NEUTRAL };
}

/**
 * Constant-power crossfade gains. Equal-power (cos/sin) keeps perceived loudness
 * flat across the blend — the standard DJ curve, not a linear dip.
 */
export function constantPower(progress: number): { from: number; to: number } {
  const p = Math.max(0, Math.min(1, progress));
  return {
    from: Math.cos((p * Math.PI) / 2),
    to: Math.cos(((1 - p) * Math.PI) / 2),
  };
}

/** Map a high-pass sweep 0..1 onto a musical Hz range (20Hz → ~1.2kHz). */
function sweepHighpass(amount: number): number {
  const a = Math.max(0, Math.min(1, amount));
  // exponential feels linear to the ear
  return 20 * Math.pow(60, a); // 20 .. 1200 Hz
}

/**
 * The core: targets for both decks at `progress` through `transition`, given the
 * absolute `nowBar` (needed for bass_swap's discrete swap point).
 */
export function transitionTargets(
  transition: CueTransition,
  progress: number,
  nowBar: number,
): TransitionTargets {
  const p = Math.max(0, Math.min(1, progress));
  const type: TransitionType = transition.type;
  const from = neutralTargets();
  const to = neutralTargets();

  switch (type) {
    case "cut": {
      // Hard switch at the downbeat (midpoint of the 1-ish bar window).
      const flipped = p >= 0.5;
      from.gain = flipped ? 0 : 1;
      to.gain = flipped ? 1 : 0;
      break;
    }

    case "filter_fade": {
      // Sweep a high-pass UP on the outgoing (thins it out) while crossfading.
      const xf = constantPower(p);
      from.gain = xf.from;
      to.gain = xf.to;
      from.highpassHz = sweepHighpass(p);
      break;
    }

    case "bass_swap": {
      // Only one track owns the sub at a time. Crossfade the tops; swap the
      // lows discretely at swap_at_bar (default: transition midpoint).
      const xf = constantPower(p);
      from.gain = xf.from;
      to.gain = xf.to;
      const swapBar =
        transition.params?.swap_at_bar ??
        transition.start_bar + transition.duration_bars / 2;
      const swapped = nowBar >= swapBar;
      // outgoing keeps lows until swap, then loses them; incoming the inverse.
      from.lowDb = swapped ? -24 : 0;
      to.lowDb = swapped ? 0 : -24;
      break;
    }

    case "echo_out": {
      // Echo/delay tail builds on the outgoing as it leaves; incoming fades in.
      const xf = constantPower(p);
      from.gain = xf.from;
      to.gain = xf.to;
      from.echoSend = Math.min(1, p * 1.3);
      break;
    }

    case "loop_roll": {
      // No real loop buffer in v0; approximate as a fast crossfade in the last
      // stretch so the seam is covered. (Upgrade: AudioWorklet beat-repeat.)
      const fast = Math.max(0, Math.min(1, (p - 0.6) / 0.4));
      const xf = constantPower(fast);
      from.gain = xf.from;
      to.gain = xf.to;
      break;
    }

    default: {
      // Default = plain constant-power crossfade.
      const xf = constantPower(p);
      from.gain = xf.from;
      to.gain = xf.to;
      break;
    }
  }

  return { from, to };
}
