import {
  Save,
} from "lucide-react";
import { useEffect } from "react";
import { SCENARIO, getHitDependentText, UI_LABELS, THEME } from "../consts";
import { useGame } from "../GameContext";
import { VNChoice } from "../types";
import { StarField } from "../ui/GlobalUI";
import { SaveManager } from "../util";

export function VNPart() {
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