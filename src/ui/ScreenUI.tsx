import {
  Heart,
  ImageIcon,
  Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { UI_LABELS, THEME, MENU_TEXT, MENU_BUTTONS, SCREENS, MANUAL_SECTIONS, OPTION_FIELDS, ENDINGS, resolveEnding, STAGE_SEQUENCE } from "../consts";
import { UnlockedEndingRecord, useGame } from "../GameContext";
import { MenuButtonConfig, OptionsState } from "../types";
import { SaveManager } from "../util";
import { StarField, MenuButton, ScreenHeader } from "./GlobalUI";
import { STGPart } from "../stg/STGPart";
import { VNPart } from "../vn/VNPart";

export function MenuScreen() {
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

export function ManualScreen() {
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

export function OptionsScreen() {
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

export function EndingGalleryScreen() {
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

export function EndingPart() {
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

export function GameScreen() {
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