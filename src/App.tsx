/**
 * =============================================================================
 *  React Game Engine (TypeScript) — PC向け 会話パート + 弾幕STGパート ハイブリッド
 * =============================================================================
 *
 *  設計方針:
 *   - 「エンジン」として拡張しやすいこと最優先。あとから編集する可能性が高い値
 *     (配色・文言・シナリオ・ステージ構成・エンディング条件など)はすべて
 *     ファイル冒頭の「編集用データ」セクションに集約している。
 *     ロジック本体(コンポーネント/リデューサー/ゲームループ)を読まなくても
 *     このセクションの値を書き換えるだけでコンテンツを変更できる。
 *   - デバッグしやすさのため、
 *       (1) すべての状態遷移を useReducer + アクションログで一元管理
 *       (2) F1キーでデバッグパネル(現在のstate/フラグ)を表示可能
 *       (3) console.groupで各システムのログを分けて出力
 *   - セーブデータは window.storage (Claude Artifacts永続ストレージ) を使用。
 *
 *  ファイル構成:
 *   0. 型定義
 *   1. ★編集用データ(THEME / TEXT / SCENARIO / STG_STAGES / ENDINGS 等)★
 *   2. ユーティリティ (SaveManager, 数学関数, useKeyboardRef)
 *   3. GameContext (useReducer による中央状態管理)
 *   4. 画面コンポーネント (Menu / Manual / Options / EndingGallery)
 *   5. ゲーム画面振り分け (GameScreen)
 *   6. VNPart (会話パート)
 *   7. STGPart (弾幕STGパート, canvas)
 *   8. App (ルート)
 * =============================================================================
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Play,
  RotateCcw,
  BookOpen,
  Settings,
  ImageIcon,
  Power,
  Volume2,
  ArrowLeft,
  Bomb,
  Save,
  ChevronRight,
  Sparkles,
  Skull,
  Heart,
  LucideIcon,
} from "lucide-react";

/* =============================================================================
 * 0. 型定義
 * ========================================================================== */

type ScreenId = "menu" | "ending_gallery" | "manual" | "options" | "game";

interface Theme {
  bgPrimary: string; // 全体の背景
  bgSTG: string; // STGパートの背景
  bgPanel: string; // カード/パネルの背景
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  accent: string; // 強調色(ゴールド)
  accentSoft: string; // 強調色(半透明)
  border: string; // 標準ボーダー色
  danger: string; // 被弾/敵など警告色
  info: string; // 自弾/情報色
  purple: string; // ボス色
}

interface OptionsState {
  bgmVolume: number;
  seVolume: number;
}

type IconKey =
  | "Play"
  | "RotateCcw"
  | "ImageIcon"
  | "BookOpen"
  | "Settings"
  | "Power";

interface MenuButtonConfig {
  key: string;
  label: string;
  icon: IconKey;
  type: "start" | "continue" | "navigate" | "exit";
  screen?: ScreenId;
}

interface ManualSection {
  title: string;
  paragraphs?: string[];
  list?: string[];
}

interface VNChoice {
  label: string;
  next: string;
  setFlag?: Record<string, number>;
}

interface VNNode {
  speaker: string;
  text: string; // "___HIT_DEPENDENT___" の場合は HIT_DEPENDENT_TEXT から動的生成
  next?: string;
  choices?: VNChoice[];
  save?: boolean; // このノードでセーブボタンを表示するか
  endOfStage?: boolean; // このステージを終了し次のステージへ進むか
}

type Scenario = Record<string, VNNode>;

interface StageSequenceItem {
  id: string;
  type: "vn" | "stg" | "ending";
  startNode?: string; // type: "vn" のとき使用
  stageKey?: string; // type: "stg" のとき STG_STAGES のキーを指定
}

interface HitDependentTextRule {
  maxHit: number; // この被弾数以下ならこのテキストを採用
  text: string;
}

interface STGBossConfig {
  name: string;
  hp: number;
  bulletSpeed: number;
}

interface STGStageConfig {
  label: string;
  grunts: number; // 撃破対象の雑魚数(倒し切るとボス出現)
  gruntSpawnInterval: number; // 秒
  gruntHp: number;
  boss: STGBossConfig;
}

type STGStages = Record<string, STGStageConfig>;

interface STGSettings {
  width: number;
  height: number;
  playerSpeed: number; // px/sec
  playerRadius: number;
  shotCooldown: number; // 秒
  bombInvulnTime: number; // 秒
  hitInvulnTime: number; // 秒
  // 霊力(power)ごとの弾の広がり(自機中心からのオフセットpx配列)
  shotPatternByPower: Record<number, number[]>;
}

interface EndingLine {
  speaker: string;
  text: string;
}

interface EndingDef {
  id: string;
  title: string;
  color: string;
  lines: EndingLine[];
}

type Endings = Record<string, EndingDef>;

interface EndingRules {
  badHitThreshold: number; // 被弾数がこれ以上ならBADエンド
  goodBondThreshold: number; // 絆スコアがこれ以上ならGOODエンド
}

interface UILabels {
  screenTitles: { manual: string; options: string; endingGallery: string };
  debugHint: string;
  clickToContinue: string;
  saveButton: string;
  saveDoneAlert: string;
  exitAlert: string;
  theEnd: string;
  returnToMenu: string;
  stageClear: string;
  statusPanelTitle: string;
  bombLabel: string;
  hitCountLabel: string;
  gruntsLeftLabel: string;
  controlsHintLines: string[];
  imagePlaceholder: string;
  lockedEnding: string;
}

/* =============================================================================
 * 1. ★★★ 編集用データ ★★★
 *    このセクションの値を書き換える/増やすだけでゲーム内容を変更・拡張できる。
 * ========================================================================== */

// ---- 1-1. 画面遷移ID(システム用。通常は編集不要) ----
const SCREENS: Record<string, ScreenId> = {
  MENU: "menu",
  ENDING_GALLERY: "ending_gallery",
  MANUAL: "manual",
  OPTIONS: "options",
  GAME: "game",
};

// ---- 1-2. 配色テーマ ----
const THEME: Theme = {
  bgPrimary: "#0a0b12",
  bgSTG: "#050609",
  bgPanel: "#12131c",
  textPrimary: "#f4f1ea",
  textSecondary: "#e9ecf5",
  textMuted: "#d8dae8",
  textFaint: "rgba(255,255,255,0.3)",
  accent: "#e8c874",
  accentSoft: "rgba(232,200,116,0.3)",
  border: "rgba(124,139,176,0.3)",
  danger: "#c96a6a",
  info: "#9fe8ff",
  purple: "#8a4fbf",
};

// ---- 1-3. オプション初期値 ----
const DEFAULT_OPTIONS: OptionsState = {
  bgmVolume: 70,
  seVolume: 80,
};

const OPTION_FIELDS: { key: keyof OptionsState; label: string }[] = [
  { key: "bgmVolume", label: "ここにテキスト(BGM音量)" },
  { key: "seVolume", label: "ここにテキスト(SE音量)" },
];

// ---- 1-4. メニュー画面 ----
const MENU_TEXT = {
  eyebrow: "ここにテキスト",
  title: "ここにテキスト",
  tagline: "ここにテキスト",
};

const MENU_BUTTONS: MenuButtonConfig[] = [
  { key: "start", label: "スタート", icon: "Play", type: "start" },
  { key: "continue", label: "続きから", icon: "RotateCcw", type: "continue" },
  {
    key: "ending",
    label: "エンディング",
    icon: "ImageIcon",
    type: "navigate",
    screen: SCREENS.ENDING_GALLERY,
  },
  {
    key: "manual",
    label: "マニュアル",
    icon: "BookOpen",
    type: "navigate",
    screen: SCREENS.MANUAL,
  },
  {
    key: "options",
    label: "オプション",
    icon: "Settings",
    type: "navigate",
    screen: SCREENS.OPTIONS,
  },
  { key: "exit", label: "終了", icon: "Power", type: "exit" },
];

// ---- 1-5. マニュアル画面の文章 ----
const MANUAL_SECTIONS: ManualSection[] = [
  { title: "ゲーム概要", paragraphs: ["ここにテキスト", "ここにテキスト"] },
  { title: "会話パート操作", paragraphs: ["ここにテキスト"] },
  {
    title: "STGパート操作",
    list: ["ここにテキスト", "ここにテキスト", "ここにテキスト"],
  },
  { title: "霊力について", paragraphs: ["ここにテキスト"] },
  { title: "被弾について", paragraphs: ["ここにテキスト"] },
];

// ---- 1-6. UI文言(汎用ラベル類) ----
const UI_LABELS: UILabels = {
  screenTitles: {
    manual: "マニュアル",
    options: "オプション",
    endingGallery: "エンディング",
  },
  debugHint: "F1: DEBUG PANEL",
  clickToContinue: "CLICK TO CONTINUE ▼",
  saveButton: "セーブする",
  saveDoneAlert: "セーブしました。",
  exitAlert: "ゲームを終了します(デモのため実際には終了しません)",
  theEnd: "THE END",
  returnToMenu: "メニューへ戻る",
  stageClear: "STAGE CLEAR",
  statusPanelTitle: "STATUS",
  bombLabel: "ボム",
  hitCountLabel: "被弾数",
  gruntsLeftLabel: "残り雑魚",
  controlsHintLines: ["矢印キー：移動", "Z：ショット", "X：ボム"],
  imagePlaceholder: "IMAGE PLACEHOLDER",
  lockedEnding: "未解放",
};

// ---- 1-7. ゲーム全体の進行順序 ----
// vn(会話) → stg(シューティング) → vn → stg → ... → ending
// 拡張するときはこの配列に追加するだけでよい。
const STAGE_SEQUENCE: StageSequenceItem[] = [
  { id: "stage1_vn", type: "vn", startNode: "prologue_1" },
  { id: "stage1_stg", type: "stg", stageKey: "stage1" },
  { id: "stage2_vn", type: "vn", startNode: "interlude_1" },
  { id: "stage2_stg", type: "stg", stageKey: "stage2" },
  { id: "stage3_vn", type: "vn", startNode: "finale_1" },
  { id: "ending", type: "ending" },
];

// ---- 1-8. 会話パートのシナリオ(ノードID→内容のグラフ構造) ----
// choices があれば選択肢を表示し、setFlag でフラグを立てて分岐させる。
// next のみなら地の文としてクリックで進む。endOfStage: true でこのステージを
// 終了し STAGE_SEQUENCE の次へ進む。
const SCENARIO: Scenario = {
  // --- ステージ1: プロローグ ---
  prologue_1: { speaker: "ここにテキスト", text: "ここにテキスト", next: "prologue_2" },
  prologue_2: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    next: "prologue_3",
    save: true,
  },
  prologue_3: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    choices: [
      { label: "ここにテキスト", next: "prologue_4a", setFlag: { trust: 1 } },
      { label: "ここにテキスト", next: "prologue_4b", setFlag: { trust: -1 } },
    ],
  },
  prologue_4a: { speaker: "ここにテキスト", text: "ここにテキスト", next: "prologue_end" },
  prologue_4b: { speaker: "ここにテキスト", text: "ここにテキスト", next: "prologue_end" },
  prologue_end: { speaker: "ここにテキスト", text: "ここにテキスト", endOfStage: true },

  // --- ステージ2: 幕間 ---
  interlude_1: {
    speaker: "ここにテキスト",
    text: "___HIT_DEPENDENT___",
    next: "interlude_2",
  },
  interlude_2: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    choices: [
      { label: "ここにテキスト", next: "interlude_3", setFlag: { bond: 1 } },
      { label: "ここにテキスト", next: "interlude_3", setFlag: { bond: -1 } },
    ],
  },
  interlude_3: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    next: "interlude_end",
    save: true,
  },
  interlude_end: { speaker: "ここにテキスト", text: "ここにテキスト", endOfStage: true },

  // --- ステージ3: 終盤 ---
  finale_1: { speaker: "ここにテキスト", text: "ここにテキスト", next: "finale_2" },
  finale_2: { speaker: "ここにテキスト", text: "ここにテキスト", endOfStage: true },
};

// ---- 1-9. 被弾数によって出し分けるテキスト(SCENARIO内 "___HIT_DEPENDENT___" 用) ----
// 配列の先頭から順に maxHit 以下かどうかを判定する。
const HIT_DEPENDENT_TEXT: HitDependentTextRule[] = [
  { maxHit: 0, text: "ここにテキスト(被弾0回用)" },
  { maxHit: 3, text: "ここにテキスト(被弾1〜3回用)" },
  { maxHit: Infinity, text: "ここにテキスト(被弾4回以上用)" },
];

// ---- 1-10. STGパートのステージ定義 ----
// 追加ステージは STG_STAGES に増やして STAGE_SEQUENCE から参照するだけでよい。
const STG_STAGES: STGStages = {
  stage1: {
    label: "ここにテキスト(第一幕)",
    grunts: 8,
    gruntSpawnInterval: 1.1,
    gruntHp: 2,
    boss: { name: "ここにテキスト(ボス名)", hp: 60, bulletSpeed: 140 },
  },
  stage2: {
    label: "ここにテキスト(第二幕)",
    grunts: 12,
    gruntSpawnInterval: 0.9,
    gruntHp: 3,
    boss: { name: "ここにテキスト(ボス名)", hp: 90, bulletSpeed: 170 },
  },
};

// ---- 1-11. STGパートの基本設定(自機速度・当たり判定など) ----
const STG_SETTINGS: STGSettings = {
  width: 480,
  height: 640,
  playerSpeed: 220,
  playerRadius: 4,
  shotCooldown: 0.09,
  bombInvulnTime: 1.2,
  hitInvulnTime: 1.5,
  // 霊力(power)によって弾の広がりを変える。将来パワーアップを実装する際は
  // ここにキーを増やすだけでよい(現状は増やす手段が無いため power は常に1)。
  shotPatternByPower: {
    1: [0],
    2: [-10, 10],
    3: [-24, -8, 8, 24],
  },
};

// ---- 1-12. エンディング定義 ----
// 追加するときはオブジェクトに足し、下の ENDING_RULES / resolveEnding も確認する。
const ENDINGS: Endings = {
  good: {
    id: "good",
    title: "GOOD END - ここにテキスト",
    color: "#f2c46d",
    lines: [
      { speaker: "ここにテキスト", text: "ここにテキスト" },
      { speaker: "ここにテキスト", text: "ここにテキスト" },
      { speaker: "ここにテキスト", text: "ここにテキスト" },
    ],
  },
  normal: {
    id: "normal",
    title: "NORMAL END - ここにテキスト",
    color: "#8fb8de",
    lines: [
      { speaker: "ここにテキスト", text: "ここにテキスト" },
      { speaker: "ここにテキスト", text: "ここにテキスト" },
    ],
  },
  bad: {
    id: "bad",
    title: "BAD END - ここにテキスト",
    color: "#c96a6a",
    lines: [
      { speaker: "ここにテキスト", text: "ここにテキスト" },
      { speaker: "ここにテキスト", text: "ここにテキスト" },
    ],
  },
};

// ---- 1-13. エンディング分岐条件 ----
const ENDING_RULES: EndingRules = {
  badHitThreshold: 6,
  goodBondThreshold: 2,
};

/* =============================================================================
 * ▲▲▲ 編集用データはここまで。以下はエンジン本体のロジック ▲▲▲
 * ========================================================================== */

// アイコン名(文字列) → 実際のアイコンコンポーネント の対応表。
// MENU_BUTTONS の icon フィールドはこの表のキーで指定する。
const ICON_MAP: Record<IconKey, LucideIcon> = {
  Play,
  RotateCcw,
  ImageIcon,
  BookOpen,
  Settings,
  Power,
};

function resolveEnding(flags: Record<string, number>, hitCount: number): string {
  const bondScore = (flags.trust || 0) + (flags.bond || 0);
  if (hitCount >= ENDING_RULES.badHitThreshold) return "bad";
  if (bondScore >= ENDING_RULES.goodBondThreshold) return "good";
  return "normal";
}

function getHitDependentText(hitCount: number): string {
  const rule = HIT_DEPENDENT_TEXT.find((r) => hitCount <= r.maxHit);
  return rule ? rule.text : HIT_DEPENDENT_TEXT[HIT_DEPENDENT_TEXT.length - 1].text;
}

/* =============================================================================
 * 2. ユーティリティ
 * ========================================================================== */

const SaveManager = {
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

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function rectsOverlap(
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
function useKeyboardRef() {
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

/* =============================================================================
 * 3. GameContext (中央状態管理)
 * ========================================================================== */

interface VNTranscriptEntry {
  speaker: string;
  text: string;
}

interface RuntimeState {
  stageIndex: number;
  currentNodeId: string | null;
  flags: Record<string, number>;
  hitCount: number;
  transcript: VNTranscriptEntry[];
}

interface UnlockedEndingRecord {
  id: string;
  title: string;
  color: string;
  lines: EndingLine[];
  unlockedAt: string;
}

interface GameState {
  screen: ScreenId;
  debugVisible: boolean;
  options: OptionsState;
  unlockedEndings: UnlockedEndingRecord[];
  hasSaveData: boolean;
  runtime: RuntimeState;
  actionLog: string[];
}

type GameAction =
  | { type: "GO_SCREEN"; payload: { screen: ScreenId } }
  | { type: "TOGGLE_DEBUG" }
  | { type: "SET_OPTION"; payload: { key: keyof OptionsState; value: number } }
  | {
      type: "HYDRATE";
      payload: {
        options: OptionsState | null;
        unlockedEndings: UnlockedEndingRecord[];
        hasSaveData: boolean;
      };
    }
  | { type: "START_NEW_GAME" }
  | { type: "LOAD_GAME"; payload: { runtime: RuntimeState } }
  | { type: "VN_GOTO"; payload: { nodeId: string } }
  | { type: "VN_SET_FLAG"; payload: { flag: Record<string, number> } }
  | { type: "VN_APPEND_TRANSCRIPT"; payload: { entry: VNTranscriptEntry } }
  | { type: "ADVANCE_STAGE" }
  | { type: "STG_HIT" }
  | { type: "UNLOCK_ENDING"; payload: UnlockedEndingRecord }
  | { type: "RETURN_TO_MENU" };

const initialState: GameState = {
  screen: SCREENS.MENU,
  debugVisible: false,
  options: DEFAULT_OPTIONS,
  unlockedEndings: [],
  hasSaveData: false,
  runtime: {
    stageIndex: 0,
    currentNodeId: null,
    flags: {},
    hitCount: 0,
    transcript: [],
  },
  actionLog: [],
};

function pushLog(state: GameState, actionType: string, payload: unknown): string[] {
  const entry = `${new Date().toLocaleTimeString()}  ${actionType}  ${JSON.stringify(
    payload || {}
  )}`;
  return [entry, ...state.actionLog].slice(0, 30);
}

function reducer(state: GameState, action: GameAction): GameState {
  console.groupCollapsed(`%c[Reducer] ${action.type}`, "color:#8fb8de");
  console.log("payload:", "payload" in action ? action.payload : undefined);
  console.groupEnd();

  const nextLog = pushLog(state, action.type, "payload" in action ? action.payload : undefined);

  switch (action.type) {
    case "GO_SCREEN":
      return { ...state, screen: action.payload.screen, actionLog: nextLog };

    case "TOGGLE_DEBUG":
      return { ...state, debugVisible: !state.debugVisible };

    case "SET_OPTION":
      return {
        ...state,
        options: { ...state.options, [action.payload.key]: action.payload.value },
        actionLog: nextLog,
      };

    case "HYDRATE":
      return {
        ...state,
        options: action.payload.options || state.options,
        unlockedEndings: action.payload.unlockedEndings || [],
        hasSaveData: !!action.payload.hasSaveData,
      };

    case "START_NEW_GAME": {
      const firstStage = STAGE_SEQUENCE[0];
      return {
        ...state,
        screen: SCREENS.GAME,
        runtime: {
          stageIndex: 0,
          currentNodeId: firstStage.startNode || null,
          flags: {},
          hitCount: 0,
          transcript: [],
        },
        actionLog: nextLog,
      };
    }

    case "LOAD_GAME":
      return {
        ...state,
        screen: SCREENS.GAME,
        runtime: action.payload.runtime,
        actionLog: nextLog,
      };

    case "VN_GOTO":
      return {
        ...state,
        runtime: { ...state.runtime, currentNodeId: action.payload.nodeId },
        actionLog: nextLog,
      };

    case "VN_SET_FLAG":
      return {
        ...state,
        runtime: {
          ...state.runtime,
          flags: { ...state.runtime.flags, ...action.payload.flag },
        },
        actionLog: nextLog,
      };

    case "VN_APPEND_TRANSCRIPT":
      return {
        ...state,
        runtime: {
          ...state.runtime,
          transcript: [...state.runtime.transcript, action.payload.entry],
        },
      };

    case "ADVANCE_STAGE": {
      const nextIndex = state.runtime.stageIndex + 1;
      const nextStage = STAGE_SEQUENCE[nextIndex];
      return {
        ...state,
        runtime: {
          ...state.runtime,
          stageIndex: nextIndex,
          currentNodeId: nextStage && nextStage.type === "vn" ? nextStage.startNode || null : null,
        },
        actionLog: nextLog,
      };
    }

    case "STG_HIT":
      return {
        ...state,
        runtime: { ...state.runtime, hitCount: state.runtime.hitCount + 1 },
        actionLog: nextLog,
      };

    case "UNLOCK_ENDING": {
      const filtered = state.unlockedEndings.filter((e) => e.id !== action.payload.id);
      return {
        ...state,
        unlockedEndings: [...filtered, action.payload],
        actionLog: nextLog,
      };
    }

    case "RETURN_TO_MENU":
      return { ...state, screen: SCREENS.MENU, actionLog: nextLog };

    default:
      return state;
  }
}

interface GameContextValue {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const GameContext = createContext<GameContextValue | null>(null);
function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

/* =============================================================================
 * 共通UIパーツ
 * ========================================================================== */

function MenuButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconKey;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = ICON_MAP[icon];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group relative flex items-center gap-3 w-full px-5 py-3 rounded-sm border transition-all duration-200 text-left"
      style={{
        borderColor: disabled ? "rgba(255,255,255,0.1)" : THEME.border,
        color: disabled ? "rgba(255,255,255,0.25)" : THEME.textSecondary,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.borderColor = THEME.accent;
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.borderColor = THEME.border;
      }}
    >
      <Icon size={16} className={disabled ? "opacity-30" : "opacity-70 group-hover:opacity-100"} />
      <span className="tracking-[0.15em] text-sm font-medium">{label}</span>
      {!disabled && (
        <ChevronRight
          size={14}
          className="ml-auto opacity-0 group-hover:opacity-60 transition-opacity"
        />
      )}
    </button>
  );
}

function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      <button
        onClick={onBack}
        className="p-2 rounded-sm border transition-colors"
        style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)" }}
      >
        <ArrowLeft size={16} />
      </button>
      <h2
        className="text-lg tracking-[0.2em] font-medium"
        style={{ color: THEME.textSecondary }}
      >
        {title}
      </h2>
    </div>
  );
}

function StarField() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 60 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            width: Math.random() * 2 + 0.5,
            height: Math.random() * 2 + 0.5,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            opacity: Math.random() * 0.6 + 0.15,
          }}
        />
      ))}
    </div>
  );
}

/* =============================================================================
 * 4. 画面コンポーネント
 * ========================================================================== */

function MenuScreen() {
  const { state, dispatch } = useGame();

  const handleButton = async (btn: MenuButtonConfig) => {
    switch (btn.type) {
      case "start":
        dispatch({ type: "START_NEW_GAME" });
        return;
      case "continue": {
        const data = await SaveManager.load();
        if (data) dispatch({ type: "LOAD_GAME", payload: { runtime: data } });
        return;
      }
      case "navigate":
        if (btn.screen) dispatch({ type: "GO_SCREEN", payload: { screen: btn.screen } });
        return;
      case "exit":
        alert(UI_LABELS.exitAlert);
        return;
    }
  };

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center">
      <StarField />
      <div className="relative z-10 text-center mb-12">
        <div
          className="text-[11px] tracking-[0.5em] mb-3"
          style={{ color: THEME.accentSoft }}
        >
          {MENU_TEXT.eyebrow}
        </div>
        <h1
          className="text-4xl font-bold tracking-[0.15em]"
          style={{ color: THEME.textPrimary }}
        >
          {MENU_TEXT.title}
        </h1>
        <div
          className="text-[11px] tracking-[0.3em] mt-3"
          style={{ color: THEME.textFaint }}
        >
          {MENU_TEXT.tagline}
        </div>
      </div>

      <div className="relative z-10 w-[280px] flex flex-col gap-2.5">
        {MENU_BUTTONS.map((btn) => (
          <MenuButton
            key={btn.key}
            icon={btn.icon}
            label={btn.label}
            disabled={btn.type === "continue" ? !state.hasSaveData : false}
            onClick={() => handleButton(btn)}
          />
        ))}
      </div>

      <div
        className="absolute bottom-4 right-4 text-[10px] tracking-widest"
        style={{ color: "rgba(255,255,255,0.2)" }}
      >
        {UI_LABELS.debugHint}
      </div>
    </div>
  );
}

function ManualScreen() {
  const { dispatch } = useGame();
  return (
    <div className="relative h-full w-full p-10 overflow-y-auto">
      <ScreenHeader
        title={UI_LABELS.screenTitles.manual}
        onBack={() => dispatch({ type: "GO_SCREEN", payload: { screen: SCREENS.MENU } })}
      />
      <div className="max-w-xl space-y-6 text-sm leading-relaxed" style={{ color: THEME.textMuted }}>
        {MANUAL_SECTIONS.map((section, i) => (
          <section key={i}>
            <h3
              className="tracking-widest text-xs mb-2"
              style={{ color: THEME.accent }}
            >
              {section.title}
            </h3>
            {section.paragraphs?.map((p, j) => (
              <p key={j}>{p}</p>
            ))}
            {section.list && (
              <ul className="space-y-1">
                {section.list.map((li, j) => (
                  <li key={j}>{li}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function OptionsScreen() {
  const { state, dispatch } = useGame();

  const setVolume = (key: keyof OptionsState, value: number) => {
    dispatch({ type: "SET_OPTION", payload: { key, value } });
    SaveManager.saveOptions({ ...state.options, [key]: value });
  };

  return (
    <div className="relative h-full w-full p-10">
      <ScreenHeader
        title={UI_LABELS.screenTitles.options}
        onBack={() => dispatch({ type: "GO_SCREEN", payload: { screen: SCREENS.MENU } })}
      />
      <div className="max-w-md space-y-8">
        {OPTION_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex justify-between text-sm mb-2" style={{ color: THEME.textMuted }}>
              <span className="flex items-center gap-2 tracking-wider">
                <Volume2 size={14} style={{ color: THEME.accent }} />
                {label}
              </span>
              <span className="font-mono" style={{ color: THEME.accent }}>
                {state.options[key]}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={state.options[key]}
              onChange={(e) => setVolume(key, Number(e.target.value))}
              className="w-full"
              style={{ accentColor: THEME.accent }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EndingGalleryScreen() {
  const { state, dispatch } = useGame();
  const [selected, setSelected] = useState<string | null>(null);
  const endingList = Object.values(ENDINGS);
  const unlockedIds = new Set(state.unlockedEndings.map((e) => e.id));

  if (selected) {
    const unlocked = state.unlockedEndings.find((e) => e.id === selected);
    const def = ENDINGS[selected];
    return (
      <div className="relative h-full w-full p-10 overflow-y-auto">
        <ScreenHeader title={def.title} onBack={() => setSelected(null)} />
        <div
          className="w-full h-40 rounded-sm mb-6 flex items-center justify-center border"
          style={{
            borderColor: "rgba(255,255,255,0.1)",
            background: `linear-gradient(135deg, ${def.color}22, transparent)`,
          }}
        >
          <ImageIcon size={32} style={{ color: def.color }} className="opacity-60" />
          <span className="ml-3 text-xs tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
            {UI_LABELS.imagePlaceholder}
          </span>
        </div>
        <div className="space-y-4 max-w-lg">
          {(unlocked ? unlocked.lines : def.lines).map((line, i) => (
            <div key={i}>
              <div className="text-[11px] tracking-widest" style={{ color: def.color }}>
                {line.speaker}
              </div>
              <div className="text-sm leading-relaxed" style={{ color: THEME.textSecondary }}>
                {line.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full p-10">
      <ScreenHeader
        title={UI_LABELS.screenTitles.endingGallery}
        onBack={() => dispatch({ type: "GO_SCREEN", payload: { screen: SCREENS.MENU } })}
      />
      <div className="grid grid-cols-3 gap-4 max-w-2xl">
        {endingList.map((e) => {
          const unlocked = unlockedIds.has(e.id);
          return (
            <button
              key={e.id}
              disabled={!unlocked}
              onClick={() => setSelected(e.id)}
              className="aspect-video rounded-sm border flex flex-col items-center justify-center gap-2"
              style={{
                borderColor: unlocked ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                opacity: unlocked ? 1 : 0.3,
                cursor: unlocked ? "pointer" : "not-allowed",
              }}
            >
              <ImageIcon size={20} style={{ color: "rgba(255,255,255,0.5)" }} />
              <span className="text-[10px] tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>
                {unlocked ? e.title.split(" - ")[0] : UI_LABELS.lockedEnding}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =============================================================================
 * 6. VNPart (会話パート)
 * ========================================================================== */

function VNPart() {
  const { state, dispatch } = useGame();
  const node = state.runtime.currentNodeId ? SCENARIO[state.runtime.currentNodeId] : undefined;

  useEffect(() => {
    if (!node) return;
    const text = node.text === "___HIT_DEPENDENT___" ? getHitDependentText(state.runtime.hitCount) : node.text;
    dispatch({
      type: "VN_APPEND_TRANSCRIPT",
      payload: { entry: { speaker: node.speaker, text } },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.runtime.currentNodeId]);

  const handleSave = async () => {
    const ok = await SaveManager.save(state.runtime);
    if (ok) alert(UI_LABELS.saveDoneAlert);
  };

  const advance = (nextId?: string) => {
    if (!nextId) return;
    dispatch({ type: "VN_GOTO", payload: { nodeId: nextId } });
  };

  const handleChoice = (choice: VNChoice) => {
    if (choice.setFlag) {
      dispatch({ type: "VN_SET_FLAG", payload: { flag: choice.setFlag } });
    }
    advance(choice.next);
  };

  const handleBodyClick = () => {
    if (!node) return;
    if (node.choices) return;
    if (node.endOfStage) {
      dispatch({ type: "ADVANCE_STAGE" });
      return;
    }
    advance(node.next);
  };

  if (!node) return null;

  const displayText =
    node.text === "___HIT_DEPENDENT___" ? getHitDependentText(state.runtime.hitCount) : node.text;

  return (
    <div
      className="relative h-full w-full flex flex-col justify-end cursor-pointer select-none"
      onClick={handleBodyClick}
    >
      <StarField />
      <div className="relative z-10 p-8 pb-10">
        <div className="max-w-2xl mx-auto">
          {node.save && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
              className="mb-3 flex items-center gap-2 text-[11px] tracking-widest border px-3 py-1.5 rounded-sm"
              style={{ color: THEME.accentSoft, borderColor: THEME.accentSoft }}
            >
              <Save size={12} /> {UI_LABELS.saveButton}
            </button>
          )}

          <div
            className="border rounded-sm p-6 backdrop-blur-sm min-h-[140px]"
            style={{ backgroundColor: `${THEME.bgPanel}d9`, borderColor: "rgba(255,255,255,0.1)" }}
          >
            <div className="text-xs tracking-[0.2em] mb-2" style={{ color: THEME.accent }}>
              {node.speaker}
            </div>
            <p className="text-[15px] leading-loose" style={{ color: THEME.textPrimary }}>
              {displayText}
            </p>

            {node.choices && (
              <div className="mt-5 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                {node.choices.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => handleChoice(c)}
                    className="text-left px-4 py-2.5 rounded-sm border text-sm transition-colors"
                    style={{ borderColor: THEME.border, color: THEME.textSecondary }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {!node.choices && (
              <div
                className="text-right text-[10px] mt-3 tracking-widest"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                {UI_LABELS.clickToContinue}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =============================================================================
 * 7. STGPart (弾幕STGパート)
 * ========================================================================== */

const {
  width: STG_WIDTH,
  height: STG_HEIGHT,
  playerSpeed: PLAYER_SPEED,
  playerRadius: PLAYER_RADIUS,
  shotCooldown: SHOT_COOLDOWN,
  bombInvulnTime: BOMB_INVULN_TIME,
  hitInvulnTime: HIT_INVULN_TIME,
} = STG_SETTINGS;

function getShotPattern(power: number): number[] {
  return STG_SETTINGS.shotPatternByPower[power] || STG_SETTINGS.shotPatternByPower[1];
}

interface STGPlayer {
  x: number;
  y: number;
  power: number;
  shotTimer: number;
  invuln: number;
}
interface STGBullet {
  x: number;
  y: number;
  vx?: number;
  vy: number;
}
interface STGEnemy {
  type: "grunt";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  vy: number;
  t: number;
  shotTimer: number;
}
interface STGBoss {
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  t: number;
  shotTimer: number;
}
interface STGItem {
  x: number;
  y: number;
}
interface STGWorld {
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
interface STGHud {
  bombs: number;
  hitCount: number;
  bossHp: number | null;
  bossMaxHp: number | null;
  gruntsLeft: number;
  cleared: boolean;
}

function STGPart({ stageKey, onComplete }: { stageKey: string; onComplete: () => void }) {
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

/* =============================================================================
 * 5. EndingPart & GameScreen (振り分け)
 * ========================================================================== */

function EndingPart() {
  const { state, dispatch } = useGame();
  const [resolved] = useState<string>(() => resolveEnding(state.runtime.flags, state.runtime.hitCount));
  const def = ENDINGS[resolved];

  useEffect(() => {
    const record: UnlockedEndingRecord = {
      id: def.id,
      title: def.title,
      color: def.color,
      lines: state.runtime.transcript.slice(-6).length ? state.runtime.transcript.slice(-6) : def.lines,
      unlockedAt: new Date().toISOString(),
    };
    dispatch({ type: "UNLOCK_ENDING", payload: record });
    (async () => {
      const list = await SaveManager.loadUnlockedEndings();
      const filtered = list.filter((e) => e.id !== record.id);
      await SaveManager.saveUnlockedEndings([...filtered, record]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center p-10">
      <StarField />
      <div className="relative z-10 text-center">
        <Heart size={22} style={{ color: def.color }} className="mx-auto mb-4 opacity-70" />
        <div
          className="text-[11px] tracking-[0.4em] mb-2"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {UI_LABELS.theEnd}
        </div>
        <h2 className="text-2xl tracking-[0.15em] mb-8" style={{ color: def.color }}>
          {def.title}
        </h2>
        <button
          onClick={() => dispatch({ type: "RETURN_TO_MENU" })}
          className="px-6 py-2.5 border rounded-sm text-sm tracking-widest"
          style={{ borderColor: "rgba(255,255,255,0.2)", color: THEME.textSecondary }}
        >
          {UI_LABELS.returnToMenu}
        </button>
      </div>
    </div>
  );
}

function GameScreen() {
  const { state, dispatch } = useGame();
  const stage = STAGE_SEQUENCE[state.runtime.stageIndex];

  if (!stage) return null;
  if (stage.type === "vn") return <VNPart />;
  if (stage.type === "stg" && stage.stageKey)
    return (
      <STGPart
        key={stage.id}
        stageKey={stage.stageKey}
        onComplete={() => dispatch({ type: "ADVANCE_STAGE" })}
      />
    );
  if (stage.type === "ending") return <EndingPart />;
  return null;
}

/* =============================================================================
 * デバッグパネル (F1)
 * ========================================================================== */

function DebugPanel() {
  const { state } = useGame();
  if (!state.debugVisible) return null;
  const stage = STAGE_SEQUENCE[state.runtime.stageIndex];
  return (
    <div
      className="absolute top-0 right-0 w-72 h-full border-l p-4 overflow-y-auto text-[11px] font-mono z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.85)", borderColor: THEME.accentSoft, color: THEME.info }}
    >
      <div className="tracking-widest mb-2" style={{ color: THEME.accent }}>
        DEBUG PANEL (F1)
      </div>
      <div className="mb-3 space-y-0.5">
        <div>screen: {state.screen}</div>
        <div>stageIndex: {state.runtime.stageIndex}</div>
        <div>stage.id: {stage?.id}</div>
        <div>currentNode: {state.runtime.currentNodeId}</div>
        <div>hitCount: {state.runtime.hitCount}</div>
        <div>flags: {JSON.stringify(state.runtime.flags)}</div>
      </div>
      <div className="tracking-widest mb-1" style={{ color: THEME.accent }}>
        ACTION LOG
      </div>
      <div className="space-y-0.5 opacity-70">
        {state.actionLog.map((l, i) => (
          <div key={i} className="truncate">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =============================================================================
 * 8. App (ルート)
 * ========================================================================== */

function ScreenRouter() {
  const { state } = useGame();
  switch (state.screen) {
    case SCREENS.MENU:
      return <MenuScreen />;
    case SCREENS.MANUAL:
      return <ManualScreen />;
    case SCREENS.OPTIONS:
      return <OptionsScreen />;
    case SCREENS.ENDING_GALLERY:
      return <EndingGalleryScreen />;
    case SCREENS.GAME:
      return <GameScreen />;
    default:
      return null;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    (async () => {
      const [options, unlockedEndings, save] = await Promise.all([
        SaveManager.loadOptions(),
        SaveManager.loadUnlockedEndings(),
        SaveManager.load(),
      ]);
      dispatch({
        type: "HYDRATE",
        payload: { options, unlockedEndings, hasSaveData: !!save },
      });
    })();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "F1") {
        e.preventDefault();
        dispatch({ type: "TOGGLE_DEBUG" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      <div
        className="w-full h-screen overflow-hidden relative font-sans"
        style={{ backgroundColor: THEME.bgPrimary, color: THEME.textPrimary }}
      >
        <ScreenRouter />
        <DebugPanel />
      </div>
    </GameContext.Provider>
  );
}