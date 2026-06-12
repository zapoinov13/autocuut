import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { SubtitleStyle } from "@/lib/styles";
import { formatDuration } from "@/lib/format";
import { previewFontScale, wordStyle } from "@/lib/subtitle-render";
import type { VideoFormat } from "@/components/editor/panels/FormatPanel";

interface Word { text: string; start: number; end: number; }
interface Scene {
  id: string;
  start_time: number;
  end_time: number;
  zoom: string;
  highlight_words: string[];
  broll_url?: string | null;
  top_video_url?: string | null;
}

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
  trimStart?: number | null;
  trimEnd?: number | null;
}

export const VideoPreview = ({
  videoUrl, subtitleStyle: sub, words, scenes,
  format = "stories", musicUrl, musicVolume = 20,
  subtitleY = 82, onSubtitleYChange, onEditSubtitle,
  trimStart = null, trimEnd = null,
}: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const topVideoRef = useRef<HTMLVideoElement>(null);
  const brollVideoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fontScale, setFontScale] = useState(1);

  const trimIn = trimStart ?? 0;
  const relativeTime = currentTime - trimIn;
  const effectiveDuration = Math.max(0, (trimEnd ?? (duration || 0)) - trimIn);

  const activeScene = useMemo(
    () => scenes.find((s) => relativeTime >= s.start_time && relativeTime < s.end_time),
    [scenes, relativeTime],
  );

  const maxWords = Math.max(2, Math.min(5, sub.maxWords ?? 3));
  const minChunkDuration = Math.max(0.4, sub.minChunkDuration ?? 0.9);

  const chunks = useMemo(() => {
    if (!words.length) return [] as { start: number; end: number; words: Word[] }[];
    const out: { start: number; end: number; words: Word[] }[] = [];
    let buf: Word[] = [];
    const flush = () => {
      if (!buf.length) return;
      out.push({ start: buf[0].start, end: buf[buf.length - 1].end, words: [...buf] });
      buf = [];
    };
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      buf.push(w);
      const dur = buf[buf.length - 1].end - buf[0].start;
      const chars = buf.reduce((a, x) => a + x.text.length + 1, 0);
      const next = words[i + 1];
      const gap = next ? next.start - w.end : 0;
      const punct = /[.!?…]$/.test(w.text);
      const maxedOut = buf.length >= maxWords || chars >= 28;
      if (!next || maxedOut || (dur >= minChunkDuration && (punct || gap > 0.4))) flush();
    }
    flush();
    return out;
  }, [words, maxWords, minChunkDuration]);

  const currentChunk = useMemo(() => {
    if (!chunks.length) return null;
    return chunks.find((c) => relativeTime >= c.start && relativeTime < c.end + 0.05) ?? null;
  }, [chunks, relativeTime]);

  const visibleWords = currentChunk?.words ?? [];

  const highlightSet = useMemo(() => {
    if (!activeScene) return new Set<string>();
    return new Set(activeScene.highlight_words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")));
  }, [activeScene]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setFontScale(previewFontScale(el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf: number;
    const tick = () => {
      const vid = videoRef.current;
      if (!vid) return;
      if (trimEnd != null && vid.currentTime >= trimEnd) {
        vid.pause();
        vid.currentTime = trimIn;
      }
      setCurrentTime(vid.currentTime);
      raf = requestAnimationFrame(tick);
    };
    if (playing) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, trimEnd, trimIn]);

  // Синхронизация B-roll / top / music с основным видео
  useEffect(() => {
    if (!playing) {
      brollVideoRef.current?.pause();
      topVideoRef.current?.pause();
      musicRef.current?.pause();
      return;
    }
    const localT = activeScene ? relativeTime - activeScene.start_time : 0;
    const broll = brollVideoRef.current;
    if (broll && activeScene?.broll_url) {
      if (broll.paused) broll.play().catch(() => undefined);
      const dur = broll.duration || 10;
      const target = localT % dur;
      if (Math.abs(broll.currentTime - target) > 0.35) broll.currentTime = target;
    }
    const top = topVideoRef.current;
    if (top && activeScene?.top_video_url) {
      if (top.paused) top.play().catch(() => undefined);
      const dur = top.duration || 10;
      const target = localT % dur;
      if (Math.abs(top.currentTime - target) > 0.35) top.currentTime = target;
    }
    if (musicRef.current) musicRef.current.play().catch(() => undefined);
  }, [playing, activeScene, relativeTime]);

  useEffect(() => {
    const music = musicRef.current;
    if (music) music.volume = Math.min(1, Math.max(0, musicVolume / 100));
  }, [musicVolume]);

  const zoomScale = useMemo(() => {
    if (!activeScene || activeScene.broll_url) return 1;
    const progress = (relativeTime - activeScene.start_time) / Math.max(0.01, activeScene.end_time - activeScene.start_time);
    if (activeScene.zoom === "in") return 1 + progress * 0.12;
    if (activeScene.zoom === "out") return 1.12 - progress * 0.12;
    return 1;
  }, [activeScene, relativeTime]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }, []);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const abs = trimIn + Math.max(0, Math.min(effectiveDuration, t));
    v.currentTime = abs;
    setCurrentTime(v.currentTime);
    if (musicRef.current) musicRef.current.currentTime = v.currentTime;
  }, [trimIn, effectiveDuration]);

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

  const [dragging, setDragging] = useState(false);
  const [moved, setMoved] = useState(false);
  const dragStartY = useRef(0);
  const [localY, setLocalY] = useState(subtitleY);
  useEffect(() => { if (!dragging) setLocalY(subtitleY); }, [subtitleY, dragging]);

  const onSubPointerDown = (e: React.PointerEvent) => {
    if (!onSubtitleYChange) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
    setDragging(true);
    setMoved(false);
  };
  const onSubPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !containerRef.current) return;
    if (Math.abs(e.clientY - dragStartY.current) > 4) setMoved(true);
    const rect = containerRef.current.getBoundingClientRect();
    setLocalY(Math.max(8, Math.min(92, ((e.clientY - rect.top) / rect.height) * 100)));
  };
  const onSubPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (moved) onSubtitleYChange?.(localY);
  };

  const scaledFont = sub.fontSize * fontScale;
  const wordGap = Math.round((sub.wordGap ?? 10) * fontScale);
  const hasBg = sub.background && sub.background !== "transparent";
  const padX = Math.round((sub.paddingX ?? 16) * fontScale);
  const padY = Math.round((sub.paddingY ?? 10) * fontScale);
  const aspectRatio = format === "landscape" ? "16/9" : "9/16";
  const isSplit = format === "split";
  const showBroll = Boolean(activeScene?.broll_url);

  return (
    <div ref={containerRef} className="relative bg-black rounded-2xl overflow-hidden shadow-elevated group/player mx-auto" style={{ aspectRatio, height: "100%", maxHeight: "calc(100vh - 180px)", width: "auto" }}>
      {isSplit ? (
        <>
          <div className="absolute inset-x-0 top-0 h-1/2 bg-black overflow-hidden">
            {activeScene?.top_video_url ? (
              <video ref={topVideoRef} src={activeScene.top_video_url} className="w-full h-full object-cover" muted playsInline />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-white/40 text-center px-3">
                Верхний клип (B-roll)
              </div>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-black overflow-hidden">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer"
              style={{ transform: `scale(${zoomScale})` }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration);
                if (trimIn > 0) e.currentTarget.currentTime = trimIn;
              }}
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
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer"
          style={{ transform: `scale(${zoomScale})`, transformOrigin: "center center" }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            if (trimIn > 0) e.currentTarget.currentTime = trimIn;
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onClick={togglePlay}
          playsInline
        />
      )}

      {showBroll && (
        <video
          key={activeScene!.id + activeScene!.broll_url}
          ref={brollVideoRef}
          src={activeScene!.broll_url!}
          className={`absolute ${isSplit ? "inset-x-0 bottom-0 h-1/2" : "inset-0 h-full"} w-full object-cover z-[5] pointer-events-none transition-opacity duration-300`}
          muted
          playsInline
        />
      )}

      {musicUrl && <audio ref={musicRef} src={musicUrl} loop />}

      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/35 transition-colors z-10"
          aria-label="Play"
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/95 flex items-center justify-center shadow-2xl">
            <Play className="h-7 w-7 sm:h-9 sm:w-9 text-black fill-black ml-1" />
          </div>
        </button>
      )}

      {visibleWords.length > 0 && (
        <div
          key={`${currentChunk?.start}-${visibleWords.length}`}
          onPointerDown={onSubPointerDown}
          onPointerMove={onSubPointerMove}
          onPointerUp={onSubPointerUp}
          onPointerCancel={onSubPointerUp}
          onClick={(e) => { e.stopPropagation(); if (!moved) onEditSubtitle?.(); }}
          className={`absolute left-0 right-0 -translate-y-1/2 flex justify-center px-4 z-20 select-none group/sub ${
            onSubtitleYChange ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
          }`}
          style={{ top: `${localY}%`, transition: dragging ? "none" : "top 0.15s ease-out" }}
        >
          <div
            className="inline-flex flex-wrap items-end justify-center max-w-[92%]"
            style={{
              gap: `${wordGap}px`,
              background: hasBg ? sub.background : undefined,
              padding: hasBg ? `${padY}px ${padX}px` : undefined,
              borderRadius: hasBg ? 12 : undefined,
              outline: dragging ? "2px dashed rgba(255,255,255,0.5)" : undefined,
              outlineOffset: 6,
            }}
          >
            {visibleWords.map((w, i) => {
              const isActive = relativeTime >= w.start && relativeTime < w.end;
              const cleaned = w.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
              const isKeyword = highlightSet.has(cleaned);
              return (
                <span
                  key={`${w.start}-${i}`}
                  style={wordStyle(sub, scaledFont, { isActive, isKeyword })}
                >
                  {w.text}
                </span>
              );
            })}
          </div>
          {onEditSubtitle && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEditSubtitle(); }}
              className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-black/75 text-white text-[10px] opacity-0 group-hover/sub:opacity-100 transition-opacity whitespace-nowrap"
            >
              Редактировать
            </button>
          )}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/45 to-transparent opacity-100 sm:opacity-0 sm:group-hover/player:opacity-100 transition-opacity z-30">
        <div className="px-1 mb-2">
          <Slider value={[Math.max(0, relativeTime)]} min={0} max={effectiveDuration || 1} step={0.05} onValueChange={(v) => seek(v[0])} />
        </div>
        <div className="flex items-center gap-2 text-white">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15" onClick={togglePlay}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15" onClick={() => seek(0)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15" onClick={toggleMute}>
            {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <span className="text-xs font-mono tabular-nums">
            {formatDuration(Math.max(0, relativeTime))} / {formatDuration(effectiveDuration)}
          </span>
          {showBroll && (
            <span className="text-[10px] bg-primary/80 text-white px-1.5 py-0.5 rounded ml-1">B-roll</span>
          )}
          <div className="ml-auto">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15" onClick={fullscreen}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
