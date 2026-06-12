import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Scissors, Sparkles, Loader2, Play, Wand2 } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { toast } from "sonner";

interface Segment {
  id: string;
  order_index: number;
  start_time: number;
  end_time: number;
  title: string;
  hook: string;
  viral_score: number | null;
  reason: string | null;
  child_project_id: string | null;
}

const MagicClipsResults = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["magic-clips", id],
    queryFn: async () => {
      const [{ data: project }, { data: segments }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id!).single(),
        supabase.from("magic_clip_segments").select("*").eq("project_id", id!).order("order_index"),
      ]);
      return { project, segments: (segments ?? []) as Segment[] };
    },
    enabled: !!id,
  });

  const openInEditor = async (seg: Segment) => {
    if (!user || !data?.project) return;
    if (seg.child_project_id) {
      navigate(`/editor/${seg.child_project_id}`);
      return;
    }

    toast.message("Создаём проект для монтажа...");
    try {
      const parent = data.project;
      const { data: subs } = await supabase.from("subtitles").select("words").eq("project_id", id!).maybeSingle();
      const words = ((subs?.words as { text: string; start: number; end: number }[]) ?? [])
        .filter((w) => w.start >= seg.start_time - 0.1 && w.end <= seg.end_time + 0.1)
        .map((w) => ({
          text: w.text,
          start: Math.max(0, w.start - seg.start_time),
          end: w.end - seg.start_time,
        }));

      const clipDur = seg.end_time - seg.start_time;
      const { data: child, error: cErr } = await supabase.from("projects").insert({
        user_id: user.id,
        title: seg.title || `Клип #${seg.order_index + 1}`,
        style: parent.style,
        kind: "single",
        format: parent.format ?? "stories",
        status: "analyzing",
        duration: clipDur,
        video_path: parent.video_path,
        video_url: parent.video_url,
        thumbnail_url: parent.thumbnail_url,
        trim_start: seg.start_time,
        trim_end: seg.end_time,
        viral_score: seg.viral_score,
        title_suggestion: seg.title,
        meta: { source_project_id: id, segment_id: seg.id },
      } as any).select().single();
      if (cErr || !child) throw cErr ?? new Error("Не удалось создать проект");

      if (words.length) {
        await supabase.from("subtitles").insert({ project_id: child.id, user_id: user.id, words });
      }

      await supabase.from("magic_clip_segments").update({ child_project_id: child.id }).eq("id", seg.id);

      await supabase.from("projects").update({ status: "analyzing" }).eq("id", child.id);
      const { error: aErr } = await supabase.functions.invoke("analyze-scenes", { body: { project_id: child.id } });
      if (aErr) throw aErr;

      qc.invalidateQueries({ queryKey: ["magic-clips", id] });
      navigate(`/processing/${child.id}`);
    } catch (e: any) {
      toast.error("Ошибка", { description: e.message });
    }
  };

  if (isLoading || !data?.project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { project, segments } = data;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 backdrop-blur-xl sticky top-0 z-50 bg-background/80">
        <div className="container flex h-16 items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">{project.title}</h1>
          </div>
          {project.viral_score != null && (
            <Badge className="ml-auto bg-primary/20 text-primary border-0">
              <Sparkles className="h-3 w-3 mr-1" /> Max viral: {project.viral_score}
            </Badge>
          )}
        </div>
      </header>

      <main className="container py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-1">Magic Clips · {segments.length} клипов</h2>
          <p className="text-muted-foreground text-sm">
            AI нашёл лучшие моменты. Откройте клип в редакторе для субтитров, зумов и экспорта.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {segments.map((seg) => (
            <Card key={seg.id} className="p-5 bg-gradient-card border-border/60 hover:border-primary/40 transition-smooth">
              <div className="flex items-start justify-between mb-3">
                <Badge variant="outline" className="text-[10px]">#{seg.order_index + 1}</Badge>
                {seg.viral_score != null && (
                  <span className="text-xs text-primary font-semibold flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> {seg.viral_score}
                  </span>
                )}
              </div>
              <h3 className="font-semibold mb-1 line-clamp-2">{seg.title}</h3>
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2 italic">«{seg.hook}»</p>
              <p className="text-[11px] text-muted-foreground mb-3 line-clamp-2">{seg.reason}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">
                  {formatDuration(seg.start_time)} – {formatDuration(seg.end_time)} · {formatDuration(seg.end_time - seg.start_time)}
                </span>
                <Button size="sm" onClick={() => openInEditor(seg)}>
                  {seg.child_project_id ? (
                    <><Play className="mr-1 h-3 w-3" /> Редактор</>
                  ) : (
                    <><Wand2 className="mr-1 h-3 w-3" /> Монтаж</>
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default MagicClipsResults;
