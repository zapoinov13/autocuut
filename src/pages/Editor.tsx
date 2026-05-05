import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Sparkles, Loader2, Download, Music, Wand2, ZoomIn, Film,
  Type, Scissors, Anchor, Mic, Eye, Captions,
} from "lucide-react";
import { VideoPreview } from "@/components/editor/VideoPreview";
import { StylePanel } from "@/components/editor/StylePanel";
import { ScenesPanel } from "@/components/editor/panels/ScenesPanel";
import { TrimPanel } from "@/components/editor/panels/TrimPanel";
import { MusicPanel } from "@/components/editor/panels/MusicPanel";
import { BrollPanel } from "@/components/editor/panels/BrollPanel";
import { ExportDialog } from "@/components/editor/panels/ExportDialog";
import { STYLES, StyleId, SubtitleStyle, getEffectiveSubtitleStyle, loadCustomStyle } from "@/lib/styles";
import { toast } from "sonner";

const Editor = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [customStyle, setCustomStyle] = useState<SubtitleStyle>(() => loadCustomStyle());

  const { data, isLoading } = useQuery({
    queryKey: ["editor", id],
    queryFn: async () => {
      const [{ data: project }, { data: scenes }, { data: subs }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).single(),
        supabase.from("scenes").select("*").eq("project_id", id).order("order_index"),
        supabase.from("subtitles").select("words").eq("project_id", id).maybeSingle(),
      ]);
      return {
        project,
        scenes: (scenes ?? []) as any[],
        words: ((subs?.words as any[]) ?? []) as { text: string; start: number; end: number }[],
      };
    },
    enabled: !!id,
  });

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data?.project?.video_path) return;
    supabase.storage.from("videos").createSignedUrl(data.project.video_path, 60 * 60 * 6).then(({ data: signed }) => {
      if (signed) setVideoUrl(signed.signedUrl);
    });
  }, [data?.project?.video_path]);

  const handleStyleChange = async (newStyle: StyleId) => {
    await supabase.from("projects").update({ style: newStyle }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["editor", id] });
    toast.success(`Стиль изменён на ${STYLES[newStyle].name}`);
  };

  const toggleProjectField = async (field: "captions_enabled" | "clean_audio", value: boolean) => {
    const update: any = { [field]: value };
    await supabase.from("projects").update(update).eq("id", id!);
    qc.invalidateQueries({ queryKey: ["editor", id] });
  };

  if (isLoading || !data?.project || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { project, scenes, words } = data;
  const styleId = project.style as StyleId;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-xl bg-background/80 shrink-0">
        <div className="px-4 flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="min-w-0">
              <h1 className="font-semibold truncate text-sm">{project.title_suggestion ?? project.title}</h1>
              {project.viral_score !== null && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Viral: <span className="text-primary font-semibold">{project.viral_score}/100</span>
                </div>
              )}
            </div>
          </div>
          <ExportDialog
            projectId={project.id}
            userId={user.id}
            trigger={
              <Button className="shadow-glow">
                <Download className="mr-2 h-4 w-4" />
                Экспорт 4K
              </Button>
            }
          />
        </div>
      </header>

      {/* 3-column layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] gap-3 p-3 overflow-hidden">
        {/* LEFT — Edit tools */}
        <Card className="bg-gradient-card border-border/60 p-3 overflow-y-auto">
          <SectionTitle>Edit</SectionTitle>
          <div className="grid grid-cols-1 gap-2">
            <StylePanel
              styleId={styleId}
              onPick={handleStyleChange}
              onCustomChange={setCustomStyle}
            />
            <ScenesPanel
              projectId={project.id}
              scenes={scenes as any}
              trigger={
                <ToolButton icon={Film} label={`Сцены (${scenes.length})`} />
              }
            />
            <TrimPanel
              projectId={project.id}
              duration={Number(project.duration ?? 0)}
              trimStart={project.trim_start as any}
              trimEnd={project.trim_end as any}
              trigger={<ToolButton icon={Scissors} label="Обрезать" />}
            />
          </div>

          <SectionTitle className="mt-5">AI Tools</SectionTitle>
          <div className="space-y-2">
            <ToggleTile icon={Captions} label="AI Captions" desc="Стилизованные субтитры"
              checked={project.captions_enabled ?? true}
              onCheckedChange={(v) => toggleProjectField("captions_enabled", v)} />
            <ToggleTile icon={Mic} label="Clean Audio" desc="Убрать шум, нормализовать громкость"
              checked={project.clean_audio ?? false}
              onCheckedChange={(v) => toggleProjectField("clean_audio", v)} />
            <ToggleTile icon={Anchor} label="AI Hook Title" desc="Генерация заголовка-крючка"
              checked={!!project.title_suggestion} onCheckedChange={() => {}} disabled />
            <ToggleTile icon={Eye} label="Eye Contact" desc="Скоро · Коррекция взгляда"
              checked={false} onCheckedChange={() => {}} disabled />
          </div>
        </Card>

        {/* CENTER — Video preview */}
        <div className="flex items-center justify-center min-h-0 overflow-hidden">
          {videoUrl ? (
            <VideoPreview
              videoUrl={videoUrl}
              subtitleStyle={styleId === "custom" ? customStyle : getEffectiveSubtitleStyle(styleId)}
              words={(project.captions_enabled ?? true) ? words : []}
              scenes={scenes as any}
            />
          ) : (
            <div className="bg-surface-1 rounded-2xl flex items-center justify-center" style={{ aspectRatio: "9/16", height: "100%", maxHeight: "calc(100vh - 180px)" }}>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </div>

        {/* RIGHT — AI Boost */}
        <Card className="bg-gradient-card border-border/60 p-3 overflow-y-auto">
          <SectionTitle>AI Boost</SectionTitle>
          <div className="space-y-2">
            <ToolBigButton icon={ZoomIn} label="AI Auto Zooms" desc="Зум на ключевых моментах"
              onClick={() => toast.info("AI Авто-зумы запущены", { description: "Сцены будут обновлены через минуту" })} />
            <BrollPanel projectId={project.id} userId={user.id}
              trigger={<ToolBigButton asDiv icon={Film} label="AI Auto B-rolls" desc="Стоковые вставки в сцены" />} />
            <MusicPanel projectId={project.id} userId={user.id}
              musicUrl={project.music_url as any} musicVolume={project.music_volume ?? 20}
              trigger={
                <ToolBigButton asDiv icon={Music} label={project.music_url ? `Музыка · ${project.music_volume}%` : "Add Music"} desc="Библиотека + громкость" />
              } />
            <ToolBigButton icon={Wand2} label="Remove Silences" desc="Скоро"
              onClick={() => toast.info("Скоро будет доступно")} disabled />
          </div>

          <SectionTitle className="mt-5">Текущий стиль</SectionTitle>
          <div className="p-3 rounded-lg bg-surface-1 border border-border/40">
            <div className="text-2xl">{STYLES[styleId].emoji}</div>
            <p className="text-sm font-medium mt-1">{STYLES[styleId].name}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{STYLES[styleId].description}</p>
          </div>
        </Card>
      </div>
    </div>
  );
};

const SectionTitle = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 ${className}`}>{children}</p>
);

const ToolButton = ({ icon: Icon, label }: { icon: any; label: string }) => (
  <Button variant="outline" size="sm" className="h-10 justify-start w-full">
    <Icon className="mr-2 h-4 w-4 text-primary" />
    <span className="text-sm">{label}</span>
  </Button>
);

interface ToolBigProps {
  icon: any;
  label: string;
  desc: string;
  onClick?: () => void;
  disabled?: boolean;
  asDiv?: boolean;
}
const ToolBigButton = ({ icon: Icon, label, desc, onClick, disabled, asDiv }: ToolBigProps) => {
  const cls = `w-full text-left p-3 rounded-lg border border-border/40 bg-surface-1 hover:border-primary/40 hover:bg-surface-2 transition-smooth ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`;
  const content = (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
      </div>
    </div>
  );
  if (asDiv) return <div className={cls}>{content}</div>;
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{content}</button>;
};

const ToggleTile = ({ icon: Icon, label, desc, checked, onCheckedChange, disabled }: {
  icon: any; label: string; desc: string; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean;
}) => (
  <div className={`flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-surface-1 ${disabled ? "opacity-60" : ""}`}>
    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
      <Icon className="h-3.5 w-3.5 text-primary" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium truncate">{label}</p>
      <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
  </div>
);

export default Editor;
