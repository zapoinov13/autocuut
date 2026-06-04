import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Upload as UploadIcon, Music, Film, Loader2, X, Sparkles } from "lucide-react";
import { FORMATS, VideoFormat } from "@/components/editor/panels/FormatPanel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_CLIP_SIZE = 500 * 1024 * 1024;
const MAX_AUDIO_SIZE = 300 * 1024 * 1024;
const MAX_CLIPS = 30;

interface ClipItem {
  file: File;
  duration: number;
  thumbDataUrl: string;
}

const PLACEHOLDER_THUMB =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'><rect width='320' height='180' fill='%23222'/><text x='50%25' y='50%25' fill='%23888' font-family='sans-serif' font-size='16' text-anchor='middle' dy='.3em'>video</text></svg>`
  );

// Robust meta extractor: NEVER hangs. Resolves with placeholder on timeout/error,
// so one weird file doesn't block the rest of the queue.
const extractClipMeta = (f: File): Promise<{ duration: number; thumbDataUrl: string }> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    (v as any).playsInline = true;
    v.src = url;

    let done = false;
    const finish = (duration: number, thumb: string) => {
      if (done) return;
      done = true;
      try { URL.revokeObjectURL(url); } catch {}
      resolve({ duration: isFinite(duration) && duration > 0 ? duration : 0, thumbDataUrl: thumb });
    };

    const hardTimeout = setTimeout(() => finish(v.duration || 0, PLACEHOLDER_THUMB), 3500);

    v.onloadedmetadata = () => {
      const dur = v.duration || 0;
      try {
        v.currentTime = Math.min(Math.max(dur / 2, 0.1), Math.max(dur - 0.1, 0.1));
      } catch {
        clearTimeout(hardTimeout);
        finish(dur, PLACEHOLDER_THUMB);
        return;
      }
      // если seek не выстрелит (часто на .mov/.mkv) — быстро выходим с плейсхолдером
      setTimeout(() => {
        if (!done) { clearTimeout(hardTimeout); finish(dur, PLACEHOLDER_THUMB); }
      }, 900);
    };

    v.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = 320;
        const h = v.videoWidth ? Math.round((w * v.videoHeight) / v.videoWidth) : 180;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx && v.videoWidth) ctx.drawImage(v, 0, 0, w, h);
        const dataUrl = (ctx && v.videoWidth) ? canvas.toDataURL("image/jpeg", 0.7) : PLACEHOLDER_THUMB;
        clearTimeout(hardTimeout);
        finish(v.duration, dataUrl || PLACEHOLDER_THUMB);
      } catch {
        clearTimeout(hardTimeout);
        finish(v.duration, PLACEHOLDER_THUMB);
      }
    };

    v.onerror = () => { clearTimeout(hardTimeout); finish(0, PLACEHOLDER_THUMB); };
  });

const UploadMontage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [audio, setAudio] = useState<File | null>(null);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [format, setFormat] = useState<VideoFormat>("stories");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");

  const onAudioDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    if (f.size > MAX_AUDIO_SIZE) { toast.error(`Аудио > ${Math.round(MAX_AUDIO_SIZE / 1024 / 1024)} МБ`); return; }
    setAudio(f);
  }, []);

  const onClipsDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    if (clips.length + accepted.length > MAX_CLIPS) {
      toast.error(`Максимум ${MAX_CLIPS} клипов`); return;
    }
    const valid = accepted.filter((f) => {
      if (f.size > MAX_CLIP_SIZE) {
        toast.error(`${f.name} > 500 МБ`); return false;
      }
      return true;
    });
    if (!valid.length) return;

    toast.message(`Обработка ${valid.length} клипа(ов)...`);
    // Параллельно — один зависший файл не блокирует остальные (у extractClipMeta встроенный таймаут).
    const results = await Promise.all(
      valid.map(async (f) => {
        const { duration, thumbDataUrl } = await extractClipMeta(f);
        return { file: f, duration, thumbDataUrl } as ClipItem;
      })
    );
    setClips((prev) => [...prev, ...results]);
    toast.success(`Добавлено клипов: ${results.length}`);
  }, [clips.length]);

  const audioDrop = useDropzone({
    onDrop: onAudioDrop,
    accept: {
      "audio/*": [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus", ".weba"],
    },
    maxFiles: 1, multiple: false,
  });
  const clipsDrop = useDropzone({
    onDrop: onClipsDrop,
    accept: {
      "video/*": [".mp4", ".mov", ".webm", ".mkv", ".m4v", ".3gp", ".avi"],
    },
    multiple: true,
  });

  const removeClip = (i: number) => setClips((p) => p.filter((_, idx) => idx !== i));

  const getAudioDuration = (f: File): Promise<number> =>
    new Promise((resolve) => {
      const a = new Audio();
      a.preload = "metadata";
      a.src = URL.createObjectURL(f);
      let done = false;
      const finish = (duration = 0) => {
        if (done) return;
        done = true;
        try { URL.revokeObjectURL(a.src); } catch {}
        resolve(isFinite(duration) && duration > 0 ? duration : 0);
      };
      const timeout = setTimeout(() => finish(0), 3000);
      a.onloadedmetadata = () => { clearTimeout(timeout); finish(a.duration); };
      a.onerror = () => { clearTimeout(timeout); finish(0); };
    });

  const handleStart = async () => {
    if (!user || !audio || clips.length < 2) {
      toast.error("Нужен 1 аудио и минимум 2 клипа"); return;
    }
    setBusy(true);
    setProgress(5);
    setStage("Создаём проект...");
    try {
      const audioDur = await getAudioDuration(audio);

      const { data: project, error: pErr } = await supabase.from("projects").insert({
        user_id: user.id,
        title: audio.name.replace(/\.[^.]+$/, ""),
        style: "viral_tiktok",
        status: "uploading",
        duration: audioDur,
        format,
        kind: "montage",
        captions_enabled: false,
      } as any).select().single();
      if (pErr || !project) throw pErr ?? new Error("Не удалось создать проект");

      setProgress(15);
      setStage("Загружаем аудио...");

      const audioExt = audio.name.split(".").pop() ?? "mp3";
      const audioPath = `${user.id}/${project.id}.${audioExt}`;
      const { error: aErr } = await supabase.storage.from("audio")
        .upload(audioPath, audio, { contentType: audio.type, upsert: true });
      if (aErr) throw aErr;

      await supabase.from("projects").update({ audio_path: audioPath } as any).eq("id", project.id);

      setProgress(25);
      const baseProgress = 25;
      const perClip = 60 / clips.length;

      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        setStage(`Загружаем клип ${i + 1}/${clips.length}...`);
        const ext = c.file.name.split(".").pop() ?? "mp4";
        const clipPath = `${user.id}/${project.id}/clip_${i}.${ext}`;
        const thumbPath = `${user.id}/${project.id}/clip_${i}.jpg`;

        const { error: vErr } = await supabase.storage.from("videos")
          .upload(clipPath, c.file, { contentType: c.file.type, upsert: true });
        if (vErr) throw vErr;

        // Convert dataUrl to blob for thumb upload
        const thumbBlob = await (await fetch(c.thumbDataUrl)).blob();
        await supabase.storage.from("thumbnails")
          .upload(thumbPath, thumbBlob, { contentType: "image/jpeg", upsert: true });

        await supabase.from("montage_clips").insert({
          project_id: project.id,
          user_id: user.id,
          storage_path: clipPath,
          duration: c.duration,
          order_index: i,
          meta: { thumb_path: thumbPath, original_name: c.file.name },
        } as any);

        setProgress(baseProgress + perClip * (i + 1));
      }

      // Set thumbnail to first clip
      const { data: thumb0 } = supabase.storage.from("thumbnails").getPublicUrl(`${user.id}/${project.id}/clip_0.jpg`);
      await supabase.from("projects").update({ thumbnail_url: thumb0.publicUrl }).eq("id", project.id);

      setProgress(90);
      setStage("Запускаем AI...");
      supabase.functions.invoke("auto-montage", { body: { project_id: project.id } })
        .then(({ error }) => { if (error) console.error("auto-montage error", error); });

      toast.success("Загружено! AI собирает монтаж...");
      navigate(`/processing/${project.id}`);
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка", { description: e.message });
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 backdrop-blur-xl sticky top-0 z-50 bg-background/80">
        <div className="container flex h-16 items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">AI Авто-монтаж</h1>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl py-10 space-y-8">
        <div>
          <h2 className="text-xl font-semibold mb-1">Как это работает</h2>
          <p className="text-muted-foreground text-sm">
            Загрузите один аудио-трек (голос или музыка) и несколько видео-нарезок.
            ИИ распознает речь или ритм, проанализирует кадры клипов и автоматически склеит ролик по смыслу.
            Результат откроется в полноценном таймлайн-редакторе.
          </p>
        </div>

        {/* Audio */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Music className="h-4 w-4 text-primary" /> 1. Аудио-трек</h3>
          {!audio ? (
            <div {...audioDrop.getRootProps()} className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-smooth",
              audioDrop.isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-surface-1"
            )}>
              <input {...audioDrop.getInputProps()} />
              <UploadIcon className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium">Перетащите аудио (MP3/WAV/M4A) или нажмите</p>
              <p className="text-xs text-muted-foreground mt-1">Голос → подбор по смыслу · Музыка → подбор по ритму</p>
            </div>
          ) : (
            <Card className="p-4 bg-gradient-card flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Music className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-sm">{audio.name}</p>
                <p className="text-xs text-muted-foreground">{(audio.size / 1024 / 1024).toFixed(1)} МБ</p>
              </div>
              {!busy && <Button variant="ghost" size="sm" onClick={() => setAudio(null)}>Заменить</Button>}
            </Card>
          )}
        </div>

        {/* Clips */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" /> 2. Видео-нарезки ({clips.length}/{MAX_CLIPS})
          </h3>
          <div {...clipsDrop.getRootProps()} className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-smooth",
            clipsDrop.isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-surface-1"
          )}>
            <input {...clipsDrop.getInputProps()} />
            <UploadIcon className="h-6 w-6 text-primary mx-auto mb-1" />
            <p className="text-sm font-medium">+ Добавить клипы (можно сразу несколько)</p>
            <p className="text-xs text-muted-foreground mt-0.5">MP4 / MOV / WEBM · до 500 МБ каждый</p>
          </div>

          {clips.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mt-4">
              {clips.map((c, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden bg-surface-2 border border-border/60">
                  <img src={c.thumbDataUrl} alt="" className="w-full aspect-video object-cover" />
                  <div className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[10px] text-white">
                    {c.duration.toFixed(1)}с
                  </div>
                  <div className="absolute top-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[10px] text-white font-mono">
                    #{i + 1}
                  </div>
                  {!busy && (
                    <button onClick={() => removeClip(i)}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <X className="h-3 w-3 text-white" />
                    </button>
                  )}
                  <p className="text-[10px] truncate px-1.5 py-1 text-muted-foreground">{c.file.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Format */}
        <div>
          <h3 className="font-semibold mb-3">3. Формат</h3>
          <div className="grid grid-cols-3 gap-3">
            {FORMATS.map((f) => (
              <button key={f.id} onClick={() => setFormat(f.id)} disabled={busy}
                className={cn("p-4 rounded-xl border-2 transition-smooth bg-gradient-card text-left",
                  format === f.id ? "border-primary shadow-glow" : "border-border hover:border-primary/40")}>
                <p className="font-semibold text-sm">{f.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {busy && (
          <Card className="p-4 bg-surface-1">
            <Progress value={progress} className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground">{stage} · {Math.round(progress)}%</p>
          </Card>
        )}

        <div className="flex justify-end">
          <Button size="lg" onClick={handleStart} disabled={busy || !audio || clips.length < 2} className="h-12 px-8 shadow-glow">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загружаем...</>
              : <><Sparkles className="mr-2 h-4 w-4" /> Собрать монтаж</>}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default UploadMontage;
