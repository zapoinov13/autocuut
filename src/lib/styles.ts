// Стили монтажа — пресеты + кастомизация

export type StyleId = "viral_tiktok" | "podcast_clips" | "educational" | "mrbeast_pacing" | "clean_minimal" | "bold_neon" | "custom";

export const FONT_OPTIONS = [
  { value: "Inter", label: "Inter" },
  { value: "Manrope", label: "Manrope" },
  { value: "Outfit", label: "Outfit" },
  { value: "DM Sans", label: "DM Sans" },
  { value: "Space Grotesk", label: "Space Grotesk" },
  { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Poppins", label: "Poppins" },
  { value: "Rubik", label: "Rubik" },
  { value: "Roboto", label: "Roboto" },
  { value: "Oswald", label: "Oswald (Condensed)" },
  { value: "Anton", label: "Anton (Display)" },
  { value: "Bebas Neue", label: "Bebas Neue (Tall Caps)" },
  { value: "Archivo Black", label: "Archivo Black (Heavy)" },
  { value: "Permanent Marker", label: "Permanent Marker" },
  { value: "Caveat", label: "Caveat (Handwriting)" },
] as const;

export type FontFamily = (typeof FONT_OPTIONS)[number]["value"];

export const POSITION_OPTIONS = [
  { value: "top", label: "Сверху" },
  { value: "center", label: "По центру" },
  { value: "bottom", label: "Снизу" },
] as const;

export type SubtitlePosition = (typeof POSITION_OPTIONS)[number]["value"];

export interface SubtitleStyle {
  fontFamily: FontFamily;
  fontSize: number; // px
  fontWeight: number;
  color: string;
  highlightColor: string;
  background: string; // 'transparent' or rgba/hex
  strokeWidth: number; // px
  strokeColor: string;
  shadowBlur: number; // px
  shadowColor: string;
  wordGap?: number; // px between subtitle words
  paddingX?: number; // px horizontal subtitle background padding
  paddingY?: number; // px vertical subtitle background padding
  uppercase: boolean;
  position: SubtitlePosition;
  maxWords?: number; // max words per chunk on screen (default 3)
  minChunkDuration?: number; // seconds — minimum time a chunk stays visible (default 1.2)
}

export interface MontageStyle {
  id: StyleId;
  name: string;
  description: string;
  emoji: string;
  pacing: "slow" | "medium" | "fast" | "ultra_fast";
  zoomFrequency: "low" | "medium" | "high";
  subtitleStyle: SubtitleStyle;
}

export const DEFAULT_CUSTOM_STYLE: SubtitleStyle = {
  fontFamily: "Inter",
  fontSize: 38,
  fontWeight: 800,
  color: "#FFFFFF",
  highlightColor: "#FACC15",
  background: "transparent",
  strokeWidth: 2,
  strokeColor: "#000000",
  shadowBlur: 12,
  shadowColor: "rgba(0,0,0,0.85)",
  wordGap: 8,
  paddingX: 14,
  paddingY: 8,
  uppercase: false,
  position: "center",
  maxWords: 3,
  minChunkDuration: 1.2,
};

export const STYLES: Record<StyleId, MontageStyle> = {
  viral_tiktok: {
    id: "viral_tiktok",
    name: "Viral TikTok",
    description: "Жирный Anton, жёлтая подсветка ключевых слов",
    pacing: "fast",
    zoomFrequency: "high",
    emoji: "🔥",
    subtitleStyle: {
      fontFamily: "Anton",
      fontSize: 44,
      fontWeight: 400,
      color: "#FFFFFF",
      highlightColor: "#FACC15",
      background: "transparent",
      strokeWidth: 3,
      strokeColor: "#000000",
      shadowBlur: 14,
      shadowColor: "rgba(0,0,0,0.9)",
      uppercase: true,
      position: "center",
    },
  },
  mrbeast_pacing: {
    id: "mrbeast_pacing",
    name: "MrBeast",
    description: "Огромные капс-сабы Archivo Black с зелёной подсветкой",
    pacing: "ultra_fast",
    zoomFrequency: "high",
    emoji: "⚡",
    subtitleStyle: {
      fontFamily: "Archivo Black",
      fontSize: 48,
      fontWeight: 900,
      color: "#FFFFFF",
      highlightColor: "#22C55E",
      background: "transparent",
      strokeWidth: 4,
      strokeColor: "#000000",
      shadowBlur: 18,
      shadowColor: "rgba(0,0,0,1)",
      uppercase: true,
      position: "center",
    },
  },
  bold_neon: {
    id: "bold_neon",
    name: "Bold Neon",
    description: "Bebas Neue с неоновой розовой подсветкой",
    pacing: "fast",
    zoomFrequency: "high",
    emoji: "💖",
    subtitleStyle: {
      fontFamily: "Bebas Neue",
      fontSize: 50,
      fontWeight: 400,
      color: "#FFFFFF",
      highlightColor: "#EC4899",
      background: "transparent",
      strokeWidth: 0,
      strokeColor: "#000000",
      shadowBlur: 20,
      shadowColor: "rgba(236,72,153,0.7)",
      uppercase: true,
      position: "center",
    },
  },
  podcast_clips: {
    id: "podcast_clips",
    name: "Podcast Clips",
    description: "Inter, аккуратно и читабельно",
    pacing: "medium",
    zoomFrequency: "low",
    emoji: "🎙️",
    subtitleStyle: {
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: 700,
      color: "#FFFFFF",
      highlightColor: "#F97316",
      background: "transparent",
      strokeWidth: 0,
      strokeColor: "#000000",
      shadowBlur: 10,
      shadowColor: "rgba(0,0,0,0.7)",
      uppercase: false,
      position: "bottom",
    },
  },
  educational: {
    id: "educational",
    name: "Educational",
    description: "Montserrat с подложкой, акцент на термины",
    pacing: "medium",
    zoomFrequency: "medium",
    emoji: "📚",
    subtitleStyle: {
      fontFamily: "Montserrat",
      fontSize: 32,
      fontWeight: 700,
      color: "#FFFFFF",
      highlightColor: "#3B82F6",
      background: "rgba(0,0,0,0.55)",
      strokeWidth: 0,
      strokeColor: "#000000",
      shadowBlur: 0,
      shadowColor: "rgba(0,0,0,0)",
      uppercase: false,
      position: "bottom",
    },
  },
  clean_minimal: {
    id: "clean_minimal",
    name: "Clean Minimal",
    description: "Poppins, минимализм, белый текст",
    pacing: "medium",
    zoomFrequency: "low",
    emoji: "✨",
    subtitleStyle: {
      fontFamily: "Poppins",
      fontSize: 30,
      fontWeight: 600,
      color: "#FFFFFF",
      highlightColor: "#A78BFA",
      background: "transparent",
      strokeWidth: 0,
      strokeColor: "#000000",
      shadowBlur: 8,
      shadowColor: "rgba(0,0,0,0.6)",
      uppercase: false,
      position: "bottom",
    },
  },
  custom: {
    id: "custom",
    name: "Свой стиль",
    description: "Полностью настраиваемый стиль субтитров",
    pacing: "medium",
    zoomFrequency: "medium",
    emoji: "🎨",
    subtitleStyle: DEFAULT_CUSTOM_STYLE,
  },
};

export const STYLE_LIST = Object.values(STYLES);

const CUSTOM_KEY = "custom_subtitle_style_v1";

export function loadCustomStyle(): SubtitleStyle {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return DEFAULT_CUSTOM_STYLE;
    return { ...DEFAULT_CUSTOM_STYLE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CUSTOM_STYLE;
  }
}

export function saveCustomStyle(s: SubtitleStyle) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(s));
}

export function getEffectiveSubtitleStyle(styleId: StyleId): SubtitleStyle {
  if (styleId === "custom") return loadCustomStyle();
  return STYLES[styleId].subtitleStyle;
}
