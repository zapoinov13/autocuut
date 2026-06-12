import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Sparkles, Loader2, Download, Music, Wand2, ZoomIn, Film,
  Scissors, Anchor, Mic, Eye, Captions, LayoutTemplate, Play, Settings2,
  Clock, Layers, Clapperboard,
} from "lucide-react";
import { VideoPreview } from "@/components/editor/VideoPreview";
import { StylePanel } from "@/components/editor/StylePanel";
import { ScenesPanel } from "@/components/editor/panels/ScenesPanel";
import { TrimPanel } from "@/components/editor/panels/TrimPanel";
import { MusicPanel } from "@/components/editor/panels/MusicPanel";
import { BrollPanel } from "@/components/editor/panels/BrollPanel";
import { TimelinePanel } from "@/components/editor/panels/TimelinePanel";
import { ExportDialog } from "@/components/editor/panels/ExportDialog";
import { FormatPanel, FORMATS, VideoFormat } from "@/components/editor/panels/FormatPanel";
import { HookTitlePanel } from "@/components/editor/panels/HookTitlePanel";
import { STYLES, StyleId, SubtitleStyle, getEffectiveSubtitleStyle, loadCustomStyle } from "@/lib/styles";
import { formatDuration } from "@/lib/format";
import { POSITION_Y } from "@/lib/subtitle-render";
import { toast } from "sonner";

type MobileTab = "preview" | "edit" | "ai";

const Editor = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [customStyle, setCustomStyle] = useState<SubtitleStyle>(() => loadCustomStyle());
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);
  const [styleTab, setStyleTab] = useState<"presets" | "custom" | "text">("presets");
  const [localStyleId, setLocalStyleId] = useState<StyleId | null>(null);
  const [localSubtitleY, setLocalSubtitleY] = useState<number | null>(null);
  const [localWords, setLocalWords] = useState<{ text: string; start: number; end: number }[] | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("preview");
  const [zoomBusy, setZoomBusy] = useState(false);
  const [enhancing, setEnhancing] = useState<string | null>(null);
  const enhanceKick = useRef(false);

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

  useEffect(() => {
    if (!localWords && data?.words) setLocalWords(data.words);
  }, [data?.words, localWords]);

  // Авто-усиление для уже готовых проектов (B-roll + зум)
  useEffect(() => {
    if (!id || !data?.scenes?.length || (data.project as any)?.kind === "montage") return;
    if (enhanceKick.current) return;
    enhanceKick.current = true;

    (async () => {
      const scenesList = data.scenes;
      const hasBroll = scenesList.some((s: any) => s.broll_url);
      const allNoZoom = scenesList.every((s: any) => !s.zoom || s.zoom === "none");

      try {
        if (allNoZoom) {
          setEnhancing("zoom");
          await Promise.all(scenesList.map((scene: any, i: number) => {
            const zoom = scene.is_hook ? "in" : i % 3 === 1 ? "out" : i % 3 === 0 ? "in" : "none";
            return supabase.from("scenes").update({ zoom }).eq("id", scene.id);
          }));
          qc.invalidateQueries({ queryKey: ["editor", id] });
        }

        if (!hasBroll) {
          setEnhancing("broll");
          const { data: br, error } = await supabase.functions.invoke("fetch-broll", {
            body: { projectId: id, orientation: "portrait" },
          });
          if (error) {
            console.error("fetch-broll", error);
          } else if (br?.error) {
            toast.error("B-roll не подключён", {
              description: br.error.includes("ключ") ? "Нужен PEXELS_API_KEY в Lovable Secrets" : br.error,
            });
          } else if ((br?.updated ?? 0) > 0) {
            toast.success(`B-roll: ${br.updated} блоков`);
            qc.invalidateQueries({ queryKey: ["editor", id] });
          }
        }
      } finally {
        setEnhancing(null);
      }
    })();
  }, [id, data?.scenes, data?.project, qc]);

  const handleStyleChange = async (newStyle: StyleId) => {
    setLocalStyleId(newStyle);
    qc.setQueryData(["editor", id], (old: any) => old ? { ...old, project: { ...old.project, style: newStyle } } : old);
    await supabase.from("projects").update({ style: newStyle }).eq("id", id);
    if (newStyle !== "custom") toast.success(`Стиль: ${STYLES[newStyle].name}`);
  };

  const toggleProjectField = async (field: "captions_enabled" | "clean_audio", value: boolean) => {
    const { error } = await supabase.from("projects").update({ [field]: value }).eq("id", id!);
    if (error) {
      toast.error("Не удалось сохранить настройку", { description: error.message });
      return;
    }
    qc.setQueryData(["editor", id], (old: any) =>
      old ? { ...old, project: { ...old.project, [field]: value } } : old,
    );
    toast.success(field === "captions_enabled"
      ? (value ? "Субтитры включены" : "Субтитры скрыты")
      : (value ? "Clean Audio включён" : "Clean Audio выключен"),
    );
  };

  const applyAutoZooms = useCallback(async (scenesList: any[]) => {
    if (!scenesList.length) {
      toast.error("Нет сцен", { description: "Дождитесь завершения AI-анализа" });
      return;
    }
    setZoomBusy(true);
    try {
      await Promise.all(scenesList.map((scene, i) => {
        let zoom: string;
        if (scene.is_hook) zoom = "in";
        else if ((scene.highlight_words?.length ?? 0) > 0) zoom = i % 2 === 0 ? "in" : "out";
        else zoom = i % 3 === 0 ? "in" : i % 3 === 1 ? "out" : "none";
        return supabase.from("scenes").update({ zoom }).eq("id", scene.id);
      }));
      qc.invalidateQueries({ queryKey: ["editor", id] });
      toast.success(`Авто-зум применён к ${scenesList.length} сценам`);
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка применения зума");
    } finally {
      setZoomBusy(false);
    }
  }, [id, qc]);

  if (isLoading || !data?.project || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Загружаем редактор...</p>
      </div>
    );
  }

  const { project, scenes } = data;
  const isMontage = (project as any).kind === "montage";
  const words = localWords ?? data.words;
  const styleId = (localStyleId ?? project.style) as StyleId;
  const format = (project.format as VideoFormat) ?? "stories";
  const formatMeta = FORMATS.find((f) => f.id === format)!;
  const subtitleY = localSubtitleY ?? Number((project as any).subtitle_y ?? POSITION_Y[(project.subtitle_position as string) ?? "bottom"] ?? 82);
  const effectiveStyle: SubtitleStyle = styleId === "custom" ? customStyle : getEffectiveSubtitleStyle(styleId);
  const duration = Number(project.duration ?? 0);

  const updateSubtitleY = async (y: number) => {
    setLocalSubtitleY(y);
    qc.setQueryData(["editor", id], (old: any) => old ? { ...old, project: { ...old.project, subtitle_y: y } } : old);
    await supabase.from("projects").update({ subtitle_y: y } as any).eq("id", id!);
  };

  const updateSubtitleWords = async (nextWords: { text: string; start: number; end: number }[]) => {
    setLocalWords(nextWords);
    qc.setQueryData(["editor", id], (old: any) => old ? { ...old, words: nextWords } : old);
    const { error } = await supabase.from("subtitles").update({ words: nextWords as any }).eq("project_id", id!);
    if (error) {
      toast.error("Не удалось сохранить титры", { description: error.message });
      qc.invalidateQueries({ queryKey: ["editor", id] });
    }
  };

  const openSubtitleEditor = (tab: "presets" | "custom" | "text" = "custom") => {
    setStyleTab(tab);
    setStyleSheetOpen(true);
  };

  const exportTrigger = (
    <Button size={isMobile ? "icon" : "default"} className="shadow-glow shrink-0" disabled={!videoUrl}>
      <Download className="h-4 w-4 sm:mr-2" />
      <span className="hidden sm:inline">Экспорт</span>
    </Button>
  );

  const editPanel = (
    <aside className="editor-panel overflow-y-auto h-full">
      <SectionTitle icon={Settings2}>Правка</SectionTitle>
      <div className="grid grid-cols-1 gap-2">
        <FormatPanel
          projectId={project.id}
          format={format}
          subtitlePosition={(project.subtitle_position as string) ?? "bottom"}
          trigger={<ToolButton icon={LayoutTemplate} label={`Формат · ${formatMeta.name.split(" / ")[0]}`} />}
        />
        <StylePanel
          styleId={styleId}
          onPick={handleStyleChange}
          onCustomChange={setCustomStyle}
          words={words}
          onWordsChange={updateSubtitleWords}
          subtitleY={subtitleY}
          onSubtitleYChange={updateSubtitleY}
          open={styleSheetOpen}
          onOpenChange={setStyleSheetOpen}
          defaultTab={styleTab}
          trigger={<ToolButton icon={Captions} label="Стиль субтитров" />}
        />
        {!isMontage && (
          <>
            <ScenesPanel
              projectId={project.id}
              userId={user.id}
              format={format}
              scenes={scenes as any}
              trigger={<ToolButton icon={Film} label={`Сцены · ${scenes.length}`} badge={scenes.length > 0 ? String(scenes.length) : undefined} />}
            />
            <TrimPanel
              projectId={project.id}
              duration={duration}
              trimStart={project.trim_start as any}
              trimEnd={project.trim_end as any}
              trigger={<ToolButton icon={Scissors} label="Обрезать видео" />}
            />
          </>
        )}
      </div>

      {!isMontage && (
        <>
          <SectionTitle icon={Sparkles} className="mt-6">AI инструменты</SectionTitle>
          <div className="space-y-2">
            <ToggleTile
              icon={Captions}
              label="AI Captions"
              desc="Стилизованные субтитры на превью"
              checked={project.captions_enabled ?? true}
              onCheckedChange={(v) => toggleProjectField("captions_enabled", v)}
            />
            <ToggleTile
              icon={Mic}
              label="Clean Audio"
              desc="Шумоподавление при экспорте"
              checked={project.clean_audio ?? false}
              onCheckedChange={(v) => toggleProjectField("clean_audio", v)}
            />
            <HookTitlePanel
              projectId={project.id}
              titleSuggestion={project.title_suggestion}
              fallbackTitle={project.title}
              trigger={
                <ActionTile
                  icon={Anchor}
                  label="AI Hook Title"
                  desc={project.title_suggestion ? "Редактировать заголовок" : "Добавить заголовок-крючок"}
                  active={!!project.title_suggestion}
                />
              }
            />
            <ActionTile
              icon={Eye}
              label="Eye Contact"
              desc="Скоро · коррекция взгляда"
              disabled
            />
          </div>
        </>
      )}

      {isMontage && (
        <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground leading-relaxed">
          <Clapperboard className="h-4 w-4 text-primary inline mr-1.5 -mt-0.5" />
          Режим <strong className="text-foreground">AI-монтажа</strong>: редактируй сегменты на таймлайне в центре. Замена клипов и перегенерация доступны под превью.
        </div>
      )}
    </aside>
  );

  const previewPanel = (
    <div className="flex flex-col items-center justify-center min-h-0 overflow-hidden h-full w-full gap-3">
      <div className="relative flex-1 min-h-0 w-full flex items-center justify-center">
        <div className="absolute inset-4 bg-primary/5 blur-3xl rounded-full pointer-events-none" />
        {isMontage ? (
          <div className="relative z-10 w-full h-full overflow-y-auto rounded-2xl border border-border/50 bg-gradient-card p-3 shadow-card">
            <TimelinePanel projectId={project.id} audioPath={(project as any).audio_path ?? null} />
          </div>
        ) : videoUrl ? (
          <div className="relative z-10 h-full">
            {enhancing && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 rounded-2xl backdrop-blur-sm">
                <div className="text-center text-white px-4">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
                  <p className="text-sm font-medium">
                    {enhancing === "broll" ? "Подбираем B-roll..." : "Настраиваем зум..."}
                  </p>
                </div>
              </div>
            )}
            <VideoPreview
              videoUrl={videoUrl}
              subtitleStyle={effectiveStyle}
              subtitleY={subtitleY}
              onSubtitleYChange={updateSubtitleY}
              onEditSubtitle={() => openSubtitleEditor("text")}
              words={(project.captions_enabled ?? true) ? words : []}
              scenes={scenes as any}
              format={format}
              musicUrl={project.music_url as any}
              musicVolume={project.music_volume ?? 20}
              trimStart={project.trim_start as number | null}
              trimEnd={project.trim_end as number | null}
            />
          </div>
        ) : (
          <div className="relative z-10 bg-surface-1 rounded-2xl border border-border/50 flex flex-col items-center justify-center gap-3 shadow-card"
            style={{ aspectRatio: format === "landscape" ? "16/9" : "9/16", height: "100%", maxHeight: "calc(100vh - 200px)" }}>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Загружаем видео...</p>
          </div>
        )}
      </div>

    </div>
  );

  const aiPanel = (
    <aside className="editor-panel overflow-y-auto h-full">
      <SectionTitle icon={Wand2}>AI усиление</SectionTitle>
      <div className="space-y-2">
        {!isMontage && (
          <ToolBigButton
            icon={ZoomIn}
            label="AI Auto Zooms"
            desc={zoomBusy ? "Применяем зум..." : "Зум на ключевых моментах"}
            onClick={() => applyAutoZooms(scenes)}
            disabled={zoomBusy || !scenes.length}
            loading={zoomBusy}
          />
        )}
        {!isMontage && (
          <BrollPanel
            projectId={project.id}
            userId={user.id}
            format={format}
            scenes={scenes as any}
            trigger={<ToolBigButton icon={Film} label="AI Auto B-rolls" desc="Pexels стоковые вставки" />}
          />
        )}
        {!isMontage && (
          <MusicPanel
            projectId={project.id}
            userId={user.id}
            musicUrl={project.music_url as any}
            musicVolume={project.music_volume ?? 20}
            trigger={
              <ToolBigButton
                icon={Music}
                label={project.music_url ? `Музыка · ${project.music_volume}%` : "Добавить музыку"}
                desc="Библиотека + громкость"
              />
            }
          />
        )}
        {!isMontage && (
          <ToolBigButton
            icon={Wand2}
            label="Remove Silences"
            desc="Скоро · авто-вырезка пауз"
            onClick={() => toast.info("Скоро будет доступно")}
            disabled
          />
        )}
        {isMontage && (
          <div className="p-4 rounded-xl bg-surface-1 border border-border/40 text-sm text-muted-foreground">
            AI-усиление для монтажа: используй кнопки перегенерации и замены клипов на таймлайне.
          </div>
        )}
      </div>

      {!isMontage && (
        <>
          <SectionTitle icon={Layers} className="mt-6">Текущий стиль</SectionTitle>
          <div className="p-4 rounded-xl bg-surface-1 border border-border/40 hover:border-primary/30 transition-smooth">
            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none">{STYLES[styleId].emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{STYLES[styleId].name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{STYLES[styleId].description}</p>
                <Button
                  variant="link"
                  className="h-auto p-0 mt-2 text-xs text-primary"
                  onClick={() => openSubtitleEditor("presets")}
                >
                  Изменить стиль →
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </aside>
  );

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <header className="border-b border-border/40 backdrop-blur-xl bg-background/90 shrink-0">
        <div className="px-3 sm:px-5 flex h-[3.75rem] items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Button variant="ghost" size="icon" asChild className="h-9 w-9 shrink-0 rounded-xl">
              <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-semibold truncate text-sm sm:text-base max-w-[200px] sm:max-w-md">
                  {project.title_suggestion ?? project.title}
                </h1>
                {isMontage && (
                  <Badge variant="outline" className="text-[10px] border-primary/40 text-primary shrink-0">
                    Монтаж
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {project.viral_score !== null && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-primary font-medium">
                    <Sparkles className="h-3 w-3" />
                    Viral {project.viral_score}/100
                  </span>
                )}
                {!isMontage && duration > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDuration(duration)}
                  </span>
                )}
                {!isMontage && (
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    {formatMeta.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {videoUrl ? (
            <ExportDialog
              projectTitle={project.title_suggestion ?? project.title}
              videoUrl={videoUrl}
              words={(project.captions_enabled ?? true) ? words : []}
              scenes={scenes as any}
              subtitleStyle={effectiveStyle}
              format={format}
              musicUrl={project.music_url as any}
              musicVolume={project.music_volume ?? 20}
              captionsEnabled={project.captions_enabled ?? true}
              subtitleY={subtitleY}
              trimStart={project.trim_start as number | null}
              trimEnd={project.trim_end as number | null}
              trigger={exportTrigger}
            />
          ) : isMontage ? (
            <Button size={isMobile ? "icon" : "default"} variant="outline" className="shrink-0" disabled title="Экспорт монтажа скоро">
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Экспорт</span>
            </Button>
          ) : null}
        </div>
      </header>

      {isMobile ? (
        <>
          <div className="flex-1 min-h-0 overflow-hidden p-2">
            {mobileTab === "preview" && previewPanel}
            {mobileTab === "edit" && editPanel}
            {mobileTab === "ai" && aiPanel}
          </div>
          <nav className="border-t border-border/40 bg-background/95 backdrop-blur-xl shrink-0 grid grid-cols-3 pb-[env(safe-area-inset-bottom)]">
            <TabBtn active={mobileTab === "preview"} onClick={() => setMobileTab("preview")} icon={Play} label="Превью" />
            <TabBtn active={mobileTab === "edit"} onClick={() => setMobileTab("edit")} icon={Settings2} label="Правка" />
            <TabBtn active={mobileTab === "ai"} onClick={() => setMobileTab("ai")} icon={Sparkles} label="AI" />
          </nav>
        </>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[272px_1fr_288px] gap-3 p-3 overflow-hidden min-h-0">
          {editPanel}
          {previewPanel}
          {aiPanel}
        </div>
      )}
    </div>
  );
};

const TabBtn = ({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
    }`}
  >
    <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
    {label}
  </button>
);

const SectionTitle = ({ children, className = "", icon: Icon }: { children: React.ReactNode; className?: string; icon?: any }) => (
  <div className={`flex items-center gap-1.5 mb-3 ${className}`}>
    {Icon && <Icon className="h-3.5 w-3.5 text-primary/80" />}
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{children}</p>
  </div>
);

const ToolButton = forwardRef<HTMLButtonElement, { icon: any; label: string; badge?: string }>(
  ({ icon: Icon, label, badge }, ref) => (
    <Button
      ref={ref}
      variant="outline"
      size="sm"
      className="h-11 justify-start w-full rounded-xl border-border/50 bg-surface-1/80 hover:bg-surface-2 hover:border-primary/40 transition-smooth group"
    >
      <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center mr-2.5 shrink-0 group-hover:bg-primary/15 transition-colors">
        <Icon className="h-4 w-4 text-primary" />
      </span>
      <span className="text-sm truncate flex-1 text-left">{label}</span>
      {badge && (
        <span className="text-[10px] font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded-md">{badge}</span>
      )}
    </Button>
  ),
);
ToolButton.displayName = "ToolButton";

interface ToolBigProps {
  icon: any;
  label: string;
  desc: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const ToolBigButton = forwardRef<HTMLButtonElement, ToolBigProps>(
  ({ icon: Icon, label, desc, onClick, disabled, loading }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left p-3.5 rounded-xl border border-border/40 bg-surface-1 hover:border-primary/40 hover:bg-surface-2 transition-smooth group ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
          {loading ? <Loader2 className="h-4 w-4 text-primary animate-spin" /> : <Icon className="h-4 w-4 text-primary" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
        </div>
      </div>
    </button>
  ),
);
ToolBigButton.displayName = "ToolBigButton";

const ToggleTile = ({ icon: Icon, label, desc, checked, onCheckedChange, disabled }: {
  icon: any; label: string; desc: string; checked: boolean;
  onCheckedChange: (v: boolean) => void; disabled?: boolean;
}) => (
  <div className={`flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-surface-1 ${disabled ? "opacity-60" : ""}`}>
    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
      <Icon className="h-4 w-4 text-primary" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium truncate">{label}</p>
      <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
  </div>
);

const ActionTile = forwardRef<HTMLButtonElement, {
  icon: any; label: string; desc: string; disabled?: boolean; active?: boolean;
}>(({ icon: Icon, label, desc, disabled, active }, ref) => (
  <button
    ref={ref}
    type="button"
    disabled={disabled}
    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-smooth ${
      disabled
        ? "opacity-50 cursor-not-allowed border-border/30 bg-surface-1/50"
        : active
          ? "border-primary/40 bg-primary/5 hover:bg-primary/10 cursor-pointer"
          : "border-border/40 bg-surface-1 hover:border-primary/40 hover:bg-surface-2 cursor-pointer"
    }`}
  >
    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
      <Icon className="h-4 w-4 text-primary" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium truncate">{label}</p>
      <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
    </div>
    {active && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
  </button>
));
ActionTile.displayName = "ActionTile";

export default Editor;
