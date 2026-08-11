/**
 * =============================================================================
 *  React Game Engine (PC向け / 会話パート + 弾幕STGパート ハイブリッド)
 * =============================================================================
 *
 *  設計方針:
 *   - 「エンジン」として拡張しやすいこと最優先。画面遷移・進行データ・シナリオ・
 *     STGステージ定義はすべて「設定オブジェクト」として分離し、コードを増やさず
 *     データを足すだけでコンテンツを追加できるようにしてある。
 *   - デバッグしやすさのため、
 *       (1) すべての状態遷移を useReducer + アクションログで一元管理
 *       (2) F1キーでデバッグパネル(現在のstate/フラグ/座標)を表示可能
 *       (3) console.groupで各システムのログを分けて出力
 *   - セーブデータは window.storage (Claude Artifacts永続ストレージ) を使用。
 *     ローカルストレージは使用不可のためこちらを利用している。
 *
 *  ファイル構成 (すべて1ファイルにまとめているが、セクションで明確に分離):
 *   1. 定数・設定データ (SCREENS, STAGE_SEQUENCE, SCENARIO, STG_STAGES, ENDINGS)
 *   2. ユーティリティ (SaveManager, 数学関数, useKeyboard)
 *   3. GameContext (useReducer による中央状態管理)
 *   4. 画面コンポーネント (Menu / Manual / Options / EndingGallery)
 *   5. ゲーム画面 (GameScreen → VNPart / STGPart / EndingPart の振り分け)
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
  useCallback,
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
} from "lucide-react";

/* =============================================================================
 * 1. 定数・設定データ
 *    ここを書き換える/増やすだけでゲーム内容を拡張できる。
 * ========================================================================== */

const SCREENS = {
  MENU: "menu",
  ENDING_GALLERY: "ending_gallery",
  MANUAL: "manual",
  OPTIONS: "options",
  GAME: "game",
};

// ゲーム全体の進行順序。vn(会話) → stg(シューティング) → vn → stg → ... → ending
// 拡張するときはここに配列を追加するだけでよい。
const STAGE_SEQUENCE = [
  { id: "stage1_vn", type: "vn", startNode: "prologue_1" },
  { id: "stage1_stg", type: "stg", stageKey: "stage1" },
  { id: "stage2_vn", type: "vn", startNode: "interlude_1" },
  { id: "stage2_stg", type: "stg", stageKey: "stage2" },
  { id: "stage3_vn", type: "vn", startNode: "finale_1" },
  { id: "ending", type: "ending" },
];

// 会話パートのシナリオデータ。ノードID→内容 のグラフ構造。
// choices があれば選択肢を表示し、setFlag でフラグを立てて分岐させる。
// next のみなら地の文としてクリックで進む。endOfStage: true で
// このステージを終了し STAGE_SEQUENCE の次へ進む。
const SCENARIO = {
  // --- ステージ1: プロローグ ---
  prologue_1: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    next: "prologue_2",
  },
  prologue_2: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    next: "prologue_3",
    save: true, // このノードでセーブボタンを表示
  },
  prologue_3: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    choices: [
      { label: "ここにテキスト", next: "prologue_4a", setFlag: { trust: 1 } },
      { label: "ここにテキスト", next: "prologue_4b", setFlag: { trust: -1 } },
    ],
  },
  prologue_4a: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    next: "prologue_end",
  },
  prologue_4b: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    next: "prologue_end",
  },
  prologue_end: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    endOfStage: true,
  },

  // --- ステージ2: 幕間 ---
  interlude_1: {
    speaker: "ここにテキスト",
    text: "___HIT_DEPENDENT___", // STGPartのHUDでは無く、被弾数によってテキストを動的差し替え
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
  interlude_end: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    endOfStage: true,
  },

  // --- ステージ3: 終盤 ---
  finale_1: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    next: "finale_2",
  },
  finale_2: {
    speaker: "ここにテキスト",
    text: "ここにテキスト",
    endOfStage: true,
  },
};

// STGパートのステージ定義。雑魚の湧き方・ボスHPなどをデータ化。
// 追加ステージは STG_STAGES に増やして STAGE_SEQUENCE から参照するだけ。
const STG_STAGES = {
  stage1: {
    label: "第一幕 迷いの森",
    grunts: 8, // 撃破対象の雑魚数(これを倒すとボスが出現)
    gruntSpawnInterval: 1.1, // 秒
    gruntHp: 2,
    boss: {
      name: "森の番人",
      hp: 60,
      bulletSpeed: 140,
    },
  },
  stage2: {
    label: "第二幕 崩れる結界",
    grunts: 12,
    gruntSpawnInterval: 0.9,
    gruntHp: 3,
    boss: {
      name: "結界の巫女",
      hp: 90,
      bulletSpeed: 170,
    },
  },
};

// エンディング定義。フラグ/被弾数からどのエンディングになるかを決定する。
// 追加するときは配列に足し、下の resolveEnding() の条件も更新する。
const ENDINGS = {
  good: {
    id: "good",
    title: "GOOD END - 結ばれた絆",
    color: "#f2c46d",
    lines: [
      { speaker: "先客", text: "やったわね……あなたと組んで正解だった。" },
      { speaker: "主人公", text: "ああ。これで森の結界も元通りだ。" },
      { speaker: "先客", text: "また何かあったら、呼んでちょうだい。" },
    ],
  },
  normal: {
    id: "normal",
    title: "NORMAL END - 静かな帰り道",
    color: "#8fb8de",
    lines: [
      { speaker: "主人公", text: "何とか収まった、か。" },
      { speaker: "先客", text: "……お疲れ様。あなたなりのやり方、悪くなかったわ。" },
    ],
  },
  bad: {
    id: "bad",
    title: "BAD END - 傷だらけの帰還",
    color: "#c96a6a",
    lines: [
      { speaker: "主人公", text: "……体中が悲鳴を上げている。" },
      { speaker: "???", text: "無茶をするから、そうなるのよ。" },
    ],
  },
};

function resolveEnding(flags, hitCount) {
  // 拡張しやすいよう単純なスコア方式にしている。
  const bondScore = (flags.trust || 0) + (flags.bond || 0);
  if (hitCount >= 6) return "bad";
  if (bondScore >= 2) return "good";
  return "normal";
}

/* =============================================================================
 * 2. ユーティリティ
 * ========================================================================== */

// window.storage を使った簡易セーブマネージャ。
// 1ファイルだけ扱う想定だが、スロットキーを増やせば複数セーブにも対応できる。
const SaveManager = {
  SAVE_KEY: "savegame:slot1",
  OPTIONS_KEY: "options:main",
  ENDINGS_KEY: "unlocked_endings",

  async save(data) {
    try {
      await window.storage.set(this.SAVE_KEY, JSON.stringify(data), false);
      console.log("[SaveManager] saved:", data);
      return true;
    } catch (e) {
      console.error("[SaveManager] save failed", e);
      return false;
    }
  },
  async load() {
    try {
      const res = await window.storage.get(this.SAVE_KEY, false);
      return res ? JSON.parse(res.value) : null;
    } catch (e) {
      console.log("[SaveManager] no save data found");
      return null;
    }
  },
  async saveOptions(options) {
    try {
      await window.storage.set(this.OPTIONS_KEY, JSON.stringify(options), false);
    } catch (e) {
      console.error("[SaveManager] saveOptions failed", e);
    }
  },
  async loadOptions() {
    try {
      const res = await window.storage.get(this.OPTIONS_KEY, false);
      return res ? JSON.parse(res.value) : null;
    } catch (e) {
      return null;
    }
  },
  async loadUnlockedEndings() {
    try {
      const res = await window.storage.get(this.ENDINGS_KEY, false);
      return res ? JSON.parse(res.value) : [];
    } catch (e) {
      return [];
    }
  },
  async saveUnlockedEndings(list) {
    try {
      await window.storage.set(this.ENDINGS_KEY, JSON.stringify(list), false);
    } catch (e) {
      console.error("[SaveManager] saveUnlockedEndings failed", e);
    }
  },
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function rectsOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy < (ar + br) * (ar + br);
}

// キーボード押下状態を ref で保持するフック(canvasループから直接参照するため)
function useKeyboardRef() {
  const keysRef = useRef({});
  useEffect(() => {
    const down = (e) => {
      keysRef.current[e.code] = true;
    };
    const up = (e) => {
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

const initialState = {
  screen: SCREENS.MENU,
  debugVisible: false,
  options: { bgmVolume: 70, seVolume: 80 },
  unlockedEndings: [], // [{id, title, color, lines, unlockedAt}]
  hasSaveData: false,
  // runtime = 現在プレイ中の進行状態(セーブ/ロード対象)
  runtime: {
    stageIndex: 0,
    currentNodeId: null,
    flags: {},
    hitCount: 0,
    transcript: [], // このプレイの会話ログ(エンディング閲覧用)
  },
  actionLog: [], // デバッグ用: 直近のアクション履歴
};

function pushLog(state, actionType, payload) {
  const entry = `${new Date().toLocaleTimeString()}  ${actionType}  ${JSON.stringify(
    payload || {}
  )}`;
  return [entry, ...state.actionLog].slice(0, 30);
}

function reducer(state, action) {
  console.groupCollapsed(`%c[Reducer] ${action.type}`, "color:#8fb8de");
  console.log("payload:", action.payload);
  console.groupEnd();

  const nextLog = pushLog(state, action.type, action.payload);

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

    case "HYDRATE": // 起動時にストレージから復元
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
          currentNodeId: nextStage && nextStage.type === "vn" ? nextStage.startNode : null,
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
      console.warn("[Reducer] unknown action", action.type);
      return state;
  }
}

const GameContext = createContext(null);
function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

/* =============================================================================
 * 共通UIパーツ
 * ========================================================================== */

function MenuButton({ icon: Icon, label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative flex items-center gap-3 w-full px-5 py-3 rounded-sm border
        transition-all duration-200 text-left
        ${
          disabled
            ? "border-white/10 text-white/25 cursor-not-allowed"
            : "border-[#7c8bb0]/30 text-[#e9ecf5] hover:border-[#e8c874] hover:bg-[#e8c874]/[0.06]"
        }`}
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

function ScreenHeader({ title, onBack }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      <button
        onClick={onBack}
        className="p-2 rounded-sm border border-white/15 text-white/60 hover:text-[#e8c874] hover:border-[#e8c874]/50 transition-colors"
      >
        <ArrowLeft size={16} />
      </button>
      <h2 className="text-lg tracking-[0.2em] text-[#e9ecf5] font-medium">{title}</h2>
    </div>
  );
}

/* =============================================================================
 * 4. 画面コンポーネント
 * ========================================================================== */

function StarField() {
  // 背景の星空演出。CSSのみで軽量に。
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

function MenuScreen() {
  const { state, dispatch } = useGame();

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center">
      <StarField />
      <div className="relative z-10 text-center mb-12">
        <div
          className="text-[11px] tracking-[0.5em] mb-3"
          style={{ color: "rgba(232,200,116,0.7)" }}
        >
          ここにテキスト
        </div>
        <h1
          className="text-4xl font-bold tracking-[0.15em]"
          style={{ color: "#f4f1ea" }}
        >
          ここにテキスト
        </h1>
        <div
          className="text-[11px] tracking-[0.3em] mt-3"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          ここにテキスト
        </div>
      </div>

      <div className="relative z-10 w-[280px] flex flex-col gap-2.5">
        <MenuButton
          icon={Play}
          label="スタート"
          onClick={() => dispatch({ type: "START_NEW_GAME" })}
        />
        <MenuButton
          icon={RotateCcw}
          label="続きから"
          disabled={!state.hasSaveData}
          onClick={async () => {
            const data = await SaveManager.load();
            if (data) dispatch({ type: "LOAD_GAME", payload: { runtime: data } });
          }}
        />
        <MenuButton
          icon={ImageIcon}
          label="エンディング"
          onClick={() => dispatch({ type: "GO_SCREEN", payload: { screen: SCREENS.ENDING_GALLERY } })}
        />
        <MenuButton
          icon={BookOpen}
          label="マニュアル"
          onClick={() => dispatch({ type: "GO_SCREEN", payload: { screen: SCREENS.MANUAL } })}
        />
        <MenuButton
          icon={Settings}
          label="オプション"
          onClick={() => dispatch({ type: "GO_SCREEN", payload: { screen: SCREENS.OPTIONS } })}
        />
        <MenuButton
          icon={Power}
          label="終了"
          onClick={() => alert("ゲームを終了します(デモのため実際には終了しません)")}
        />
      </div>

      <div className="absolute bottom-4 right-4 text-[10px] text-white/20 tracking-widest">
        F1: DEBUG PANEL
      </div>
    </div>
  );
}

function ManualScreen() {
  const { dispatch } = useGame();
  return (
    <div className="relative h-full w-full p-10 overflow-y-auto">
      <ScreenHeader
        title="マニュアル"
        onBack={() => dispatch({ type: "GO_SCREEN", payload: { screen: SCREENS.MENU } })}
      />
      <div className="max-w-xl space-y-6 text-[#d8dae8] text-sm leading-relaxed">
        <section>
          <h3 className="text-[#e8c874] tracking-widest text-xs mb-2">ゲーム概要</h3>
          <p>
            「会話パート」と「弾幕STGパート」を交互に繰り返しながら異変の真相に迫る
            ハイブリッドアドベンチャーです。会話パートでの選択と、STGパートでの
            被弾数によって、辿り着くエンディングが変化します。
          </p>
        </section>
        <section>
          <h3 className="text-[#e8c874] tracking-widest text-xs mb-2">会話パート操作</h3>
          <p>画面をクリック / タップで文章を進行。選択肢が出た場合はボタンをクリック。</p>
        </section>
        <section>
          <h3 className="text-[#e8c874] tracking-widest text-xs mb-2">STGパート操作</h3>
          <ul className="space-y-1">
            <li>矢印キー：自機の移動</li>
            <li>Z：ショット(押しっぱなしで連射)</li>
            <li>X：ボム(画面上の敵弾を消去。1プレイにつき1個、STGパートごとにリセット)</li>
          </ul>
        </section>
        <section>
          <h3 className="text-[#e8c874] tracking-widest text-xs mb-2">霊力について</h3>
          <p>
            自機の弾の強さは「霊力」によって変化します。現在のバージョンでは
            霊力を増やす手段は未実装です。
          </p>
        </section>
        <section>
          <h3 className="text-[#e8c874] tracking-widest text-xs mb-2">被弾について</h3>
          <p>
            残機の概念はなく、被弾した回数のみが記録されます。被弾数はその後の
            会話パートの展開や、最終的なエンディングに影響します。
          </p>
        </section>
      </div>
    </div>
  );
}

function OptionsScreen() {
  const { state, dispatch } = useGame();

  const setVolume = (key, value) => {
    dispatch({ type: "SET_OPTION", payload: { key, value } });
    SaveManager.saveOptions({ ...state.options, [key]: value });
  };

  return (
    <div className="relative h-full w-full p-10">
      <ScreenHeader
        title="オプション"
        onBack={() => dispatch({ type: "GO_SCREEN", payload: { screen: SCREENS.MENU } })}
      />
      <div className="max-w-md space-y-8">
        {[
          { key: "bgmVolume", label: "BGM音量" },
          { key: "seVolume", label: "SE音量" },
        ].map(({ key, label }) => (
          <div key={key}>
            <div className="flex justify-between text-sm text-[#d8dae8] mb-2">
              <span className="flex items-center gap-2 tracking-wider">
                <Volume2 size={14} className="text-[#e8c874]" />
                {label}
              </span>
              <span className="text-[#e8c874] font-mono">{state.options[key]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={state.options[key]}
              onChange={(e) => setVolume(key, Number(e.target.value))}
              className="w-full accent-[#e8c874]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EndingGalleryScreen() {
  const { state, dispatch } = useGame();
  const [selected, setSelected] = useState(null);
  const endingList = Object.values(ENDINGS);

  const unlockedIds = new Set(state.unlockedEndings.map((e) => e.id));

  if (selected) {
    const unlocked = state.unlockedEndings.find((e) => e.id === selected);
    const def = ENDINGS[selected];
    return (
      <div className="relative h-full w-full p-10 overflow-y-auto">
        <ScreenHeader title={def.title} onBack={() => setSelected(null)} />
        <div
          className="w-full h-40 rounded-sm mb-6 flex items-center justify-center border border-white/10"
          style={{
            background: `linear-gradient(135deg, ${def.color}22, transparent)`,
          }}
        >
          <ImageIcon size={32} style={{ color: def.color }} className="opacity-60" />
          <span className="ml-3 text-white/30 text-xs tracking-widest">
            IMAGE PLACEHOLDER
          </span>
        </div>
        <div className="space-y-4 max-w-lg">
          {(unlocked ? unlocked.lines : def.lines).map((line, i) => (
            <div key={i}>
              <div className="text-[11px] tracking-widest" style={{ color: def.color }}>
                {line.speaker}
              </div>
              <div className="text-sm text-[#e9ecf5] leading-relaxed">{line.text}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full p-10">
      <ScreenHeader
        title="エンディング"
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
              className={`aspect-video rounded-sm border flex flex-col items-center justify-center gap-2
                ${
                  unlocked
                    ? "border-white/15 hover:border-[#e8c874]/60"
                    : "border-white/5 opacity-30 cursor-not-allowed"
                }`}
            >
              <ImageIcon size={20} className="text-white/50" />
              <span className="text-[10px] tracking-widest text-white/60">
                {unlocked ? e.title.split(" - ")[0] : "未解放"}
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
  const node = SCENARIO[state.runtime.currentNodeId];

  // ノードに入ったら transcript に記録(エンディング振り返り用)
  useEffect(() => {
    if (!node) return;
    const text =
      node.text === "___HIT_DEPENDENT___"
        ? getHitDependentText(state.runtime.hitCount)
        : node.text;
    dispatch({
      type: "VN_APPEND_TRANSCRIPT",
      payload: { entry: { speaker: node.speaker, text } },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.runtime.currentNodeId]);

  const handleSave = async () => {
    const ok = await SaveManager.save(state.runtime);
    if (ok) alert("セーブしました。");
  };

  const advance = (nextId) => {
    if (!nextId) return;
    dispatch({ type: "VN_GOTO", payload: { nodeId: nextId } });
  };

  const handleChoice = (choice) => {
    if (choice.setFlag) {
      dispatch({ type: "VN_SET_FLAG", payload: { flag: choice.setFlag } });
    }
    advance(choice.next);
  };

  const handleBodyClick = () => {
    if (!node) return;
    if (node.choices) return; // 選択肢がある場合はクリック進行させない
    if (node.endOfStage) {
      dispatch({ type: "ADVANCE_STAGE" });
      return;
    }
    advance(node.next);
  };

  if (!node) return null;

  const displayText =
    node.text === "___HIT_DEPENDENT___"
      ? getHitDependentText(state.runtime.hitCount)
      : node.text;

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
              className="mb-3 flex items-center gap-2 text-[11px] tracking-widest text-[#e8c874]/80 hover:text-[#e8c874] border border-[#e8c874]/30 px-3 py-1.5 rounded-sm"
            >
              <Save size={12} /> セーブする
            </button>
          )}

          <div className="bg-[#12131c]/85 border border-white/10 rounded-sm p-6 backdrop-blur-sm min-h-[140px]">
            <div
              className="text-xs tracking-[0.2em] mb-2"
              style={{ color: "#e8c874" }}
            >
              {node.speaker}
            </div>
            <p
              className="text-[15px] leading-loose"
              style={{ color: "#f4f1ea" }}
            >
              {displayText}
            </p>

            {node.choices && (
              <div
                className="mt-5 flex flex-col gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                {node.choices.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => handleChoice(c)}
                    className="text-left px-4 py-2.5 rounded-sm border border-[#7c8bb0]/30 text-sm text-[#e9ecf5] hover:border-[#e8c874] hover:bg-[#e8c874]/[0.06] transition-colors"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {!node.choices && (
              <div className="text-right text-white/30 text-[10px] mt-3 tracking-widest">
                CLICK TO CONTINUE ▼
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getHitDependentText(hitCount) {
  // 被弾数によって会話内容を分岐させる例(内容は仮テキスト)。
  if (hitCount === 0) return "ここにテキスト(被弾0回用)";
  if (hitCount <= 3) return "ここにテキスト(被弾1〜3回用)";
  return "ここにテキスト(被弾4回以上用)";
}

/* =============================================================================
 * 7. STGPart (弾幕STGパート)
 * ========================================================================== */

const STG_WIDTH = 480;
const STG_HEIGHT = 640;
const PLAYER_SPEED = 220; // px/sec
const PLAYER_RADIUS = 4;
const SHOT_COOLDOWN = 0.09;
const BOMB_INVULN_TIME = 1.2;
const HIT_INVULN_TIME = 1.5;

function getShotPattern(power) {
  // 霊力(power)によって弾の広がりを変える。将来パワーアップを実装する際は
  // ここに分岐を増やすだけでよい。
  if (power >= 3) return [-24, -8, 8, 24];
  if (power === 2) return [-10, 10];
  return [0];
}

function STGPart({ stageKey, onComplete }) {
  const { state, dispatch } = useGame();
  const canvasRef = useRef(null);
  const keysRef = useKeyboardRef();
  const rafRef = useRef(null);
  const worldRef = useRef(null); // 全ゲームオブジェクトを保持(再レンダーを避けるためref管理)

  // HUD用のstate(高頻度更新しないようイベント発生時のみ更新)
  const [hud, setHud] = useState({
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
      player: {
        x: STG_WIDTH / 2,
        y: STG_HEIGHT - 80,
        power: 1,
        shotTimer: 0,
        invuln: 0,
      },
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
    const ctx = canvas.getContext("2d");

    function spawnGrunt(world) {
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

    function spawnBoss(world) {
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

    function tick(now) {
      const world = worldRef.current;
      if (!world || world.cleared) return;
      const dt = Math.min(0.033, (now - world.lastTime) / 1000);
      world.lastTime = now;

      const keys = keysRef.current;
      const p = world.player;

      // --- 被弾無敵/ボム無敵タイマー ---
      if (p.invuln > 0) p.invuln -= dt;

      // --- 移動 ---
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

      // --- ショット (Z) ---
      p.shotTimer -= dt;
      if (keys["KeyZ"] && p.shotTimer <= 0) {
        p.shotTimer = SHOT_COOLDOWN;
        for (const offset of getShotPattern(p.power)) {
          world.playerBullets.push({ x: p.x + offset, y: p.y - 14, vy: -520 });
        }
      }

      // --- ボム (X) ---
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

      // --- 雑魚スポーン ---
      if (!world.bossSpawned && world.gruntsSpawned < stageConfig.grunts) {
        world.spawnTimer -= dt;
        if (world.spawnTimer <= 0) {
          world.spawnTimer = stageConfig.gruntSpawnInterval;
          spawnGrunt(world);
        }
      }
      // 雑魚を全滅させ切ったらボス出現
      if (
        !world.bossSpawned &&
        world.gruntsSpawned >= stageConfig.grunts &&
        world.enemies.length === 0
      ) {
        spawnBoss(world);
      }

      // --- 雑魚更新 ---
      for (const en of world.enemies) {
        en.t += dt;
        en.y += en.vy * dt;
        en.x += Math.sin(en.t * 2) * 30 * dt;
        en.shotTimer -= dt;
        if (en.shotTimer <= 0 && en.y > 0 && en.y < STG_HEIGHT - 60) {
          en.shotTimer = 1.4 + Math.random() * 0.6;
          const ang = Math.atan2(p.y - en.y, p.x - en.x);
          world.enemyBullets.push({
            x: en.x,
            y: en.y,
            vx: Math.cos(ang) * 130,
            vy: Math.sin(ang) * 130,
          });
        }
      }
      // 画面外に出た雑魚は除去
      world.enemies = world.enemies.filter((e) => e.y < STG_HEIGHT + 40);

      // --- ボス更新 ---
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

      // --- 弾更新 ---
      world.playerBullets.forEach((b) => (b.y += b.vy * dt));
      world.playerBullets = world.playerBullets.filter((b) => b.y > -20);

      world.enemyBullets.forEach((b) => {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      });
      world.enemyBullets = world.enemyBullets.filter(
        (b) => b.x > -20 && b.x < STG_WIDTH + 20 && b.y > -20 && b.y < STG_HEIGHT + 20
      );

      // --- アイテム更新(効果は未実装。取得演出のみ) ---
      world.items.forEach((it) => (it.y += 90 * dt));
      world.items = world.items.filter((it) => {
        if (rectsOverlap(it.x, it.y, 10, p.x, p.y, PLAYER_RADIUS + 8)) {
          return false; // 取得
        }
        return it.y < STG_HEIGHT + 20;
      });

      // --- 当たり判定: 自弾 vs 雑魚 ---
      for (const en of world.enemies) {
        for (const b of world.playerBullets) {
          if (en.hp > 0 && rectsOverlap(en.x, en.y, 12, b.x, b.y, 3)) {
            en.hp -= 1;
            b.y = -9999; // 消す
          }
        }
      }
      world.playerBullets = world.playerBullets.filter((b) => b.y !== -9999);

      const beforeCount = world.enemies.length;
      const defeated = world.enemies.filter((e) => e.hp <= 0);
      defeated.forEach((e) => {
        world.items.push({ x: e.x, y: e.y });
      });
      world.enemies = world.enemies.filter((e) => e.hp > 0);
      world.gruntsDefeated += beforeCount - world.enemies.length;

      // --- 当たり判定: 自弾 vs ボス ---
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
          setHud((h) => ({ ...h, bossHp: world.boss.hp }));
        }
      }

      // --- 当たり判定: 敵弾/敵 vs 自機 ---
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

      setHud((h) => ({ ...h, gruntsLeft: Math.max(0, stageConfig.grunts - world.gruntsDefeated) }));

      // --- 描画 ---
      draw(ctx, world, p);

      if (world.cleared) {
        setTimeout(() => onComplete(), 900);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageKey]);

  function draw(ctx, world, p) {
    // 背景
    ctx.fillStyle = "#0a0b12";
    ctx.fillRect(0, 0, STG_WIDTH, STG_HEIGHT);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < STG_HEIGHT; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(STG_WIDTH, i);
      ctx.stroke();
    }

    // アイテム
    ctx.fillStyle = "#e8c874";
    world.items.forEach((it) => {
      ctx.beginPath();
      ctx.arc(it.x, it.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 自弾
    ctx.fillStyle = "#9fe8ff";
    world.playerBullets.forEach((b) => {
      ctx.fillRect(b.x - 2, b.y - 8, 4, 12);
    });

    // 雑魚
    world.enemies.forEach((en) => {
      ctx.fillStyle = "#c96a6a";
      ctx.beginPath();
      ctx.arc(en.x, en.y, 12, 0, Math.PI * 2);
      ctx.fill();
    });

    // ボス
    if (world.boss) {
      ctx.fillStyle = "#8a4fbf";
      ctx.beginPath();
      ctx.arc(world.boss.x, world.boss.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }

    // 敵弾
    ctx.fillStyle = "#f26d6d";
    world.enemyBullets.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 自機
    ctx.fillStyle = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0 ? "#ffffff55" : "#f4f1ea";
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8c874";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  return (
    <div className="relative h-full w-full flex items-center justify-center gap-6 bg-[#050609] px-6">
      {/* 左: STGゲーム画面 */}
      <div className="relative shrink-0" style={{ width: STG_WIDTH, height: STG_HEIGHT }}>
        <canvas
          ref={canvasRef}
          width={STG_WIDTH}
          height={STG_HEIGHT}
          className="border border-white/10 rounded-sm"
        />
        <div className="absolute bottom-2 left-2 text-[10px] text-white/25 tracking-widest">
          {stageConfig.label}
        </div>
        {hud.cleared && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-[#e8c874] tracking-[0.3em] text-sm">STAGE CLEAR</div>
          </div>
        )}
      </div>

      {/* 右: ステータス表示パネル */}
      <div className="w-56 shrink-0 h-fit border border-white/10 rounded-sm bg-[#12131c]/70 p-4 space-y-5 font-mono">
        <div className="text-[10px] tracking-[0.3em] text-white/30 border-b border-white/10 pb-2">
          STATUS
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-white/60 tracking-widest text-[11px]">
            <Bomb size={13} className="text-[#e8c874]" /> ボム
          </span>
          <span className="text-[#e8c874] text-base">{hud.bombs}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-white/60 tracking-widest text-[11px]">
            <Skull size={13} className="text-[#c96a6a]" /> 被弾数
          </span>
          <span className="text-[#c96a6a] text-base">{hud.hitCount}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-white/60 tracking-widest text-[11px]">
            <Sparkles size={13} className="text-[#9fe8ff]" /> 残り雑魚
          </span>
          <span className="text-[#9fe8ff] text-base">{hud.gruntsLeft}</span>
        </div>

        {hud.bossHp !== null && (
          <div>
            <div className="text-[11px] text-white/60 tracking-widest mb-1.5">
              {stageConfig.boss.name}
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#8a4fbf] transition-all"
                style={{ width: `${clamp((hud.bossHp / hud.bossMaxHp) * 100, 0, 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-white/30 mt-1 text-right">
              {Math.max(0, hud.bossHp)} / {hud.bossMaxHp}
            </div>
          </div>
        )}

        <div className="border-t border-white/10 pt-3 text-[10px] text-white/25 leading-relaxed tracking-wide">
          矢印キー：移動
          <br />
          Z：ショット
          <br />
          X：ボム
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
  const [resolved] = useState(() =>
    resolveEnding(state.runtime.flags, state.runtime.hitCount)
  );
  const def = ENDINGS[resolved];

  useEffect(() => {
    const record = {
      id: def.id,
      title: def.title,
      color: def.color,
      lines: state.runtime.transcript.slice(-6).length
        ? state.runtime.transcript.slice(-6)
        : def.lines,
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
        <div className="text-[11px] tracking-[0.4em] text-white/40 mb-2">THE END</div>
        <h2 className="text-2xl tracking-[0.15em] mb-8" style={{ color: def.color }}>
          {def.title}
        </h2>
        <button
          onClick={() => dispatch({ type: "RETURN_TO_MENU" })}
          className="px-6 py-2.5 border border-white/20 rounded-sm text-sm tracking-widest text-[#e9ecf5] hover:border-[#e8c874]"
        >
          メニューへ戻る
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

  if (stage.type === "stg")
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
    <div className="absolute top-0 right-0 w-72 h-full bg-black/85 border-l border-[#e8c874]/30 p-4 overflow-y-auto text-[11px] font-mono text-[#9fe8ff] z-50">
      <div className="text-[#e8c874] tracking-widest mb-2">DEBUG PANEL (F1)</div>
      <div className="mb-3 space-y-0.5">
        <div>screen: {state.screen}</div>
        <div>stageIndex: {state.runtime.stageIndex}</div>
        <div>stage.id: {stage?.id}</div>
        <div>currentNode: {state.runtime.currentNodeId}</div>
        <div>hitCount: {state.runtime.hitCount}</div>
        <div>flags: {JSON.stringify(state.runtime.flags)}</div>
      </div>
      <div className="text-[#e8c874] tracking-widest mb-1">ACTION LOG</div>
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

  // 起動時にストレージから復元
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

  // F1でデバッグパネル切り替え
  useEffect(() => {
    const handler = (e) => {
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
        style={{ backgroundColor: "#0a0b12", color: "#f4f1ea" }}
      >
        <ScreenRouter />
        <DebugPanel />
      </div>
    </GameContext.Provider>
  );
}
