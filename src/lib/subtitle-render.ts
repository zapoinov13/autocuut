import type { CSSProperties } from "react";
import type { SubtitleStyle } from "@/lib/styles";

/** Масштаб шрифта под ширину превью (референс 360px для 9:16). */
export function previewFontScale(containerWidth: number): number {
  return Math.min(1.15, Math.max(0.5, containerWidth / 360));
}

/** Обводка через text-shadow — выглядит чище чем WebkitTextStroke на контейнере. */
export function buildTextOutline(width: number, color: string): string {
  if (width <= 0) return "";
  const parts: string[] = [];
  const r = Math.ceil(width);
  for (let x = -r; x <= r; x++) {
    for (let y = -r; y <= r; y++) {
      if (x * x + y * y <= r * r + 0.5) {
        parts.push(`${x}px ${y}px 0 ${color}`);
      }
    }
  }
  return parts.join(", ");
}

export function wordStyle(
  sub: SubtitleStyle,
  fontSize: number,
  opts: { isActive: boolean; isKeyword: boolean },
): CSSProperties {
  const outline = buildTextOutline(sub.strokeWidth, sub.strokeColor);
  const drop = sub.shadowBlur > 0 ? `0 3px ${sub.shadowBlur}px ${sub.shadowColor}` : "";
  const textShadow = [outline, drop].filter(Boolean).join(", ") || undefined;

  let color = sub.color;
  if (opts.isActive) color = sub.highlightColor;
  else if (opts.isKeyword) color = sub.highlightColor;

  return {
    color,
    fontSize,
    fontWeight: sub.fontWeight,
    fontFamily: `"${sub.fontFamily}", system-ui, sans-serif`,
    textTransform: sub.uppercase ? "uppercase" : "none",
    textShadow,
    display: "inline-block",
    lineHeight: 1.1,
    transform: opts.isActive ? "scale(1.12)" : "scale(1)",
    transformOrigin: "center bottom",
    transition: "transform 0.1s ease-out, color 0.1s ease-out",
  };
}

export const POSITION_Y: Record<string, number> = {
  top: 14,
  center: 50,
  bottom: 82,
};
