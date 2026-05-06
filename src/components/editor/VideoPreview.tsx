import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { SubtitleStyle } from "@/lib/styles";
import { formatDuration } from "@/lib/format";
import type { VideoFormat } from "@/components/editor/panels/FormatPanel";

interface Word { text: string; start: number; end: number; }
interface Scene { id: string; start_time: number; end_time: number; zoom: string; highlight_words: string[]; broll_url?: string | null; top_video_url?: string | null; }

interface Props {
  videoUrl: string;
  subtitleStyle: SubtitleStyle;
  words: Word[];
  scenes: Scene[];
  format?: VideoFormat;
  musicUrl?: string | null;
  musicVolume?: number;
  subtitleY?: number;
  onSubtitleYChange?: (y: number) => void;
  onEditSubtitle?: () => void;
}

export const VideoPreview = ({
  videoUrl, subtitleStyle: sub, words, scenes,
  format = "stories", musicUrl, musicVolume = 20,
  subtitleY = 80, onSubtitleYChange, onEditSubtitle,
}: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const topVideoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
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

  // Sync top video and music with main video
  useEffect(() => {
    const top = topVideoRef.current;
    const music = musicRef.current;
    if (top) { playing ? top.play().catch(() => {}) : top.pause(); }
    if (music) { playing ? music.play().catch(() => {}) : music.pause(); }
  }, [playing, activeScene?.top_video_url, musicUrl]);

  useEffect(() => {
    const music = musicRef.current;
    if (music) music.volume = Math.min(1, Math.max(0, musicVolume / 100));
  }, [musicVolume]);

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
    if (musicRef.current) musicRef.current.currentTime = v.currentTime;
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

  // Drag subtitles vertically
  const [dragging, setDragging] = useState(false);
  const [localY, setLocalY] = useState(subtitleY);
  useEffect(() => { if (!dragging) setLocalY(subtitleY); }, [subtitleY, dragging]);

  const onSubPointerDown = (e: React.PointerEvent) => {
    if (!onSubtitleYChange) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onSubPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setLocalY(Math.max(5, Math.min(95, y)));
  };
  const onSubPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    onSubtitleYChange?.(localY);
  };

  const textShadow = sub.shadowBlur > 0 ? `0 4px ${sub.shadowBlur}px ${sub.shadowColor}` : undefined;
  const stroke = sub.strokeWidth > 0 ? `${sub.strokeWidth}px ${sub.strokeColor}` : undefined;
  const hasBg = sub.background && sub.background !== "transparent";

  const aspectRatio = format === "landscape" ? "16/9" : "9/16";
  const isSplit = format === "split";

  return (
    <div ref={containerRef} className="relative bg-black rounded-2xl overflow-hidden shadow-elevated group/player mx-auto" style={{ aspectRatio, height: "100%", maxHeight: "calc(100vh - 180px)", width: "auto" }}>
      {isSplit ? (
        <>
          {/* Top half — B-roll / uploaded clip */}
          <div className="absolute inset-x-0 top-0 h-1/2 bg-black overflow-hidden">
            {activeScene?.top_video_url ? (
              <video
                ref={topVideoRef}
                src={activeScene.top_video_url}
                className="w-full h-full object-cover"
                loop
                muted
                playsInline
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-white/40 text-center px-3">
                Назначь верхний клип на сцену<br/>(B-roll или загрузи свой)
              </div>
            )}
          </div>
          {/* Bottom half — speaker video */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-black overflow-hidden">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-cover transition-transform duration-300 ease-out cursor-pointer"
              style={{ transform: `scale(${zoomScale})` }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onClick={togglePlay}
              playsInline
            />
          </div>
        </>
      ) : (
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
      )}

      {musicUrl && <audio ref={musicRef} src={musicUrl} loop />}

      {!playing && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors z-10"
          aria-label="Play"
        >
          <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-2xl">
            <Play className="h-9 w-9 text-black fill-black ml-1" />
          </div>
        </button>
      )}

      {visibleWords.length > 0 && (
        <div
          onPointerDown={onSubPointerDown}
          onPointerMove={onSubPointerMove}
          onPointerUp={onSubPointerUp}
          onPointerCancel={onSubPointerUp}
          onDoubleClick={(e) => { e.stopPropagation(); onEditSubtitle?.(); }}
          className={`absolute left-3 right-3 -translate-y-1/2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 z-20 select-none group/sub ${
            onSubtitleYChange ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
          }`}
          style={{
            top: `${localY}%`,
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
            outline: dragging ? "2px dashed rgba(255,255,255,0.6)" : undefined,
            outlineOffset: 4,
            transition: dragging ? "none" : "top 0.15s ease-out",
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
          {onEditSubtitle && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEditSubtitle(); }}
              className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-black/80 text-white text-[11px] opacity-0 group-hover/sub:opacity-100 transition-opacity whitespace-nowrap pointer-events-auto"
            >
              ✏️ Редактировать стиль
            </button>
          )}
        </div>
      )}

      {/* Custom controls */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover/player:opacity-100 transition-opacity z-30">
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
            {formatDuration(currentTime)} / {formatDuration(duration)}
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
