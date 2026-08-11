export type ScreenId = "menu" | "ending_gallery" | "manual" | "options" | "game";

export interface Theme {
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

export interface OptionsState {
  bgmVolume: number;
  seVolume: number;
}

export type IconKey =
  | "Play"
  | "RotateCcw"
  | "ImageIcon"
  | "BookOpen"
  | "Settings"
  | "Power";

export interface MenuButtonConfig {
  key: string;
  label: string;
  icon: IconKey;
  type: "start" | "continue" | "navigate" | "exit";
  screen?: ScreenId;
}

export interface ManualSection {
  title: string;
  paragraphs?: string[];
  list?: string[];
}

export interface VNChoice {
  label: string;
  next: string;
  setFlag?: Record<string, number>;
}

export interface VNNode {
  speaker: string;
  text: string; // "___HIT_DEPENDENT___" の場合は HIT_DEPENDENT_TEXT から動的生成
  next?: string;
  choices?: VNChoice[];
  save?: boolean; // このノードでセーブボタンを表示するか
  endOfStage?: boolean; // このステージを終了し次のステージへ進むか
}

export type Scenario = Record<string, VNNode>;

export interface StageSequenceItem {
  id: string;
  type: "vn" | "stg" | "ending";
  startNode?: string; // type: "vn" のとき使用
  stageKey?: string; // type: "stg" のとき STG_STAGES のキーを指定
}

export interface HitDependentTextRule {
  maxHit: number; // この被弾数以下ならこのテキストを採用
  text: string;
}

export interface STGBossConfig {
  name: string;
  hp: number;
  bulletSpeed: number;
}

export interface STGStageConfig {
  label: string;
  grunts: number; // 撃破対象の雑魚数(倒し切るとボス出現)
  gruntSpawnInterval: number; // 秒
  gruntHp: number;
  boss: STGBossConfig;
}

export type STGStages = Record<string, STGStageConfig>;

export interface STGSettings {
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

export interface EndingLine {
  speaker: string;
  text: string;
}

export interface EndingDef {
  id: string;
  title: string;
  color: string;
  lines: EndingLine[];
}

export type Endings = Record<string, EndingDef>;

export interface EndingRules {
  badHitThreshold: number; // 被弾数がこれ以上ならBADエンド
  goodBondThreshold: number; // 絆スコアがこれ以上ならGOODエンド
}

export interface UILabels {
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