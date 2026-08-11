import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bomb,
  Sparkles,
  Skull,
} from "lucide-react";
import { STG_SETTINGS, STG_STAGES, THEME, UI_LABELS } from "../consts";
import { useGame } from "../GameContext";
import { useKeyboardRef, clamp, rectsOverlap } from "../util";

export const {
  width: STG_WIDTH,
  height: STG_HEIGHT,
  playerSpeed: PLAYER_SPEED,
  playerRadius: PLAYER_RADIUS,
  shotCooldown: SHOT_COOLDOWN,
  bombInvulnTime: BOMB_INVULN_TIME,
  hitInvulnTime: HIT_INVULN_TIME,
} = STG_SETTINGS;

export function getShotPattern(power: number): number[] {
  return STG_SETTINGS.shotPatternByPower[power] || STG_SETTINGS.shotPatternByPower[1];
}

export interface STGPlayer {
  x: number;
  y: number;
  power: number;
  shotTimer: number;
  invuln: number;
}
export interface STGBullet {
  x: number;
  y: number;
  vx?: number;
  vy: number;
}
export interface STGEnemy {
  type: "grunt";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  vy: number;
  t: number;
  shotTimer: number;
}
export interface STGBoss {
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  t: number;
  shotTimer: number;
}
export interface STGItem {
  x: number;
  y: number;
}
export interface STGWorld {
  player: STGPlayer;
  bombs: number;
  bombKeyLatch: boolean;
  playerBullets: STGBullet[];
  enemies: STGEnemy[];
  enemyBullets: STGBullet[];
  items: STGItem[];
  gruntsSpawned: number;
  gruntsDefeated: number;
  spawnTimer: number;
  boss: STGBoss | null;
  bossSpawned: boolean;
  cleared: boolean;
  lastTime: number;
}
export interface STGHud {
  bombs: number;
  hitCount: number;
  bossHp: number | null;
  bossMaxHp: number | null;
  gruntsLeft: number;
  cleared: boolean;
}

export function STGPart({ stageKey, onComplete }: { stageKey: string; onComplete: () => void }) {
  const { state, dispatch } = useGame();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useKeyboardRef();
  const rafRef = useRef<number | null>(null);
  const worldRef = useRef<STGWorld | null>(null);

  const [hud, setHud] = useState<STGHud>({
    bombs: 1,
    hitCount: state.runtime.hitCount,
    bossHp: null,
    bossMaxHp: null,
    gruntsLeft: 0,
    cleared: false,
  });

  const stageConfig = STG_STAGES[stageKey];

  // ワールド初期化
  useEffect(() => {
    worldRef.current = {
      player: { x: STG_WIDTH / 2, y: STG_HEIGHT - 80, power: 1, shotTimer: 0, invuln: 0 },
      bombs: 1,
      bombKeyLatch: false,
      playerBullets: [],
      enemies: [],
      enemyBullets: [],
      items: [],
      gruntsSpawned: 0,
      gruntsDefeated: 0,
      spawnTimer: 0,
      boss: null,
      bossSpawned: false,
      cleared: false,
      lastTime: performance.now(),
    };
    setHud((h) => ({
      ...h,
      bombs: 1,
      gruntsLeft: stageConfig.grunts,
      bossHp: null,
      bossMaxHp: stageConfig.boss.hp,
      cleared: false,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageKey]);

  // メインループ
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function spawnGrunt(world: STGWorld) {
      world.enemies.push({
        type: "grunt",
        x: 40 + Math.random() * (STG_WIDTH - 80),
        y: -20,
        hp: stageConfig.gruntHp,
        maxHp: stageConfig.gruntHp,
        vy: 70,
        t: 0,
        shotTimer: 1 + Math.random(),
      });
      world.gruntsSpawned += 1;
    }

    function spawnBoss(world: STGWorld) {
      world.boss = {
        name: stageConfig.boss.name,
        x: STG_WIDTH / 2,
        y: 100,
        hp: stageConfig.boss.hp,
        maxHp: stageConfig.boss.hp,
        t: 0,
        shotTimer: 0,
      };
      world.bossSpawned = true;
      console.log(`[STG] BOSS APPEARED: ${stageConfig.boss.name}`);
    }

    function tick(now: number) {
      const world = worldRef.current;
      if (!world || world.cleared) return;
      const dt = Math.min(0.033, (now - world.lastTime) / 1000);
      world.lastTime = now;

      const keys = keysRef.current;
      const p = world.player;

      if (p.invuln > 0) p.invuln -= dt;

      let dx = 0,
        dy = 0;
      if (keys["ArrowLeft"]) dx -= 1;
      if (keys["ArrowRight"]) dx += 1;
      if (keys["ArrowUp"]) dy -= 1;
      if (keys["ArrowDown"]) dy += 1;
      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }
      p.x = clamp(p.x + dx * PLAYER_SPEED * dt, 12, STG_WIDTH - 12);
      p.y = clamp(p.y + dy * PLAYER_SPEED * dt, 12, STG_HEIGHT - 12);

      p.shotTimer -= dt;
      if (keys["KeyZ"] && p.shotTimer <= 0) {
        p.shotTimer = SHOT_COOLDOWN;
        for (const offset of getShotPattern(p.power)) {
          world.playerBullets.push({ x: p.x + offset, y: p.y - 14, vy: -520 });
        }
      }

      if (keys["KeyX"] && !world.bombKeyLatch && world.bombs > 0) {
        world.bombKeyLatch = true;
        world.bombs -= 1;
        world.enemyBullets = [];
        p.invuln = Math.max(p.invuln, BOMB_INVULN_TIME);
        for (const en of world.enemies) en.hp -= 3;
        if (world.boss) world.boss.hp -= 8;
        setHud((h) => ({ ...h, bombs: world.bombs }));
        console.log("[STG] BOMB used");
      }
      if (!keys["KeyX"]) world.bombKeyLatch = false;

      if (!world.bossSpawned && world.gruntsSpawned < stageConfig.grunts) {
        world.spawnTimer -= dt;
        if (world.spawnTimer <= 0) {
          world.spawnTimer = stageConfig.gruntSpawnInterval;
          spawnGrunt(world);
        }
      }
      if (!world.bossSpawned && world.gruntsSpawned >= stageConfig.grunts && world.enemies.length === 0) {
        spawnBoss(world);
      }

      for (const en of world.enemies) {
        en.t += dt;
        en.y += en.vy * dt;
        en.x += Math.sin(en.t * 2) * 30 * dt;
        en.shotTimer -= dt;
        if (en.shotTimer <= 0 && en.y > 0 && en.y < STG_HEIGHT - 60) {
          en.shotTimer = 1.4 + Math.random() * 0.6;
          const ang = Math.atan2(p.y - en.y, p.x - en.x);
          world.enemyBullets.push({ x: en.x, y: en.y, vx: Math.cos(ang) * 130, vy: Math.sin(ang) * 130 });
        }
      }
      world.enemies = world.enemies.filter((e) => e.y < STG_HEIGHT + 40);

      if (world.boss) {
        const b = world.boss;
        b.t += dt;
        b.x = STG_WIDTH / 2 + Math.sin(b.t * 0.8) * (STG_WIDTH / 2 - 60);
        b.shotTimer -= dt;
        if (b.shotTimer <= 0) {
          b.shotTimer = 0.5;
          const bulletCount = 10;
          for (let i = 0; i < bulletCount; i++) {
            const ang = (Math.PI * 2 * i) / bulletCount + b.t;
            world.enemyBullets.push({
              x: b.x,
              y: b.y,
              vx: Math.cos(ang) * stageConfig.boss.bulletSpeed,
              vy: Math.sin(ang) * stageConfig.boss.bulletSpeed,
            });
          }
        }
      }

      world.playerBullets.forEach((b) => (b.y += b.vy * dt));
      world.playerBullets = world.playerBullets.filter((b) => b.y > -20);

      world.enemyBullets.forEach((b) => {
        b.x += (b.vx || 0) * dt;
        b.y += b.vy * dt;
      });
      world.enemyBullets = world.enemyBullets.filter(
        (b) => b.x > -20 && b.x < STG_WIDTH + 20 && b.y > -20 && b.y < STG_HEIGHT + 20
      );

      world.items.forEach((it) => (it.y += 90 * dt));
      world.items = world.items.filter((it) => {
        if (rectsOverlap(it.x, it.y, 10, p.x, p.y, PLAYER_RADIUS + 8)) return false;
        return it.y < STG_HEIGHT + 20;
      });

      for (const en of world.enemies) {
        for (const b of world.playerBullets) {
          if (en.hp > 0 && rectsOverlap(en.x, en.y, 12, b.x, b.y, 3)) {
            en.hp -= 1;
            b.y = -9999;
          }
        }
      }
      world.playerBullets = world.playerBullets.filter((b) => b.y !== -9999);

      const beforeCount = world.enemies.length;
      const defeated = world.enemies.filter((e) => e.hp <= 0);
      defeated.forEach((e) => world.items.push({ x: e.x, y: e.y }));
      world.enemies = world.enemies.filter((e) => e.hp > 0);
      world.gruntsDefeated += beforeCount - world.enemies.length;

      if (world.boss) {
        for (const b of world.playerBullets) {
          if (rectsOverlap(world.boss.x, world.boss.y, 26, b.x, b.y, 3)) {
            world.boss.hp -= 1;
            b.y = -9999;
          }
        }
        world.playerBullets = world.playerBullets.filter((b) => b.y !== -9999);

        if (world.boss.hp <= 0) {
          console.log("[STG] BOSS DEFEATED");
          world.cleared = true;
          setHud((h) => ({ ...h, cleared: true, bossHp: 0 }));
        } else {
          setHud((h) => ({ ...h, bossHp: world.boss!.hp }));
        }
      }

      if (p.invuln <= 0) {
        let hit = false;
        for (const b of world.enemyBullets) {
          if (rectsOverlap(p.x, p.y, PLAYER_RADIUS, b.x, b.y, 3)) {
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (const en of world.enemies) {
            if (rectsOverlap(p.x, p.y, PLAYER_RADIUS, en.x, en.y, 12)) {
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          p.invuln = HIT_INVULN_TIME;
          dispatch({ type: "STG_HIT" });
          setHud((h) => ({ ...h, hitCount: h.hitCount + 1 }));
          console.log("[STG] PLAYER HIT");
        }
      }

      setHud((h) => ({
        ...h,
        gruntsLeft: Math.max(0, stageConfig.grunts - world.gruntsDefeated),
      }));

      draw(ctx!, world, p);

      if (world.cleared) {
        setTimeout(() => onComplete(), 900);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageKey]);

  function draw(ctx: CanvasRenderingContext2D, world: STGWorld, p: STGPlayer) {
    ctx.fillStyle = THEME.bgSTG;
    ctx.fillRect(0, 0, STG_WIDTH, STG_HEIGHT);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < STG_HEIGHT; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(STG_WIDTH, i);
      ctx.stroke();
    }

    ctx.fillStyle = THEME.accent;
    world.items.forEach((it) => {
      ctx.beginPath();
      ctx.arc(it.x, it.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = THEME.info;
    world.playerBullets.forEach((b) => {
      ctx.fillRect(b.x - 2, b.y - 8, 4, 12);
    });

    world.enemies.forEach((en) => {
      ctx.fillStyle = THEME.danger;
      ctx.beginPath();
      ctx.arc(en.x, en.y, 12, 0, Math.PI * 2);
      ctx.fill();
    });

    if (world.boss) {
      ctx.fillStyle = THEME.purple;
      ctx.beginPath();
      ctx.arc(world.boss.x, world.boss.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#f26d6d";
    world.enemyBullets.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0 ? "#ffffff55" : THEME.textPrimary;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = THEME.accent;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  return (
    <div
      className="relative h-full w-full flex items-center justify-center gap-6 px-6"
      style={{ backgroundColor: THEME.bgSTG }}
    >
      {/* 左: STGゲーム画面 */}
      <div className="relative shrink-0" style={{ width: STG_WIDTH, height: STG_HEIGHT }}>
        <canvas
          ref={canvasRef}
          width={STG_WIDTH}
          height={STG_HEIGHT}
          className="border rounded-sm"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        />
        <div
          className="absolute bottom-2 left-2 text-[10px] tracking-widest"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          {stageConfig.label}
        </div>
        {hud.cleared && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="tracking-[0.3em] text-sm" style={{ color: THEME.accent }}>
              {UI_LABELS.stageClear}
            </div>
          </div>
        )}
      </div>

      {/* 右: ステータス表示パネル */}
      <div
        className="w-56 shrink-0 h-fit border rounded-sm p-4 space-y-5 font-mono"
        style={{ borderColor: "rgba(255,255,255,0.1)", backgroundColor: `${THEME.bgPanel}b3` }}
      >
        <div
          className="text-[10px] tracking-[0.3em] border-b pb-2"
          style={{ color: "rgba(255,255,255,0.3)", borderColor: "rgba(255,255,255,0.1)" }}
        >
          {UI_LABELS.statusPanelTitle}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span
            className="flex items-center gap-2 tracking-widest text-[11px]"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            <Bomb size={13} style={{ color: THEME.accent }} /> {UI_LABELS.bombLabel}
          </span>
          <span className="text-base" style={{ color: THEME.accent }}>
            {hud.bombs}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span
            className="flex items-center gap-2 tracking-widest text-[11px]"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            <Skull size={13} style={{ color: THEME.danger }} /> {UI_LABELS.hitCountLabel}
          </span>
          <span className="text-base" style={{ color: THEME.danger }}>
            {hud.hitCount}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span
            className="flex items-center gap-2 tracking-widest text-[11px]"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            <Sparkles size={13} style={{ color: THEME.info }} /> {UI_LABELS.gruntsLeftLabel}
          </span>
          <span className="text-base" style={{ color: THEME.info }}>
            {hud.gruntsLeft}
          </span>
        </div>

        {hud.bossHp !== null && (
          <div>
            <div
              className="text-[11px] tracking-widest mb-1.5"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              {stageConfig.boss.name}
            </div>
            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
              <div
                className="h-full transition-all"
                style={{
                  backgroundColor: THEME.purple,
                  width: `${clamp(((hud.bossHp || 0) / (hud.bossMaxHp || 1)) * 100, 0, 100)}%`,
                }}
              />
            </div>
            <div className="text-[10px] mt-1 text-right" style={{ color: "rgba(255,255,255,0.3)" }}>
              {Math.max(0, hud.bossHp)} / {hud.bossMaxHp}
            </div>
          </div>
        )}

        <div
          className="border-t pt-3 text-[10px] leading-relaxed tracking-wide"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.25)" }}
        >
          {UI_LABELS.controlsHintLines.map((line, i) => (
            <React.Fragment key={i}>
              {line}
              {i < UI_LABELS.controlsHintLines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}