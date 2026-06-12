import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Loader2, AlertCircle, Check, FileText, Wand2, Bot, Scissors } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_STEPS = [
  { key: "uploading", label: "Загрузка видео", icon: Loader2 },
  { key: "transcribing", label: "Распознаём речь", icon: FileText },
  { key: "analyzing", label: "AI собирает монтаж", icon: Wand2 },
  { key: "ready", label: "Готово!", icon: Check },
];

const AVATAR_STEPS = [
  { key: "uploading", label: "Создаём задачу", icon: Loader2 },
  { key: "analyzing", label: "HeyGen рендерит аватар", icon: Bot },
  { key: "transcribing", label: "Распознаём речь", icon: FileText },
  { key: "analyzing2", label: "AI добавляет монтаж", icon: Wand2 },
  { key: "ready", label: "Готово!", icon: Check },
];

const MAGIC_STEPS = [
  { key: "uploading", label: "Загрузка видео", icon: Loader2 },
  { key: "transcribing", label: "Распознаём речь", icon: FileText },
  { key: "analyzing", label: "AI ищет viral-клипы", icon: Scissors },
  { key: "ready", label: "Готово!", icon: Check },
];

const Processing = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const montageKick = useRef(false);
  const uploadKick = useRef(false);
  const postTranscribeKick = useRef(false);
  const heygenTranscribeKick = useRef(false);

  const navigateWhenReady = useCallback((data: any) => {
    if (data.kind === "magic_clips") navigate(`/magic-clips/${id}`);
    else navigate(`/editor/${id}`);
  }, [id, navigate]);

  const chainTranscribeThenAnalyze = useCallback((projectId: string) => {
    supabase.functions.invoke("transcribe-video", { body: { project_id: projectId } })
      .then(({ data, error: trErr }) => {
        if (trErr || data?.success === false) return;
        supabase.functions.invoke("analyze-scenes", { body: { project_id: projectId } });
      });
  }, []);

  const kickPostTranscribe = useCallback(async (data: any) => {
    if (postTranscribeKick.current) return;
    const { data: subs } = await supabase.from("subtitles").select("id").eq("project_id", id!).maybeSingle();
    if (!subs) return;

    postTranscribeKick.current = true;

    if (data.kind === "magic_clips") {
      const clipCount = data.meta?.clip_count ?? 5;
      supabase.functions.invoke("magic-clips", { body: { project_id: id, clip_count: clipCount } })
        .catch((e) => console.error("magic-clips", e));
      return;
    }

    if (data.kind === "montage") return;

    supabase.functions.invoke("analyze-scenes", { body: { project_id: id } })
      .catch((e) => console.error("analyze-scenes", e));
  }, [id]);

  useEffect(() => {
    montageKick.current = false;
    uploadKick.current = false;
    postTranscribeKick.current = false;
    heygenTranscribeKick.current = false;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const maybeKickPipeline = async (data: any) => {
      // Montage: invoke не дошёл
      if (!montageKick.current && data.kind === "montage" && data.status === "uploading") {
        montageKick.current = true;
        supabase.functions.invoke("auto-montage", { body: { project_id: id } })
          .catch((e) => console.error("auto-montage kick", e));
        return;
      }

      // Обычная загрузка: видео есть, но transcribe не запустился
      if (!uploadKick.current && data.kind === "single" && data.status === "uploading" && data.video_path) {
        uploadKick.current = true;
        await supabase.from("projects").update({ status: "transcribing" }).eq("id", id);
        chainTranscribeThenAnalyze(id);
        return;
      }

      // HeyGen: poll каждые 3 сек пока видео не скачано (без блокировки ref)
      if (data.kind === "avatar" && data.status === "analyzing" && !data.video_path && data.meta?.heygen_video_id) {
        const { data: syncData, error: syncErr } = await supabase.functions.invoke("heygen-api", {
          body: { action: "sync", project_id: id },
        });
        if (syncErr) {
          console.error("heygen sync", syncErr);
        } else if (syncData?.error) {
          if (!cancelled) setError(syncData.error);
        } else if (syncData?.phase === "transcribing" && !heygenTranscribeKick.current) {
          heygenTranscribeKick.current = true;
          chainTranscribeThenAnalyze(id);
        }
        return;
      }

      // Транскрипция завершена → следующий шаг (analyze / magic-clips)
      if (data.status === "transcribing" && data.video_path) {
        await kickPostTranscribe(data);
      }
    };

    const fetchProject = async () => {
      const { data, error: fetchErr } = await supabase.from("projects").select("*").eq("id", id).single();
      if (cancelled) return;
      if (fetchErr) { setError(fetchErr.message); return; }

      setProject(data);
      await maybeKickPipeline(data);

      if (data.status === "ready") {
        setTimeout(() => navigateWhenReady(data), 800);
      } else if (data.status === "failed") {
        setError(data.error_message ?? "Что-то пошло не так");
      } else if (["transcribing", "analyzing"].includes(data.status)) {
        const updatedAt = new Date(data.updated_at).getTime();
        if (Date.now() - updatedAt > 5 * 60 * 1000) {
          setError("Обработка зависла больше 5 минут. Нажмите «Повторить».");
        }
      }
    };

    fetchProject();
    const interval = setInterval(fetchProject, 3000);

    const channel = supabase
      .channel(`project-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${id}` },
        (payload) => {
          setProject(payload.new);
          if (payload.new.status === "ready") {
            setTimeout(() => navigateWhenReady(payload.new), 800);
          } else if (payload.new.status === "failed") {
            setError((payload.new as any).error_message ?? "Что-то пошло не так");
          }
        })
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [id, navigate, navigateWhenReady, chainTranscribeThenAnalyze, kickPostTranscribe]);

  const steps = project?.kind === "avatar" ? AVATAR_STEPS
    : project?.kind === "magic_clips" ? MAGIC_STEPS
    : DEFAULT_STEPS;

  const currentStepIndex = (() => {
    if (!project) return 0;
    if (project.status === "ready") return steps.length - 1;
    if (project.kind === "avatar" && project.status === "analyzing" && project.video_path) {
      return steps.findIndex((s) => s.key === "analyzing2");
    }
    const idx = steps.findIndex((s) => s.key === project.status || s.key.replace("2", "") === project.status);
    return idx >= 0 ? idx : 0;
  })();

  const progressPct = project?.status === "ready" ? 100
    : ((currentStepIndex + 0.5) / steps.length) * 100;

  const subtitle = project?.kind === "avatar"
    ? "HeyGen генерирует аватар, затем AI добавит субтитры"
    : project?.kind === "magic_clips"
    ? "AI ищет лучшие viral-моменты в вашем видео"
    : "Это займёт от 30 секунд до пары минут";

  const handleRetry = async () => {
    if (!id || !project) return;
    montageKick.current = false;
    uploadKick.current = false;
    postTranscribeKick.current = false;
    heygenTranscribeKick.current = false;
    setError(null);

    if (project.kind === "montage") {
      await supabase.from("projects").update({ status: "transcribing", error_message: null }).eq("id", id);
      const { error: mErr } = await supabase.functions.invoke("auto-montage", { body: { project_id: id } });
      if (mErr) toast.error("Не удалось перезапустить", { description: mErr.message });
      return;
    }

    if (project.kind === "magic_clips") {
      await supabase.from("projects").update({ status: "transcribing", error_message: null }).eq("id", id);
      const { error: tErr } = await supabase.functions.invoke("transcribe-video", { body: { project_id: id } });
      if (tErr) { toast.error(tErr.message); return; }
      await supabase.functions.invoke("magic-clips", {
        body: { project_id: id, clip_count: project.meta?.clip_count ?? 5 },
      });
      return;
    }

    if (project.kind === "avatar") {
      if (!project.video_path) {
        await supabase.functions.invoke("heygen-api", { body: { action: "sync", project_id: id } });
      } else {
        await supabase.from("projects").update({ status: "transcribing", error_message: null }).eq("id", id);
        chainTranscribeThenAnalyze(id);
      }
      return;
    }

    await supabase.from("projects").update({ status: "transcribing", error_message: null }).eq("id", id);
    chainTranscribeThenAnalyze(id);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 bg-gradient-hero">
      <Card className="w-full max-w-lg p-8 bg-gradient-card border-border/60 shadow-elevated">
        <div className="text-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-4 shadow-glow">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2">
            {error ? "Ошибка обработки" : project?.status === "ready" ? "Готово!" : "AI работает..."}
          </h1>
          <p className="text-muted-foreground text-sm">{error ? "Попробуйте ещё раз" : subtitle}</p>
        </div>

        {error ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" asChild>
                <Link to="/dashboard">К проектам</Link>
              </Button>
              <Button className="flex-1" onClick={handleRetry}>Повторить</Button>
            </div>
          </div>
        ) : (
          <>
            <Progress value={progressPct} className="mb-6 h-2" />
            <div className="space-y-3">
              {steps.map((step, i) => {
                const isDone = i < currentStepIndex || project?.status === "ready";
                const isActive = i === currentStepIndex && project?.status !== "ready";
                const Icon = step.icon;
                return (
                  <div key={step.key} className={`flex items-center gap-3 p-3 rounded-lg ${
                    isActive ? "bg-primary/10" : isDone ? "opacity-60" : "opacity-40"
                  }`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      isDone ? "bg-success/20" : isActive ? "bg-primary/20" : "bg-surface-3"
                    }`}>
                      {isDone ? <Check className="h-4 w-4 text-success" />
                        : <Icon className={`h-4 w-4 ${isActive ? "text-primary animate-spin" : "text-muted-foreground"}`} />}
                    </div>
                    <span className={`text-sm ${isActive ? "font-medium" : ""}`}>{step.label}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default Processing;
