import { useEffect, useRef, useState, useMemo } from "react";
import { STYLES, StyleId } from "@/lib/styles";

interface Word { text: string; start: number; end: number; }
interface Scene { id: string; start_time: number; end_time: number; zoom: string; highlight_words: string[]; }

interface Props {
  videoUrl: string;
  styleId: StyleId;
  words: Word[];
  scenes: Scene[];
}

export const VideoPreview = ({ videoUrl, styleId, words, scenes }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const style = STYLES[styleId];

  // Detect active scene + active words
  const activeScene = useMemo(
    () => scenes.find((s) => currentTime >= s.start_time && currentTime < s.end_time),
    [scenes, currentTime],
  );

  // Show 3-5 words around the current time
  const visibleWords = useMemo(() => {
    const window = 1.8; // sec window of text around current time
    return words.filter((w) => w.start <= currentTime + 0.1 && w.end > currentTime - window);
  }, [words, currentTime]);

  const highlightSet = useMemo(() => {
    if (!activeScene) return new Set<string>();
    return new Set(activeScene.highlight_words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")));
  }, [activeScene]);

  // Animation frame for smooth time updates
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf: number;
    const tick = () => {
      setCurrentTime(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    if (playing) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Zoom transform
  const zoomScale = useMemo(() => {
    if (!activeScene) return 1;
    const progress = (currentTime - activeScene.start_time) / Math.max(0.01, activeScene.end_time - activeScene.start_time);
    if (activeScene.zoom === "in") return 1 + progress * 0.15;
    if (activeScene.zoom === "out") return 1.15 - progress * 0.15;
    return 1;
  }, [activeScene, currentTime]);

  const sub = style.subtitleStyle;
  const positionClass = sub.position === "center" ? "top-1/2 -translate-y-1/2" : "bottom-[15%]";

  return (
    <div className="relative w-full bg-black rounded-2xl overflow-hidden shadow-elevated" style={{ aspectRatio: "9/16" }}>
      <video
        ref={videoRef}
        src={videoUrl}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 ease-out"
        style={{ transform: `scale(${zoomScale})` }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        playsInline
        controls
      />

      {/* Subtitles overlay */}
      {visibleWords.length > 0 && (
        <div
          className={`absolute left-4 right-4 ${positionClass} pointer-events-none flex flex-wrap items-center justify-center gap-x-2 gap-y-1`}
          style={{
            fontSize: sub.fontSize,
            fontWeight: sub.fontWeight,
            color: sub.color,
            textShadow: sub.textShadow,
            textTransform: sub.textTransform,
            WebkitTextStroke: sub.stroke,
            background: sub.background,
            padding: sub.background ? "8px 12px" : undefined,
            borderRadius: sub.background ? "8px" : undefined,
            lineHeight: 1.1,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {visibleWords.map((w, i) => {
            const isActive = currentTime >= w.start && currentTime < w.end;
            const cleaned = w.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
            const isHighlight = highlightSet.has(cleaned);
            const color = isHighlight ? sub.highlightColor : sub.color;
            return (
              <span
                key={`${w.start}-${i}`}
                style={{
                  color,
                  transform: isActive ? "scale(1.08)" : "scale(1)",
                  transition: "transform 0.12s ease-out",
                  display: "inline-block",
                  opacity: isActive ? 1 : 0.7,
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
