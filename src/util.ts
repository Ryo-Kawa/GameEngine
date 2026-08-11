import { useRef, useEffect } from "react";
import { OptionsState } from "./types";
import { RuntimeState, UnlockedEndingRecord } from "./GameContext";

export const SaveManager = {
  SAVE_KEY: "savegame:slot1",
  OPTIONS_KEY: "options:main",
  ENDINGS_KEY: "unlocked_endings",

  async save(data: RuntimeState): Promise<boolean> {
    try {
      await (window as any).storage.set(this.SAVE_KEY, JSON.stringify(data), false);
      console.log("[SaveManager] saved:", data);
      return true;
    } catch (e) {
      console.error("[SaveManager] save failed", e);
      return false;
    }
  },
  async load(): Promise<RuntimeState | null> {
    try {
      const res = await (window as any).storage.get(this.SAVE_KEY, false);
      return res ? (JSON.parse(res.value) as RuntimeState) : null;
    } catch (e) {
      console.log("[SaveManager] no save data found");
      return null;
    }
  },
  async saveOptions(options: OptionsState): Promise<void> {
    try {
      await (window as any).storage.set(this.OPTIONS_KEY, JSON.stringify(options), false);
    } catch (e) {
      console.error("[SaveManager] saveOptions failed", e);
    }
  },
  async loadOptions(): Promise<OptionsState | null> {
    try {
      const res = await (window as any).storage.get(this.OPTIONS_KEY, false);
      return res ? (JSON.parse(res.value) as OptionsState) : null;
    } catch (e) {
      return null;
    }
  },
  async loadUnlockedEndings(): Promise<UnlockedEndingRecord[]> {
    try {
      const res = await (window as any).storage.get(this.ENDINGS_KEY, false);
      return res ? (JSON.parse(res.value) as UnlockedEndingRecord[]) : [];
    } catch (e) {
      return [];
    }
  },
  async saveUnlockedEndings(list: UnlockedEndingRecord[]): Promise<void> {
    try {
      await (window as any).storage.set(this.ENDINGS_KEY, JSON.stringify(list), false);
    } catch (e) {
      console.error("[SaveManager] saveUnlockedEndings failed", e);
    }
  },
};

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function rectsOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy < (ar + br) * (ar + br);
}

// キーボード押下状態を ref で保持するフック(canvasループから直接参照するため)
export function useKeyboardRef() {
  const keysRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  return keysRef;
}