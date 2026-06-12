import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Upload as UploadIcon, Scissors, Loader2 } from "lucide-react";
import { STYLE_LIST, StyleId } from "@/lib/styles";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_SIZE = 500 * 1024 * 1024;

const UploadMagicClips = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<StyleId>("viral_tiktok");
  const [clipCount, setClipCount] = useState(5);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    if (f.size > MAX_SIZE) {
      toast.error("Файл слишком большой", { description: "Максимум 500 МБ" });
      return;
    }
    setFile(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [".mp4", ".mov", ".webm", ".mkv"] },
    maxFiles: 1,
    multiple: false,
  });

  const extractMetadata = (f: File): Promise<{ duration: number; thumbnail: Blob }> =>
    new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.src = URL.createObjectURL(f);
      video.onloadedmetadata = () => { video.currentTime = Math.min(1, video.duration / 4); };
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 360;
        canvas.height = (360 * video.videoHeight) / video.videoWidth;
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) resolve({ duration: video.duration, thumbnail: blob });
          else reject(new Error("Не удалось создать превью"));
          URL.revokeObjectURL(video.src);
        }, "image/jpeg", 0.85);
      };
      video.onerror = () => reject(new Error("Не удалось прочитать видео"));
    });

  const handleStart = async () => {
    if (!file || !user) return;
    setUploading(true);
    setProgress(5);
    try {
      const { duration, thumbnail } = await extractMetadata(file);
      setProgress(15);

      const { data: project, error: projErr } = await supabase.from("projects").insert({
        user_id: user.id,
        title: file.name.replace(/\.[^.]+$/, ""),
        style,
        status: "uploading",
        duration,
        kind: "magic_clips",
        format: "stories",
        meta: { clip_count: clipCount },
      } as any).select().single();
      if (projErr || !project) throw projErr ?? new Error("Не удалось создать проект");

      const thumbPath = `${user.id}/${project.id}.jpg`;
      await supabase.storage.from("thumbnails").upload(thumbPath, thumbnail, { contentType: "image/jpeg", upsert: true });

      const ext = file.name.split(".").pop() ?? "mp4";
      const videoPath = `${user.id}/${project.id}.${ext}`;
      const { error: vidErr } = await supabase.storage.from("videos")
        .upload(videoPath, file, { contentType: file.type, upsert: true });
      if (vidErr) throw vidErr;
      setProgress(70);

      const { data: signed } = await supabase.storage.from("videos").createSignedUrl(videoPath, 60 * 60 * 24 * 7);
      await supabase.from("projects").update({
        video_path: videoPath,
        video_url: signed?.signedUrl,
        thumbnail_url: thumbPath,
        status: "transcribing",
      } as any).eq("id", project.id);

      setProgress(100);
      toast.success("Видео загружено! AI ищет viral-моменты...");

      supabase.functions.invoke("transcribe-video", { body: { project_id: project.id } })
        .then(({ data, error }) => {
          if (error || (data && data.success === false)) return;
          supabase.functions.invoke("magic-clips", {
            body: { project_id: project.id, clip_count: clipCount },
          });
        });

      navigate(`/processing/${project.id}`);
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка", { description: e.message });
      setUploading(false);
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
            <Scissors className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">Magic Clips</h1>
          </div>
        </div>
      </header>

      <main className="container max-w-3xl py-10 space-y-8">
        <div>
          <h2 className="text-xl font-semibold mb-1">Шортсы из длинного видео</h2>
          <p className="text-muted-foreground text-sm">
            Загрузите подкаст, вебинар или лекцию. AI найдёт лучшие viral-моменты и нарежет готовые клипы для Reels/TikTok.
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-3">1. Длинное видео</h3>
          {!file ? (
            <div {...getRootProps()} className={cn(
              "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-smooth",
              isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-surface-1",
            )}>
              <input {...getInputProps()} />
              <UploadIcon className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium">MP4 / MOV / WEBM · до 500 МБ · от 3 минут</p>
            </div>
          ) : (
            <Card className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Scissors className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-sm">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} МБ</p>
              </div>
              {!uploading && <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Заменить</Button>}
            </Card>
          )}
        </div>

        <div>
          <h3 className="font-semibold mb-3">2. Количество клипов: {clipCount}</h3>
          <Slider min={3} max={8} step={1} value={[clipCount]} onValueChange={(v) => setClipCount(v[0])} disabled={uploading} />
          <p className="text-xs text-muted-foreground mt-2">AI выберет {clipCount} лучших моментов по viral-потенциалу</p>
        </div>

        <div>
          <h3 className="font-semibold mb-3">3. Стиль монтажа</h3>
          <div className="grid grid-cols-2 gap-3">
            {STYLE_LIST.map((s) => (
              <button key={s.id} onClick={() => setStyle(s.id)} disabled={uploading}
                className={cn("p-4 rounded-xl border-2 text-left transition-smooth bg-gradient-card",
                  style === s.id ? "border-primary shadow-glow" : "border-border hover:border-primary/40")}>
                <span className="text-2xl">{s.emoji}</span>
                <p className="font-semibold text-sm mt-1">{s.name}</p>
              </button>
            ))}
          </div>
        </div>

        {uploading && (
          <Card className="p-4">
            <Progress value={progress} className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground">AI анализирует видео и ищет viral-моменты...</p>
          </Card>
        )}

        <div className="flex justify-end">
          <Button size="lg" onClick={handleStart} disabled={uploading || !file} className="h-12 px-8 shadow-glow">
            {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Анализируем...</>
              : <><Scissors className="mr-2 h-4 w-4" /> Найти Magic Clips</>}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default UploadMagicClips;
