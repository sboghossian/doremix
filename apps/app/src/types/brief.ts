/** The user's description of the set the Conductor should plan. */

export type EnergyArc = "rising" | "wave" | "plateau_peak";

export type AudiencePreset =
  | "sunset_rooftop"
  | "warehouse"
  | "dinner"
  | "peak_club"
  | "afterhours"
  | "beach";

export interface SetRules {
  noVocalsAfterPeak: boolean;
  harmonicOnly: boolean;
  noDoubleDrops: boolean;
  longBlends: boolean;
}

export interface Brief {
  /** free-text description ("40-min sunset rooftop, build slow, no vocals after the peak") */
  text: string;
  /** minutes */
  lengthMin: number;
  audience: AudiencePreset;
  arc: EnergyArc;
  rules: SetRules;
}

export const DEFAULT_RULES: SetRules = {
  noVocalsAfterPeak: false,
  harmonicOnly: true,
  noDoubleDrops: false,
  longBlends: false,
};
