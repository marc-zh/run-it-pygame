import type { BoostId, SkinId } from "./catalog";
import { SKINS } from "./catalog";

export type ScoreRow = {
  name: string;
  score: number;
  coins: number;
  time: number;
};

export type SaveData = {
  name: string;
  coins: number;
  best: number;
  skin: SkinId;
  owned: SkinId[];
  boosts: Record<BoostId, number>;
  upgrades: { air2: boolean; banker: boolean };
  scores: ScoreRow[];
  seenHowTo: boolean;
  muted: boolean;
};

const KEY = "run-it-cosmic-v1";

const empty = (): SaveData => ({
  name: "SPIELER",
  coins: 0,
  best: 0,
  skin: "pulse",
  owned: ["pulse"],
  boosts: { shield: 0, chrono: 0, magnet: 0 },
  upgrades: { air2: false, banker: false },
  scores: [],
  seenHowTo: false,
  muted: false,
});

export function loadSave(): SaveData {
  const base = empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const owned = (
      Array.isArray(parsed.owned) ? parsed.owned.filter((id): id is SkinId => SKINS.some((s) => s.id === id)) : ["pulse"]
    ) as SkinId[];
    if (!owned.includes("pulse")) owned.unshift("pulse");
    const skin = SKINS.some((s) => s.id === parsed.skin) ? (parsed.skin as SkinId) : "pulse";
    return {
      ...base,
      ...parsed,
      owned,
      skin: owned.includes(skin) ? skin : "pulse",
      boosts: { ...base.boosts, ...(parsed.boosts ?? {}) },
      upgrades: { ...base.upgrades, ...(parsed.upgrades ?? {}) },
      scores: Array.isArray(parsed.scores) ? parsed.scores.slice(0, 10) : [],
    };
  } catch {
    return base;
  }
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* Storage full or blocked (private mode): the run must still end cleanly */
  }
}

export function pushScore(save: SaveData, row: ScoreRow): SaveData {
  const scores = [...save.scores, row]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const best = Math.max(save.best, row.score);
  return { ...save, scores, best };
}
