import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { SubtitleStyle } from "@/lib/styles";
import { formatTime } from "@/lib/format";

interface Word { text: string; start: number; end: number; }
interface Scene { id: string; start_time: number; end_time: number; zoom: string; highlight_words: string[]; }

interface Props {
  videoUrl: string;
  subtitleStyle: SubtitleStyle;
  words: Word[];
  scenes: Scene[];
}

export const VideoPreview = ({ videoUrl, subtitleStyle: sub, words, scenes }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const activeScene = useMemo(
    () => scenes.find((s) => currentTime >= s.start_time && currentTime < s.end_time),
    [scenes, currentTime],
  );

  const visibleWords = useMemo(() => {
    const window = 1.8;
    return words.filter((w) => w.start <= currentTime + 0.1 && w.end > currentTime - window);
  }, [words, currentTime]);

  const highlightSet = useMemo(() => {
    if (!activeScene) return new Set<string>();
    return new Set(activeScene.highlight_words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")));
  }, [activeScene]);

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

  const zoomScale = useMemo(() => {
    if (!activeScene) return 1;
    const progress = (currentTime - activeScene.start_time) / Math.max(0.01, activeScene.end_time - activeScene.start_time);
    if (activeScene.zoom === "in") return 1 + progress * 0.15;
    if (activeScene.zoom === "out") return 1.15 - progress * 0.15;
    return 1;
  }, [activeScene, currentTime]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }, []);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, t));
    setCurrentTime(v.currentTime);
  }, [duration]);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const handleVolume = (val: number[]) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val[0];
    setVolume(val[0]);
    if (val[0] > 0 && v.muted) { v.muted = false; setMuted(false); }
  };

  const fullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  const positionClass =
    sub.position === "center" ? "top-1/2 -translate-y-1/2"
    : sub.position === "top" ? "top-[10%]"
    : "bottom-[15%]";

  const textShadow = sub.shadowBlur > 0 ? `0 4px ${sub.shadowBlur}px ${sub.shadowColor}` : undefined;
  const stroke = sub.strokeWidth > 0 ? `${sub.strokeWidth}px ${sub.strokeColor}` : undefined;
  const hasBg = sub.background && sub.background !== "transparent";

  return (
    <div ref={containerRef} className="relative w-full bg-black rounded-2xl overflow-hidden shadow-elevated group/player" style={{ aspectRatio: "9/16" }}>
      <video
        ref={videoRef}
        src={videoUrl}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 ease-out cursor-pointer"
        style={{ transform: `scale(${zoomScale})` }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onClick={togglePlay}
        playsInline
      />

      {/* Big play button overlay when paused */}
      {!playing && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
          aria-label="Play"
        >
          <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-2xl">
            <Play className="h-9 w-9 text-black fill-black ml-1" />
          </div>
        </button>
      )}

      {/* Subtitles overlay */}
      {visibleWords.length > 0 && (
        <div
          className={`absolute left-4 right-4 ${positionClass} pointer-events-none flex flex-wrap items-center justify-center gap-x-2 gap-y-1`}
          style={{
            fontSize: `${sub.fontSize}px`,
            fontWeight: sub.fontWeight,
            color: sub.color,
            textShadow,
            textTransform: sub.uppercase ? "uppercase" : "none",
            WebkitTextStroke: stroke,
            background: hasBg ? sub.background : undefined,
            padding: hasBg ? "8px 14px" : undefined,
            borderRadius: hasBg ? "10px" : undefined,
            lineHeight: 1.15,
            fontFamily: `"${sub.fontFamily}", system-ui, -apple-system, sans-serif`,
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
                  transform: isActive ? "scale(1.1)" : "scale(1)",
                  transition: "transform 0.12s ease-out",
                  display: "inline-block",
                  opacity: isActive ? 1 : 0.75,
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      )}

      {/* Custom controls */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover/player:opacity-100 transition-opacity">
        {/* Progress */}
        <div className="px-1 mb-2">
          <Slider
            value={[currentTime]}
            min={0}
            max={duration || 1}
            step={0.05}
            onValueChange={(v) => seek(v[0])}
          />
        </div>
        <div className="flex items-center gap-2 text-white">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15 hover:text-white" onClick={togglePlay}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15 hover:text-white" onClick={() => seek(0)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15 hover:text-white" onClick={toggleMute}>
            {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <div className="w-20 hidden sm:block">
            <Slider value={[muted ? 0 : volume]} min={0} max={1} step={0.05} onValueChange={handleVolume} />
          </div>
          <span className="text-xs font-mono ml-1 tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="ml-auto">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15 hover:text-white" onClick={fullscreen}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
