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
  kick:     { dmg: 13, rng: 90,  dur: 26, kb: 6,   startup: 8,  active: 8,  stun: 22 },
  special:  { dmg: 22, rng: 115, dur: 40, kb: 11,  startup: 13, active: 10, stun: 34 },
  airpunch: { dmg: 11, rng: 80,  dur: 20, kb: 5,   startup: 4,  active: 8,  stun: 16 },
  airkick:  { dmg: 17, rng: 95,  dur: 28, kb: 8,   startup: 6,  active: 9,  stun: 24 },
  super:    { dmg: 45, rng: 130, dur: 55, kb: 16,  startup: 18, active: 12, stun: 45 },
  finisher: { dmg: 70, rng: 140, dur: 65, kb: 22,  startup: 22, active: 14, stun: 60 },
};

// ── CPU difficulty profiles ──
const DIFFICULTY = {
  easy:      { thinkMin: 22, thinkMax: 40, blockChance: 0.15, attackChance: 0.28, superChance: 0.00, aggression: 0.3 },
  semipro:   { thinkMin: 12, thinkMax: 24, blockChance: 0.50, attackChance: 0.58, superChance: 0.25, aggression: 0.6 },
  pro:       { thinkMin: 5,  thinkMax: 12, blockChance: 0.75, attackChance: 0.80, superChance: 0.55, aggression: 0.8 },
  legendary: { thinkMin: 1,  thinkMax: 5,  blockChance: 0.95, attackChance: 0.95, superChance: 0.90, aggression: 1.0 },
};

const SUPER_MAX        = 100;
const SUPER_FILL_DMG   = 1.8;
const SUPER_FILL_TAKEN = 2.4;

const ROUND_TIME  = 60;
const WINS_NEEDED = 2;
const COMBO_TICKS = 55;

// ── Single player bindings ──
const PK = {
  left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp",
  punch: "KeyA", kick: "KeyS", special: "KeyD", block: "ArrowDown",
  altUp: "KeyW", taunt: "KeyT",
};
const GAME_KEYS = new Set([
  "ArrowLeft","ArrowRight","ArrowUp","ArrowDown",
  "KeyA","KeyS","KeyD","KeyW","KeyT",
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
function initGS(playerName, difficulty = "medium") {
  return {
    phase: "menu",
    tick: 0, timer: ROUND_TIME, timerFrames: 0,
    round: 1, wins: [0, 0],
    fighters: [
      mkFighter(170, 1,  "#00e5ff", "#00e5ff", playerName || "PLAYER"),
      mkFighter(630, -1, "#ff4040", "#ff4040", "CPU"),
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
  };
}

function beginRound(gs) {
  const pName = gs.fighters[0].name;
  gs.fighters    = [mkFighter(170, 1, "#00e5ff", "#00e5ff", pName), mkFighter(630, -1, "#ff4040", "#ff4040", "CPU")];
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

  // ── LEGENDARY MIND GAME: adapt to player behavior ──
  let adaptedBlock   = diff.blockChance;
  let adaptedAttack  = diff.attackChance;
  if (gs.difficulty === "legendary" && gs.playerBehavior) {
    const pb = gs.playerBehavior;
    if (pb.punchCount > 4) adaptedBlock  = Math.min(0.98, adaptedBlock  + 0.12);
    if (pb.blockCount  > 3) adaptedAttack = Math.min(0.98, adaptedAttack + 0.15);
    if (pb.jumpCount   > 2) dec.jumping = false; // punish jump spam by staying grounded
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
    dec.attack = roll < 0.50 ? "punch" : roll < 0.78 ? "kick" : "special";
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
  cpu.vx = dec.move !== 0 ? dec.move * WALK_SPD * (0.75 + agg * 0.4) : cpu.vx * 0.65;
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
  const pP = keys.has(PK.punch), pK = keys.has(PK.kick), pS = keys.has(PK.special), pB = keys.has(PK.block);

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
  if      (f.state !== "attack" && pS && onGround) doAttack(f, "special");
  else if (f.state !== "attack" && pK && onGround) doAttack(f, "kick");
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
      gs.slowMotionFrames = 14;
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
    gs.slowMotionFrames = 22;
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
  const tauntBonus = atk.tauntCooldown > 0 && atk.tauntCooldown < 150 ? 1.20 : 1.0; // bonus after taunting
  const comboBonus = atk.comboCount >= 3 ? 1.35 : atk.comboCount >= 2 ? 1.18 : 1;
  const isCrit     = Math.random() < (atk.hp <= 30 ? 0.16 : 0.08); // rage = higher crit chance
  const isFinisher = atk.attackType === "finisher";
  const isSuper    = atk.attackType === "super";
  const isSpecial  = atk.attackType === "special";
  const dmg        = a.dmg * comboBonus * rageMulti * tauntBonus * (isCrit ? 1.75 : 1);

  def.hp    = Math.max(0, def.hp - dmg);
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
  gs.particles.push(...mkParticles(hx, hy, pc, isFinisher ? 40 : isCrit ? 28 : isSuper ? 32 : 18));

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
  if (isFinisher)  { gs.shakeFrames = 24; gs.shakeIntensity = 14; gs.slowMotionFrames = 40; }
  else if (isSuper){ gs.shakeFrames = 18; gs.shakeIntensity = 10; gs.slowMotionFrames = 18; }
  else if (isSpecial) { gs.shakeFrames = 9;  gs.shakeIntensity = 5; }
  else if (isCrit)    { gs.shakeFrames = 10; gs.shakeIntensity = 7; gs.slowMotionFrames = 12; }

  // ── Cinematic KO check ──
  if (def.hp <= 0 && !gs.cinematicKO) {
    gs.cinematicKO       = true;
    gs.cinematicKOTimer  = 80;
    gs.slowMotionFrames  = 80;
    gs.shakeFrames       = 28;
    gs.shakeIntensity    = 12;
    gs.particles.push(...mkParticles(def.x, def.y - FH*0.5, pc, 60));
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
  gs.particles.push(...mkParticles(cx, cy, "#ffffff", 30));
  gs.particles.push(...mkParticles(cx, cy, "#ffaa00", 20));
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
    if (gs.tick % 3 !== 0) { gs.tick++; tickParticles(gs); return; }
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
      gs.wins[winner]++;
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
      .filter(r => r.life > 0);
  }
  gs.fighters.forEach(f => { if (f.personalityTimer > 0) f.personalityTimer--; });
}

// ═══════════════════════════════════════════════════════════════
// DRAWING
// ═══════════════════════════════════════════════════════════════
function drawBG(ctx, tick, gs) {
  // ── Sky gradient ──
  const sky = ctx.createLinearGradient(0, 0, 0, CH);
  sky.addColorStop(0, "#02020c"); sky.addColorStop(1, "#0a0a22");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, CH);

  // ── Parallax stars (2 layers) ──
  for (let i = 0; i < 55; i++) {
    const sx = ((i * 139 + 17) + tick * 0.08) % CW;
    const sy = (i * 71 + 9) % (CH * 0.52);
    ctx.globalAlpha = (0.2 + 0.6 * Math.abs(Math.sin(tick * 0.008 + i))) * 0.5;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(sx, sy, 1, 1);
  }
  for (let i = 0; i < 30; i++) {
    const sx = ((i * 223 + 55) + tick * 0.03) % CW;
    const sy = (i * 97 + 22) % (CH * 0.48);
    ctx.globalAlpha = (0.1 + 0.4 * Math.abs(Math.sin(tick * 0.012 + i * 2))) * 0.4;
    ctx.fillStyle = "#aaccff"; ctx.fillRect(sx, sy, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  // ── City buildings (back layer) ──
  ctx.fillStyle = "#05051a";
  [[0,155,52],[56,118,46],[106,142,40],[150,128,32],[186,160,24],
   [558,160,24],[586,128,32],[622,142,40],[666,118,46],[716,155,52],[768,138,32]]
    .forEach(([bx, by, bw]) => ctx.fillRect(bx, by, bw, CH));

  // ── Neon signs on buildings ──
  const signs = [
    { x: 62,  y: 104, text: "NEON",   col: "#ff0066", period: 90  },
    { x: 620, y: 112, text: "BRAWL",  col: "#00e5ff", period: 110 },
    { x: 160, y: 116, text: "FIGHT",  col: "#ffdd00", period: 70  },
    { x: 726, y: 140, text: "K.O.",   col: "#ff4400", period: 130 },
  ];
  signs.forEach(s => {
    const on = Math.floor(tick / (s.period / 2)) % 2 === 0;
    ctx.save();
    ctx.font = "bold 8px 'Courier New'"; ctx.textAlign = "center";
    ctx.fillStyle = on ? s.col : rgba(s.col.replace("#",""), 0.25);
    ctx.shadowColor = s.col; ctx.shadowBlur = on ? 14 : 0;
    ctx.globalAlpha = on ? 0.9 : 0.3;
    ctx.fillText(s.text, s.x, s.y);
    ctx.restore();
  });

  // ── Blinking building windows ──
  for (let i = 0; i < 28; i++) {
    if ((tick + i * 23) % 200 < 140) {
      ctx.globalAlpha = 0.3; ctx.fillStyle = "#ffffaa";
      ctx.fillRect(10 + i * 29 + (i % 5) * 4, 122 + (i % 5) * 14, 5, 6);
    }
  }
  ctx.globalAlpha = 1;

  // ── Spotlight beams sweeping from below ──
  const spots = [
    { baseX: 180, phase: 0,   r: 0,   g: 229, b: 255, a: 0.06 },
    { baseX: 620, phase: 1.8, r: 255, g: 0,   b: 100, a: 0.05 },
    { baseX: 400, phase: 3.5, r: 255, g: 200, b: 0,   a: 0.04 },
  ];
  spots.forEach(sp => {
    const angle = Math.sin(tick * 0.018 + sp.phase) * 0.35;
    const tx2 = sp.baseX + Math.tan(angle) * (CH - GROUND - 10);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sp.baseX - 14, CH);
    ctx.lineTo(sp.baseX + 14, CH);
    ctx.lineTo(tx2 + 28, GROUND - 18);
    ctx.lineTo(tx2 - 28, GROUND - 18);
    ctx.closePath();
    const sg = ctx.createLinearGradient(sp.baseX, CH, tx2, GROUND);
    sg.addColorStop(0,   `rgba(${sp.r},${sp.g},${sp.b},0)`);
    sg.addColorStop(0.5, `rgba(${sp.r},${sp.g},${sp.b},${sp.a})`);
    sg.addColorStop(1,   `rgba(${sp.r},${sp.g},${sp.b},0)`);
    ctx.fillStyle = sg; ctx.globalAlpha = 1;
    ctx.fill(); ctx.restore();
  });

  // ── CROWD silhouettes at bottom edge ──
  const crowdY = GROUND + 2;
  const excitement = gs && (gs.phase === "ko" || (gs.fighters && gs.fighters.some(f => f.comboCount >= 3))) ? 1 : 0;
  for (let i = 0; i < 38; i++) {
    const cx2 = i * 22 + (i % 3) * 4;
    const bobAmt = excitement > 0
      ? Math.abs(Math.sin(tick * 0.18 + i * 0.7)) * 14
      : Math.abs(Math.sin(tick * 0.06 + i * 0.9)) * 5;
    const ch2 = 18 + (i % 5) * 5 + bobAmt;
    const alpha = 0.22 + (i % 4) * 0.04;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#000000";
    // Head
    ctx.beginPath(); ctx.arc(cx2 + 11, crowdY - ch2 + 5, 5 + (i%3), 0, Math.PI*2); ctx.fill();
    // Body
    ctx.beginPath(); ctx.fillRect(cx2 + 5, crowdY - ch2 + 9, 12, ch2 - 9); ctx.fill();
    // Occasional colored lighter / phone
    if (i % 5 === 0) {
      const lc = ["#ff4400","#00e5ff","#ffdd00","#ff00ff"][i % 4];
      ctx.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(tick * 0.1 + i));
      ctx.fillStyle = lc; ctx.shadowColor = lc; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(cx2 + 11, crowdY - ch2 - 2, 3, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
  ctx.globalAlpha = 1;

  // ── Floor ──
  const floor = ctx.createLinearGradient(0, GROUND, 0, CH);
  floor.addColorStop(0, "#141430"); floor.addColorStop(1, "#07071a");
  ctx.fillStyle = floor; ctx.fillRect(0, GROUND, CW, CH - GROUND);
  // Floor reflection strips
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#00e5ff" : "#ff0066";
    ctx.fillRect(i * 135, GROUND, 135, CH - GROUND);
  }
  ctx.globalAlpha = 1;
  ctx.save(); ctx.shadowColor = "#5050ff"; ctx.shadowBlur = 28;
  ctx.strokeStyle = "#4444cc"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(CW, GROUND); ctx.stroke();
  ctx.restore();

  // ── CRT scanlines ──
  ctx.globalAlpha = 0.032;
  for (let sy = 0; sy < CH; sy += 3) { ctx.fillStyle = "#000"; ctx.fillRect(0, sy, CW, 1.5); }
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
    // X eyes
    const hx2 = x + dir * (-FH * 0.33), hy2 = fy - FW * 0.2;
    ctx.strokeStyle = "#ff0000"; ctx.lineWidth = 2.5; ctx.shadowColor = "#ff0000"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(hx2-6, hy2-5); ctx.lineTo(hx2-1, hy2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx2-1, hy2-5); ctx.lineTo(hx2-6, hy2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx2+1, hy2-5); ctx.lineTo(hx2+6, hy2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx2+6, hy2-5); ctx.lineTo(hx2+1, hy2); ctx.stroke();
    // Dizzy stars + sparkles
    for (let i = 0; i < 5; i++) {
      const a2 = tick * 0.1 + i * (Math.PI * 2 / 5);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = i % 2 === 0 ? "#ffff44" : "#ff9900";
      ctx.shadowColor = "#ffff00"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(x + Math.cos(a2)*26, fy - FH*0.75 + Math.sin(a2)*11, 4.5, 0, Math.PI*2); ctx.fill();
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

    // ── KICK: big boot sweep ──────────────────────────────────
    } else if (attackType === "kick") {
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
      <div style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {/* Special on top */}
        <div style={atk("255,0,255", 50)} {...mkHandlers("KeyD")}>
          <span style={{ textAlign: "center", lineHeight: 1.2 }}>SPE<br/>CIAL</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={atk("0,229,255", 50)} {...mkHandlers("KeyA")}>
            <span style={{ textAlign: "center", lineHeight: 1.2 }}>PUN<br/>CH</span>
          </div>
          <div style={atk("255,160,0", 50)} {...mkHandlers("KeyS")}>
            <span style={{ textAlign: "center", lineHeight: 1.2 }}>KI<br/>CK</span>
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
      // ── KO RED DANGER EFFECT ──
      if (gph === "ko") {
        const p1 = 0.35 + 0.28 * Math.abs(Math.sin(tick * 0.14));
        const p2 = 0.18 + 0.18 * Math.abs(Math.sin(tick * 0.22 + 1));
        // Deep blood vignette
        const vg = ctx.createRadialGradient(CW/2, CH/2, CW*0.18, CW/2, CH/2, CW*0.82);
        vg.addColorStop(0,   "rgba(0,0,0,0)");
        vg.addColorStop(0.6, `rgba(120,0,0,${p2})`);
        vg.addColorStop(1,   `rgba(220,0,0,${p1})`);
        ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH);
        // Red scanlines overlay
        ctx.globalAlpha = 0.07;
        for (let sy = 0; sy < CH; sy += 4) {
          ctx.fillStyle = "#ff0000"; ctx.fillRect(0, sy, CW, 2);
        }
        ctx.globalAlpha = 1;
        // Pulsing danger border
        const bw = 6 + 4 * Math.abs(Math.sin(tick * 0.25));
        ctx.strokeStyle = `rgba(255,0,0,${p1 * 1.8})`; ctx.lineWidth = bw;
        ctx.strokeRect(bw/2, bw/2, CW-bw, CH-bw);
        // Corner danger triangles
        const cs = 28 + 6 * Math.abs(Math.sin(tick * 0.18));
        ctx.fillStyle = `rgba(255,0,0,${p1})`;
        [[0,0,1,1],[CW,0,-1,1],[0,CH,1,-1],[CW,CH,-1,-1]].forEach(([cx2,cy2,sx2,sy2]) => {
          ctx.beginPath(); ctx.moveTo(cx2,cy2);
          ctx.lineTo(cx2+sx2*cs*2, cy2); ctx.lineTo(cx2, cy2+sy2*cs*2);
          ctx.closePath(); ctx.fill();
        });
        // DANGER text flicker
        if (tick % 14 < 9) {
          ctx.save();
          ctx.font = "bold 11px 'Courier New'"; ctx.textAlign = "center";
          ctx.fillStyle = `rgba(255,40,40,${p1 * 1.2})`;
          ctx.shadowColor = "#ff0000"; ctx.shadowBlur = 12;
          ctx.fillText("⚠ K.O. ⚠", CW/2, CH - 14);
          ctx.restore();
        }
      }
      // Screen flash on hit
      if (flashFrames > 0) { ctx.fillStyle = `rgba(255,255,255,${flashFrames * 0.013})`; ctx.fillRect(0, 0, CW, CH); }
      if (gs.shakeFrames > 0) {
        const si = gs.shakeIntensity * (gs.shakeFrames / 18);
        ctx.save(); ctx.translate((Math.random()-0.5)*si, (Math.random()-0.5)*si);
      }
      drawFighter(ctx, f1, tick); drawFighter(ctx, f2, tick);
      if (gs.shakeFrames > 0) ctx.restore();
      drawParticles(ctx, particles);
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
        setResults({ winner: gs.wins[0] >= WINS_NEEDED ? f1.name : "CPU", wins: [...gs.wins], playerName: f1.name });
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
    const gs = initGS(name.toUpperCase(), difficulty);
    gs.resultsTriggered = false;
    gsRef.current = gs;
    beginRound(gs);
    setUiPhase("game");
  }

  function handleRematch() {
    const name = gsRef.current?.fighters[0]?.name || playerName.trim().toUpperCase();
    const gs = initGS(name, difficulty);
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

            {/* ── TITLE ── */}
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: "clamp(32px, 9vw, 62px)", fontWeight: "bold", color: "#fff",
                letterSpacing: "clamp(4px, 2vw, 14px)",
                textShadow: "0 0 30px #ff0000, 0 0 60px #ff00ff, 0 0 100px #00ffff",
                lineHeight: 1,
              }}>BEAT ME</div>
              <div style={{ fontSize: "clamp(9px,2vw,12px)", color: "#ff4433", letterSpacing: 8, marginTop: 6, fontWeight: "bold" }}>
                1 PLAYER · VS · CPU
              </div>
            </div>

            {/* ── NAME INPUT BLOCK ── */}
            <div style={{ width: "100%", maxWidth: 420, boxSizing: "border-box" }}>
              <div style={{ fontSize: 10, color: "#00e5ff", letterSpacing: 5, fontWeight: "bold", marginBottom: 8, textShadow: "0 0 8px #00e5ff" }}>
                ▸ YOUR FIGHTER NAME
              </div>
              <input
                type="text"
                maxLength={12}
                value={playerName}
                onChange={e => { setPlayerName(e.target.value); setNameError(""); }}
                onKeyDown={e => e.key === "Enter" && handleStart()}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="TYPE YOUR NAME"
                autoFocus
                style={{
                  display: "block", width: "100%", boxSizing: "border-box",
                  background: focused ? "rgba(0,229,255,0.12)" : "rgba(0,229,255,0.05)",
                  border: `2px solid ${focused ? "#00e5ff" : "rgba(0,229,255,0.35)"}`,
                  color: "#fff", fontSize: "clamp(16px,5vw,24px)", fontFamily: F,
                  fontWeight: "bold", letterSpacing: 6, textAlign: "center",
                  padding: "14px 12px", outline: "none", textTransform: "uppercase",
                  boxShadow: focused ? "0 0 28px rgba(0,229,255,0.4)" : "none",
                  transition: "all 0.15s", borderRadius: 4,
                }}
              />
              {nameError
                ? <div style={{ color: "#ff4444", fontSize: 11, letterSpacing: 2, marginTop: 7, textAlign: "center", fontWeight: "bold" }}>⚠ {nameError}</div>
                : <div style={{ color: "#224455", fontSize: 9, letterSpacing: 3, marginTop: 7, textAlign: "center" }}>{playerName.trim().length} / 12 CHARS</div>
              }
            </div>

            {/* ── LEVEL SELECT ── */}
            <div style={{ width: "100%", maxWidth: 420, boxSizing: "border-box" }}>
              <div style={{ fontSize: 10, color: "#ff4422", letterSpacing: 5, fontWeight: "bold", marginBottom: 10, textShadow: "0 0 8px #ff2200" }}>
                ◈ SELECT LEVEL
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { d: "easy",      num: "1", label: "EASY",      dc: "#44dd44", desc: "Beginner",   icon: "🟢" },
                  { d: "semipro",   num: "2", label: "SEMI PRO",  dc: "#ffcc00", desc: "Moderate",   icon: "🟡" },
                  { d: "pro",       num: "3", label: "PRO",       dc: "#ff7700", desc: "Challenging", icon: "🟠" },
                  { d: "legendary", num: "4", label: "LEGENDARY", dc: "#ff0044", desc: "Insane",      icon: "🔴" },
                ].map(({ d, num, label, dc, desc, icon }) => {
                  const sel = difficulty === d;
                  return (
                    <button key={d} onClick={() => setDifficulty(d)} style={{
                      flex: 1, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      gap: 4, padding: "12px 4px 10px",
                      background: sel ? `rgba(${d==="easy"?"0,180,0":d==="semipro"?"180,140,0":d==="pro"?"180,80,0":"180,0,40"},0.18)` : "rgba(20,5,5,0.5)",
                      border: `2px solid ${sel ? dc : "rgba(80,20,10,0.35)"}`,
                      borderRadius: 6, cursor: "pointer", outline: "none",
                      boxShadow: sel ? `0 0 20px ${dc}55, inset 0 0 12px ${dc}11` : "none",
                      transform: sel ? "scale(1.04)" : "scale(1)",
                      transition: "all 0.15s",
                    }}>
                      {/* Number badge */}
                      <span style={{
                        fontSize: "clamp(20px,5vw,30px)", fontWeight: "bold", lineHeight: 1,
                        color: sel ? dc : "#442211",
                        textShadow: sel ? `0 0 14px ${dc}` : "none",
                        fontFamily: F,
                      }}>{num}</span>
                      {/* Icon */}
                      <span style={{ fontSize: "clamp(10px,3vw,15px)", lineHeight: 1 }}>{icon}</span>
                      {/* Label */}
                      <span style={{
                        fontSize: "clamp(6px,1.6vw,9px)", letterSpacing: 1,
                        fontWeight: "bold", color: sel ? dc : "#553322",
                        fontFamily: F, textTransform: "uppercase",
                        opacity: sel ? 1 : 0.55,
                      }}>{label}</span>
                      {/* Desc — only on selected */}
                      {sel && (
                        <span style={{ fontSize: "clamp(5px,1.3vw,8px)", color: dc, opacity: 0.75, fontFamily: F, letterSpacing: 1 }}>
                          {desc}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── FIGHT BUTTON ── */}
            <button
              style={{
                width: "100%", maxWidth: 420, boxSizing: "border-box",
                padding: "16px 0",
                background: "rgba(255,20,10,0.14)",
                border: "2px solid #ff3322",
                color: "#ff6655", fontSize: "clamp(12px,4vw,16px)",
                fontFamily: F, fontWeight: "bold", letterSpacing: "clamp(3px,1.5vw,8px)",
                cursor: "pointer", textTransform: "uppercase",
                boxShadow: "0 0 24px rgba(255,20,10,0.35)",
                textShadow: "0 0 10px #ff2200",
                outline: "none", borderRadius: 4, transition: "all 0.15s",
              }}
              onMouseOver={e => { e.currentTarget.style.background="rgba(255,20,10,0.26)"; e.currentTarget.style.boxShadow="0 0 44px rgba(255,20,10,0.6)"; }}
              onMouseOut={e  => { e.currentTarget.style.background="rgba(255,20,10,0.14)"; e.currentTarget.style.boxShadow="0 0 24px rgba(255,20,10,0.35)"; }}
              onClick={handleStart}
            >
              ▶ FIGHT !
            </button>

            {/* ── CONTROLS HINT ── */}
            <div style={{ width: "100%", maxWidth: 420, fontSize: 9, color: "#223344", letterSpacing: 2, lineHeight: 2, textAlign: "center" }}>
              ← → MOVE · ↑/W JUMP · ↓ BLOCK · A PUNCH · S KICK · D SPECIAL · ↑+D SUPER · T TAUNT
            </div>

          </div>
        )}

        {/* ─────────── RESULTS ─────────── */}
        {uiPhase === "results" && results && (
          <div style={overlay}>
            <div style={{ fontSize: 9, color: "#222244", letterSpacing: 10 }}>MATCH COMPLETE</div>

            <div style={{ fontSize: "clamp(28px, 7vw, 50px)", fontWeight: "bold", color: "#fff", letterSpacing: 5,
                          textShadow: results.winner === "CPU"
                            ? `0 0 30px ${cpuColor}, 0 0 70px #ff0000`
                            : `0 0 30px ${playerColor}, 0 0 70px #ff00ff` }}>
              {results.winner}
            </div>
            <div style={{ fontSize: 12, color: "#6666aa", letterSpacing: 6, marginTop: -6 }}>
              WINS THE MATCH
            </div>

            {/* Score card */}
            <div style={{ display: "flex", gap: 0, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden", marginTop: 8 }}>
              <div style={{ padding: "14px 28px", textAlign: "center", background: "rgba(0,229,255,0.06)",
                            borderRight: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize: 9, color: "#336677", letterSpacing: 3, marginBottom: 8 }}>{results.playerName}</div>
                <div style={{ fontSize: 46, fontWeight: "bold", color: playerColor, textShadow: `0 0 18px ${playerColor}` }}>
                  {results.wins[0]}
                </div>
              </div>
              <div style={{ padding: "18px 24px", display: "flex", alignItems: "center" }}>
                <span style={{ color: "#181830", fontSize: 16, fontWeight: "bold" }}>VS</span>
              </div>
              <div style={{ padding: "14px 28px", textAlign: "center", background: "rgba(255,64,64,0.06)",
                            borderLeft: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize: 9, color: "#663333", letterSpacing: 3, marginBottom: 8 }}>CPU</div>
                <div style={{ fontSize: 46, fontWeight: "bold", color: cpuColor, textShadow: `0 0 18px ${cpuColor}` }}>
                  {results.wins[1]}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button
                style={neonBtn(playerColor)}
                onMouseOver={e => { e.currentTarget.style.boxShadow = `0 0 32px ${playerColor}88`; e.currentTarget.style.background = "rgba(0,229,255,0.07)"; }}
                onMouseOut={e  => { e.currentTarget.style.boxShadow = `0 0 16px ${playerColor}44`; e.currentTarget.style.background = "transparent"; }}
                onClick={handleRematch}
              >
                REMATCH
              </button>
              <button
                style={neonBtn("#444466")}
                onMouseOver={e => { e.currentTarget.style.boxShadow = "0 0 32px #44446688"; e.currentTarget.style.background = "rgba(68,68,102,0.07)"; }}
                onMouseOut={e  => { e.currentTarget.style.boxShadow = "0 0 16px #44446644"; e.currentTarget.style.background = "transparent"; }}
                onClick={() => { setResults(null); setUiPhase("enter_name"); }}
              >
                CHANGE NAME
              </button>
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
