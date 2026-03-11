# 👊 beatMEE

> A fast-paced 2D browser fighting game — 1 Player vs CPU. Built with React + HTML5 Canvas. No game engine. Just pure code.

**🎮 [Play Now → TakbirZaman.github.io/beatMEE](https://TakbirZaman.github.io/beatMEE/)**

---

## ✨ Features

### ⚔️ Core Combat
- **Punch, Kick, Special, Super Move, Air Attacks, Finisher**
- **Combo system** — chain hits for bonus damage (2× COMBO → SUPER COMBO → ⚡ UNSTOPPABLE ⚡)
- **Super Meter** — fills as you deal and receive damage. Unleash a super when full
- **Critical Hits** — random chance for 1.75× damage, especially in Rage Mode
- **Block** to absorb hits and build meter
- **Clash** — if both attack at the same moment, sparks fly and both get pushed back

### 🧠 4 Difficulty Levels
| Level | Feel |
|-------|------|
| 1 · Easy | Slow, forgiving. Good for beginners |
| 2 · Semi Pro | Moderate speed and aggression |
| 3 · Pro | Fast reactions, frequent supers |
| 4 · Legendary | Near-instant AI. Adaptive. Merciless |

**Legendary AI adapts to your playstyle:**
- Spam punch → CPU blocks 90% of them
- Stay far away → CPU rushes you instantly
- Block a lot → CPU uses Special/Super to chip through your guard

### 🔥 Hype Moments
- **Rage Mode** — at 25% HP your fighter gets faster attacks, +15% damage, and a glowing red aura
- **Last-Second Dodge** — 7% auto-dodge when HP is critical. Triggers slow-motion + crowd reaction
- **Near-Miss Slow Motion** — a punch that barely misses briefly slows time
- **Cinematic KO** — slow-motion + particles + screen shake on the final blow
- **Clutch Mechanic** — both fighters below 18 HP? All damage gets +25% boost
- **Taunt (T key)** — trash talk your opponent. Your next hit deals +20% bonus damage

### 🎭 Arena & Atmosphere
- **Live crowd** — 38 silhouettes that bob slowly, going wild on combos and KOs
- **Neon signs** on buildings flashing on their own timers
- **Sweeping spotlight beams** across the arena
- **Crowd reaction text** — "OOOH!", "WHAT A HIT!", "FINISH HIM!" pops up mid-fight
- **Fighter personality messages** — short trash talk lines after combos and taunts
- **KO red danger effect** — blood vignette, pulsing border, red scanlines, corner triangles

### 🎨 Customization
- **8 fighter colors** — pick before the match. Color carries to health bar, glow, and effects

### 📊 Stats
- **Win streak** shown on the menu and results screen
- **Match history** — last 5 results on the results screen

---

## 🕹️ Controls

| Key | Action |
|-----|--------|
| `← →` | Move |
| `↑` / `W` | Jump |
| `↓` | Block |
| `A` | Punch |
| `S` | Kick |
| `D` | Special (Energy Sword) |
| `↑ + D` | **SUPER MOVE** (when meter is full) |
| `↑ + A + D` | **FINISHER** (when enemy HP < 10%) |
| `T` | Taunt (+20% damage on next hit) |

**Mobile:** On-screen D-pad and attack buttons appear automatically on small screens.

---

## 🏗️ Tech Stack

| Tool | Purpose |
|------|---------|
| React 18 | UI overlays, state management |
| HTML5 Canvas API | All game rendering |
| Vite | Build tool |
| gh-pages | Deployment |

No game engine. No pixi.js. No three.js. Everything drawn manually on Canvas every frame.

### Key Architecture
- All game state in `useRef` — zero React re-renders during gameplay
- Fixed-step game loop with `requestAnimationFrame`
- Canvas for gameplay, React for UI overlays (HUD, menus, touch controls)
- CPU AI re-evaluates every N ticks based on difficulty, with pattern tracking for Legendary

---

## 🚀 Run Locally

```bash
git clone https://github.com/TakbirZaman/beatMEE.git
cd beatMEE
npm install
npm run dev
```

Open `http://localhost:5173/beatMEE/`

### Deploy
```bash
npm run deploy
```

---

## 📁 Structure

```
beatMEE/
├── src/
│   ├── beatMEE.jsx     ← entire game (single file)
│   └── main.jsx        ← React entry point
├── index.html
├── vite.config.js
└── package.json
```

---

## 👤 Author

**Takbir Zaman** — CSE Student @ AIUB · Full-Stack & ML Developer  
[@TakbirZaman](https://github.com/TakbirZaman)

---

*Built from scratch. No tutorials. Just vibes and `requestAnimationFrame`.*
