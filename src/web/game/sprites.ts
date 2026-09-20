import type { SkinId } from "./catalog";
import { SKINS } from "./catalog";

export type SpritePack = {
  skins: Record<SkinId, { down: HTMLCanvasElement; up: HTMLCanvasElement }>;
  spike: HTMLCanvasElement;
  spikeUp: HTMLCanvasElement;
  coin: HTMLCanvasElement;
  clockGood: HTMLCanvasElement;
  clockBad: HTMLCanvasElement;
  ground: HTMLCanvasElement;
  groundUp: HTMLCanvasElement;
  shield: HTMLCanvasElement;
  start: HTMLImageElement;
};

const PLAYER_FILL: [number, number, number] = [99, 155, 255];

function asset(name: string): string {
  return `${import.meta.env.BASE_URL}assets/images/${name}`;
}

function loadImage(name: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Bild fehlt: ${name}`));
    img.src = asset(name);
  });
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Kein 2D-Context");
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function pixelScale(src: CanvasImageSource, sw: number, sh: number, scale: number): HTMLCanvasElement {
  const c = canvas(sw * scale, sh * scale);
  ctx2d(c).drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function remap(
  src: CanvasImageSource,
  sw: number,
  sh: number,
  paint: (r: number, g: number, b: number, a: number) => [number, number, number, number],
): HTMLCanvasElement {
  const c = canvas(sw, sh);
  const ctx = ctx2d(c);
  ctx.drawImage(src, 0, 0);
  const id = ctx.getImageData(0, 0, sw, sh);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b, a] = paint(d[i], d[i + 1], d[i + 2], d[i + 3]);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = a;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

function swapFill(
  src: CanvasImageSource,
  sw: number,
  sh: number,
  from: [number, number, number],
  to: [number, number, number],
): HTMLCanvasElement {
  return remap(src, sw, sh, (r, g, b, a) => {
    if (a > 0 && r === from[0] && g === from[1] && b === from[2]) return [to[0], to[1], to[2], a];
    return [r, g, b, a];
  });
}

function flipY(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas(src.width, src.height);
  const ctx = ctx2d(c);
  ctx.translate(0, src.height);
  ctx.scale(1, -1);
  ctx.drawImage(src, 0, 0);
  return c;
}

function fit(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const c = canvas(w, h);
  const ctx = ctx2d(c);
  const x = Math.floor((w - src.width) / 2);
  const y = Math.floor((h - src.height) / 2);
  ctx.drawImage(src, x, y);
  return c;
}

function makeShield(): HTMLCanvasElement {
  const raw = canvas(8, 8);
  const ctx = ctx2d(raw);
  const pixels = [
    "00011000",
    "00111100",
    "01111110",
    "11111111",
    "01111110",
    "00111100",
    "00011000",
    "00000000",
  ];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (pixels[y][x] === "1") {
        ctx.fillStyle = y < 3 ? "#ffe56a" : "#e6c14a";
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  ctx.fillStyle = "#000000";
  ctx.fillRect(3, 3, 2, 2);
  return pixelScale(raw, 8, 8, 3);
}

export async function loadSprites(): Promise<SpritePack> {
  const [player, playerUp, player2, spike, spikeUp, coin, clock, clock2, ground, start] = await Promise.all([
    loadImage("player.png"),
    loadImage("player-up.png"),
    loadImage("player-2.png"),
    loadImage("spike.png"),
    loadImage("spike-up.png"),
    loadImage("coin.png"),
    loadImage("clock.png"),
    loadImage("clock2.png"),
    loadImage("ground.png"),
    loadImage("start.png"),
  ]);

  const playerDown4 = pixelScale(player, 12, 14, 4);
  const playerUp4 = pixelScale(playerUp, 12, 14, 4);
  const player2Down = fit(pixelScale(player2, 16, 16, 3), 48, 56);
  const player2Up = flipY(player2Down);

  const skins = {} as SpritePack["skins"];
  for (const def of SKINS) {
    if (def.asset === "player2") {
      skins[def.id] = { down: player2Down, up: player2Up };
      continue;
    }
    if (!def.fill) {
      skins[def.id] = { down: playerDown4, up: playerUp4 };
      continue;
    }
    const down = pixelScale(swapFill(player, 12, 14, PLAYER_FILL, def.fill), 12, 14, 4);
    const up = pixelScale(swapFill(playerUp, 12, 14, PLAYER_FILL, def.fill), 12, 14, 4);
    skins[def.id] = { down, up };
  }

  const groundTile = pixelScale(ground, 16, 10, 3);

  const clockGood = pixelScale(
    remap(clock, 8, 8, (r, g, b, a) => {
      if (r === 178 && g === 202 && b === 215) return [106, 190, 48, a];
      return [r, g, b, a];
    }),
    8,
    8,
    3,
  );
  const clockBad = pixelScale(
    remap(clock2, 8, 8, (r, g, b, a) => {
      if (r === 178 && g === 202 && b === 215) return [224, 64, 64, a];
      return [r, g, b, a];
    }),
    8,
    8,
    3,
  );

  return {
    skins,
    spike: pixelScale(spike, 14, 12, 3),
    spikeUp: pixelScale(spikeUp, 14, 12, 3),
    coin: pixelScale(coin, 8, 8, 3),
    clockGood,
    clockBad,
    ground: groundTile,
    groundUp: flipY(groundTile),
    shield: makeShield(),
    start,
  };
}

export function drawSkinPreview(target: HTMLCanvasElement, pack: SpritePack, id: SkinId): void {
  const ctx = ctx2d(target);
  ctx.clearRect(0, 0, target.width, target.height);
  const spr = pack.skins[id].down;
  const scale = Math.floor(Math.min(target.width / spr.width, target.height / spr.height));
  const w = spr.width * scale;
  const h = spr.height * scale;
  const x = Math.floor((target.width - w) / 2);
  const y = Math.floor((target.height - h) / 2);
  ctx.drawImage(spr, x, y, w, h);
}
