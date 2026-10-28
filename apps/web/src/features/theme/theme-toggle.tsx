"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "./theme-context";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className = "", showLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`h-7 w-7 rounded-md border border-slate-200 dark:border-slate-700/60 bg-slate-100 dark:bg-slate-800/40 opacity-50 ${className}`}
        aria-hidden="true"
      />
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={`h-7 px-2 text-xs font-medium rounded-md border transition-all duration-200 flex items-center justify-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 select-none shadow-sm ${
        isDark
          ? "border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-amber-300 hover:text-amber-200 hover:border-slate-600"
          : "border-slate-300 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900"
      } ${className}`}
    >
      {isDark ? (
        <Sun className="w-3.5 h-3.5 text-amber-400 transition-transform duration-300 rotate-0 hover:rotate-45" />
      ) : (
        <Moon className="w-3.5 h-3.5 text-indigo-600 transition-transform duration-300 -rotate-12 hover:rotate-0" />
      )}
      {showLabel && (
        <span className="text-[11px] font-medium">
          {isDark ? "Light Mode" : "Dark Mode"}
        </span>
      )}
    </button>
  );
}
