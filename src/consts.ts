import {
  Play,
  RotateCcw,
  BookOpen,
  Settings,
  ImageIcon,
  Power,
  LucideIcon,
} from "lucide-react";
import { ScreenId, Theme, OptionsState, MenuButtonConfig, ManualSection, UILabels, StageSequenceItem, Scenario, HitDependentTextRule, STGStages, STGSettings, Endings, EndingRules, IconKey } from "./types";

// ---- 1-1. 画面遷移ID(システム用。通常は編集不要) ----
export const SCREENS: Record<string, ScreenId> = {
  MENU: "menu",
  ENDING_GALLERY: "ending_gallery",
  MANUAL: "manual",
  OPTIONS: "options",
  GAME: "game",
};

// ---- 1-2. 配色テーマ ----
export const THEME: Theme = {
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
export const DEFAULT_OPTIONS: OptionsState = {
  bgmVolume: 70,
  seVolume: 80,
};

export const OPTION_FIELDS: { key: keyof OptionsState; label: string }[] = [
  { key: "bgmVolume", label: "ここにテキスト(BGM音量)" },
  { key: "seVolume", label: "ここにテキスト(SE音量)" },
];

// ---- 1-4. メニュー画面 ----
export const MENU_TEXT = {
  eyebrow: "ここにテキスト",
  title: "ここにテキスト",
  tagline: "ここにテキスト",
};

export const MENU_BUTTONS: MenuButtonConfig[] = [
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
export const MANUAL_SECTIONS: ManualSection[] = [
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
export const UI_LABELS: UILabels = {
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
export const STAGE_SEQUENCE: StageSequenceItem[] = [
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
export const SCENARIO: Scenario = {
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
export const HIT_DEPENDENT_TEXT: HitDependentTextRule[] = [
  { maxHit: 0, text: "ここにテキスト(被弾0回用)" },
  { maxHit: 3, text: "ここにテキスト(被弾1〜3回用)" },
  { maxHit: Infinity, text: "ここにテキスト(被弾4回以上用)" },
];

// ---- 1-10. STGパートのステージ定義 ----
// 追加ステージは STG_STAGES に増やして STAGE_SEQUENCE から参照するだけでよい。
export const STG_STAGES: STGStages = {
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
export const STG_SETTINGS: STGSettings = {
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
export const ENDINGS: Endings = {
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
export const ENDING_RULES: EndingRules = {
  badHitThreshold: 6,
  goodBondThreshold: 2,
};

// アイコン名(文字列) → 実際のアイコンコンポーネント の対応表。
// MENU_BUTTONS の icon フィールドはこの表のキーで指定する。
export const ICON_MAP: Record<IconKey, LucideIcon> = {
  Play,
  RotateCcw,
  ImageIcon,
  BookOpen,
  Settings,
  Power,
};

export function resolveEnding(flags: Record<string, number>, hitCount: number): string {
  const bondScore = (flags.trust || 0) + (flags.bond || 0);
  if (hitCount >= ENDING_RULES.badHitThreshold) return "bad";
  if (bondScore >= ENDING_RULES.goodBondThreshold) return "good";
  return "normal";
}

export function getHitDependentText(hitCount: number): string {
  const rule = HIT_DEPENDENT_TEXT.find((r) => hitCount <= r.maxHit);
  return rule ? rule.text : HIT_DEPENDENT_TEXT[HIT_DEPENDENT_TEXT.length - 1].text;
}