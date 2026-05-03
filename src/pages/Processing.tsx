import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Loader2, AlertCircle, Check, FileText, Wand2 } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  { key: "uploading", label: "Загрузка видео", icon: Loader2 },
  { key: "transcribing", label: "Распознаём речь", icon: FileText },
  { key: "analyzing", label: "AI собирает монтаж", icon: Wand2 },
  { key: "ready", label: "Готово!", icon: Check },
];

const Processing = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    const fetchProject = async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setProject(data);
      if (data.status === "ready") {
        setTimeout(() => navigate(`/editor/${id}`), 800);
      } else if (data.status === "failed") {
        setError(data.error_message ?? "Что-то пошло не так");
      }
    };

    fetchProject();
    const interval = setInterval(fetchProject, 2000);

    // Realtime subscription
    const channel = supabase
      .channel(`project-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${id}` },
        (payload) => {
          setProject(payload.new);
          if (payload.new.status === "ready") {
            setTimeout(() => navigate(`/editor/${id}`), 800);
          } else if (payload.new.status === "failed") {
            setError((payload.new as any).error_message ?? "Что-то пошло не так");
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [id, navigate]);

  const currentStepIndex = project ? STEPS.findIndex((s) => s.key === project.status) : 0;
  const progressPct =
    project?.status === "ready" ? 100
    : project?.status === "uploading" ? 25
    : project?.status === "transcribing" ? 55
    : project?.status === "analyzing" ? 85
    : 10;

  const handleRetry = async () => {
    if (!id) return;
    await supabase.from("projects").update({ status: "transcribing", error_message: null }).eq("id", id);
    setError(null);
    const { error: tErr } = await supabase.functions.invoke("transcribe-video", { body: { project_id: id } });
    if (tErr) {
      toast.error("Не удалось перезапустить", { description: tErr.message });
      return;
    }
    const { data: freshProject } = await supabase.from("projects").select("status, error_message").eq("id", id).single();
    if (freshProject?.status === "failed") {
      setError(freshProject.error_message ?? "Распознавание не удалось");
      return;
    }
    await supabase.functions.invoke("analyze-scenes", { body: { project_id: id } });
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
          <p className="text-muted-foreground text-sm">
            {error ? "Попробуйте ещё раз" : "Это займёт от 30 секунд до пары минут"}
          </p>
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
              {STEPS.map((step, i) => {
                const isDone = i < currentStepIndex || project?.status === "ready";
                const isActive = i === currentStepIndex && project?.status !== "ready";
                const Icon = step.icon;
                return (
                  <div
                    key={step.key}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      isActive ? "bg-primary/10" : isDone ? "opacity-60" : "opacity-40"
                    }`}
                  >
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center ${
                        isDone ? "bg-success/20" : isActive ? "bg-primary/20" : "bg-surface-3"
                      }`}
                    >
                      {isDone ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (
                        <Icon className={`h-4 w-4 ${isActive ? "text-primary animate-spin" : "text-muted-foreground"}`} />
                      )}
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
