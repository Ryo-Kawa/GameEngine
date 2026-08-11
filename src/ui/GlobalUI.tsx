import {
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import { ICON_MAP, THEME } from "../consts";
import { IconKey } from "../types";

export function MenuButton({
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

export function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
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

export function StarField() {
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