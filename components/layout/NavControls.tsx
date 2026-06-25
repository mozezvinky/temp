"use client";

import type { Role } from "@/types";
import { Moon, Sun } from "lucide-react";

export type UiTheme = "light" | "dark";

export function RoleModeToggle({
  activeRole,
  switchingRole,
  onSwitch,
  className = ""
}: {
  activeRole: "worker" | "client";
  switchingRole: Role | null;
  onSwitch: (role: "worker" | "client") => void;
  className?: string;
}) {
  return (
    <div className={`copic-control temp-role-switch relative inline-flex text-xs font-black ${activeRole === "client" ? "is-client" : "is-worker"} ${className}`} aria-label="Switch account mode">
      <span className="temp-role-switch-thumb absolute z-0" aria-hidden="true" />
      {(["worker", "client"] as const).map(role => (
        <button
          key={role}
          type="button"
          disabled={!!switchingRole || activeRole === role}
          aria-pressed={activeRole === role}
          aria-label={`Use ${role} mode`}
          onClick={() => onSwitch(role)}
          className="relative z-10 rounded-full capitalize transition-all duration-300 ease-in-out disabled:cursor-default"
        >
          {switchingRole === role ? "Switching" : role}
        </button>
      ))}
    </div>
  );
}

export function ThemeModeSwitch({ theme, onToggle }: { theme: UiTheme; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-pressed={theme === "dark"}
      onClick={onToggle}
      className={`copic-control temp-mode-toggle ${theme === "dark" ? "is-dark" : "is-light"}`}
    >
      <span className="temp-mode-toggle-thumb" aria-hidden="true">
        {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
      </span>
    </button>
  );
}
