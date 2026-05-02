// Стили монтажа — пресеты для AI-режиссуры и рендера субтитров

export type StyleId = "viral_tiktok" | "podcast_clips" | "educational" | "mrbeast_pacing";

export interface MontageStyle {
  id: StyleId;
  name: string;
  description: string;
  pacing: "slow" | "medium" | "fast" | "ultra_fast";
  zoomFrequency: "low" | "medium" | "high";
  subtitleStyle: {
    fontSize: string;
    fontWeight: number;
    color: string;
    highlightColor: string;
    background?: string;
    textShadow?: string;
    textTransform?: "none" | "uppercase";
    position: "center" | "bottom";
    stroke?: string;
  };
  emoji: string;
}

export const STYLES: Record<StyleId, MontageStyle> = {
  viral_tiktok: {
    id: "viral_tiktok",
    name: "Viral TikTok",
    description: "Быстрая нарезка, крупные жёлтые субтитры, агрессивные зумы",
    pacing: "fast",
    zoomFrequency: "high",
    emoji: "🔥",
    subtitleStyle: {
      fontSize: "42px",
      fontWeight: 900,
      color: "#FFFFFF",
      highlightColor: "#FACC15",
      textShadow: "0 4px 12px rgba(0,0,0,0.9)",
      stroke: "2px black",
      textTransform: "uppercase",
      position: "center",
    },
  },
  podcast_clips: {
    id: "podcast_clips",
    name: "Podcast Clips",
    description: "Спокойный темп, минималистичные белые субтитры",
    pacing: "medium",
    zoomFrequency: "low",
    emoji: "🎙️",
    subtitleStyle: {
      fontSize: "32px",
      fontWeight: 600,
      color: "#FFFFFF",
      highlightColor: "#F97316",
      textShadow: "0 2px 8px rgba(0,0,0,0.7)",
      position: "bottom",
    },
  },
  educational: {
    id: "educational",
    name: "Educational",
    description: "Средний темп, чистые субтитры, выделение ключевых терминов",
    pacing: "medium",
    zoomFrequency: "medium",
    emoji: "📚",
    subtitleStyle: {
      fontSize: "34px",
      fontWeight: 700,
      color: "#FFFFFF",
      highlightColor: "#3B82F6",
      background: "rgba(0,0,0,0.5)",
      position: "bottom",
    },
  },
  mrbeast_pacing: {
    id: "mrbeast_pacing",
    name: "MrBeast Pacing",
    description: "Очень быстрая нарезка, крупные капс-субтитры с обводкой",
    pacing: "ultra_fast",
    zoomFrequency: "high",
    emoji: "⚡",
    subtitleStyle: {
      fontSize: "48px",
      fontWeight: 900,
      color: "#FFFFFF",
      highlightColor: "#22C55E",
      textShadow: "0 4px 16px rgba(0,0,0,1)",
      stroke: "3px black",
      textTransform: "uppercase",
      position: "center",
    },
  },
};

export const STYLE_LIST = Object.values(STYLES);
