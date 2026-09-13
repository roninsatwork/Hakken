/** Shared score formula; all inputs are validated at the mutation boundary. */
export const NIGHT_HEIST_GAME = "ronin-night-heist-v1";
export function calculateNightHeistScore(seconds: number, treasure: boolean, alarms: number): number {
  return (
    4500 + (treasure ? 750 : 0) + Math.max(0, 1200 - Math.floor(seconds) * 5) - Math.min(alarms, 20) * 50
  );
}

/** Order is also the server's unlock contract. Courtyard keeps its original key. */
export const NIGHT_HEIST_LEVELS = ["courtyard", "market", "docks", "gardens"] as const;
export type NightHeistLevelId = (typeof NIGHT_HEIST_LEVELS)[number];
export function nightHeistGame(level: NightHeistLevelId): string {
  return level === "courtyard" ? NIGHT_HEIST_GAME : `${NIGHT_HEIST_GAME}:${level}`;
}
export function isNightHeistGame(game: string): boolean {
  return game === NIGHT_HEIST_GAME || game.startsWith(`${NIGHT_HEIST_GAME}:`);
}
