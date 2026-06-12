import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Upload as UploadIcon, Video, Loader2, Check } from "lucide-react";
import { STYLE_LIST, StyleId } from "@/lib/styles";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_SIZE = 500 * 1024 * 1024; // 500 MB

const Upload = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<StyleId>("viral_tiktok");
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
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration / 4);
      };
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 360;
        canvas.height = (360 * video.videoHeight) / video.videoWidth;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
      // 1. Extract metadata + thumbnail
      const { duration, thumbnail } = await extractMetadata(file);
      setProgress(15);

      // 2. Create project row
      const { data: project, error: projErr } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          title: file.name.replace(/\.[^.]+$/, ""),
          style,
          status: "uploading",
          duration,
        })
        .select()
        .single();
      if (projErr || !project) throw projErr ?? new Error("Не удалось создать проект");

      // 3. Upload thumbnail
      const thumbPath = `${user.id}/${project.id}.jpg`;
      const { error: thumbErr } = await supabase.storage
        .from("thumbnails")
        .upload(thumbPath, thumbnail, { contentType: "image/jpeg", upsert: true });
      if (thumbErr) console.warn("Thumbnail upload failed:", thumbErr.message);
      setProgress(25);

      // 4. Upload video
      const ext = file.name.split(".").pop() ?? "mp4";
      const videoPath = `${user.id}/${project.id}.${ext}`;
      const { error: vidErr } = await supabase.storage
        .from("videos")
        .upload(videoPath, file, { contentType: file.type, upsert: true });
      if (vidErr) throw vidErr;
      setProgress(70);

      const { data: signed } = await supabase.storage.from("videos").createSignedUrl(videoPath, 60 * 60 * 24 * 7);

      await supabase
        .from("projects")
        .update({
          video_path: videoPath,
          video_url: signed?.signedUrl,
          thumbnail_url: thumbPath,
          status: "transcribing",
        })
        .eq("id", project.id);

      setProgress(85);

      // 5. Kick off transcription (don't await — let processing page poll)
      supabase.functions.invoke("transcribe-video", { body: { project_id: project.id } })
        .then(({ data, error }) => {
          if (error) {
            console.error("transcribe error", error);
            return;
          }
          if (data && data.success === false) {
            console.error("transcribe handled error", data.error);
            return;
          }
          // Chain analysis
          supabase.functions.invoke("analyze-scenes", { body: { project_id: project.id } });
        });

      setProgress(100);
      toast.success("Видео загружено! Запускаем AI...");
      navigate(`/processing/${project.id}`);
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка загрузки", { description: e.message ?? "Попробуйте ещё раз" });
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
          <h1 className="text-lg font-bold">Новый проект</h1>
        </div>
      </header>

      <main className="container max-w-5xl py-10">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Upload */}
          <div>
            <h2 className="text-xl font-semibold mb-4">1. Загрузите видео</h2>
            {!file ? (
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-smooth",
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 bg-surface-1",
                )}
              >
                <input {...getInputProps()} />
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <UploadIcon className="h-8 w-8 text-primary" />
                </div>
                <p className="font-medium mb-1">
                  {isDragActive ? "Отпустите файл" : "Перетащите видео сюда"}
                </p>
                <p className="text-sm text-muted-foreground">
                  или нажмите, чтобы выбрать · MP4, MOV, WebM · до 500 МБ
                </p>
              </div>
            ) : (
              <Card className="p-6 bg-gradient-card">
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Video className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(1)} МБ
                    </p>
                  </div>
                  {!uploading && (
                    <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                      Заменить
                    </Button>
                  )}
                </div>
                {uploading && (
                  <div className="space-y-2">
                    <Progress value={progress} />
                    <p className="text-xs text-muted-foreground text-center">{progress}%</p>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Style */}
          <div>
            <h2 className="text-xl font-semibold mb-4">2. Выберите стиль</h2>
            <div className="grid grid-cols-2 gap-3">
              {STYLE_LIST.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  disabled={uploading}
                  className={cn(
                    "text-left p-4 rounded-xl border-2 transition-smooth bg-gradient-card",
                    style === s.id
                      ? "border-primary shadow-glow"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-2xl">{s.emoji}</span>
                    {style === s.id && (
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="font-semibold text-sm mb-1">{s.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex justify-end">
          <Button
            size="lg"
            disabled={!file || uploading}
            onClick={handleStart}
            className="h-12 px-8 shadow-glow"
          >
            {uploading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загружаем...</>
            ) : (
              <>Начать обработку →</>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Upload;
