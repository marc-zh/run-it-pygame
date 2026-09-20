export type SkinId = "pulse" | "aqua" | "nova" | "solar" | "void" | "ghost";
export type BoostId = "shield" | "chrono" | "magnet";
export type UpgradeId = "air2" | "banker";

export type SkinDef = {
  id: SkinId;
  name: string;
  price: number;
  asset: "player" | "player2";
  fill?: [number, number, number];
};

export const SKINS: SkinDef[] = [
  { id: "pulse", name: "BLUE", price: 0, asset: "player" },
  { id: "aqua", name: "CYAN", price: 80, asset: "player2" },
  { id: "nova", name: "PINK", price: 140, asset: "player", fill: [255, 92, 173] },
  { id: "solar", name: "GOLD", price: 200, asset: "player", fill: [255, 196, 64] },
  { id: "void", name: "PURPLE", price: 280, asset: "player", fill: [164, 92, 255] },
  { id: "ghost", name: "WHITE", price: 360, asset: "player", fill: [236, 244, 255] },
];

export const BOOSTS: { id: BoostId; name: string; use: string; price: number }[] = [
  { id: "shield", name: "SHIELD", use: "survive 1 spike", price: 35 },
  { id: "chrono", name: "SLOW", use: "5 seconds slow", price: 45 },
  { id: "magnet", name: "MAGNET", use: "8 seconds coins", price: 55 },
];

export const UPGRADES: { id: UpgradeId; name: string; use: string; price: number }[] = [
  { id: "air2", name: "2X FLIP", use: "redirect twice in air", price: 320 },
  { id: "banker", name: "+25%", use: "more coins each run", price: 220 },
];
