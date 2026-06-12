import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Play, Pause, RotateCw, Trash2, Music } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

interface Props { projectId: string; audioPath: string | null; }

interface Clip { id: string; storage_path: string; duration: number; order_index: number; meta: any; }
interface Segment {
  id: string; order_index: number;
  clip_id: string; clip_in: number; clip_out: number;
  audio_start: number; audio_end: number;
  reason: string | null;
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export const TimelinePanel = ({ projectId, audioPath }: Props) => {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [clipUrls, setClipUrls] = useState<Record<string, string>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["montage", projectId],
    queryFn: async () => {
      const [{ data: clips }, { data: segs }] = await Promise.all([
        supabase.from("montage_clips").select("*").eq("project_id", projectId).order("order_index"),
        supabase.from("montage_segments").select("*").eq("project_id", projectId).order("order_index"),
      ]);
      return { clips: (clips ?? []) as Clip[], segments: (segs ?? []) as Segment[] };
    },
  });

  // Sign audio + clip URLs
  useEffect(() => {
    if (audioPath) {
      supabase.storage.from("audio").createSignedUrl(audioPath, 6 * 3600)
        .then(({ data }) => data && setAudioUrl(data.signedUrl));
    }
  }, [audioPath]);

  useEffect(() => {
    if (!data?.clips) return;
    (async () => {
      const urls: Record<string, string> = {};
      const ths: Record<string, string> = {};
      for (const c of data.clips) {
        const { data: s } = await supabase.storage.from("videos").createSignedUrl(c.storage_path, 6 * 3600);
        if (s) urls[c.id] = s.signedUrl;
        const thumbPath = c.meta?.thumb_path;
        if (thumbPath) {
          // Бакет thumbnails приватный — нужна подписанная ссылка
          const { data: th } = await supabase.storage.from("thumbnails").createSignedUrl(thumbPath, 6 * 3600);
          if (th) ths[c.id] = th.signedUrl;
        }
      }
      setClipUrls(urls); setThumbs(ths);
    })();
  }, [data?.clips]);

  const currentSeg = useMemo(() => {
    if (!data?.segments) return null;
    return data.segments.find((s) => t >= s.audio_start && t < s.audio_end) ?? null;
  }, [data?.segments, t]);

  // Drive video element to play the right clip segment in sync with audio
  useEffect(() => {
    const v = videoRef.current; if (!v || !currentSeg) return;
    const url = clipUrls[currentSeg.clip_id];
    if (!url) return;
    const localTime = currentSeg.clip_in + (t - currentSeg.audio_start);
    if (v.src !== url) {
      v.src = url;
      v.onloadedmetadata = () => { v.currentTime = Math.max(0, localTime); };
    } else if (Math.abs(v.currentTime - localTime) > 0.3) {
      v.currentTime = Math.max(0, localTime);
    }
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [currentSeg?.id, currentSeg?.clip_id, clipUrls, playing]);

  // RAF poll audio time
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const a = audioRef.current;
      if (a) setT(a.currentTime);
      raf = requestAnimationFrame(tick);
    };
    if (playing) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play(); else a.pause();
  };

  const callAction = async (action: string, body: any) => {
    setBusy(action + (body.segment_id ?? ""));
    const { data, error } = await supabase.functions.invoke("montage-segment-action", {
      body: { action, project_id: projectId, ...body },
    });
    setBusy(null);
    if (error || (data as any)?.error) {
      toast.error("Не удалось", { description: (data as any)?.error ?? error?.message });
      return false;
    }
    qc.invalidateQueries({ queryKey: ["montage", projectId] });
    return true;
  };

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data || !data.segments.length) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">AI ещё собирает раскладку...</Card>;
  }

  const total = Math.max(...data.segments.map((s) => s.audio_end));
  const pxPerSec = isMobile ? 32 : 50;

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="bg-black rounded-xl overflow-hidden aspect-video relative">
        <video ref={videoRef} className="w-full h-full object-contain" muted playsInline />
        <audio ref={audioRef} src={audioUrl ?? undefined}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)} />
        {currentSeg && (
          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
            Сегмент #{currentSeg.order_index + 1} · {currentSeg.reason}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button size="icon" onClick={toggle}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
        <div className="text-xs text-muted-foreground font-mono">{fmt(t)} / {fmt(total)}</div>
        <Music className="h-4 w-4 text-primary ml-auto" />
        <span className="text-xs text-muted-foreground">{data.segments.length} сегментов · {data.clips.length} клипов</span>
      </div>

      {/* Timeline strip */}
      <div className="bg-surface-1 border border-border/40 rounded-xl p-3 overflow-x-auto">
        <div className="relative h-20" style={{ width: `${total * pxPerSec}px`, minWidth: "100%" }}>
          {data.segments.map((s) => {
            const left = s.audio_start * pxPerSec;
            const w = (s.audio_end - s.audio_start) * pxPerSec;
            const isCur = currentSeg?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => { if (audioRef.current) audioRef.current.currentTime = s.audio_start; setT(s.audio_start); }}
                className={`absolute top-0 h-full rounded-md overflow-hidden border-2 transition-all ${isCur ? "border-primary shadow-glow z-10" : "border-border/40 hover:border-primary/60"}`}
                style={{ left: `${left}px`, width: `${Math.max(40, w - 2)}px` }}
              >
                {thumbs[s.clip_id] && (
                  <img src={thumbs[s.clip_id]} alt="" className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-[10px] px-1 py-0.5 truncate">
                  #{s.order_index + 1} · {(s.audio_end - s.audio_start).toFixed(1)}с
                </div>
              </button>
            );
          })}
          {/* playhead */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-primary pointer-events-none" style={{ left: `${t * pxPerSec}px` }} />
        </div>
      </div>

      {/* Segment list with actions */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {data.segments.map((s) => {
          const clip = data.clips.find((c) => c.id === s.clip_id);
          const isCur = currentSeg?.id === s.id;
          return (
            <Card key={s.id} className={`p-3 flex items-center gap-3 ${isCur ? "border-primary" : "border-border/40"}`}>
              {thumbs[s.clip_id] && <img src={thumbs[s.clip_id]} alt="" className="h-12 w-20 rounded object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">#{s.order_index + 1} · {fmt(s.audio_start)}-{fmt(s.audio_end)} · клип «{clip?.meta?.description ?? clip?.meta?.original_name ?? "?"}»</p>
                <p className="text-[11px] text-muted-foreground line-clamp-1">{s.reason ?? "-"}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <select
                  className="text-xs bg-surface-2 border border-border/60 rounded px-1 py-1 max-w-[120px]"
                  value={s.clip_id}
                  onChange={(e) => callAction("replace_clip", { segment_id: s.id, payload: { clip_id: e.target.value, clip_in: 0 } })}
                  disabled={!!busy}
                >
                  {data.clips.map((c, i) => (
                    <option key={c.id} value={c.id}>#{i + 1} {c.meta?.description?.slice(0, 24) ?? ""}</option>
                  ))}
                </select>
                <Button size="icon" variant="ghost" title="Перегенерировать" disabled={!!busy}
                  onClick={() => callAction("regenerate", { segment_id: s.id })}>
                  {busy === "regenerate" + s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                </Button>
                <Button size="icon" variant="ghost" title="Удалить" disabled={!!busy}
                  onClick={() => callAction("delete", { segment_id: s.id })}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
