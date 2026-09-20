import "./style.css";
import { BOOSTS, SKINS, UPGRADES, type BoostId, type UpgradeId } from "./game/catalog";
import { loadSave, writeSave } from "./game/save";
import { AudioBus } from "./game/audio";
import { drawSkinPreview, loadSprites } from "./game/sprites";
import { Game, type OverSnap } from "./game/game";
import { layoutStage } from "./pixel";

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} fehlt`);
  return el as T;
};

const frame = $("frame");
const stage = $("stage");
const canvas = $<HTMLCanvasElement>("game");
const playHit = $("play-hit");
const hud = $("hud");

const screens = {
  boot: $("screen-boot"),
  menu: $("screen-menu"),
  shop: $("screen-shop"),
  how: $("screen-how"),
  pause: $("screen-pause"),
  over: $("screen-over"),
};

let save = loadSave();
const audio = new AudioBus();
audio.muted = save.muted;
let howThenPlay = false;

function show(name: keyof typeof screens | null): void {
  for (const key of Object.keys(screens) as Array<keyof typeof screens>) {
    screens[key].classList.toggle("hidden", key !== name);
  }
}

function setPlayUi(on: boolean): void {
  hud.classList.toggle("hidden", !on);
  playHit.classList.toggle("hidden", !on);
}

function refreshMenu(): void {
  $("menu-stats").textContent = `${save.coins}  BEST ${save.best}`;
  $("shop-bank").textContent = `${save.coins}`;
  const input = $<HTMLInputElement>("pilot-name");
  if (document.activeElement !== input) input.value = save.name;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function persist(): void {
  writeSave(save);
  refreshMenu();
}

async function boot(): Promise<void> {
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  const layout = () => layoutStage(frame, stage);
  layout();
  window.addEventListener("resize", layout);

  const sprites = await loadSprites();
  const hudScore = $("hud-score");
  const hudCoins = $("hud-coins");
  const hudFx = $("hud-fx");
  const bagBtns = {
    shield: $<HTMLButtonElement>("use-shield"),
    chrono: $<HTMLButtonElement>("use-chrono"),
    magnet: $<HTMLButtonElement>("use-magnet"),
  };
  const paintBag = (bag: Record<BoostId, number>) => {
    const set = (btn: HTMLButtonElement, n: number, label: string) => {
      btn.textContent = `${label}${n}`;
      btn.disabled = n <= 0;
      btn.classList.toggle("hidden", n <= 0);
    };
    set(bagBtns.shield, bag.shield, "S");
    set(bagBtns.chrono, bag.chrono, "T");
    set(bagBtns.magnet, bag.magnet, "M");
  };
  const game = new Game(canvas, sprites, audio, save, {
    onHud: (h) => {
      hudScore.textContent = String(h.score);
      hudCoins.textContent = `${h.coins}C`;
      const fx =
        h.effect || (h.shields > 0 ? `SHIELD ${h.shields}` : h.combo > 1 ? `x${h.combo}` : "");
      hudFx.textContent = fx;
      hudFx.classList.toggle("hidden", !fx);
      paintBag(h.bag);
    },
    onOver: (snap) => {
      setPlayUi(false);
      paintOver(snap);
      show("over");
    },
    onSave: (next) => {
      save = next;
      refreshMenu();
    },
  });
  game.startLoop();
  (window as Window & { runIt?: Game }).runIt = game;

  renderShop(game, sprites);
  refreshMenu();
  show("menu");

  const wake = async () => {
    await audio.boot();
  };
  window.addEventListener("pointerdown", wake, { once: true });
  window.addEventListener("keydown", wake, { once: true });

  const start = () => {
    void audio.boot();
    save.name = cleanName($<HTMLInputElement>("pilot-name").value);
    persist();
    game.setSave(save);
    if (!save.seenHowTo) {
      save.seenHowTo = true;
      persist();
      howThenPlay = true;
      show("how");
      return;
    }
    begin(game);
  };

  $("btn-play").addEventListener("click", start);
  $("btn-shop").addEventListener("click", () => {
    renderShop(game, sprites);
    showShopTab("skins");
    show("shop");
  });
  $("btn-how").addEventListener("click", () => {
    howThenPlay = false;
    show("how");
  });
  $("tab-skins").addEventListener("click", () => showShopTab("skins"));
  $("tab-items").addEventListener("click", () => showShopTab("items"));
  $("tab-keep").addEventListener("click", () => showShopTab("keep"));
  $("shop-back").addEventListener("click", () => show("menu"));
  $("how-back").addEventListener("click", () => {
    if (howThenPlay) {
      howThenPlay = false;
      begin(game);
      return;
    }
    show("menu");
  });
  $("btn-pause").addEventListener("click", (e) => {
    e.stopPropagation();
    game.pause();
    setPlayUi(false);
    show("pause");
  });
  const useFromBag = (id: BoostId, e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    game.useBoost(id);
  };
  bagBtns.shield.addEventListener("pointerdown", (e) => useFromBag("shield", e));
  bagBtns.chrono.addEventListener("pointerdown", (e) => useFromBag("chrono", e));
  bagBtns.magnet.addEventListener("pointerdown", (e) => useFromBag("magnet", e));
  $("pause-resume").addEventListener("click", () => {
    show(null);
    setPlayUi(true);
    game.resume();
  });
  $("pause-quit").addEventListener("click", () => {
    game.abortToIdle();
    setPlayUi(false);
    show("menu");
  });
  $("over-retry").addEventListener("click", () => begin(game));
  $("over-shop").addEventListener("click", () => {
    renderShop(game, sprites);
    showShopTab("skins");
    show("shop");
  });
  $("over-menu").addEventListener("click", () => show("menu"));

  const tapFlip = (e: Event) => {
    e.preventDefault();
    game.flip();
  };
  playHit.addEventListener("pointerdown", tapFlip);
  canvas.addEventListener("pointerdown", tapFlip);

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === "Digit1" || e.key === "1") {
      e.preventDefault();
      game.useBoost("shield");
      return;
    }
    if (e.code === "Digit2" || e.key === "2") {
      e.preventDefault();
      game.useBoost("chrono");
      return;
    }
    if (e.code === "Digit3" || e.key === "3") {
      e.preventDefault();
      game.useBoost("magnet");
      return;
    }
    if (e.code !== "Space" && e.key !== " " && e.code !== "ArrowUp" && e.code !== "KeyW" && e.key !== "w" && e.key !== "W") return;
    e.preventDefault();
    if (!screens.how.classList.contains("hidden")) {
      $("how-back").click();
      return;
    }
    if (!screens.menu.classList.contains("hidden")) {
      start();
      return;
    }
    if (!screens.over.classList.contains("hidden")) {
      begin(game);
      return;
    }
    if (!screens.pause.classList.contains("hidden")) {
      $("pause-resume").click();
      return;
    }
    game.flip();
  });

  $<HTMLInputElement>("pilot-name").addEventListener("change", () => {
    save.name = cleanName($<HTMLInputElement>("pilot-name").value);
    persist();
    game.setSave(save);
  });

  frame.addEventListener("contextmenu", (e) => e.preventDefault());
}

function begin(game: Game): void {
  show(null);
  setPlayUi(true);
  game.setSave(save);
  game.startRun();
}

function showShopTab(name: "skins" | "items" | "keep"): void {
  $("pane-skins").classList.toggle("hidden", name !== "skins");
  $("pane-items").classList.toggle("hidden", name !== "items");
  $("pane-keep").classList.toggle("hidden", name !== "keep");
  $("tab-skins").classList.toggle("on", name === "skins");
  $("tab-items").classList.toggle("on", name === "items");
  $("tab-keep").classList.toggle("on", name === "keep");
}

function paintOver(snap: OverSnap): void {
  $("over-flag").textContent = snap.personalBest ? "NEW BEST" : "GAME OVER";
  $("over-score").textContent = String(snap.score);
  $("over-best").textContent = `BEST ${snap.best}`;
  $("over-meta").textContent = `${snap.coins} COINS  ${snap.time.toFixed(1)}S`;
}

function renderShop(game: Game, sprites: Awaited<ReturnType<typeof loadSprites>>): void {
  const skins = $("shop-skins");
  skins.innerHTML = "";
  for (const skin of SKINS) {
    const owned = save.owned.includes(skin.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `card${save.skin === skin.id ? " on" : ""}`;
    btn.innerHTML = `<canvas width="64" height="74"></canvas><span class="nm">${skin.name}</span><span class="pr">${owned ? (save.skin === skin.id ? "ON" : "USE") : `${skin.price}`}</span>`;
    const preview = btn.querySelector("canvas");
    if (preview) drawSkinPreview(preview, sprites, skin.id);
    btn.addEventListener("click", () => {
      if (!owned) {
        if (save.coins < skin.price) return;
        save.coins -= skin.price;
        save.owned.push(skin.id);
        audio.play("buy");
      }
      save.skin = skin.id;
      persist();
      game.setSave(save);
      renderShop(game, sprites);
    });
    skins.append(btn);
  }

  const boosts = $("shop-boosts");
  boosts.innerHTML = "";
  for (const item of BOOSTS) {
    const have = save.boosts[item.id];
    const poor = save.coins < item.price;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `row${poor ? " poor" : ""}`;
    btn.innerHTML = `<div><div class="nm">${item.name}</div><div class="bl">${item.use}</div></div><span class="pr">BUY ${item.price}<br>HAVE ${have}</span>`;
    btn.addEventListener("click", () => buyBoost(item.id, item.price, game, sprites));
    boosts.append(btn);
  }

  const ups = $("shop-upgrades");
  ups.innerHTML = "";
  for (const item of UPGRADES) {
    const have = save.upgrades[item.id];
    const poor = !have && save.coins < item.price;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `row${have ? " on" : poor ? " poor" : ""}`;
    btn.disabled = have;
    btn.innerHTML = `<div><div class="nm">${item.name}</div><div class="bl">${item.use}</div></div><span class="pr">${have ? "ON" : `BUY ${item.price}`}</span>`;
    btn.addEventListener("click", () => buyUpgrade(item.id, item.price, game, sprites));
    ups.append(btn);
  }
}

function buyBoost(
  id: BoostId,
  price: number,
  game: Game,
  sprites: Awaited<ReturnType<typeof loadSprites>>,
): void {
  if (save.coins < price) return;
  save.coins -= price;
  save.boosts[id] += 1;
  audio.play("buy");
  persist();
  game.setSave(save);
  renderShop(game, sprites);
}

function buyUpgrade(
  id: UpgradeId,
  price: number,
  game: Game,
  sprites: Awaited<ReturnType<typeof loadSprites>>,
): void {
  if (save.upgrades[id] || save.coins < price) return;
  save.coins -= price;
  save.upgrades[id] = true;
  audio.play("buy");
  persist();
  game.setSave(save);
  renderShop(game, sprites);
}

function cleanName(raw: string): string {
  const n = raw.replace(/\s+/g, "").toUpperCase().slice(0, 12);
  return n.length >= 2 ? n : "SPIELER";
}

void boot().catch((err) => {
  screens.boot.classList.remove("hidden");
  screens.boot.innerHTML = `<p class="stat">load failed</p><p class="hint">${escapeHtml(String(err))}</p>`;
});
