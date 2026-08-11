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

import {
  useReducer,
  useEffect,
} from "react";
import { SCREENS, THEME } from "./consts";
import { useGame, reducer, initialState, GameContext } from "./GameContext";
import { SaveManager } from "./util";
import { MenuScreen, ManualScreen, OptionsScreen, EndingGalleryScreen, GameScreen } from "./ui/ScreenUI";

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
      </div>
    </GameContext.Provider>
  );
}