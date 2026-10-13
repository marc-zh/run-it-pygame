import type { SaveData } from "./save";
import { pushScore, writeSave } from "./save";
import type { BoostId } from "./catalog";
import type { AudioBus } from "./audio";
import type { SpritePack } from "./sprites";

export const W = 500;
export const H = 800;
const STEP = 1000 / 60;
const PLAYER_W = 48;
const PLAYER_H = 56;
const PLAYER_X = 50;
const TOP_Y = 40;
const BOTTOM_Y = H - PLAYER_H - 40;
const START_SPEED = 6;
const MAX_SPEED = 13;
const BASE_MOVE = 0.6;
const BASE_ACCEL = 7;

export type HudSnap = {
  score: number;
  coins: number;
  time: number;
  jumps: number;
  combo: number;
  effect: string;
  shields: number;
  bag: Record<BoostId, number>;
};

export type OverSnap = {
  score: number;
  best: number;
  coins: number;
  banked: number;
  time: number;
  jumps: number;
  personalBest: boolean;
};

type Mode = "idle" | "play" | "pause" | "over";
type Pattern =
  | "single_top"
  | "single_bottom"
  | "alternating"
  | "gap_top"
  | "gap_bottom"
  | "double_gap"
  | "safe_zone";

type Spike = { x: number; y: number; up: boolean; grazed: boolean };
type Pickup = { x: number; y: number } | null;
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type Floater = { x: number; y: number; text: string; life: number; color: string };
type Cloud = { x: number; y: number; w: number; h: number };

// Spike hitbox as three stacked boxes (fractions of the sprite) that follow the
// triangle, so the empty corners next to the tip no longer count as a hit.
const SPIKE_PARTS: Array<[number, number, number, number]> = [
  [0.36, 0.06, 0.28, 0.22],
  [0.26, 0.25, 0.48, 0.25],
  [0.12, 0.5, 0.76, 0.38],
];

const PATTERNS: Pattern[] = [
  "single_top",
  "single_bottom",
  "alternating",
  "gap_top",
  "gap_bottom",
  "double_gap",
  "safe_zone",
];

export class Game {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites: SpritePack;
  private readonly audio: AudioBus;
  private save: SaveData;
  private readonly onHud: (h: HudSnap) => void;
  private readonly onOver: (o: OverSnap) => void;
  private readonly onSave: (s: SaveData) => void;

  mode: Mode = "idle";
  private acc = 0;
  private last = 0;
  private raf = 0;

  private playerY = BOTTOM_Y;
  private movingUp = false;
  private movingDown = false;
  private destY = BOTTOM_Y;
  private moveSpeed = BASE_MOVE;
  private airUsed = 0;
  private airMax = 1;
  private facingUp = false;
  private landSquash = 0;

  private speed = START_SPEED;
  private timer = 0;
  private coins = 0;
  private jumps = 0;
  private combo = 0;
  private comboTimer = 0;
  private grazeScore = 0;
  private shields = 0;
  private iframe = 0;
  private magnet = false;
  private magnetLeft = 0;

  private moveBase = BASE_MOVE;
  private accel = BASE_ACCEL;
  private slowLeft = 0;
  private fastLeft = 0;
  private pendingReset = false;

  private spikes: Spike[] = [];
  private coin: Pickup = null;
  private clockGood: Pickup = null;
  private clockBad: Pickup = null;
  private shieldDrop: Pickup = null;

  private spikeTimer = 0;
  private spikeGap = 90;
  private coinTimer = 0;
  private coinGap = 150;
  private clockTimer = 0;
  private clockGap = 45 * 60;
  private clock2Timer = 0;
  private clock2Gap = 50 * 60;
  private clockLock = 0;
  private shieldTimer = 0;
  private shieldGap = 40 * 60;
  private grace = 90;

  private pattern: Pattern | null = null;
  private patternStep = 0;
  private patternLen = 0;
  private lastPos: Array<"top" | "bottom"> = [];
  private sameStreak = 0;

  private ground: number[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private clouds: Cloud[] = [];
  private trail: Array<{ y: number; up: boolean }> = [];
  private shake = 0;
  private tick = 0;

  constructor(
    canvas: HTMLCanvasElement,
    sprites: SpritePack,
    audio: AudioBus,
    save: SaveData,
    hooks: {
      onHud: (h: HudSnap) => void;
      onOver: (o: OverSnap) => void;
      onSave: (s: SaveData) => void;
    },
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Kein Canvas");
    this.ctx = ctx;
    this.sprites = sprites;
    this.audio = audio;
    this.save = save;
    this.onHud = hooks.onHud;
    this.onOver = hooks.onOver;
    this.onSave = hooks.onSave;
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;

    const tw = sprites.ground.width;
    for (let i = 0; i < Math.ceil(W / tw) + 3; i++) this.ground.push(i * tw);
    for (let i = 0; i < 7; i++) {
      this.clouds.push({
        x: Math.random() * W,
        y: 80 + Math.random() * (H - 220),
        w: 28 + Math.floor(Math.random() * 36),
        h: 12 + Math.floor(Math.random() * 10),
      });
    }
  }

  setSave(save: SaveData): void {
    this.save = save;
  }

  startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const frame = (t: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(50, t - this.last);
      this.last = t;
      this.acc += dt;
      while (this.acc >= STEP) {
        this.step();
        this.acc -= STEP;
      }
      this.paint();
    };
    this.raf = requestAnimationFrame(frame);
  }

  startRun(): void {
    this.mode = "play";
    this.playerY = BOTTOM_Y;
    this.movingUp = false;
    this.movingDown = false;
    this.destY = BOTTOM_Y;
    this.moveSpeed = BASE_MOVE;
    this.airUsed = 0;
    this.airMax = this.save.upgrades.air2 ? 2 : 1;
    this.facingUp = false;
    this.landSquash = 0;
    this.speed = START_SPEED;
    this.timer = 0;
    this.coins = 0;
    this.jumps = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.grazeScore = 0;
    this.iframe = 0;
    this.moveBase = BASE_MOVE;
    this.accel = BASE_ACCEL;
    this.slowLeft = 0;
    this.fastLeft = 0;
    this.pendingReset = false;
    this.spikes = [];
    this.coin = null;
    this.clockGood = null;
    this.clockBad = null;
    this.shieldDrop = null;
    this.spikeTimer = 0;
    this.spikeGap = 88;
    this.coinTimer = 0;
    this.coinGap = 150;
    this.clockTimer = 0;
    this.clockGap = randInt(28, 48) * 60;
    this.clock2Timer = 0;
    this.clock2Gap = randInt(32, 55) * 60;
    this.clockLock = 0;
    this.shieldTimer = 0;
    this.shieldGap = randInt(22, 40) * 60;
    this.grace = 96;
    this.pattern = null;
    this.patternStep = 0;
    this.patternLen = 0;
    this.lastPos = [];
    this.sameStreak = 0;
    this.particles = [];
    this.floaters = [];
    this.trail = [];
    this.shake = 0;

    this.shields = 0;
    this.magnet = false;
    this.magnetLeft = 0;
    writeSave(this.save);
    this.onSave(this.save);
    this.emitHud();
  }

  pause(): void {
    if (this.mode === "play") this.mode = "pause";
  }

  resume(): void {
    if (this.mode === "pause") this.mode = "play";
  }

  useBoost(id: BoostId): boolean {
    if (this.mode !== "play") return false;
    if (this.save.boosts[id] <= 0) return false;
    if (id === "shield") {
      this.save.boosts.shield -= 1;
      this.shields += 1;
      this.float(PLAYER_X, this.playerY, "SHIELD", "#e6c14a");
      this.audio.play("shield");
    } else if (id === "chrono") {
      this.save.boosts.chrono -= 1;
      this.applySlow(5);
      this.float(PLAYER_X, this.playerY, "SLOW", "#6abe30");
      this.audio.play("tick");
    } else {
      this.save.boosts.magnet -= 1;
      this.magnet = true;
      this.magnetLeft = 8;
      this.float(PLAYER_X, this.playerY, "MAGNET", "#ffd24a");
      this.audio.play("coin");
    }
    writeSave(this.save);
    this.onSave(this.save);
    this.emitHud();
    return true;
  }

  abortToIdle(): void {
    this.mode = "idle";
    this.spikes = [];
    this.coin = null;
    this.clockGood = null;
    this.clockBad = null;
    this.shieldDrop = null;
    this.slowLeft = 0;
    this.fastLeft = 0;
    this.magnet = false;
    this.magnetLeft = 0;
    this.playerY = BOTTOM_Y;
    this.facingUp = false;
    this.movingUp = false;
    this.movingDown = false;
  }

  snapshot(): {
    mode: Mode;
    y: number;
    bottom: number;
    jumps: number;
    movingUp: boolean;
    spikes: Array<{ x: number; up: boolean }>;
  } {
    return {
      mode: this.mode,
      y: this.playerY,
      bottom: BOTTOM_Y,
      jumps: this.jumps,
      movingUp: this.movingUp,
      spikes: this.spikes.map((s) => ({ x: s.x, up: s.up })),
    };
  }

  flip(): void {
    if (this.mode !== "play") return;
    const onBottom = Math.abs(this.playerY - BOTTOM_Y) < 0.5 && !this.movingUp && !this.movingDown;
    const onTop = Math.abs(this.playerY - TOP_Y) < 0.5 && !this.movingUp && !this.movingDown;

    if (onBottom) {
      this.movingUp = true;
      this.destY = TOP_Y;
      this.facingUp = true;
      this.airUsed = 0;
      this.jumps += 1;
      this.speed = Math.min(MAX_SPEED, this.speed + 0.01);
      this.moveSpeed = this.moveBase;
      this.audio.play("jump");
      this.burst(PLAYER_X + PLAYER_W / 2, this.playerY + PLAYER_H, "#639BFF", 6);
      return;
    }
    if (onTop) {
      this.movingDown = true;
      this.destY = BOTTOM_Y;
      this.facingUp = false;
      this.airUsed = 0;
      this.jumps += 1;
      this.speed = Math.min(MAX_SPEED, this.speed + 0.01);
      this.moveSpeed = this.moveBase;
      this.audio.play("jump");
      this.burst(PLAYER_X + PLAYER_W / 2, this.playerY, "#ffb700", 6);
      return;
    }
    if (this.movingUp && this.airUsed < this.airMax) {
      this.movingUp = false;
      this.movingDown = true;
      this.destY = BOTTOM_Y;
      this.facingUp = false;
      this.moveSpeed = this.moveBase * 1.2;
      this.airUsed += 1;
      this.jumps += 1;
      this.speed = Math.min(MAX_SPEED, this.speed + 0.01);
      this.audio.play("jump");
      return;
    }
    if (this.movingDown && this.airUsed < this.airMax) {
      this.movingDown = false;
      this.movingUp = true;
      this.destY = TOP_Y;
      this.facingUp = true;
      this.moveSpeed = this.moveBase * 1.2;
      this.airUsed += 1;
      this.jumps += 1;
      this.speed = Math.min(MAX_SPEED, this.speed + 0.01);
      this.audio.play("jump");
    }
  }

  private grounded(): boolean {
    return (
      (this.playerY === BOTTOM_Y || this.playerY === TOP_Y) && !this.movingUp && !this.movingDown
    );
  }

  private applySlow(seconds: number): void {
    this.slowLeft = seconds;
    this.fastLeft = 0;
    // A reset queued by an earlier clock must not cancel this one on landing.
    this.pendingReset = false;
    this.moveBase = BASE_MOVE * 0.5;
    this.accel = BASE_ACCEL * 0.4;
  }

  private applyFast(seconds: number): void {
    this.fastLeft = seconds;
    this.slowLeft = 0;
    this.pendingReset = false;
    this.moveBase = BASE_MOVE * 1.8;
    this.accel = BASE_ACCEL * 2.5;
  }

  private resetPhysics(): void {
    this.moveBase = BASE_MOVE;
    this.accel = BASE_ACCEL;
    this.pendingReset = false;
  }

  private difficulty(): number {
    const byTime = Math.min(this.timer / 55, 1);
    const byCoins = Math.min(this.coins / 12, 1);
    return Math.min(1, byTime * 0.65 + byCoins * 0.35);
  }

  private scoreNow(): number {
    const base = Math.floor(this.timer * 10);
    const coinBonus = this.coins * 10;
    const efficiency = Math.floor((this.coins * 50) / Math.max(this.jumps, 1));
    const comboBonus = this.combo > 1 ? this.combo * 4 : 0;
    return base + coinBonus + efficiency + this.grazeScore + comboBonus;
  }

  private step(): void {
    this.tick += 1;
    if (this.mode === "play") this.scrollDecor(this.speed);
    else if (this.mode === "idle") this.scrollDecor(2.2);
    this.updateFx();
    if (this.mode !== "play") return;

    this.timer += 1 / 60;
    this.speed = Math.min(MAX_SPEED, this.speed + 0.001);
    if (this.grace > 0) this.grace -= 1;
    if (this.iframe > 0) this.iframe -= 1;
    if (this.clockLock > 0) this.clockLock -= 1;
    if (this.comboTimer > 0) {
      this.comboTimer -= 1;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.landSquash > 0) this.landSquash -= 1;

    this.updateClocks();
    this.updatePlayer();
    this.spawnWorld();
    this.moveWorld();
    this.collisions();
    this.emitHud();
  }

  private updatePlayer(): void {
    if (this.movingUp) {
      this.playerY -= this.moveSpeed;
      this.moveSpeed += this.accel;
      if (this.playerY <= this.destY) {
        this.playerY = this.destY;
        this.movingUp = false;
        this.airUsed = 0;
        this.moveSpeed = this.moveBase;
        this.landSquash = 6;
        if (this.pendingReset) this.resetPhysics();
      }
    } else if (this.movingDown) {
      this.playerY += this.moveSpeed;
      this.moveSpeed += this.accel;
      if (this.playerY >= this.destY) {
        this.playerY = this.destY;
        this.movingDown = false;
        this.airUsed = 0;
        this.moveSpeed = this.moveBase;
        this.landSquash = 6;
        if (this.pendingReset) this.resetPhysics();
      }
    }
    this.trail.push({ y: this.playerY, up: this.facingUp });
    if (this.trail.length > 7) this.trail.shift();
  }

  private updateClocks(): void {
    if (this.slowLeft > 0) {
      this.slowLeft -= 1 / 60;
      if (this.slowLeft <= 0) {
        this.slowLeft = 0;
        if (this.grounded()) this.resetPhysics();
        else this.pendingReset = true;
      }
    }
    if (this.fastLeft > 0) {
      this.fastLeft -= 1 / 60;
      if (this.fastLeft <= 0) {
        this.fastLeft = 0;
        if (this.grounded()) this.resetPhysics();
        else this.pendingReset = true;
      }
    }
    if (this.magnetLeft > 0) {
      this.magnetLeft -= 1 / 60;
      if (this.magnetLeft <= 0) {
        this.magnetLeft = 0;
        this.magnet = false;
      }
    }
  }

  private spawnWorld(): void {
    this.spikeTimer += 1;
    this.coinTimer += 1;
    this.clockTimer += 1;
    this.clock2Timer += 1;
    this.shieldTimer += 1;

    if (this.grace <= 0 && this.spikeTimer >= this.spikeGap) {
      if (!this.pattern || this.patternStep >= this.patternLen) this.pickPattern();
      this.spawnPattern();
      this.patternStep += 1;
      this.spikeTimer = 0;
      const d = this.difficulty();
      this.spikeGap = Math.floor(92 - d * 38);
    }

    if (this.coinTimer >= this.coinGap && !this.coin) {
      this.coin = { x: W, y: this.pickLane(this.timer > 8 && Math.random() < 0.28) };
      this.coinTimer = 0;
    }

    if (this.clockTimer >= this.clockGap) {
      if (!this.clockGood && this.clockLock <= 0) {
        this.clockGood = { x: W, y: this.pickLane(false) };
        this.clockLock = 60;
      }
      this.clockTimer = 0;
      this.clockGap = randInt(30, 58) * 60;
    }
    if (this.clock2Timer >= this.clock2Gap) {
      if (!this.clockBad && this.clockLock <= 0) {
        this.clockBad = { x: W, y: this.pickLane(false) };
        this.clockLock = 60;
      }
      this.clock2Timer = 0;
      this.clock2Gap = randInt(30, 58) * 60;
    }
    if (this.shieldTimer >= this.shieldGap) {
      if (!this.shieldDrop) this.shieldDrop = { x: W, y: this.pickLane(false) };
      this.shieldTimer = 0;
      this.shieldGap = randInt(26, 48) * 60;
    }
  }

  private pickLane(allowMid: boolean): number {
    if (allowMid) return (TOP_Y + BOTTOM_Y) / 2;
    return Math.random() < 0.5 ? TOP_Y + 8 : BOTTOM_Y + 8;
  }

  private pickPattern(): void {
    const d = this.difficulty();
    let pool: Pattern[];
    if (d < 0.25) pool = ["single_top", "single_bottom", "safe_zone", "gap_top", "gap_bottom"];
    else if (d < 0.55) pool = ["single_top", "single_bottom", "alternating", "gap_top", "gap_bottom", "safe_zone"];
    else pool = PATTERNS.slice();
    if (this.sameStreak >= 3) pool = ["alternating", "safe_zone", "double_gap"];
    this.pattern = pool[Math.floor(Math.random() * pool.length)];
    this.patternStep = 0;
    if (this.pattern === "safe_zone") this.patternLen = randInt(2, 4);
    else if (this.pattern === "alternating") this.patternLen = randInt(3, 6);
    else if (this.pattern === "double_gap") this.patternLen = 4;
    else this.patternLen = randInt(1, 3);
  }

  private spawnPattern(): void {
    const p = this.pattern;
    if (!p || p === "safe_zone") return;
    const sw = this.sprites.spike.width;
    const sh = this.sprites.spike.height;
    const topY = 38;
    const botY = H - sh - 32;
    const add = (up: boolean, xOff = 0) => {
      this.spikes.push({ x: W + xOff, y: up ? topY : botY, up, grazed: false });
      this.track(up ? "top" : "bottom");
    };
    if (p === "single_top" || p === "gap_bottom") add(true);
    else if (p === "single_bottom" || p === "gap_top") add(false);
    else if (p === "alternating") add(this.patternStep % 2 === 0);
    else if (p === "double_gap") {
      if (this.patternStep === 0 || this.patternStep === 3) {
        add(true);
        add(false, sw + 10);
      } else if (this.patternStep === 1) add(true);
      else add(false);
    }
  }

  private track(pos: "top" | "bottom"): void {
    this.lastPos.push(pos);
    if (this.lastPos.length > 5) this.lastPos.shift();
    if (this.lastPos.length >= 2 && this.lastPos.at(-1) === this.lastPos.at(-2)) this.sameStreak += 1;
    else this.sameStreak = 0;
  }

  private moveWorld(): void {
    const sp = this.speed;
    for (const s of this.spikes) s.x -= sp;
    this.spikes = this.spikes.filter((s) => s.x > -60);
    this.advancePickup("coin", this.sprites.coin.width, () => this.grabCoin());
    this.advancePickup("clockGood", this.sprites.clockGood.width, () => {
      this.applySlow(10);
      this.float(PLAYER_X, this.playerY, "SLOW", "#6abe30");
      this.audio.play("tick");
    });
    this.advancePickup("clockBad", this.sprites.clockBad.width, () => {
      this.applyFast(10);
      this.float(PLAYER_X, this.playerY, "CHAOS", "#ff6b6b");
      this.audio.play("tick");
    });
    this.advancePickup("shieldDrop", this.sprites.shield.width, () => {
      this.shields += 1;
      this.float(PLAYER_X, this.playerY, "SHIELD", "#e6c14a");
      this.audio.play("shield");
      this.burst(PLAYER_X + 24, this.playerY + 28, "#e6c14a", 10);
    });
  }

  private advancePickup(key: "coin" | "clockGood" | "clockBad" | "shieldDrop", size: number, grab: () => void): void {
    const item = this[key];
    if (!item) return;
    item.x -= this.speed;
    if (this.magnet && key === "coin") {
      const cx = PLAYER_X + PLAYER_W / 2;
      const cy = this.playerY + PLAYER_H / 2;
      const dx = cx - (item.x + size / 2);
      const dy = cy - (item.y + size / 2);
      if (dx * dx + dy * dy < 130 * 130) {
        item.x += dx * 0.12;
        item.y += dy * 0.12;
      }
    }
    if (item.x < -size) {
      this[key] = null;
      return;
    }
    if (overlap(PLAYER_X, this.playerY, PLAYER_W, PLAYER_H, item.x, item.y, size, size)) {
      this[key] = null;
      grab();
    }
  }

  private grabCoin(): void {
    this.coins += 1;
    this.combo += 1;
    this.comboTimer = 120;
    this.speed = Math.min(MAX_SPEED, this.speed + 0.08);
    this.coinGap = Math.max(55, this.coinGap - 8);
    this.audio.play("coin");
    this.burst(PLAYER_X + 24, this.playerY + 20, "#ffd24a", 8);
    if (this.combo > 1) this.float(PLAYER_X + 10, this.playerY, `x${this.combo}`, "#ffd24a");
    try {
      navigator.vibrate?.(8);
    } catch {
      /* ignore */
    }
  }

  private collisions(): void {
    const pw = PLAYER_W * 0.8;
    const ph = PLAYER_H * 0.8;
    const px = PLAYER_X + PLAYER_W * 0.1;
    const py = this.playerY + PLAYER_H * 0.1;
    const sw = this.sprites.spike.width;
    const sh = this.sprites.spike.height;

    for (const s of this.spikes) {
      const hit = SPIKE_PARTS.some(([x, y, w, h]) =>
        overlap(px, py, pw, ph, s.x + x * sw, s.y + (s.up ? 1 - y - h : y) * sh, w * sw, h * sh),
      );
      if (hit && this.iframe <= 0) {
        if (this.shields > 0) {
          this.shields -= 1;
          this.iframe = 45;
          this.shake = 8;
          this.audio.play("shield");
          this.burst(PLAYER_X + 24, this.playerY + 28, "#ffffff", 14);
          s.grazed = true;
          continue;
        }
        this.die();
        return;
      }
      if (!s.grazed && s.x + sw < PLAYER_X && s.x + sw + this.speed >= PLAYER_X) {
        s.grazed = true;
        const pc = this.playerY + PLAYER_H / 2;
        const sc = s.y + sh / 2;
        if (Math.abs(pc - sc) < 92) {
          this.grazeScore += 8 + this.combo * 2;
          this.combo += 1;
          this.comboTimer = 100;
          this.audio.play("graze");
          this.float(PLAYER_X + 36, this.playerY, "GRAZE", "#ffb700");
          this.burst(PLAYER_X + PLAYER_W, this.playerY + 20, "#ffb700", 5);
        }
      }
    }
  }

  private die(): void {
    const score = this.scoreNow();
    const personalBest = score > this.save.best;
    let banked = this.coins;
    if (this.save.upgrades.banker) banked = Math.ceil(banked * 1.25);
    this.save.coins += banked;
    this.save = pushScore(this.save, {
      name: this.save.name || "SPIELER",
      score,
      coins: this.coins,
      time: Math.round(this.timer * 10) / 10,
    });
    writeSave(this.save);
    this.onSave(this.save);
    this.mode = "over";
    this.shake = 14;
    this.audio.play("death");
    this.burst(PLAYER_X + 24, this.playerY + 28, "#639BFF", 22);
    try {
      navigator.vibrate?.([20, 40, 30]);
    } catch {
      /* ignore */
    }
    this.onOver({
      score,
      best: this.save.best,
      coins: this.coins,
      banked,
      time: this.timer,
      jumps: this.jumps,
      personalBest,
    });
  }

  private scrollDecor(speed: number): void {
    const tw = this.sprites.ground.width;
    for (let i = 0; i < this.ground.length; i++) {
      this.ground[i] -= speed;
      if (this.ground[i] <= -tw) this.ground[i] += this.ground.length * tw;
    }
    for (const c of this.clouds) {
      c.x -= speed * 0.22;
      if (c.x < -c.w - 20) c.x = W + 10;
    }
  }

  private updateFx(): void {
    if (this.shake > 0) this.shake -= 1;
    this.particles = this.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= 1;
      return p.life > 0;
    });
    this.floaters = this.floaters.filter((f) => {
      f.y -= 0.7;
      f.life -= 1;
      return f.life > 0;
    });
  }

  private burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 4.5,
        vy: (Math.random() - 0.8) * 3.5,
        life: 18 + Math.random() * 14,
        color,
        size: Math.random() < 0.5 ? 2 : 3,
      });
    }
  }

  private float(x: number, y: number, text: string, color: string): void {
    this.floaters.push({ x, y, text, life: 42, color });
  }

  private emitHud(): void {
    let effect = "";
    if (this.slowLeft > 0) effect = `SLOW ${this.slowLeft.toFixed(1)}`;
    else if (this.fastLeft > 0) effect = `CHAOS ${this.fastLeft.toFixed(1)}`;
    else if (this.magnetLeft > 0) effect = `MAGNET ${this.magnetLeft.toFixed(1)}`;
    this.onHud({
      score: this.scoreNow(),
      coins: this.coins,
      time: this.timer,
      jumps: this.jumps,
      combo: this.combo,
      effect,
      shields: this.shields,
      bag: { ...this.save.boosts },
    });
  }

  private paint(): void {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.paintBg();
    this.paintRails();
    if (this.mode === "play" || this.mode === "pause" || this.mode === "over") this.paintEntities();
    this.paintPlayer();
    this.paintFx();
    if (this.slowLeft > 0) {
      ctx.fillStyle = "rgba(80,255,180,0.07)";
      ctx.fillRect(0, 0, W, H);
    } else if (this.fastLeft > 0) {
      ctx.fillStyle = "rgba(255,60,80,0.08)";
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  private paintBg(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#87CEFA";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#B7E4FF";
    ctx.fillRect(0, 0, W, 90);
    for (const c of this.clouds) this.paintCloud(c);
  }

  private paintCloud(c: Cloud): void {
    const ctx = this.ctx;
    const x = Math.floor(c.x);
    const y = Math.floor(c.y);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, c.w, c.h);
    ctx.fillRect(x + 8, y - 8, Math.floor(c.w * 0.7), c.h);
    ctx.fillStyle = "#e4f4ff";
    ctx.fillRect(x, y + c.h - 4, c.w, 4);
  }

  private paintRails(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(0, 0, W, 12);
    ctx.fillRect(0, H - 12, W, 12);
    for (const x of this.ground) {
      ctx.drawImage(this.sprites.groundUp, Math.floor(x), 12);
      ctx.drawImage(this.sprites.ground, Math.floor(x), H - 12 - this.sprites.ground.height);
    }
  }

  private paintEntities(): void {
    const ctx = this.ctx;
    for (const s of this.spikes) {
      ctx.drawImage(s.up ? this.sprites.spikeUp : this.sprites.spike, Math.floor(s.x), Math.floor(s.y));
    }
    if (this.coin) ctx.drawImage(this.sprites.coin, Math.floor(this.coin.x), Math.floor(this.coin.y));
    if (this.clockGood) ctx.drawImage(this.sprites.clockGood, Math.floor(this.clockGood.x), Math.floor(this.clockGood.y));
    if (this.clockBad) ctx.drawImage(this.sprites.clockBad, Math.floor(this.clockBad.x), Math.floor(this.clockBad.y));
    if (this.shieldDrop) ctx.drawImage(this.sprites.shield, Math.floor(this.shieldDrop.x), Math.floor(this.shieldDrop.y));
  }

  private paintPlayer(): void {
    const ctx = this.ctx;
    const skin = this.sprites.skins[this.save.skin] ?? this.sprites.skins.pulse;
    const spr = this.facingUp ? skin.up : skin.down;
    for (let i = 0; i < this.trail.length - 1; i++) {
      const t = this.trail[i];
      ctx.globalAlpha = (i / this.trail.length) * 0.28;
      ctx.drawImage(t.up ? skin.up : skin.down, PLAYER_X, Math.floor(t.y));
    }
    ctx.globalAlpha = 1;
    if (this.shields > 0) {
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 4;
      ctx.strokeRect(PLAYER_X - 4, this.playerY - 4, PLAYER_W + 8, PLAYER_H + 8);
      ctx.strokeStyle = this.iframe > 0 ? "#fff" : "#e6c14a";
      ctx.lineWidth = 2;
      ctx.strokeRect(PLAYER_X - 4, this.playerY - 4, PLAYER_W + 8, PLAYER_H + 8);
    }
    const squash = this.landSquash > 0 ? 0.86 : 1;
    if (squash !== 1) {
      ctx.save();
      const y = this.facingUp ? this.playerY : this.playerY + PLAYER_H * (1 - squash);
      ctx.translate(PLAYER_X, y);
      ctx.scale(1.08, squash);
      ctx.drawImage(spr, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(spr, PLAYER_X, Math.floor(this.playerY));
    }
  }

  private paintFx(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textBaseline = "top";
    ctx.imageSmoothingEnabled = false;
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / 42);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, Math.floor(f.x), Math.floor(f.y));
    }
    ctx.globalAlpha = 1;
  }
}

function overlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function randInt(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}
