import { createContext, useContext } from "react";
import { SCREENS, DEFAULT_OPTIONS, STAGE_SEQUENCE } from "./consts";
import { EndingLine, ScreenId, OptionsState } from "./types";

export interface VNTranscriptEntry {
  speaker: string;
  text: string;
}

export interface RuntimeState {
  stageIndex: number;
  currentNodeId: string | null;
  flags: Record<string, number>;
  hitCount: number;
  transcript: VNTranscriptEntry[];
}

export interface UnlockedEndingRecord {
  id: string;
  title: string;
  color: string;
  lines: EndingLine[];
  unlockedAt: string;
}

export interface GameState {
  screen: ScreenId;
  debugVisible: boolean;
  options: OptionsState;
  unlockedEndings: UnlockedEndingRecord[];
  hasSaveData: boolean;
  runtime: RuntimeState;
  actionLog: string[];
}

export type GameAction =
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

export const initialState: GameState = {
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

export function pushLog(state: GameState, actionType: string, payload: unknown): string[] {
  const entry = `${new Date().toLocaleTimeString()}  ${actionType}  ${JSON.stringify(
    payload || {}
  )}`;
  return [entry, ...state.actionLog].slice(0, 30);
}

export function reducer(state: GameState, action: GameAction): GameState {
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

export interface GameContextValue {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const GameContext = createContext<GameContextValue | null>(null);
export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}