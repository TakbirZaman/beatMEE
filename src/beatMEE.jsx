import { useEffect, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const CW = 800, CH = 450;
const GROUND = 368;
const GRAVITY = 0.62;
const JUMP_VY = -14;
const WALK_SPD = 4.5;
const FW = 40, FH = 82;

const ATK = {
  punch:    { dmg: 8,  rng: 72,  dur: 18, kb: 3.5, startup: 4,  active: 7,  stun: 14 },
  dash:     { dmg: 18, rng: 100, dur: 28, kb: 8,   startup: 5,  active: 10, stun: 26 },
  special:  { dmg: 22, rng: 115, dur: 40, kb: 11,  startup: 13, active: 10, stun: 34 },
  airpunch: { dmg: 11, rng: 80,  dur: 20, kb: 5,   startup: 4,  active: 8,  stun: 16 },
  airkick:  { dmg: 17, rng: 95,  dur: 28, kb: 8,   startup: 6,  active: 9,  stun: 24 },
  heavykick: { dmg: 28, rng: 105, dur: 38, kb: 12,  startup: 14, active: 8,  stun: 32 },
  super:    { dmg: 45, rng: 130, dur: 55, kb: 16,  startup: 18, active: 12, stun: 45 },
  finisher: { dmg: 70, rng: 140, dur: 65, kb: 22,  startup: 22, active: 14, stun: 60 },
};

// ── CPU difficulty profiles ──
const DIFFICULTY = {
  easy:      { thinkMin: 22, thinkMax: 40, blockChance: 0.15, attackChance: 0.28, superChance: 0.00, aggression: 0.3 },
  semipro:   { thinkMin: 12, thinkMax: 24, blockChance: 0.50, attackChance: 0.58, superChance: 0.25, aggression: 0.6 },
  pro:       { thinkMin: 5,  thinkMax: 12, blockChance: 0.75, attackChance: 0.80, superChance: 0.55, aggression: 0.8 },
  legendary: { thinkMin: 1,  thinkMax: 1,  blockChance: 1.00, attackChance: 0.99, superChance: 0.99, aggression: 1.0 },
};

const SUPER_MAX        = 100;
const SUPER_FILL_DMG   = 1.8;
const SUPER_FILL_TAKEN = 2.4;

const ROUND_TIME  = 90;
const WINS_NEEDED = 2;
const COMBO_TICKS = 55;

// ── Single player bindings ──
const PK = {
  left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp",
  punch: "KeyA", dash: "KeyS",  special: "KeyD", block: "ArrowDown", heavykick: "KeyF",
  altUp: "KeyW", taunt: "KeyT",
};
const GAME_KEYS = new Set([
  "ArrowLeft","ArrowRight","ArrowUp","ArrowDown",
  "KeyA","KeyS","KeyD","KeyW","KeyT","KeyF",
]);

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const CROWD_MSGS = ["OOOH!", "WHAT A HIT!", "INCREDIBLE!", "LET'S GO!", "WOAH!", "BEAST MODE!", "NO WAY!!", "GET UP!"];
const TAUNT_MSGS = ["Too slow!", "Is that all?", "Try harder!", "You're done!", "Come on!", "Pathetic!", "Fear me!", "You call that a punch?"];
const BLOCK_MSGS = ["Blocked!", "Nice try!", "Can't touch me!", "Read that!"];
const COMBO_MSGS = ["BOOM!", "Keep going!", "Don't stop!", "Unstoppable!"];

function rgba(hex, a) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ═══════════════════════════════════════════════════════════════
// FACTORIES
// ═══════════════════════════════════════════════════════════════
function mkFighter(startX, facing, color, glow, name) {
  return {
    x: startX, y: GROUND,
    vx: 0, vy: 0,
    facing,
    hp: 100,
    state: "idle",
    stateTimer: 0,
    attackType: null,
    hitActive: false,
    hitDone: false,
    comboCount: 0,
    lastHitTick: -9999,
    color, glow, name,
    animTick: 0,
    superMeter: 0,
    airAttackUsed: false,
    superActivating: false,
    stunGauge: 0,
    stunned: false,
    stunFrames: 0,
    dmgNumbers: [],
    finisherReady: false,
    tauntTimer: 0,
    tauntCooldown: 0,
    lastDodge: -999,
    personality: null,
    personalityTimer: 0,
  };
}

function mkParticles(x, y, color, n = 14) {
  return Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 6;
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2.5,
             life: 1, decay: 0.025 + Math.random() * 0.04, r: 2 + Math.random() * 5, color };
  });
}

// ═══════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════
function initGS(playerName, difficulty = "medium", playerColor = "#00e5ff") {
  const pGlow = playerColor;
  return {
    phase: "menu",
    tick: 0, timer: ROUND_TIME, timerFrames: 0,
    round: 1, wins: [0, 0],
    fighters: [
      mkFighter(170, 1,  playerColor, pGlow, playerName || "PLAYER"),
      mkFighter(630, -1, "#ff4040",   "#ff4040", "CPU"),
    ],
    particles: [], announce: null,
    cdFrames: 0, cdVal: 3,
    flashFrames: 0, shakeFrames: 0, shakeIntensity: 0,
    resultsTriggered: false,
    difficulty,
    playerPattern: { punchCount: 0, blockCount: 0, stayFarCount: 0, lastPlayerAtk: null },
    hitStopFrames: 0,
    slowMotionFrames: 0,
    cameraZoom: 1.0, cameraZoomTarget: 1.0,
    clashParticles: [],
    finishHimShown: false,
    cinematicKO: false, cinematicKOTimer: 0,
    playerBehavior: { punchCount: 0, blockCount: 0, jumpCount: 0, lastActionTick: 0 },
    cpuDecision: { move: 0, blocking: false, jumping: false, attack: null },
    cpuThinkCd: 0,
    crowdReactions: [],
    playerTookDamage: false,
    cpuTauntCd: 0,
    streakWins: 0,
  };
}

function beginRound(gs) {
  const pName = gs.fighters[0].name;
  const pCol = gs.fighters[0]?.color || "#00e5ff";
  gs.fighters    = [mkFighter(170, 1, pCol, pCol, pName), mkFighter(630, -1, "#ff4040", "#ff4040", "CPU")];
  gs.timer       = ROUND_TIME; gs.timerFrames = 0;
  gs.particles   = []; gs.cdVal = 3; gs.cdFrames = 180;
  gs.phase       = "countdown"; gs.announce = null;
  gs.flashFrames = 0; gs.shakeFrames = 0; gs.shakeIntensity = 0;
  gs.playerPattern = { punchCount: 0, blockCount: 0, stayFarCount: 0, lastPlayerAtk: null };
  gs.hitStopFrames = 0; gs.slowMotionFrames = 0;
  gs.cameraZoom = 1.0; gs.cameraZoomTarget = 1.0;
  gs.clashParticles = []; gs.finishHimShown = false;
  gs.cinematicKO = false; gs.cinematicKOTimer = 0;
  gs.playerBehavior = { punchCount: 0, blockCount: 0, jumpCount: 0, lastActionTick: 0 };
  gs.cpuDecision = { move: 0, blocking: false, jumping: false, attack: null };
  gs.cpuThinkCd  = 0;
  gs.crowdReactions = [];
  gs.playerTookDamage = false;
  gs.cpuTauntCd = 0;
}

// ═══════════════════════════════════════════════════════════════
// PHYSICS
// ═══════════════════════════════════════════════════════════════
function applyPhysics(f) {
  f.vy += GRAVITY;
  f.y   = Math.min(GROUND, f.y + f.vy);
  if (f.y >= GROUND) { f.y = GROUND; f.vy = 0; }
  f.x   = Math.max(FW / 2 + 12, Math.min(CW - FW / 2 - 12, f.x + f.vx));
}

// ═══════════════════════════════════════════════════════════════
// CPU AI  (difficulty-aware)
// ═══════════════════════════════════════════════════════════════
function updateCPU(gs) {
  const cpu    = gs.fighters[1];
  const player = gs.fighters[0];
  if (cpu.state === "ko" || cpu.state === "hit" || cpu.state === "attack") return;

  const diff = DIFFICULTY[gs.difficulty] || DIFFICULTY.medium;
  gs.cpuThinkCd--;
  if (gs.cpuThinkCd > 0) return;
  gs.cpuThinkCd = diff.thinkMin + Math.floor(Math.random() * (diff.thinkMax - diff.thinkMin));

  const dx       = player.x - cpu.x;
  const dist     = Math.abs(dx);
  const onGround = cpu.y >= GROUND - 2;
  const dec      = gs.cpuDecision;
  dec.blocking   = false; dec.attack = null; dec.jumping = false; dec.move = 0;

  // Use super when meter is full
  if (cpu.superMeter >= SUPER_MAX && dist < 130 && onGround && Math.random() < diff.superChance) {
    dec.attack = "super"; return;
  }

  // ── LEGENDARY MIND GAME: near-perfect AI ──
  if (gs.difficulty === "legendary") {
    // ALWAYS block incoming attack instantly — no randomness
    if (player.state === "attack" && dist < 140) { dec.blocking = true; return; }
    // Finish Him — always go for kill
    if (player.hp <= 14 && dist < 150 && onGround) {
      dec.attack = cpu.superMeter >= SUPER_MAX * 0.5 ? "finisher" : "special"; return;
    }
    // Super instantly when ready and close
    if (cpu.superMeter >= SUPER_MAX && dist < 145) { dec.attack = "super"; return; }
    // Rush the player immediately if far
    if (dist > 100) { dec.move = Math.sign(dx); gs.cpuThinkCd = 1; return; }
    // In range — rotate attacks to be unpredictable, never just punches
    if (dist < 120 && onGround) {
      const roll = Math.random();
      dec.attack = roll < 0.30 ? "special"
                 : roll < 0.55 ? "heavykick"
                 : roll < 0.75 ? "dash"
                 : roll < 0.88 ? "punch"
                 : "special";
      return;
    }
    // If player jumps, jump-cancel and wait to punish landing
    if (player.state === "jump") { dec.move = Math.sign(dx); gs.cpuThinkCd = 1; return; }
    dec.move = Math.sign(dx); return;
  }

  let adaptedBlock   = diff.blockChance;
  let adaptedAttack  = diff.attackChance;
  if (gs.playerBehavior) {
    const pb = gs.playerBehavior;
    if (pb.punchCount > 4) adaptedBlock  = Math.min(0.95, adaptedBlock + 0.1);
    if (pb.blockCount  > 3) adaptedAttack = Math.min(0.95, adaptedAttack + 0.12);
  }

  // Finish Him - use finisher at low health
  if (player.hp <= 10 && onGround && dist < 130 && cpu.superMeter >= SUPER_MAX * 0.5) {
    dec.attack = "finisher"; return;
  }

  // Block if player is attacking
  if (player.state === "attack" && dist < 120 && Math.random() < adaptedBlock) { dec.blocking = true; return; }
  // Close the gap
  if (dist > 180) { dec.move = Math.sign(dx); return; }
  // Attack in range
  if (dist < 115 && onGround && Math.random() < adaptedAttack) {
    const roll = Math.random();
    dec.attack = roll < 0.50 ? "punch" : roll < 0.78 ? "dash" : "special";
    return;
  }
  dec.move    = dist < 60 ? -Math.sign(dx) * (Math.random() < 0.5 ? 1 : 0) : Math.sign(dx) * (Math.random() < 0.7 ? 1 : 0);
  if (onGround && Math.random() < 0.04) dec.jumping = true;
}

function applyCPUDecision(gs) {
  const cpu = gs.fighters[1];
  const dec = gs.cpuDecision;
  if (cpu.state === "ko" || cpu.state === "hit") return;
  if (cpu.state === "attack") { cpu.animTick++; applyPhysics(cpu); return; }

  const onGround = cpu.y >= GROUND - 2;

  if (dec.blocking && onGround) { cpu.state = "block"; cpu.vx *= 0.6; applyPhysics(cpu); return; }
  if (dec.attack && onGround) {
    cpu.state = "attack"; cpu.attackType = dec.attack;
    cpu.stateTimer = ATK[dec.attack].dur; cpu.hitActive = false; cpu.hitDone = false;
    dec.attack = null; cpu.vx *= 0.6; applyPhysics(cpu); return;
  }

  const diffCfg = DIFFICULTY[gs.difficulty] || DIFFICULTY.easy;
  const agg = diffCfg.aggression || 0.5;
  const legBoost = gs.difficulty === "legendary" ? 1.62 : 1.0;
  cpu.vx = dec.move !== 0 ? dec.move * WALK_SPD * (0.75 + agg * 0.4) * legBoost : cpu.vx * 0.65;
  if (dec.jumping && onGround) cpu.vy = JUMP_VY;
  cpu.state = !onGround ? "jump" : Math.abs(cpu.vx) > 0.6 ? "walk" : "idle";
  applyPhysics(cpu);
}

// ═══════════════════════════════════════════════════════════════
// PLAYER UPDATE
// ═══════════════════════════════════════════════════════════════
function doAttack(f, type) {
  f.state = "attack"; f.attackType = type;
  // Rage mode: shorten startup at low HP for player
  const rageBoost = f.hp <= 25 && f.name !== "CPU" ? 0.85 : 1;
  f.stateTimer = Math.ceil(ATK[type].dur * rageBoost);
  f.hitActive = false; f.hitDone = false;
}

function updatePlayer(f, keys) {
  f.stateTimer = Math.max(0, f.stateTimer - 1);
  f.animTick++;
  if (f.state === "ko") { applyPhysics(f); return; }
  const onGround = f.y >= GROUND - 1;

  // Reset air attack when landing
  if (onGround) f.airAttackUsed = false;

  if (f.state === "hit") {
    if (f.stateTimer <= 0) f.state = "idle";
    f.vx *= 0.75; applyPhysics(f); return;
  }
  if (f.state === "attack") {
    const a = ATK[f.attackType], elapsed = a.dur - f.stateTimer;
    f.hitActive = elapsed >= a.startup && elapsed < a.startup + a.active;
    if (f.stateTimer <= 0) { f.state = "idle"; f.attackType = null; f.hitActive = false; f.hitDone = false; }
    f.vx *= 0.6; applyPhysics(f); return;
  }

  const pL = keys.has(PK.left), pR = keys.has(PK.right), pU = keys.has(PK.up) || keys.has(PK.altUp);
  const pP = keys.has(PK.punch), pK = keys.has(PK.dash), pS = keys.has(PK.special), pB = keys.has(PK.block);

  if (pB && onGround && !pP && !pK && !pS) { f.state = "block"; f.vx *= 0.6; applyPhysics(f); return; }

  // ── Finisher: ↑ + A + D when enemy HP < 10 and meter full ──
  // (triggered via gs in updateGS, not here directly)

  // ── Taunt: T key ──
  if (keys.has(PK.taunt) && f.state === "idle" && f.tauntCooldown <= 0) {
    f.tauntTimer = 40; f.tauntCooldown = 180;
    f.personality = TAUNT_MSGS[Math.floor(Math.random() * TAUNT_MSGS.length)];
    f.personalityTimer = 80;
  }
  if (f.tauntCooldown > 0) f.tauntCooldown--;
  if (f.tauntTimer > 0) { f.tauntTimer--; f.state = "idle"; f.vx = 0; applyPhysics(f); return; }

  // ── Super Move: ↑ + Special while meter is full ──
  if (pU && pS && f.superMeter >= SUPER_MAX && onGround) {
    f.state = "attack"; f.attackType = "super";
    f.stateTimer = ATK.super.dur; f.hitActive = false; f.hitDone = false;
    f.superMeter = 0;
    f.vx *= 0.4; applyPhysics(f); return;
  }

  // ── Track player behavior for Legendary AI ──
  // (gs not available here; tracking done in updateGS)

  // ── Air attacks (one per jump) ──
  if (!onGround && !f.airAttackUsed) {
    if      (pK) { doAttack(f, "airkick");  f.airAttackUsed = true; }
    else if (pP) { doAttack(f, "airpunch"); f.airAttackUsed = true; }
  }

  // ── Ground attacks ──
  const pHK = keys.has(PK.heavykick);
  if      (f.state !== "attack" && pS && onGround) doAttack(f, "special");
  else if (f.state !== "attack" && pHK && onGround) doAttack(f, "heavykick");
  else if (f.state !== "attack" && pK && onGround) doAttack(f, "dash");
  else if (f.state !== "attack" && pP && onGround) doAttack(f, "punch");

  if (f.state === "attack") { f.vx *= 0.6; applyPhysics(f); return; }
  if      (pL) f.vx = -WALK_SPD;
  else if (pR) f.vx =  WALK_SPD;
  else         f.vx *= 0.65;
  if (pU && onGround) f.vy = JUMP_VY;
  f.state = !onGround ? "jump" : Math.abs(f.vx) > 0.6 ? "walk" : "idle";
  applyPhysics(f);
}

function tickCPUAttack(f) {
  if (f.state !== "attack") return;
  f.stateTimer = Math.max(0, f.stateTimer - 1); f.animTick++;
  const a = ATK[f.attackType], elapsed = a.dur - f.stateTimer;
  f.hitActive = elapsed >= a.startup && elapsed < a.startup + a.active;
  if (f.stateTimer <= 0) { f.state = "idle"; f.attackType = null; f.hitActive = false; f.hitDone = false; }
}

// ═══════════════════════════════════════════════════════════════
// HIT DETECTION
// ═══════════════════════════════════════════════════════════════
function testHit(gs, atk, def) {
  if (atk.state !== "attack" || !atk.hitActive || atk.hitDone || def.state === "ko") return;
  const a = ATK[atk.attackType];
  const dx = def.x - atk.x;
  const missed = Math.abs(dx) >= a.rng || (Math.sign(dx) !== atk.facing && Math.abs(dx) >= FW * 0.6);
  // Near-miss slow motion: within 90% of range but still missed
  if (missed) {
    if (Math.abs(dx) < a.rng * 1.18 && Math.abs(dx) >= a.rng && gs.slowMotionFrames <= 0 && Math.random() < 0.45) {
      gs.slowMotionFrames = 6;
    }
    return;
  }
  atk.hitDone = true;
  const hx = (atk.x + def.x) / 2, hy = def.y - FH * 0.6;

  // ── Last-second dodge (5% chance when HP < 20) ──
  if (def.hp <= 20 && def.hp > 0 && Math.random() < 0.07 && gs.tick - def.lastDodge > 90) {
    def.lastDodge = gs.tick;
    def.vx = -def.facing * 7;
    gs.announce = { text: "DODGED!", sub: null, ttl: 40 };
    gs.particles.push(...mkParticles(def.x, def.y - FH*0.5, def.color, 12));
    // Near-miss slow motion
    gs.slowMotionFrames = 10;
    gs.shakeFrames = 5; gs.shakeIntensity = 3;
    // Crowd reacts
    if (gs.crowdReactions) gs.crowdReactions.push({ text: "WHAT A DODGE!", x: CW/2, y: CH/2 - 60, life: 1, decay: 0.018, col: "#00ffcc" });
    return;
  }

  if (def.state === "block") {
    gs.particles.push(...mkParticles(hx, hy, "#ffffff", 10));
    atk.superMeter = Math.min(SUPER_MAX, atk.superMeter + 8);
    gs.hitStopFrames = 3;
    return;
  }

  const now = gs.tick;
  atk.comboCount = now - def.lastHitTick <= COMBO_TICKS ? Math.min(atk.comboCount + 1, 9) : 1;
  def.lastHitTick = now;

  const rageMulti  = atk.hp <= 25 ? 1.15 : 1.0;
  const legDmgBoost = gs && gs.difficulty === 'legendary' && atk === gs.fighters[1] ? 1.22 : 1.0;
  const tauntBonus = atk.tauntCooldown > 0 && atk.tauntCooldown < 150 ? 1.20 : 1.0; // bonus after taunting
  const comboBonus = atk.comboCount >= 3 ? 1.35 : atk.comboCount >= 2 ? 1.18 : 1;
  const isCrit     = Math.random() < (atk.hp <= 30 ? 0.16 : 0.08); // rage = higher crit chance
  const isFinisher = atk.attackType === "finisher";
  const isSuper    = atk.attackType === "super";
  const isSpecial  = atk.attackType === "special";
  const dmg        = a.dmg * comboBonus * rageMulti * tauntBonus * (isCrit ? 1.75 : 1) * legDmgBoost;

  def.hp    = Math.max(0, def.hp - dmg);
  if (def === gs.fighters[0]) gs.playerTookDamage = true;
  def.vx    = atk.facing * a.kb * (isCrit ? 1.4 : 1);
  def.vy    = isFinisher ? -7 : -3.5;
  def.state = "hit"; def.stateTimer = a.stun * (isCrit ? 1.3 : 1);

  // ── Stun gauge ──
  const stunGain = isSuper ? 40 : isSpecial ? 28 : isFinisher ? 55 : isCrit ? 24 : 14;
  def.stunGauge  = Math.min(100, (def.stunGauge || 0) + stunGain);
  if (def.stunGauge >= 100 && !def.stunned && def.hp > 0) {
    def.stunned   = true;
    def.stunFrames = 110;
    def.stunGauge  = 0;
    def.state      = "hit";
    def.stateTimer = 110;
    gs.announce    = { text: "STUNNED!", sub: null, ttl: 55 };
  }

  // ── Super meter fill ──
  atk.superMeter = Math.min(SUPER_MAX, atk.superMeter + dmg * SUPER_FILL_DMG);
  def.superMeter = Math.min(SUPER_MAX, def.superMeter + dmg * SUPER_FILL_TAKEN);

  // ── Floating damage number ──
  const numColor = isCrit ? "#ffffff" : isFinisher ? "#ff6600" : isSuper ? "#ffdd00" : isSpecial ? "#ff00ff" : atk.color;
  if (!def.dmgNumbers) def.dmgNumbers = [];
  def.dmgNumbers.push({
    val: Math.round(dmg), x: def.x, y: def.y - FH - 10,
    vy: -2.2, life: 1, crit: isCrit, finisher: isFinisher
  });

  // ── Hit stop ──
  gs.hitStopFrames = isFinisher ? 10 : isSuper ? 8 : isSpecial ? 5 : isCrit ? 6 : 2;

  // ── Particles ──
  const pc = isCrit ? "#ffffff" : isFinisher ? "#ff6600" : isSuper ? "#ffdd00" : isSpecial ? "#ff00ff" : atk.color;
  gs.particles.push(...mkParticles(hx, hy, pc, isFinisher ? 18 : isCrit ? 12 : isSuper ? 14 : 8));

  // ── Announcements ──
  if (isCrit && !isFinisher)  gs.announce = { text: "CRITICAL!", sub: `${Math.round(dmg)} DMG`, ttl: 55 };
  if (isFinisher) gs.announce = { text: "FINISHER!!", sub: `${Math.round(dmg)} DMG`, ttl: 80 };

  // ── Clutch mechanic: both low HP → both deal more ──
  const bothLow = atk.hp <= 18 && def.hp <= 18 && def.hp > 0;
  if (bothLow) { def.hp = Math.max(0, def.hp - dmg * 0.25); } // extra 25% dmg

  // ── Crowd reactions ──
  if (!gs.crowdReactions) gs.crowdReactions = [];
  if (isFinisher || isSuper) {
    gs.crowdReactions.push({ text: CROWD_MSGS[Math.floor(Math.random()*CROWD_MSGS.length)], x: 80 + Math.random()*640, y: GROUND - 20 - Math.random()*30, life: 1, decay: 0.014, col: "#ffdd00" });
  } else if (isCrit || atk.comboCount >= 3) {
    gs.crowdReactions.push({ text: CROWD_MSGS[Math.floor(Math.random()*CROWD_MSGS.length)], x: 80 + Math.random()*640, y: GROUND - 20 - Math.random()*30, life: 1, decay: 0.02, col: "#ff8800" });
  }
  if (def.hp <= 10 && def.hp > 0) {
    gs.crowdReactions.push({ text: "FINISH HIM!", x: CW/2, y: CH/2 - 55, life: 1, decay: 0.012, col: "#ff0000" });
  }

  // ── Fighter personality messages ──
  const msgs = atk.comboCount >= 3 ? COMBO_MSGS : BLOCK_MSGS;
  if (Math.random() < 0.35) {
    atk.personality = atk.comboCount >= 3 ? COMBO_MSGS[Math.floor(Math.random()*COMBO_MSGS.length)] : TAUNT_MSGS[Math.floor(Math.random()*TAUNT_MSGS.length)];
    atk.personalityTimer = 55;
  }

  // ── Flash + shake ──
  gs.flashFrames  = isFinisher ? 20 : isSuper ? 14 : isCrit ? 12 : 7;
  if (isFinisher)  { gs.shakeFrames = 24; gs.shakeIntensity = 14; gs.slowMotionFrames = 10; }
  else if (isSuper){ gs.shakeFrames = 18; gs.shakeIntensity = 10; gs.slowMotionFrames = 10; }
  else if (isSpecial) { gs.shakeFrames = 9;  gs.shakeIntensity = 5; }
  else if (isCrit)    { gs.shakeFrames = 10; gs.shakeIntensity = 7; gs.slowMotionFrames = 8; }

  // ── Cinematic KO check ──
  if (def.hp <= 0 && !gs.cinematicKO) {
    gs.cinematicKO       = true;
    gs.cinematicKOTimer  = 40;
    gs.slowMotionFrames  = 32;
    gs.shakeFrames       = 18;
    gs.shakeIntensity    = 10;
    // Big particle burst
    gs.particles.push(...mkParticles(def.x, def.y - FH*0.5, pc, 28));
    gs.particles.push(...mkParticles(def.x, def.y - FH*0.5, "#ffffff", 8));
    // Expanding shockwave rings
    if (!gs.koRings) gs.koRings = [];
    gs.koRings.push({ x: def.x, y: GROUND, r: 0, maxR: 130, life: 1, col: pc });
    gs.koRings.push({ x: def.x, y: GROUND, r: 0, maxR: 80,  life: 1, col: "#ffffff", delay: 8 });
    // Announce
    gs.announce = { text: "K.O.!", sub: `${atk.name} WINS!`, ttl: 9999 };
  }
}

// ── Clash detection ──────────────────────────────────────────
function testClash(gs) {
  const [p, cpu] = gs.fighters;
  if (p.state !== "attack" || cpu.state !== "attack") return;
  if (!p.hitActive || !cpu.hitActive) return;
  const dist = Math.abs(p.x - cpu.x);
  if (dist > 80) return;
  // Both attacking at same time and close = CLASH
  p.hitDone = true; cpu.hitDone = true;
  p.vx = -4; cpu.vx = 4; // push apart
  const cx = (p.x + cpu.x) / 2, cy = p.y - FH * 0.6;
  gs.particles.push(...mkParticles(cx, cy, "#ffffff", 14));
  gs.particles.push(...mkParticles(cx, cy, "#ffaa00", 10));
  gs.shakeFrames = 14; gs.shakeIntensity = 8;
  gs.hitStopFrames = 7;
  gs.flashFrames = 10;
  gs.announce = { text: "CLASH!", sub: null, ttl: 50 };
  // Shockwave ring stored as special particle type
  gs.clashParticles = [{ x: cx, y: cy, r: 5, life: 1, decay: 0.04 }];
}

// ═══════════════════════════════════════════════════════════════
// MAIN UPDATE
// ═══════════════════════════════════════════════════════════════
function updateGS(gs, keys) {
  // ── Hit stop: freeze everything ──
  if (gs.hitStopFrames > 0) { gs.hitStopFrames--; return; }

  // ── Slow motion: skip every other tick ──
  const isSlowMo = gs.slowMotionFrames > 0;
  if (isSlowMo) {
    gs.slowMotionFrames--;
    if (gs.tick % 2 !== 0) { gs.tick++; tickParticles(gs); return; }
  }

  gs.tick++;
  const [player, cpu] = gs.fighters;

  // ── Camera zoom: get closer when fighters are near ──
  if (gs.phase === "fight" || gs.phase === "ko") {
    const fdist = Math.abs(player.x - cpu.x);
    gs.cameraZoomTarget = fdist < 110 ? 1.12 : fdist < 160 ? 1.06 : 1.0;
    gs.cameraZoom += (gs.cameraZoomTarget - gs.cameraZoom) * 0.05;
    gs.cameraZoom = Math.min(1.18, Math.max(0.98, gs.cameraZoom));
  }

  // ── Tick damage numbers ──
  gs.fighters.forEach(f => {
    if (!f.dmgNumbers) return;
    f.dmgNumbers = f.dmgNumbers
      .map(n => ({ ...n, y: n.y + n.vy, vy: n.vy * 0.93, life: n.life - 0.022 }))
      .filter(n => n.life > 0);
  });

  // ── Tick clash shockwave ──
  if (gs.clashParticles) {
    gs.clashParticles = gs.clashParticles
      .map(p => ({ ...p, r: p.r + 4.5, life: p.life - p.decay }))
      .filter(p => p.life > 0);
  }

  // ── Track player behavior for Legendary AI ──
  if (gs.phase === "fight" && keys.has(PK.punch)) gs.playerBehavior.punchCount = Math.min(9, (gs.playerBehavior.punchCount || 0) + 0.05);
  if (gs.phase === "fight" && keys.has(PK.block)) gs.playerBehavior.blockCount = Math.min(9, (gs.playerBehavior.blockCount || 0) + 0.05);
  else gs.playerBehavior.blockCount = Math.max(0, (gs.playerBehavior.blockCount || 0) - 0.01);

  // ── Stun tick ──
  gs.fighters.forEach(f => {
    if (f.stunned) {
      f.stunFrames--;
      if (f.stunFrames <= 0) { f.stunned = false; f.stunGauge = 0; }
    } else {
      f.stunGauge = Math.max(0, (f.stunGauge || 0) - 0.18); // drain slowly
    }
  });

  if (gs.phase === "countdown") {
    gs.cdFrames--;
    if (gs.cdFrames <= 0) {
      gs.cdVal--;
      gs.cdFrames = gs.cdVal > 0 ? 60 : 0;
      if (gs.cdVal <= 0) { gs.phase = "fight"; gs.announce = { text: "FIGHT!", sub: null, ttl: 75 }; }
    }
    return;
  }

  if (gs.phase === "ko") {
    gs.cdFrames--;
    if (gs.cdFrames <= 0) {
      const loser  = player.hp <= 0 ? 0 : cpu.hp <= 0 ? 1 : -1;
      const winner = loser === 0 ? 1 : loser === 1 ? 0 : (player.hp >= cpu.hp ? 0 : 1);
      // Perfect round check
      if (winner === 0 && !gs.playerTookDamage) {
        gs.crowdReactions = gs.crowdReactions || [];
        gs.crowdReactions.push({ text: "✨ PERFECT ROUND! ✨", x: CW/2, y: CH/2 - 80, life: 1, decay: 0.008, col: "#00ffcc" });
        gs.flashFrames = 30;
      }
      gs.wins[winner]++;
      gs.streakWins = winner === 0 ? (gs.streakWins || 0) + 1 : 0;
      if (gs.wins[winner] >= WINS_NEEDED) gs.phase = "results";
      else { gs.round++; beginRound(gs); }
    }
    tickParticles(gs); if (gs.flashFrames > 0) gs.flashFrames--; return;
  }

  if (gs.phase !== "fight") return;
  if (gs.announce) { gs.announce.ttl--; if (gs.announce.ttl <= 0) gs.announce = null; }

  gs.timerFrames++;
  if (gs.timerFrames >= 60) {
    gs.timerFrames = 0; gs.timer = Math.max(0, gs.timer - 1);
    if (gs.timer <= 0) {
      const w = player.hp > cpu.hp ? player : cpu.hp > player.hp ? cpu : null;
      gs.phase = "ko"; gs.cdFrames = 180;
      gs.announce = { text: "TIME!", sub: w ? `${w.name} WINS!` : "DRAW!", ttl: 9999 }; return;
    }
  }

  updatePlayer(player, keys);

  // ── CPU auto-taunts ──
  if (gs.cpuTauntCd > 0) gs.cpuTauntCd--;
  if (gs.cpuTauntCd <= 0 && cpu.state === "idle" && Math.random() < 0.004) {
    const cpuTaunts = ["You're pathetic!","Come on!","Is that it?","Too easy!","Embarrassing.","I'm bored.","Try harder."];
    cpu.personality = cpuTaunts[Math.floor(Math.random() * cpuTaunts.length)];
    cpu.personalityTimer = 70;
    gs.cpuTauntCd = 240;
  }

  if      (cpu.state === "hit")    { cpu.stateTimer = Math.max(0, cpu.stateTimer - 1); cpu.animTick++; if (cpu.stateTimer <= 0) cpu.state = "idle"; cpu.vx *= 0.75; applyPhysics(cpu); }
  else if (cpu.state === "attack") { tickCPUAttack(cpu); applyPhysics(cpu); updateCPU(gs); }
  else                             { updateCPU(gs); applyCPUDecision(gs); }

  if (player.state !== "ko" && cpu.state !== "ko") {
    if (player.x < cpu.x) { player.facing = 1; cpu.facing = -1; }
    else                   { player.facing = -1; cpu.facing = 1; }
  }

  // ── Clash detection ──
  testClash(gs);
  testHit(gs, player, cpu);
  testHit(gs, cpu, player);
  tickParticles(gs);
  if (gs.flashFrames > 0) gs.flashFrames--;
  if (gs.shakeFrames > 0) gs.shakeFrames--;

  // ── FINISH HIM: show prompt when enemy HP < 10 ──
  if (cpu.hp > 0 && cpu.hp <= 10 && !gs.finishHimShown && player.superMeter >= SUPER_MAX * 0.5) {
    gs.finishHimShown = true;
    gs.announce = { text: "FINISH HIM!", sub: "↑+A+D for FINISHER", ttl: 120 };
  }

  // ── Player finisher input ──
  if (keys.has(PK.up) && keys.has(PK.punch) && keys.has(PK.special) && cpu.hp <= 10 && player.superMeter >= SUPER_MAX * 0.5 && player.state !== "attack") {
    player.state = "attack"; player.attackType = "finisher";
    player.stateTimer = ATK.finisher.dur; player.hitActive = false; player.hitDone = false;
    player.superMeter = 0;
  }

  if ((player.hp <= 0 || cpu.hp <= 0) && gs.phase === "fight") {
    if (player.hp <= 0) player.state = "ko";
    if (cpu.hp     <= 0) cpu.state = "ko";
    const w = player.hp > 0 ? player : cpu.hp > 0 ? cpu : null;
    gs.phase = "ko"; gs.cdFrames = 200;
    gs.announce = { text: "K.O.!", sub: w ? `${w.name} WINS!` : "DRAW!", ttl: 9999 };
  }
}

function tickParticles(gs) {
  gs.particles = gs.particles
    .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.18, life: p.life - p.decay }))
    .filter(p => p.life > 0);
  if (gs.crowdReactions) {
    gs.crowdReactions = gs.crowdReactions
      .map(r => ({ ...r, y: r.y - 0.4, life: r.life - r.decay }))
      .filter(r => r.life > 0)
      .slice(-4);
  }
  if (gs.koRings) {
    gs.koRings = gs.koRings
      .map(r => {
        if (r.delay > 0) return { ...r, delay: r.delay - 1 };
        return { ...r, r: r.r + 7, life: r.life - 0.045 };
      })
      .filter(r => r.life > 0);
  }
  gs.fighters.forEach(f => { if (f.personalityTimer > 0) f.personalityTimer--; });
}

// ═══════════════════════════════════════════════════════════════
// DRAWING
// ═══════════════════════════════════════════════════════════════
function drawBG(ctx, tick, gs) {
  const isKO = gs && gs.phase === "ko";
  const excitement = gs && gs.fighters && gs.fighters.some(f => f.comboCount >= 3);

  // ── SKY: deep twilight purple-green (visible, moody) ──
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0,    isKO ? "#1a0520" : "#0f1a2e");
  sky.addColorStop(0.35, isKO ? "#2a0a10" : "#112238");
  sky.addColorStop(0.7,  isKO ? "#1a1005" : "#0d2418");
  sky.addColorStop(1,    isKO ? "#200808" : "#0a1a10");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, GROUND);

  // ── FULL MOON — bright and big ──
  const moonX = 660, moonY = 58;
  // Outer glow
  const mg = ctx.createRadialGradient(moonX, moonY, 18, moonX, moonY, 90);
  mg.addColorStop(0,   "rgba(255,245,180,0.28)");
  mg.addColorStop(0.4, "rgba(220,210,130,0.10)");
  mg.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = mg; ctx.fillRect(moonX-90, moonY-90, 180, 180);
  // Moon disc
  ctx.beginPath(); ctx.arc(moonX, moonY, 28, 0, Math.PI*2);
  ctx.fillStyle = "#f0e8a0"; ctx.shadowColor = "#ffe880"; ctx.shadowBlur = 36; ctx.fill();
  // Crater details
  ctx.shadowBlur = 0;
  [[-9,-5,6],[9,7,4],[-2,10,5],[14,-4,3]].forEach(([dx,dy,r])=>{
    ctx.beginPath(); ctx.arc(moonX+dx, moonY+dy, r, 0, Math.PI*2);
    ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fill();
  });
  ctx.shadowBlur = 0;

  // ── STARS — bright, visible ──
  for (let i = 0; i < 55; i++) {
    const sx = (i * 211 + 31) % CW;
    const sy = (i * 67 + 7) % (GROUND * 0.6);
    const blink = 0.4 + 0.55 * Math.abs(Math.sin(tick * 0.018 + i * 1.3));
    ctx.globalAlpha = blink;
    ctx.fillStyle = i%7===0 ? "#ffcc88" : i%5===0 ? "#aaddff" : "#ddeeff";
    const sr = i%11===0 ? 2 : 1.2;
    ctx.fillRect(sx, sy, sr, sr);
  }
  ctx.globalAlpha = 1;

  // ── DARK CLOUDS (visible but translucent) ──
  const cloudPalette = [
    "rgba(30,18,50,0.55)","rgba(20,35,15,0.5)","rgba(40,15,25,0.48)",
    "rgba(15,30,40,0.52)","rgba(25,10,35,0.5)",
  ];
  for (let i = 0; i < 8; i++) {
    const cx = ((i * 137 + tick * (0.1 + i*0.015)) % (CW+150)) - 75;
    const cy = 22 + (i%4)*20;
    const cr = 65 + i*16;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = cloudPalette[i % cloudPalette.length];
    ctx.beginPath(); ctx.ellipse(cx, cy, cr, cr*0.45, 0, 0, Math.PI*2); ctx.fill();
    // Lighter cloud edge
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#8899aa";
    ctx.beginPath(); ctx.ellipse(cx-8, cy-4, cr*0.7, cr*0.22, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ── DISTANT OCEAN / SEA glowing at horizon ──
  const horizonY = GROUND - 120;
  const seaGrad = ctx.createLinearGradient(0, horizonY, 0, horizonY + 55);
  seaGrad.addColorStop(0, "rgba(0,0,0,0)");
  seaGrad.addColorStop(0.4, isKO ? "rgba(110,20,10,0.35)" : "rgba(10,80,120,0.35)");
  seaGrad.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = seaGrad; ctx.fillRect(0, horizonY, CW, 55);

  // Sea shimmer lines on horizon
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const lx = (i * 170 + tick * 0.4) % CW;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = isKO ? "#aa3322" : "#44aacc";
    ctx.fillRect(lx, horizonY + 20 + i*4, 50 + i*20, 1.5);
  }
  ctx.restore();

  // ── BACKGROUND FOREST ROW (mid-distance, clearly visible) ──
  // Draw with green-tinted silhouettes so you can clearly see it's a forest
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const tx = i * 48 + (i%2)*12;
    const th = 95 + (i%5)*22;
    const tw = 28 + (i%3)*8;
    const treeCol = i%3===0 ? "#0d3018" : i%3===1 ? "#0a2812" : "#112a10";
    ctx.fillStyle = treeCol;
    ctx.shadowColor = "#113322"; ctx.shadowBlur = 6;
    // Double-triangle pine shape
    ctx.beginPath();
    ctx.moveTo(tx + tw*0.5, GROUND - th);
    ctx.lineTo(tx,          GROUND - th*0.48);
    ctx.lineTo(tx + tw,     GROUND - th*0.48);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx + tw*0.5, GROUND - th*0.62);
    ctx.lineTo(tx - 6,      GROUND - th*0.18);
    ctx.lineTo(tx + tw + 6, GROUND - th*0.18);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx + tw*0.5, GROUND - th*0.3);
    ctx.lineTo(tx - 4,      GROUND - th*0.02);
    ctx.lineTo(tx + tw + 4, GROUND - th*0.02);
    ctx.closePath(); ctx.fill();
    // Trunk
    ctx.fillStyle = "#0a1a0a";
    ctx.fillRect(tx + tw*0.5 - 3, GROUND - th*0.02, 6, th*0.02 + 4);
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── LARGE FOREGROUND TREES — thick, dark, detailed ──
  [[0,-1],[CW,1]].forEach(([edgeX, side]) => {
    for (let t = 0; t < 4; t++) {
      const tx = edgeX - side*(t*50 + 10);
      const th = 220 - t*35;
      const tw = 42 - t*7;
      const alpha = 0.92 - t*0.12;
      ctx.save(); ctx.globalAlpha = alpha;
      // Trunk — twisted brown-black
      ctx.strokeStyle = t===0 ? "#1a0f08" : "#120a05";
      ctx.lineWidth = 22 - t*4; ctx.lineCap = "round";
      ctx.shadowColor = "#000"; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(tx, GROUND+2);
      ctx.quadraticCurveTo(tx + side*18, GROUND - th*0.45, tx + side*8, GROUND - th);
      ctx.stroke();
      // Bark texture lines
      ctx.strokeStyle = "rgba(80,40,10,0.25)"; ctx.lineWidth = 2; ctx.shadowBlur = 0;
      for (let b=0; b<3; b++) {
        ctx.beginPath();
        ctx.moveTo(tx + side*b*4, GROUND - th*0.1 - b*40);
        ctx.lineTo(tx + side*(b*4+8), GROUND - th*0.25 - b*40);
        ctx.stroke();
      }
      // Pine canopy layers — green-dark visible
      [1.0, 0.68, 0.42, 0.22].forEach((yf, li) => {
        const lw = (tw + li*8) * (1.3 - li*0.15);
        const ly  = GROUND - th * yf;
        const col = li===0 ? "#0e2a12" : li===1 ? "#112e14" : li===2 ? "#143318" : "#1a3d1c";
        ctx.fillStyle = col; ctx.shadowColor = "#000"; ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(tx + side*8, ly - 22);
        ctx.lineTo(tx + side*8 - lw, ly + 28);
        ctx.lineTo(tx + side*8 + lw*0.4, ly + 28);
        ctx.closePath(); ctx.fill();
        // Highlight edge on canopy
        ctx.globalAlpha = alpha * 0.2;
        ctx.fillStyle = "#44aa44";
        ctx.beginPath();
        ctx.moveTo(tx + side*8 - lw + 4, ly + 8);
        ctx.lineTo(tx + side*8 - lw * 0.4, ly - 16);
        ctx.lineTo(tx + side*8 - lw * 0.2, ly + 8);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = alpha;
      });
      ctx.restore();
    }
  });

  // ── HANGING VINES — visible ropes from tree canopies ──
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const vx = 65 + i * 148;
    const vlen = 55 + (i%3)*35;
    const sway = Math.sin(tick*0.012 + i*1.4) * 10;
    ctx.strokeStyle = `rgba(20,55,15,${0.55 + i%2*0.15})`;
    ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.shadowColor = "#113300"; ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(vx, 0);
    ctx.quadraticCurveTo(vx + sway, vlen*0.5, vx + sway*1.5, vlen);
    ctx.stroke();
    // Leaves on vine
    for (let l=0; l<3; l++) {
      const lp = 0.25 + l*0.3;
      const lx = vx + sway*lp*1.5;
      const ly = vlen * lp;
      ctx.fillStyle = "#1a4a18"; ctx.shadowColor = "#113300"; ctx.shadowBlur = 5;
      ctx.beginPath(); ctx.ellipse(lx+6, ly, 7, 4, 0.4, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.shadowBlur = 0; ctx.restore();

  // ── FIREFLIES — bright glowing, clearly visible ──
  for (let i = 0; i < 16; i++) {
    const ft  = tick * 0.022 + i * 2.0;
    const fx  = 80 + i * 48 + Math.sin(ft + i*0.8) * 32;
    const ffy = GROUND - 40 - Math.abs(Math.sin(ft*0.65 + i*0.5)) * 100;
    const fc  = i%4===0 ? "#66ff88" : i%4===1 ? "#aaccff" : i%4===2 ? "#ffee66" : "#88ffcc";
    const fa  = 0.55 + 0.45*Math.abs(Math.sin(ft*1.1));
    ctx.save();
    ctx.globalAlpha = fa;
    ctx.fillStyle = fc; ctx.shadowColor = fc; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(fx, ffy, 3, 0, Math.PI*2); ctx.fill();
    // Glow trail
    ctx.globalAlpha = fa * 0.3;
    ctx.beginPath(); ctx.arc(fx, ffy, 7, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // ── MIST at ground level — visible green-grey ──
  for (let i = 0; i < 7; i++) {
    const mx = ((i*155 + tick*0.15) % (CW+200)) - 100;
    const mg2 = ctx.createRadialGradient(mx, GROUND-8, 0, mx, GROUND-8, 110+i*18);
    mg2.addColorStop(0,   isKO ? "rgba(60,10,10,0.38)" : "rgba(20,45,25,0.38)");
    mg2.addColorStop(0.6, isKO ? "rgba(40,5,5,0.15)"  : "rgba(12,30,18,0.15)");
    mg2.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = mg2; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.ellipse(mx, GROUND-8, 120+i*14, 28, 0, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── FLOOR ──
  const floorG = ctx.createLinearGradient(0, GROUND, 0, CH);
  floorG.addColorStop(0,   isKO ? "#1c0808" : "#0c1a10");
  floorG.addColorStop(0.5, isKO ? "#110505" : "#080f0a");
  floorG.addColorStop(1,   "#05080a");
  ctx.fillStyle = floorG; ctx.fillRect(0, GROUND, CW, CH-GROUND);

  // Wet ground reflection ripples
  for (let i = 0; i < 6; i++) {
    const rx = (i*130 + tick*0.25) % CW;
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = isKO ? "#552211" : "#224433";
    ctx.fillRect(rx, GROUND, 70, CH-GROUND);
  }
  ctx.globalAlpha = 1;

  // Ground line — glowing
  ctx.save();
  ctx.shadowColor = isKO ? "#661122" : "#224422";
  ctx.shadowBlur = 22;
  ctx.strokeStyle = isKO ? "#442211" : "#1a3a1a";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(CW, GROUND); ctx.stroke();
  ctx.restore();

  // ── LIGHTNING FLASH on KO ──
  if (isKO && Math.floor(tick/20) % 8 === 0) {
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, CW, CH);
    ctx.globalAlpha = 1;
    // Lightning bolt
    if (Math.floor(tick/20) % 16 === 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,180,0.7)"; ctx.lineWidth = 2; ctx.shadowColor="#ffffaa"; ctx.shadowBlur=18;
      const lx = 200 + Math.random()*400;
      ctx.beginPath(); ctx.moveTo(lx,0);
      ctx.lineTo(lx-15, 50); ctx.lineTo(lx+8, 80); ctx.lineTo(lx-10, 130); ctx.stroke();
      ctx.restore();
    }
  }

  // ── CRT grain overlay ──
  ctx.globalAlpha = 0.022;
  for (let sy=0; sy<CH; sy+=3) { ctx.fillStyle="#000"; ctx.fillRect(0,sy,CW,1.5); }
  ctx.globalAlpha = 1;
}

function drawFighter(ctx, f, tick) {
  const { x, y, facing: dir, state, stateTimer, attackType, color, glow, animTick } = f;
  const onGround = y >= GROUND - 2;
  const bob = state === "idle" ? Math.sin(animTick * 0.055) * 2.5 : 0;
  const fy  = y + bob; // idle breathing bob
  ctx.save();

  // ── DROP SHADOW ──
  const ss = state === "jump" ? Math.max(0.15, 1 - (GROUND - y) / 150) : 1;
  ctx.globalAlpha = 0.22 * ss; ctx.fillStyle = "#000000";
  ctx.beginPath(); ctx.ellipse(x, GROUND + 5, 30 * ss, 8 * ss, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  if (state === "hit") ctx.globalAlpha = tick % 6 > 3 ? 0.25 : 1;
  ctx.shadowColor = glow; ctx.shadowBlur = state === "attack" ? 36 : state === "block" ? 24 : 16;

  // ── KO POSE ──────────────────────────────────────────────────
  if (state === "ko") {
    ctx.save(); ctx.globalAlpha *= 0.65;
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 20;
    // Flat body
    ctx.beginPath(); ctx.ellipse(x, fy - 12, FH * 0.46, FW * 0.24, 0.1 * dir, 0, Math.PI * 2); ctx.fill();
    // Head on side
    ctx.beginPath(); ctx.arc(x + dir * (-FH * 0.33), fy - FW * 0.2, 15, 0, Math.PI * 2); ctx.fill();
    // Legs splayed
    ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x - 8, fy - 6); ctx.quadraticCurveTo(x - 20, fy + 8, x - 34, fy - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 8, fy - 6); ctx.quadraticCurveTo(x + 22, fy + 10, x + 30, fy + 2); ctx.stroke();
    // Arms out
    ctx.beginPath(); ctx.moveTo(x - 14, fy - 18); ctx.lineTo(x - 36, fy - 28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 10, fy - 18); ctx.lineTo(x + 32, fy - 8); ctx.stroke();
    // Hollow skull eyes (dark circles with red irises)
    const hx2 = x + dir * (-FH * 0.33), hy2 = fy - FW * 0.2;
    // Dark eye sockets
    ctx.fillStyle = "#000000"; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.ellipse(hx2-4, hy2-1, 5.5, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx2+4, hy2-1, 5.5, 4, 0, 0, Math.PI*2); ctx.fill();
    // Red glowing irises
    ctx.fillStyle = "#cc0000"; ctx.shadowColor = "#ff0000"; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(hx2-4, hy2-1, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx2+4, hy2-1, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    // Gaping horrified mouth
    ctx.fillStyle = "#000000";
    ctx.beginPath(); ctx.ellipse(hx2, hy2+6, 7, 5, 0, 0, Math.PI*2); ctx.fill();
    // Teeth in mouth
    ctx.fillStyle = "#cccccc";
    for (let t = 0; t < 3; t++) {
      ctx.beginPath(); ctx.rect(hx2 - 5 + t*4, hy2+2, 3, 4); ctx.fill();
    }
    // Sweat drops of fear
    ctx.fillStyle = "#3399ff"; ctx.globalAlpha = 0.7;
    [[hx2-14, hy2-8, tick*0.09],[hx2+14, hy2-4, tick*0.12+1]].forEach(([sx,sy,st])=>{
      const sdrip = Math.abs(Math.sin(st)) * 5;
      ctx.beginPath(); ctx.ellipse(sx, sy + sdrip, 2, 3.5, 0, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 0.9;
    // Spinning skull/ghost icons instead of stars
    for (let i = 0; i < 4; i++) {
      const a2 = tick * 0.08 + i * (Math.PI * 2 / 4);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = i%2===0 ? "#ffffff" : "#cc8800";
      ctx.shadowColor = i%2===0 ? "#aaaaff" : "#ffaa00"; ctx.shadowBlur = 10;
      ctx.font = `${9 + (i%2)*2}px serif`;
      ctx.textAlign = "center";
      ctx.fillText(i%2===0 ? "💀" : "⭐", x + Math.cos(a2)*28, fy - FH*0.78 + Math.sin(a2)*10);
    }
    ctx.restore(); return;
  }

  // ── ENERGY AURA (low hp) ─────────────────────────────────────
  if (f.hp <= 25 && state !== "ko") {
    const ap = 0.12 + 0.1 * Math.abs(Math.sin(tick * 0.14));
    ctx.save(); ctx.globalAlpha = ap;
    const ag = ctx.createRadialGradient(x, fy - FH*0.5, 8, x, fy - FH*0.5, 44);
    ag.addColorStop(0, "#ff2200"); ag.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.ellipse(x, fy - FH*0.5, 44, 52, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ── BLOCK SHIELD ─────────────────────────────────────────────
  if (state === "block") {
    ctx.save();
    // Multi-layer hex shield
    for (let sl = 0; sl < 3; sl++) {
      const sr = 44 - sl * 6, salpha = 0.12 + sl * 0.08;
      const sg2 = ctx.createRadialGradient(x + dir*20, fy - FH*0.52, 4, x + dir*20, fy - FH*0.52, sr);
      sg2.addColorStop(0, rgba(color, 0.4 - sl*0.1));
      sg2.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = sg2; ctx.globalAlpha = salpha + 0.6;
      ctx.beginPath(); ctx.ellipse(x + dir*20, fy - FH*0.52, sr, sr + 4, 0, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Arc
    ctx.strokeStyle = color; ctx.lineWidth = 3.5; ctx.shadowColor = color; ctx.shadowBlur = 22;
    ctx.beginPath(); ctx.arc(x + dir*20, fy - FH*0.52, 40, -Math.PI*0.82, Math.PI*0.82); ctx.stroke();
    // Inner ring
    ctx.strokeStyle = rgba(color, 0.4); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x + dir*20, fy - FH*0.52, 32, -Math.PI*0.7, Math.PI*0.7); ctx.stroke();
    ctx.restore();
  }

  // ── LEGS ─────────────────────────────────────────────────────
  const legSwing = state === "walk" ? Math.sin(animTick * 0.28) * 20 : 0;
  const legBend  = !onGround ? 22 : 0;
  const kneeH    = !onGround ? -14 : 0;

  ctx.lineCap = "round";
  // Thighs (thick)
  ctx.strokeStyle = color; ctx.lineWidth = 13; ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(x - 8, fy - FH*0.38);
  ctx.quadraticCurveTo(x - 16 + legSwing, fy - FH*0.19 + kneeH, x - 13 + legSwing + legBend, fy + 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 8, fy - FH*0.38);
  ctx.quadraticCurveTo(x + 16 - legSwing, fy - FH*0.19 + kneeH, x + 13 - legSwing + legBend, fy + 2); ctx.stroke();
  // Shin armor
  ctx.strokeStyle = rgba(color, 0.7); ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(x - 13 + legSwing + legBend, fy + 2);
  ctx.lineTo(x - 10 + legSwing + legBend, fy - FH*0.18 + kneeH + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 13 - legSwing + legBend, fy + 2);
  ctx.lineTo(x + 10 - legSwing + legBend, fy - FH*0.18 + kneeH + 6); ctx.stroke();
  // Boots (wide toe)
  ctx.strokeStyle = rgba(color, 0.5); ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(x - 13 + legSwing + legBend, fy + 2);
  ctx.lineTo(x - 22 + legSwing + legBend, fy + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 13 - legSwing + legBend, fy + 2);
  ctx.lineTo(x + 22 - legSwing + legBend, fy + 4); ctx.stroke();
  // Knee guards
  ctx.fillStyle = rgba(color, 0.55); ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(x - 14 + legSwing + legBend*0.5, fy - FH*0.19 + kneeH, 5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 14 - legSwing + legBend*0.5, fy - FH*0.19 + kneeH, 5, 0, Math.PI*2); ctx.fill();

  // ── TORSO ─────────────────────────────────────────────────────
  ctx.shadowColor = glow; ctx.shadowBlur = 20;
  // Main body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - FW*0.44, fy - FH*0.38);
  ctx.lineTo(x - FW*0.54, fy - FH*0.90);
  ctx.lineTo(x + FW*0.54, fy - FH*0.90);
  ctx.lineTo(x + FW*0.44, fy - FH*0.38);
  ctx.closePath(); ctx.fill();
  // Abdomen divider
  ctx.strokeStyle = rgba(color, 0.4); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - FW*0.42, fy - FH*0.42); ctx.lineTo(x + FW*0.42, fy - FH*0.42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - FW*0.46, fy - FH*0.60); ctx.lineTo(x + FW*0.46, fy - FH*0.60); ctx.stroke();
  // Chest armor plate
  ctx.fillStyle = rgba("#ffffff", 0.13);
  ctx.beginPath();
  ctx.moveTo(x - FW*0.30, fy - FH*0.46);
  ctx.lineTo(x - FW*0.36, fy - FH*0.86);
  ctx.lineTo(x + FW*0.36, fy - FH*0.86);
  ctx.lineTo(x + FW*0.30, fy - FH*0.46);
  ctx.closePath(); ctx.fill();
  // Center emblem glow
  ctx.fillStyle = rgba(color, 0.5); ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(x, fy - FH*0.66, 5, 0, Math.PI*2); ctx.fill();
  // Belt buckle
  ctx.fillStyle = rgba(color, 0.7);
  ctx.beginPath(); rrect(ctx, x-5, fy - FH*0.40, 10, 6, 2); ctx.fill();

  // ── SHOULDER PADS ─────────────────────────────────────────────
  ctx.fillStyle = rgba(color, 0.8); ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.ellipse(x - FW*0.56, fy - FH*0.86, 11, 8, -0.3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + FW*0.56, fy - FH*0.86, 11, 8,  0.3, 0, Math.PI*2); ctx.fill();
  // Shoulder highlight
  ctx.fillStyle = rgba("#ffffff", 0.18);
  ctx.beginPath(); ctx.ellipse(x - FW*0.56, fy - FH*0.88, 7, 4, -0.3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + FW*0.56, fy - FH*0.88, 7, 4,  0.3, 0, Math.PI*2); ctx.fill();

  // ── NECK ──────────────────────────────────────────────────────
  ctx.fillStyle = rgba(color, 0.6);
  ctx.beginPath(); rrect(ctx, x-5, fy - FH*0.95, 10, 8, 3); ctx.fill();

  // ── HEAD ─────────────────────────────────────────────────────
  const headY = fy - FH*0.96 - 18;
  // Helmet base
  ctx.fillStyle = color; ctx.shadowBlur = 22;
  ctx.beginPath(); ctx.arc(x, headY, 18, 0, Math.PI*2); ctx.fill();
  // Helmet top ridge/crest
  ctx.fillStyle = rgba(color, 0.9);
  ctx.beginPath();
  ctx.moveTo(x - 6, headY - 16);
  ctx.lineTo(x - 3, headY - 26);
  ctx.lineTo(x + 3, headY - 26);
  ctx.lineTo(x + 6, headY - 16);
  ctx.closePath(); ctx.fill();
  // Helmet side panels
  ctx.fillStyle = rgba(color, 0.55);
  ctx.beginPath(); ctx.ellipse(x - 16, headY + 2, 5, 9, -0.3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 16, headY + 2, 5, 9,  0.3, 0, Math.PI*2); ctx.fill();
  // Visor (dark with glow)
  ctx.fillStyle = rgba("#000814", 0.82);
  ctx.beginPath(); ctx.ellipse(x + dir*4, headY, 13, 7, dir*0.15, 0, Math.PI*2); ctx.fill();
  // Visor inner glow
  const vg2 = ctx.createLinearGradient(x + dir*4 - 10, headY - 5, x + dir*4 + 10, headY + 3);
  vg2.addColorStop(0, rgba(color, 0.7));
  vg2.addColorStop(1, rgba(color, 0.2));
  ctx.fillStyle = vg2;
  ctx.beginPath(); ctx.ellipse(x + dir*4, headY - 1, 10, 5, dir*0.15, 0, Math.PI*2); ctx.fill();
  // Visor scanline highlight
  ctx.fillStyle = rgba("#ffffff", 0.22);
  ctx.beginPath(); ctx.ellipse(x + dir*4 - 2, headY - 3, 7, 2, dir*0.15, 0, Math.PI*2); ctx.fill();

  ctx.lineWidth = 9;
  if (state === "attack") {
    const a        = ATK[attackType];
    const progress = 1 - stateTimer / a.dur;
    const swing    = Math.sin(Math.min(progress, 0.75) * Math.PI);

    // ── SPECIAL: draw neon energy SWORD ──────────────────────
    if (attackType === "special" || attackType === "airkick") {
      const reach    = swing * (attackType === "airkick" ? 72 : 100);
      const baseY    = y - FH * 0.72;
      const armTipX  = x + dir * (FW * 0.36);
      const armTipY  = baseY;
      const bladeTipX = x + dir * (FW * 0.36 + reach);
      const bladeTipY = baseY - 8 * swing;

      ctx.save();

      // Arm holding sword
      ctx.strokeStyle = color; ctx.lineWidth = 9; ctx.shadowColor = color; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(x + dir * FW * 0.36, y - FH * 0.82); ctx.lineTo(armTipX, armTipY); ctx.stroke();

      // Sword handle (grip)
      const gripLen = 14;
      const gripX1  = armTipX - dir * gripLen * 0.3;
      const gripX2  = armTipX + dir * gripLen * 0.7;
      ctx.strokeStyle = "#888899"; ctx.lineWidth = 6; ctx.shadowColor = "#aaaacc"; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(gripX1, armTipY + 2); ctx.lineTo(gripX2, armTipY - 2); ctx.stroke();

      // Guard (crossguard bar)
      ctx.strokeStyle = "#aaaadd"; ctx.lineWidth = 4; ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(gripX2 - dir * 2, armTipY - 9);
      ctx.lineTo(gripX2 - dir * 2, armTipY + 9);
      ctx.stroke();

      if (reach > 8) {
        // Blade glow layers (outer → inner)
        const bladeStartX = gripX2 + dir * 4;
        const bladeColors = ["rgba(255,0,255,0.15)", "rgba(255,0,255,0.35)", "rgba(255,120,255,0.7)", "#ffffff"];
        const bladeWidths = [14, 8, 4, 2];

        bladeColors.forEach((bc, i) => {
          ctx.beginPath();
          ctx.moveTo(bladeStartX, armTipY - 1);
          ctx.lineTo(bladeTipX, bladeTipY);
          ctx.strokeStyle = bc;
          ctx.lineWidth   = bladeWidths[i];
          ctx.shadowColor = "#ff00ff";
          ctx.shadowBlur  = 30 - i * 6;
          ctx.stroke();
        });

        // Blade tip point
        ctx.beginPath();
        ctx.moveTo(bladeTipX - dir * 4, bladeTipY - 3);
        ctx.lineTo(bladeTipX + dir * 6, bladeTipY);
        ctx.lineTo(bladeTipX - dir * 4, bladeTipY + 3);
        ctx.closePath();
        ctx.fillStyle   = "#ffffff";
        ctx.shadowColor = "#ff00ff";
        ctx.shadowBlur  = 20;
        ctx.fill();

        // Energy crackling sparks along blade
        for (let s = 0; s < 5; s++) {
          const t   = s / 4;
          const sx2 = bladeStartX + dir * (bladeTipX - bladeStartX) * t;
          const sy2 = armTipY + (bladeTipY - armTipY) * t;
          const off = (Math.sin(tick * 0.3 + s * 1.7) * 5) * (1 - t);
          ctx.beginPath();
          ctx.arc(sx2 + off, sy2 + off * 0.5, 2.5 - t * 1.5, 0, Math.PI * 2);
          ctx.fillStyle   = s % 2 === 0 ? "#ff88ff" : "#ffffff";
          ctx.shadowColor = "#ff00ff";
          ctx.shadowBlur  = 12;
          ctx.fill();
        }

        // Slash trail arc
        if (progress > 0.15 && progress < 0.7) {
          ctx.beginPath();
          ctx.arc(armTipX, armTipY, reach * 0.85, -Math.PI * 0.18 * dir, Math.PI * 0.08 * dir, dir < 0);
          ctx.strokeStyle = rgba("#ff00ff", 0.18 * swing);
          ctx.lineWidth   = 18; ctx.shadowBlur = 0;
          ctx.stroke();
        }
      }

      ctx.restore();

    // ── HEAVY KICK: rising heel slam ────────────────────────
    } else if (attackType === "heavykick") {
      const reach = swing * 72;
      const atkY  = fy - FH * 0.55 - swing * 22;
      ctx.strokeStyle = color; ctx.lineWidth = 13; ctx.shadowColor = color; ctx.shadowBlur = 28;
      ctx.beginPath(); ctx.moveTo(x + dir * FW * 0.28, fy - FH * 0.28);
      ctx.quadraticCurveTo(x + dir * (FW * 0.5 + reach * 0.4), fy - FH * 0.45, x + dir * (FW * 0.36 + reach), atkY); ctx.stroke();
      // Boot tip glow
      ctx.beginPath(); ctx.arc(x + dir * (FW * 0.36 + reach), atkY, 13, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.shadowBlur = 30; ctx.fill();
      // Energy trail
      if (swing > 0.3) {
        ctx.beginPath(); ctx.arc(x + dir * (FW * 0.36 + reach), atkY, 22, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(color, 0.25); ctx.lineWidth = 6; ctx.shadowBlur = 18; ctx.stroke();
      }

    // ── KICK: big boot sweep ──────────────────────────────────
    } else if (attackType === "dash") {
      const reach = swing * 54;
      const atkY  = y - FH * 0.22;
      ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.moveTo(x + dir * FW * 0.36, y - FH * 0.72); ctx.lineTo(x + dir * (FW * 0.36 + reach), atkY); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + dir * (FW * 0.36 + reach), atkY, 9, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();

    // ── SUPER: massive energy slam ────────────────────────────
    } else if (attackType === "super") {
      const reach  = swing * 115;
      const baseY  = y - FH * 0.72;
      const tipX   = x + dir * (FW * 0.36 + reach);

      // Arm
      ctx.strokeStyle = "#ffdd00"; ctx.lineWidth = 11; ctx.shadowColor = "#ffdd00"; ctx.shadowBlur = 35;
      ctx.beginPath(); ctx.moveTo(x + dir * FW * 0.36, y - FH * 0.82); ctx.lineTo(x + dir * FW * 0.36, baseY); ctx.stroke();

      // Giant fist / energy ball
      if (reach > 10) {
        // Outer rings
        for (let r = 0; r < 4; r++) {
          ctx.beginPath();
          ctx.arc(tipX, baseY, 22 + r * 11, 0, Math.PI * 2);
          ctx.strokeStyle = rgba("#ffdd00", Math.max(0, 0.5 - r * 0.12));
          ctx.lineWidth   = 3 - r * 0.5;
          ctx.shadowColor = "#ffaa00"; ctx.shadowBlur = 20;
          ctx.stroke();
        }
        // Core ball
        const coreGrad = ctx.createRadialGradient(tipX, baseY, 2, tipX, baseY, 18);
        coreGrad.addColorStop(0, "#ffffff");
        coreGrad.addColorStop(0.4, "#ffdd00");
        coreGrad.addColorStop(1, "rgba(255,100,0,0)");
        ctx.beginPath(); ctx.arc(tipX, baseY, 18, 0, Math.PI * 2);
        ctx.fillStyle = coreGrad; ctx.shadowColor = "#ffaa00"; ctx.shadowBlur = 40; ctx.fill();

        // Lightning bolts from ball
        for (let b = 0; b < 6; b++) {
          const angle = (b / 6) * Math.PI * 2 + tick * 0.08;
          const bx    = tipX + Math.cos(angle) * (22 + Math.random() * 14);
          const by    = baseY + Math.sin(angle) * (22 + Math.random() * 14);
          ctx.beginPath(); ctx.moveTo(tipX, baseY); ctx.lineTo(bx, by);
          ctx.strokeStyle = rgba("#ffffff", 0.5 + Math.random() * 0.4);
          ctx.lineWidth = 1.5; ctx.shadowColor = "#ffdd00"; ctx.shadowBlur = 10; ctx.stroke();
        }

        // Shockwave beam
        ctx.strokeStyle = rgba("#ffdd00", 0.25 * swing);
        ctx.lineWidth   = 28; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(x + dir * FW * 0.36, baseY); ctx.lineTo(tipX, baseY); ctx.stroke();
      }

    // ── PUNCH / AIRPUNCH: fast jab ────────────────────────────
    } else {
      const reach = swing * (attackType === "airpunch" ? 58 : 66);
      const baseY = y - FH * 0.72;
      ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.moveTo(x + dir * FW * 0.36, baseY); ctx.lineTo(x + dir * (FW * 0.36 + reach), baseY); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + dir * (FW * 0.36 + reach), baseY, 8, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    }

  } else {
    const swing  = state === "walk" ? Math.sin(animTick * 0.25 + Math.PI) * 12 : (state === "idle" ? Math.sin(animTick * 0.04) * 3 : 0);
    const fistSz = 7;
    ctx.lineWidth = 9; ctx.lineCap = "round";
    // Left arm + fist
    const lax = x - FW * 0.55 - 10 + swing, lay = y - FH * 0.5;
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(x - FW * 0.44, y - FH * 0.82); ctx.quadraticCurveTo(x - FW*0.62, y - FH*0.65, lax, lay); ctx.stroke();
    ctx.beginPath(); ctx.arc(lax, lay, fistSz, 0, Math.PI*2); ctx.fillStyle = color; ctx.fill();
    // Right arm + fist
    const rax = x + FW * 0.55 + 10 - swing, ray = y - FH * 0.5;
    ctx.beginPath(); ctx.moveTo(x + FW * 0.44, y - FH * 0.82); ctx.quadraticCurveTo(x + FW*0.62, y - FH*0.65, rax, ray); ctx.stroke();
    ctx.beginPath(); ctx.arc(rax, ray, fistSz, 0, Math.PI*2); ctx.fillStyle = color; ctx.fill();
    // Shoulder pads
    ctx.fillStyle = rgba(color, 0.45); ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(x - FW * 0.48, y - FH * 0.84, 8, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + FW * 0.48, y - FH * 0.84, 8, 0, Math.PI*2); ctx.fill();
  }

  // Floating name label + RAGE + personality
  if (state !== "ko") {
    ctx.save();
    ctx.textAlign   = "center";
    ctx.font        = "bold 9px 'Courier New'";
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;
    ctx.globalAlpha = 0.75;
    ctx.fillText(f.name, x, y - FH - 6);
    // RAGE mode indicator
    if (f.hp <= 25 && f.name !== "CPU") {
      const rp = 0.7 + 0.3 * Math.abs(Math.sin(tick * 0.2));
      ctx.globalAlpha = rp;
      ctx.font        = "bold 11px 'Courier New'";
      ctx.fillStyle   = "#ff2200";
      ctx.shadowColor = "#ff0000"; ctx.shadowBlur = 16;
      ctx.fillText("⚡ RAGE MODE ⚡", x, y - FH - 20);
    }
    // Personality / taunt message
    if (f.personalityTimer > 0 && f.personality) {
      const pt = f.personalityTimer / 55;
      ctx.globalAlpha = Math.min(1, pt * 1.5);
      ctx.font = "bold 10px 'Courier New'";
      ctx.fillStyle = f.tauntTimer > 0 ? "#ffdd00" : color;
      ctx.shadowColor = f.tauntTimer > 0 ? "#ffdd00" : color; ctx.shadowBlur = 14;
      ctx.fillText(`"${f.personality}"`, x, y - FH - 34);
    }
    // Taunt pose indicator
    if (f.tauntTimer > 0) {
      ctx.globalAlpha = 0.9;
      ctx.font = "bold 13px 'Courier New'";
      ctx.fillStyle = "#ffdd00"; ctx.shadowColor = "#ffaa00"; ctx.shadowBlur = 18;
      ctx.fillText("😤 TAUNT!", x, y - FH - 48);
    }
    ctx.restore();
  }

  if (f.comboCount >= 2 && state === "attack") {
    const isSupAtk = attackType === "special" || attackType === "super";
    let comboLabel, comboColor, comboSize;
    if (f.comboCount >= 8) {
      comboLabel = "⚡ UNSTOPPABLE ⚡"; comboColor = "#ff0066"; comboSize = 18 + f.comboCount;
    } else if (f.comboCount >= 5) {
      comboLabel = `${f.comboCount}× SUPER COMBO!`; comboColor = "#ffdd00"; comboSize = 16 + f.comboCount;
    } else {
      comboLabel = `${f.comboCount}× COMBO!`;
      comboColor = isSupAtk ? "#ff00ff" : color; comboSize = 12 + f.comboCount * 2;
    }
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `bold ${comboSize}px 'Courier New'`;
    ctx.fillStyle = comboColor; ctx.shadowColor = comboColor; ctx.shadowBlur = 20;
    const comboY = y - FH - 22 - (f.comboCount >= 5 ? 6 : 0);
    ctx.fillText(comboLabel, x, comboY);
    // Underline flash on big combos
    if (f.comboCount >= 5) {
      ctx.strokeStyle = comboColor; ctx.lineWidth = 2; ctx.shadowBlur = 12;
      const tw = ctx.measureText(comboLabel).width;
      ctx.beginPath(); ctx.moveTo(x - tw/2, comboY + 4); ctx.lineTo(x + tw/2, comboY + 4); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawParticles(ctx, particles) {
  particles.forEach(p => {
    ctx.save(); ctx.globalAlpha = p.life * 0.9;
    ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  });
}

function drawHUD(ctx, f1, f2, timer, round, wins) {
  const BAR_W = 290, BAR_H = 22, BAR_Y = 22;
  const P1X = 18, P2X = CW - 18 - BAR_W;

  function hpBar(x, pct, color, rtl) {
    // Low HP pulse
    const pulse = pct <= 0.2 ? 0.6 + 0.4 * Math.abs(Math.sin(Date.now() * 0.008)) : 1;
    ctx.fillStyle = "#09091f"; rrect(ctx, x, BAR_Y, BAR_W, BAR_H, 4); ctx.fill();
    const bc = pct > 0.5 ? color : pct > 0.25 ? "#ffaa00" : "#ff2222";
    ctx.fillStyle = bc; ctx.shadowColor = bc; ctx.shadowBlur = pct <= 0.2 ? 18 * pulse : 10;
    ctx.save(); ctx.beginPath(); rrect(ctx, x, BAR_Y, BAR_W, BAR_H, 4); ctx.clip();
    ctx.fillRect(rtl ? x + BAR_W * (1 - pct) : x, BAR_Y, BAR_W * pct, BAR_H);
    ctx.restore(); ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba("#ffffff", 0.1); ctx.lineWidth = 1; rrect(ctx, x, BAR_Y, BAR_W, BAR_H, 4); ctx.stroke();
  }

  function superBar(x, pct, color, rtl) {
    const SH = 7, SY = BAR_Y + BAR_H + 3;
    ctx.fillStyle = "#09091f"; rrect(ctx, x, SY, BAR_W, SH, 3); ctx.fill();
    if (pct > 0) {
      const full = pct >= 1;
      const sc   = full ? "#ffdd00" : color;
      ctx.fillStyle = sc; ctx.shadowColor = sc; ctx.shadowBlur = full ? 16 : 6;
      ctx.save(); ctx.beginPath(); rrect(ctx, x, SY, BAR_W, SH, 3); ctx.clip();
      ctx.fillRect(rtl ? x + BAR_W * (1 - pct) : x, SY, BAR_W * pct, SH);
      ctx.restore(); ctx.shadowBlur = 0;
      // SUPER text when full
      if (full) {
        const pulse2 = 0.7 + 0.3 * Math.abs(Math.sin(Date.now() * 0.01));
        ctx.globalAlpha = pulse2;
        ctx.font = "bold 7px 'Courier New'"; ctx.fillStyle = "#ffdd00";
        ctx.textAlign = rtl ? "right" : "left";
        ctx.fillText("★ SUPER READY", rtl ? x + BAR_W - 3 : x + 3, SY + 6);
        ctx.globalAlpha = 1;
      }
    }
    ctx.strokeStyle = rgba("#ffffff", 0.08); ctx.lineWidth = 1; rrect(ctx, x, SY, BAR_W, SH, 3); ctx.stroke();
  }

  hpBar(P1X, f1.hp / 100, f1.color, false);
  hpBar(P2X, f2.hp / 100, f2.color, true);
  superBar(P1X, f1.superMeter / SUPER_MAX, f1.color, false);
  superBar(P2X, f2.superMeter / SUPER_MAX, f2.color, true);

  // Name banners
  const nameY = BAR_Y + BAR_H + 14;
  ctx.fillStyle = rgba(f1.color, 0.1); rrect(ctx, P1X, nameY, 150, 16, 3); ctx.fill();
  ctx.font = "bold 10px 'Courier New'"; ctx.textAlign = "left";
  ctx.fillStyle = f1.color; ctx.shadowColor = f1.color; ctx.shadowBlur = 8;
  ctx.fillText(`▸ ${f1.name}`, P1X + 7, nameY + 11);

  ctx.fillStyle = rgba(f2.color, 0.1); rrect(ctx, P2X + BAR_W - 150, nameY, 150, 16, 3); ctx.fill();
  ctx.textAlign = "right";
  ctx.fillStyle = f2.color; ctx.shadowColor = f2.color; ctx.shadowBlur = 8;
  ctx.fillText(`${f2.name} ◂`, P2X + BAR_W - 7, nameY + 11);
  ctx.shadowBlur = 0;

  ctx.font = "bold 11px 'Courier New'"; ctx.fillStyle = rgba("#ffffff", 0.55);
  ctx.textAlign = "left";  ctx.fillText(`${Math.ceil(f1.hp)}`, P1X + 6, BAR_Y + 15);
  ctx.textAlign = "right"; ctx.fillText(`${Math.ceil(f2.hp)}`, P2X + BAR_W - 6, BAR_Y + 15);

  for (let i = 0; i < WINS_NEEDED; i++) {
    ctx.beginPath(); ctx.arc(P1X + BAR_W + 14 + i * 16, BAR_Y + BAR_H / 2, 5, 0, Math.PI * 2);
    const f1w = i < wins[0];
    ctx.fillStyle = f1w ? f1.color : "#111128"; ctx.shadowColor = f1w ? f1.color : "transparent"; ctx.shadowBlur = f1w ? 8 : 0;
    ctx.fill(); ctx.strokeStyle = rgba(f1.color, 0.4); ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(P2X - 14 - i * 16, BAR_Y + BAR_H / 2, 5, 0, Math.PI * 2);
    const f2w = i < wins[1];
    ctx.fillStyle = f2w ? f2.color : "#221111"; ctx.shadowColor = f2w ? f2.color : "transparent"; ctx.shadowBlur = f2w ? 8 : 0;
    ctx.fill(); ctx.strokeStyle = rgba(f2.color, 0.4); ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.shadowBlur = 0;

  const tc = timer <= 10 ? "#ff4444" : "#eeeeff";
  ctx.textAlign = "center"; ctx.font = "bold 30px 'Courier New'";
  ctx.fillStyle = tc; ctx.shadowColor = tc; ctx.shadowBlur = timer <= 10 ? 22 : 6;
  ctx.fillText(Math.ceil(timer), CW / 2, 40); ctx.shadowBlur = 0;
  ctx.font = "bold 9px 'Courier New'"; ctx.fillStyle = "#444466";
  ctx.fillText(`ROUND ${round}  ·  BEST OF ${WINS_NEEDED * 2 - 1}`, CW / 2, 54);
  ctx.textAlign = "left";
}

function drawAnnounce(ctx, text, sub, tick) {
  const pulse = 1 + 0.022 * Math.sin(tick * 0.1);
  const gc = text === "K.O.!" ? "#ff00ff" : text === "FIGHT!" ? "#00ffcc" : text === "TIME!" ? "#ffaa00" : "#ffffff";
  ctx.save(); ctx.textAlign = "center"; ctx.translate(CW / 2, CH / 2 - 8); ctx.scale(pulse, pulse);
  ctx.font = "bold 70px 'Courier New'"; ctx.fillStyle = "#ffffff"; ctx.shadowColor = gc; ctx.shadowBlur = 45;
  ctx.fillText(text, 0, 0);
  if (sub) { ctx.font = "bold 22px 'Courier New'"; ctx.fillStyle = "#aaddff"; ctx.shadowColor = "#aaddff"; ctx.shadowBlur = 18; ctx.fillText(sub, 0, 48); }
  ctx.restore();
}

function drawControls(ctx, playerName) {
  if (window.innerWidth < 600) return;
  ctx.save(); ctx.font = "9px 'Courier New'"; ctx.fillStyle = rgba("#ffffff", 0.18); ctx.textAlign = "center";
  ctx.fillText(`${playerName}: ← → move · ↑/W jump · ↓ block · A punch · S kick · D special · ↑+D SUPER · T taunt`, CW / 2, CH - 7);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// TOUCH CONTROLS COMPONENT
// ═══════════════════════════════════════════════════════════════
function TouchControls({ keysRef }) {
  const activeKeys = useRef(new Set());

  function press(key) {
    if (activeKeys.current.has(key)) return;
    activeKeys.current.add(key);
    keysRef.current.add(key);
  }
  function release(key) {
    activeKeys.current.delete(key);
    keysRef.current.delete(key);
  }
  function mkHandlers(key) {
    return {
      onTouchStart: e => { e.preventDefault(); press(key); },
      onTouchEnd:   e => { e.preventDefault(); release(key); },
      onMouseDown:  e => { e.preventDefault(); press(key); },
      onMouseUp:    e => { e.preventDefault(); release(key); },
      onMouseLeave: e => { release(key); },
    };
  }

  const base = {
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: "50%", userSelect: "none", touchAction: "none",
    WebkitTapHighlightColor: "transparent", cursor: "pointer",
    fontFamily: "'Courier New', monospace", fontWeight: "bold",
    transition: "background 0.07s",
  };

  const dpad = (label, key, extraStyle = {}) => ({
    ...base,
    width: btnSz, height: btnSz,
    background: "rgba(0,229,255,0.08)",
    border: "2px solid rgba(0,229,255,0.3)",
    color: "rgba(0,229,255,0.7)",
    fontSize: Math.max(13, btnSz * 0.35),
    boxShadow: "0 0 10px rgba(0,229,255,0.1)",
    ...extraStyle,
  });

  const atk = (color, size = 54) => ({
    ...base,
    width: Math.min(size, btnSz + 2), height: Math.min(size, btnSz + 2),
    background: `rgba(${color},0.1)`,
    border: `2px solid rgba(${color},0.5)`,
    color: `rgba(${color},0.9)`,
    fontSize: 11, letterSpacing: 1,
    boxShadow: `0 0 12px rgba(${color},0.2)`,
  });

  const btnSz = Math.min(52, Math.floor(window.innerWidth / 9));
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      display: "flex", justifyContent: "space-between", alignItems: "flex-end",
      padding: `0 ${Math.max(6, Math.floor(window.innerWidth * 0.015))}px 8px`,
      pointerEvents: "none",
    }}>
      {/* ── LEFT: D-PAD ── */}
      <div style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        {/* Jump */}
        <div style={dpad("↑", "ArrowUp")} {...mkHandlers("ArrowUp")}>↑</div>
        {/* Left / Right */}
        <div style={{ display: "flex", gap: 4 }}>
          <div style={dpad("←", "ArrowLeft")} {...mkHandlers("ArrowLeft")}>←</div>
          {/* Block (center) */}
          <div style={dpad("▼", "ArrowDown", { background: "rgba(255,200,0,0.08)", border: "2px solid rgba(255,200,0,0.3)", color: "rgba(255,200,0,0.7)", fontSize: 12 })} {...mkHandlers("ArrowDown")}>BLK</div>
          <div style={dpad("→", "ArrowRight")} {...mkHandlers("ArrowRight")}>→</div>
        </div>
      </div>

      {/* ── RIGHT: ATTACK BUTTONS ── */}
      <div style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        {/* Special on top */}
        <div style={atk("255,0,255", 50)} {...mkHandlers("KeyD")}>
          <span style={{ textAlign: "center", lineHeight: 1.2 }}>SPE<br/>CIAL</span>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <div style={atk("0,229,255", 50)} {...mkHandlers("KeyA")}>
            <span style={{ textAlign: "center", lineHeight: 1.2 }}>PUN<br/>CH</span>
          </div>
          <div style={atk("255,160,0", 50)} {...mkHandlers("KeyS")}>
            <span style={{ textAlign: "center", lineHeight: 1.2 }}>DA<br/>SH</span>
          </div>
          <div style={atk("255,60,180", 50)} {...mkHandlers("KeyF")}>
            <span style={{ textAlign: "center", lineHeight: 1.2 }}>HVY<br/>KCK</span>
          </div>
        </div>
        {/* SUPER — triggers ↑+D simultaneously */}
        <div
          style={{
            ...base,
            width: 106, height: 34,
            background: "rgba(255,221,0,0.12)",
            border: "2px solid rgba(255,221,0,0.6)",
            color: "#ffdd00", fontSize: 11, letterSpacing: 3,
            boxShadow: "0 0 14px rgba(255,221,0,0.3)",
            borderRadius: 6,
          }}
          onTouchStart={e => { e.preventDefault(); press("ArrowUp"); press("KeyD"); }}
          onTouchEnd={e   => { e.preventDefault(); release("ArrowUp"); release("KeyD"); }}
          onMouseDown={e  => { e.preventDefault(); press("ArrowUp"); press("KeyD"); }}
          onMouseUp={e    => { e.preventDefault(); release("ArrowUp"); release("KeyD"); }}
          onMouseLeave={()=> { release("ArrowUp"); release("KeyD"); }}
        >
          ★ SUPER
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function BeatMEE() {
  const canvasRef   = useRef(null);
  const gsRef       = useRef(null);
  const keysRef     = useRef(new Set());
  const rafRef      = useRef(null);

  const [uiPhase,    setUiPhase]    = useState("enter_name");
  const [playerName, setPlayerName] = useState("");
  const [nameError,  setNameError]  = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [results,    setResults]    = useState(null);
  const [focused,    setFocused]    = useState(false);
  const [winStreak,  setWinStreak]  = useState(0);
  const [matchHistory, setMatchHistory] = useState([]);
  const [playerColor2, setPlayerColor2] = useState("#00e5ff");

  // Idle BG animation on non-game screens
  useEffect(() => {
    if (uiPhase === "game") return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let tick = 0, raf;
    function loop() {
      tick++;
      drawBG(ctx, tick, gs);
      // Two idle fighters on menu screens
      const f1 = mkFighter(200, 1,  "#00e5ff", "#00e5ff", "");
      const f2 = mkFighter(600, -1, "#ff4040", "#ff4040", "");
      f1.animTick = tick; f2.animTick = tick;
      f1.state = "walk"; f2.state = "idle";
      drawFighter(ctx, f1, tick); drawFighter(ctx, f2, tick);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [uiPhase]);

  // Game loop
  useEffect(() => {
    if (uiPhase !== "game") return;
    const onDown = e => { if (GAME_KEYS.has(e.code)) e.preventDefault(); keysRef.current.add(e.code); };
    const onUp   = e => keysRef.current.delete(e.code);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    function loop() {
      try {
      const gs = gsRef.current; const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext("2d");
      updateGS(gs, keysRef.current);
      const { fighters: [f1, f2], particles, announce, phase: gph, tick, timer, round, wins, cdVal, cdFrames, flashFrames } = gs;
      drawBG(ctx, tick, gs);

      // Screen flash on hit
      if (flashFrames > 0) { ctx.fillStyle = `rgba(255,255,255,${flashFrames * 0.013})`; ctx.fillRect(0, 0, CW, CH); }
      if (gs.shakeFrames > 0) {
        const si = gs.shakeIntensity * (gs.shakeFrames / 18);
        ctx.save(); ctx.translate((Math.random()-0.5)*si, (Math.random()-0.5)*si);
      }
      drawFighter(ctx, f1, tick); drawFighter(ctx, f2, tick);
      if (gs.shakeFrames > 0) ctx.restore();
      drawParticles(ctx, particles);
      // ── KO shockwave rings ──
      if (gs.koRings) {
        gs.koRings.forEach(ring => {
          if (ring.delay > 0) return;
          ctx.save();
          ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
          ctx.strokeStyle = ring.col; ctx.globalAlpha = ring.life * 0.7;
          ctx.lineWidth = 4 * ring.life; ctx.shadowColor = ring.col; ctx.shadowBlur = 20;
          ctx.stroke();
          ctx.restore();
        });
      }
      // ── Crowd reaction floating texts ──
      if (gs.crowdReactions) {
        gs.crowdReactions.forEach(r => {
          ctx.save();
          ctx.globalAlpha = r.life;
          ctx.textAlign = "center";
          ctx.font = `bold ${12 + Math.floor((1-r.life)*4)}px 'Courier New'`;
          ctx.fillStyle = r.col; ctx.shadowColor = r.col; ctx.shadowBlur = 16;
          ctx.fillText(r.text, r.x, r.y);
          ctx.restore();
        });
      }
      drawHUD(ctx, f1, f2, timer, round, wins);
      drawControls(ctx, f1.name);
      if (gph === "countdown") {
        ctx.save(); const pulse = 1 + 0.05 * ((60 - (cdFrames % 60)) / 60);
        ctx.font = "bold 108px 'Courier New'"; ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#00ffcc"; ctx.shadowBlur = 55; ctx.textAlign = "center";
        ctx.translate(CW / 2, CH / 2 + 40); ctx.scale(pulse, pulse);
        ctx.fillText(cdVal, 0, 0); ctx.restore();
      }
      if (announce) drawAnnounce(ctx, announce.text, announce.sub, tick);
      if (gph === "results" && !gs.resultsTriggered) {
        gs.resultsTriggered = true;
        const winner = gs.wins[0] >= WINS_NEEDED ? f1.name : "CPU";
        const diff2  = gs.difficulty;
        setResults({ winner, wins: [...gs.wins], playerName: f1.name, difficulty: diff2 });
        setWinStreak(prev => winner !== "CPU" ? prev + 1 : 0);
        setMatchHistory(prev => [...prev.slice(-4), { winner, diff: diff2, wins: [...gs.wins] }]);
        setUiPhase("results");
      }
      rafRef.current = requestAnimationFrame(loop);
      } catch(e) { console.error("Game loop error:", e); rafRef.current = requestAnimationFrame(loop); }
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [uiPhase]);

  function handleStart() {
    const name = playerName.trim();
    if (!name)          { setNameError("Enter your fighter name first!"); return; }
    if (name.length > 12) { setNameError("Maximum 12 characters."); return; }
    setNameError("");
    const gs = initGS(name.toUpperCase(), difficulty, playerColor2);
    gs.resultsTriggered = false;
    gsRef.current = gs;
    beginRound(gs);
    setUiPhase("game");
  }

  function handleRematch() {
    const name = gsRef.current?.fighters[0]?.name || playerName.trim().toUpperCase();
    const gs = initGS(name, difficulty, playerColor2);
    gs.resultsTriggered = false;
    gsRef.current = gs;
    beginRound(gs);
    setResults(null);
    setUiPhase("game");
  }

  // ── Styles ──
  const F = "'Courier New', monospace";

  const overlay = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
    background: "#02020a",
    overflowY: "auto", overflowX: "hidden",
    padding: "clamp(12px, 3vw, 24px) clamp(10px, 4vw, 20px) 30px",
    gap: "clamp(8px, 2vw, 14px)", fontFamily: F,
    WebkitOverflowScrolling: "touch",
    boxSizing: "border-box",
  };

  const neonBtn = (col) => ({
    padding: "12px 48px", background: "transparent",
    border: `2px solid ${col}`, color: col, fontSize: 14,
    fontFamily: F, fontWeight: "bold", letterSpacing: 5,
    cursor: "pointer", textTransform: "uppercase",
    boxShadow: `0 0 16px ${col}44`, outline: "none", transition: "all 0.15s",
  });

  const playerColor = "#00e5ff";
  const cpuColor    = "#ff4040";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  minHeight: "100vh", minHeight: "100dvh", background: "#02020a", fontFamily: F,
                  padding: 0, margin: 0, boxSizing: "border-box", overflow: "hidden" }}>
      <div style={{ position: "relative", width: "100%", maxWidth: `${CW}px`,
                    aspectRatio: "16/9", flexShrink: 0 }}>

        <canvas ref={canvasRef} width={CW} height={CH}
                style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />

        {/* ─────────── NAME ENTRY ─────────── */}
        {uiPhase === "enter_name" && (
          <div style={overlay}>

            {/* TITLE */}
            <div style={{ textAlign:"center", lineHeight:1 }}>
              <div style={{ fontSize:"clamp(22px,8vw,48px)", fontWeight:"bold", color:"#fff",
                letterSpacing:"clamp(3px,2vw,12px)",
                textShadow:"0 0 20px #ff0000, 0 0 50px #ff00ff, 0 0 80px #00ffff" }}>
                BEAT ME
              </div>
              <div style={{ fontSize:"clamp(7px,1.8vw,10px)", color:"#ff4433", letterSpacing:6, marginTop:4, fontWeight:"bold" }}>
                1 PLAYER · VS · CPU
              </div>
            </div>

            {winStreak >= 2 && (
              <div style={{ textAlign:"center", padding:"3px 12px",
                background:"rgba(255,200,0,0.1)", border:"1px solid rgba(255,200,0,0.35)",
                borderRadius:4, fontSize:9, color:"#ffcc00", letterSpacing:3, fontWeight:"bold" }}>
                🔥 WIN STREAK × {winStreak}
              </div>
            )}

            {/* NAME + COLOR row */}
            <div style={{ width:"100%", maxWidth:400, boxSizing:"border-box" }}>
              <div style={{ fontSize:8, color:playerColor2, letterSpacing:4, fontWeight:"bold", marginBottom:5, textShadow:`0 0 6px ${playerColor2}` }}>
                ▸ YOUR FIGHTER NAME
              </div>
              <input
                type="text" maxLength={12} value={playerName}
                onChange={e => { setPlayerName(e.target.value); setNameError(""); }}
                onKeyDown={e => e.key === "Enter" && handleStart()}
                onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                placeholder="TYPE YOUR NAME" autoFocus
                style={{
                  display:"block", width:"100%", boxSizing:"border-box",
                  background: focused ? `${playerColor2}18` : `${playerColor2}09`,
                  border:`2px solid ${focused ? playerColor2 : playerColor2+"44"}`,
                  color:"#fff", fontSize:"clamp(14px,4.5vw,20px)", fontFamily:F,
                  fontWeight:"bold", letterSpacing:5, textAlign:"center",
                  padding:"10px 10px", outline:"none", textTransform:"uppercase",
                  boxShadow: focused ? `0 0 20px ${playerColor2}44` : "none",
                  transition:"all 0.15s", borderRadius:4,
                }}
              />
              {nameError
                ? <div style={{ color:"#ff4444", fontSize:9, letterSpacing:2, marginTop:4, textAlign:"center", fontWeight:"bold" }}>⚠ {nameError}</div>
                : <div style={{ color:"#224455", fontSize:8, letterSpacing:2, marginTop:4, textAlign:"center" }}>{playerName.trim().length}/12</div>
              }
              {/* Color swatches inline */}
              <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
                {[["#00e5ff","CYAN"],["#ff4040","RED"],["#44ff88","GREEN"],["#ff00ff","PINK"],["#ffdd00","GOLD"],["#ff8800","ORANGE"],["#aa88ff","PURPLE"],["#ffffff","WHITE"]].map(([col,name]) => (
                  <button key={col} onClick={() => setPlayerColor2(col)} title={name} style={{
                    width:22, height:22, borderRadius:"50%",
                    border: playerColor2===col ? "2px solid #fff" : `2px solid ${col}55`,
                    background:col, cursor:"pointer", outline:"none",
                    boxShadow: playerColor2===col ? `0 0 10px ${col}` : "none",
                    transform: playerColor2===col ? "scale(1.2)" : "scale(1)",
                    transition:"all 0.12s", flexShrink:0,
                  }}/>
                ))}
              </div>
            </div>

            {/* LEVEL SELECT */}
            <div style={{ width:"100%", maxWidth:400, boxSizing:"border-box" }}>
              <div style={{ fontSize:8, color:"#ff4422", letterSpacing:4, fontWeight:"bold", marginBottom:6, textShadow:"0 0 6px #ff2200" }}>
                ◈ SELECT LEVEL
              </div>
              <div style={{ display:"flex", gap:5 }}>
                {[
                  { d:"easy",      num:"1", label:"MEDIUM",    dc:"#44dd44", desc:"Normal",     icon:"🟢" },
                  { d:"semipro",   num:"2", label:"SEMI PRO",  dc:"#ffcc00", desc:"Moderate",   icon:"🟡" },
                  { d:"pro",       num:"3", label:"PRO",       dc:"#ff7700", desc:"Hard",        icon:"🟠" },
                  { d:"legendary", num:"4", label:"LEGEND",    dc:"#ff0044", desc:"Good Luck",   icon:"🔴" },
                ].map(({ d, num, label, dc, desc, icon }) => {
                  const sel = difficulty === d;
                  const bgMap = { easy:"0,160,0", semipro:"160,130,0", pro:"160,70,0", legendary:"160,0,35" };
                  return (
                    <button key={d} onClick={() => setDifficulty(d)} style={{
                      flex:1, display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center",
                      gap:2, padding:"8px 2px 7px",
                      background: sel ? `rgba(${bgMap[d]},0.2)` : "rgba(15,4,4,0.55)",
                      border:`2px solid ${sel ? dc : "rgba(70,18,8,0.35)"}`,
                      borderRadius:5, cursor:"pointer", outline:"none",
                      boxShadow: sel ? `0 0 16px ${dc}44` : "none",
                      transform: sel ? "scale(1.05)" : "scale(1)",
                      transition:"all 0.13s",
                    }}>
                      <span style={{ fontSize:"clamp(16px,4.5vw,24px)", fontWeight:"bold", lineHeight:1,
                        color: sel ? dc : "#442211",
                        textShadow: sel ? `0 0 12px ${dc}` : "none",
                        fontFamily:F }}>{num}</span>
                      <span style={{ fontSize:"clamp(8px,2vw,10px)", lineHeight:1.1 }}>{icon}</span>
                      <span style={{ fontSize:"clamp(5px,1.4vw,7px)", letterSpacing:0.5, fontWeight:"bold",
                        color: sel ? dc : "#553322", fontFamily:F, textTransform:"uppercase",
                        opacity: sel ? 1 : 0.5 }}>{label}</span>
                      {sel && <span style={{ fontSize:"clamp(4px,1.1vw,6px)", color:dc, opacity:0.7, fontFamily:F }}>{desc}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FIGHT BUTTON */}
            <button
              style={{
                width:"100%", maxWidth:400, boxSizing:"border-box",
                padding:"13px 0",
                background:"rgba(255,20,10,0.14)", border:"2px solid #ff3322",
                color:"#ff6655", fontSize:"clamp(11px,3.5vw,15px)",
                fontFamily:F, fontWeight:"bold", letterSpacing:"clamp(3px,1.5vw,7px)",
                cursor:"pointer", textTransform:"uppercase",
                boxShadow:"0 0 20px rgba(255,20,10,0.32)",
                textShadow:"0 0 8px #ff2200",
                outline:"none", borderRadius:4, transition:"all 0.15s",
              }}
              onMouseOver={e => { e.currentTarget.style.background="rgba(255,20,10,0.26)"; e.currentTarget.style.boxShadow="0 0 40px rgba(255,20,10,0.6)"; }}
              onMouseOut={e  => { e.currentTarget.style.background="rgba(255,20,10,0.14)"; e.currentTarget.style.boxShadow="0 0 20px rgba(255,20,10,0.32)"; }}
              onClick={handleStart}
            >▶ FIGHT !</button>

            {/* Controls hint */}
            <div style={{ width:"100%", maxWidth:400, fontSize:"clamp(6px,1.5vw,8px)", color:"#1a2233", letterSpacing:1.5, lineHeight:1.9, textAlign:"center" }}>
              A PUNCH · S DASH · F HEAVY KICK · D SPECIAL · ↑+D SUPER · T TAUNT
            </div>

          </div>
        )}

        {/* ─────────── RESULTS ─────────── */}
        {uiPhase === "results" && results && (
          <div style={overlay}>
            {/* Header */}
            <div style={{ fontSize: "clamp(7px,2vw,10px)", color: "#333355", letterSpacing: 8, textTransform: "uppercase" }}>
              ── MATCH COMPLETE ──
            </div>

            {/* Winner banner */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "clamp(10px,3vw,13px)", color: results.winner === "CPU" ? cpuColor : playerColor2,
                            letterSpacing: 6, fontWeight: "bold", marginBottom: 4, opacity: 0.7 }}>
                {results.winner === "CPU" ? "😈 DEFEATED" : "🏆 WINNER"}
              </div>
              <div style={{ fontSize: "clamp(30px,8vw,54px)", fontWeight: "bold", color: "#fff", letterSpacing: 4,
                            textShadow: results.winner === "CPU"
                              ? `0 0 30px ${cpuColor}, 0 0 60px #ff0000`
                              : `0 0 30px ${playerColor2}, 0 0 60px ${playerColor2}` }}>
                {results.winner === "CPU" ? "CPU" : results.playerName}
              </div>
            </div>

            {/* Win streak */}
            {results.winner !== "CPU" && winStreak >= 2 && (
              <div style={{ padding: "6px 20px", background: "rgba(255,200,0,0.12)",
                border: "1px solid rgba(255,200,0,0.5)", borderRadius: 4,
                fontSize: 11, color: "#ffcc00", letterSpacing: 3, fontWeight: "bold",
                textShadow: "0 0 10px #ffaa00" }}>
                🔥 {winStreak} WIN STREAK!
              </div>
            )}

            {/* Score card */}
            <div style={{ display: "flex", width: "100%", maxWidth: 340, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ flex: 1, padding: "14px 10px", textAlign: "center", background: "rgba(0,200,255,0.06)" }}>
                <div style={{ fontSize: 8, color: "#336677", letterSpacing: 2, marginBottom: 6 }}>{results.playerName}</div>
                <div style={{ fontSize: "clamp(36px,10vw,52px)", fontWeight: "bold", color: playerColor2, textShadow: `0 0 16px ${playerColor2}` }}>
                  {results.wins[0]}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 14px", background: "rgba(0,0,0,0.2)" }}>
                <span style={{ color: "#333355", fontSize: 14, fontWeight: "bold" }}>VS</span>
                <span style={{ color: "#222233", fontSize: 8, letterSpacing: 1, marginTop: 4 }}>
                  {["easy","semipro","pro","legendary"].indexOf(results.difficulty)+1} ·{" "}
                  {results.difficulty.toUpperCase()}
                </span>
              </div>
              <div style={{ flex: 1, padding: "14px 10px", textAlign: "center", background: "rgba(255,40,40,0.06)" }}>
                <div style={{ fontSize: 8, color: "#663333", letterSpacing: 2, marginBottom: 6 }}>CPU</div>
                <div style={{ fontSize: "clamp(36px,10vw,52px)", fontWeight: "bold", color: cpuColor, textShadow: `0 0 16px ${cpuColor}` }}>
                  {results.wins[1]}
                </div>
              </div>
            </div>

            {/* Match history */}
            {matchHistory.length >= 2 && (
              <div style={{ width: "100%", maxWidth: 340 }}>
                <div style={{ fontSize: 8, color: "#222244", letterSpacing: 4, marginBottom: 6 }}>RECENT MATCHES</div>
                <div style={{ display: "flex", gap: 5 }}>
                  {matchHistory.map((m, i) => (
                    <div key={i} style={{
                      flex: 1, textAlign: "center", padding: "5px 2px",
                      background: m.winner !== "CPU" ? "rgba(0,200,100,0.1)" : "rgba(255,40,40,0.1)",
                      border: `1px solid ${m.winner !== "CPU" ? "rgba(0,200,100,0.3)" : "rgba(255,40,40,0.3)"}`,
                      borderRadius: 3,
                    }}>
                      <div style={{ fontSize: 9, fontWeight: "bold", color: m.winner !== "CPU" ? "#44ff88" : "#ff4444" }}>
                        {m.winner !== "CPU" ? "WIN" : "LOSS"}
                      </div>
                      <div style={{ fontSize: 7, color: "#333355", marginTop: 2 }}>{m.wins[0]}-{m.wins[1]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 340 }}>
              <button
                style={{ ...neonBtn(playerColor2), flex: 1, padding: "12px 0", fontSize: 12, letterSpacing: 4 }}
                onMouseOver={e => { e.currentTarget.style.background = `${playerColor2}14`; }}
                onMouseOut={e  => { e.currentTarget.style.background = "transparent"; }}
                onClick={handleRematch}
              >⚔ REMATCH</button>
              <button
                style={{ ...neonBtn("#334455"), flex: 1, padding: "12px 0", fontSize: 12, letterSpacing: 3 }}
                onMouseOver={e => { e.currentTarget.style.background = "rgba(50,60,80,0.12)"; }}
                onMouseOut={e  => { e.currentTarget.style.background = "transparent"; }}
                onClick={() => { setResults(null); setUiPhase("enter_name"); }}
              >✎ MENU</button>
            </div>
          </div>
        )}

        {/* ─────────── TOUCH CONTROLS (mobile only) ─────────── */}
        {uiPhase === "game" && (
          <TouchControls keysRef={keysRef} />
        )}

      </div>
      <div style={{ marginTop: 10, fontSize: 8, color: "rgba(50,50,80,0.4)", letterSpacing: 4 }}>
        BEAT ME v5.0 · 4 LEVELS · CRITS · LEGENDARY
      </div>
    </div>
  );
}
