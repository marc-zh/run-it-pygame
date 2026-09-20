export type Sfx = "jump" | "coin" | "death" | "buy" | "shield" | "tick" | "graze";

export class AudioBus {
  private ctx: AudioContext | null = null;
  private jumpBuf: AudioBuffer | null = null;
  muted = false;

  async boot(): Promise<void> {
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      if (this.jumpBuf) return;
      const res = await fetch(`${import.meta.env.BASE_URL}assets/sounds/jump.wav`);
      const arr = await res.arrayBuffer();
      this.jumpBuf = await this.ctx.decodeAudioData(arr);
    } catch {
      /* Audio bleibt optional, Spiel startet trotzdem */
    }
  }

  play(kind: Sfx): void {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx;
    if (kind === "jump" && this.jumpBuf) {
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.55;
      src.buffer = this.jumpBuf;
      src.connect(gain).connect(ctx.destination);
      src.start();
      return;
    }
    beep(ctx, kind);
  }
}

function beep(ctx: AudioContext, kind: Sfx): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain).connect(ctx.destination);
  osc.type = "square";

  if (kind === "coin") {
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.13);
    return;
  }
  if (kind === "graze") {
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.exponentialRampToValueAtTime(1960, now + 0.06);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.11);
    return;
  }
  if (kind === "buy") {
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(740, now + 0.07);
    osc.frequency.setValueAtTime(980, now + 0.14);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.3);
    return;
  }
  if (kind === "shield") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.18);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.start(now);
    osc.stop(now + 0.23);
    return;
  }
  if (kind === "tick") {
    osc.frequency.setValueAtTime(160, now);
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.06);
    return;
  }
  if (kind === "jump") {
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.start(now);
    osc.stop(now + 0.15);
    return;
  }
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(55, now + 0.35);
  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.start(now);
  osc.stop(now + 0.42);
}
