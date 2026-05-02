import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Sparkles, Loader2, Download, Music, Wand2, ZoomIn, Film,
  Type, MoreHorizontal, Anchor, Mic, Palette,
} from "lucide-react";
import { VideoPreview } from "@/components/editor/VideoPreview";
import { STYLES, STYLE_LIST, StyleId } from "@/lib/styles";
import { formatTime } from "@/lib/format";
import { toast } from "sonner";

const Editor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

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
        scenes: scenes ?? [],
        words: ((subs?.words as any[]) ?? []) as { text: string; start: number; end: number }[],
      };
    },
    enabled: !!id,
  });

  // Refresh signed URL if expired
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data?.project?.video_path) return;
    supabase.storage.from("videos").createSignedUrl(data.project.video_path, 60 * 60 * 6).then(({ data: signed }) => {
      if (signed) setVideoUrl(signed.signedUrl);
    });
  }, [data?.project?.video_path]);

  const handleSaveScene = async (sceneId: string) => {
    await supabase.from("scenes").update({ text: editText }).eq("id", sceneId);
    setEditingSceneId(null);
    qc.invalidateQueries({ queryKey: ["editor", id] });
  };

  const handleStyleChange = async (newStyle: StyleId) => {
    await supabase.from("projects").update({ style: newStyle }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["editor", id] });
    toast.success(`Стиль изменён на ${STYLES[newStyle].name}`);
  };

  if (isLoading || !data?.project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { project, scenes, words } = data;
  const styleId = project.style as StyleId;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-xl bg-background/80 z-50">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="min-w-0">
              <h1 className="font-semibold truncate text-sm">
                {project.title_suggestion ?? project.title}
              </h1>
              {project.viral_score !== null && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Viral score: <span className="text-primary font-semibold">{project.viral_score}/100</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">{STYLES[styleId].emoji} {STYLES[styleId].name}</Badge>
            <Button onClick={() => toast.info("Экспорт скоро будет доступен", { description: "Сейчас можно посмотреть превью с эффектами" })} className="shadow-glow">
              <Download className="mr-2 h-4 w-4" />
              Экспорт
            </Button>
          </div>
        </div>
      </header>

      {/* Main editor — two columns */}
      <div className="flex-1 grid lg:grid-cols-[1fr_minmax(360px,440px)] gap-4 p-4 max-w-[1600px] mx-auto w-full">
        {/* LEFT — Scenes panel */}
        <Card className="bg-gradient-card border-border/60 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Сцены ({scenes.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs h-8">
                <Sparkles className="mr-1.5 h-3 w-3 text-primary" />
                AI Авто-зумы
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-8">
                <Sparkles className="mr-1.5 h-3 w-3 text-primary" />
                AI Авто B-rolls
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {scenes.map((scene) => {
              const isEditing = editingSceneId === scene.id;
              return (
                <div key={scene.id} className="group">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-muted-foreground bg-surface-2 px-2 py-0.5 rounded">
                      {formatTime(scene.start_time)} — {formatTime(scene.end_time)}
                    </span>
                    {scene.is_hook && (
                      <Badge className="bg-primary/20 text-primary border-0 text-[10px]">
                        <Anchor className="h-2.5 w-2.5 mr-1" /> HOOK
                      </Badge>
                    )}
                  </div>
                  <Card
                    className={`p-3 bg-surface-1 border-border/40 hover:border-primary/40 transition-smooth cursor-pointer ${
                      isEditing ? "border-primary" : ""
                    }`}
                    onClick={() => {
                      if (!isEditing) {
                        setEditingSceneId(scene.id);
                        setEditText(scene.text);
                      }
                    }}
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="min-h-[60px] text-sm bg-surface-2"
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingSceneId(null); }}>
                            Отмена
                          </Button>
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); handleSaveScene(scene.id); }}>
                            Сохранить
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed">{scene.text}</p>
                    )}
                  </Card>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {scene.zoom !== "none" && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <ZoomIn className="h-2.5 w-2.5" />
                        Зум {scene.zoom === "in" ? "наезд" : "отъезд"}
                      </Badge>
                    )}
                    {(scene.highlight_words as string[]).slice(0, 3).map((w, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                        {w}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* RIGHT — Preview panel */}
        <div className="flex flex-col gap-3">
          {/* Preview tools row */}
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Palette className="mr-2 h-4 w-4" />
                  Стиль
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-2">
                {STYLE_LIST.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleStyleChange(s.id)}
                    className={`w-full text-left p-2 rounded-md hover:bg-accent flex items-center gap-3 ${
                      styleId === s.id ? "bg-accent" : ""
                    }`}
                  >
                    <span className="text-xl">{s.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{s.description}</p>
                    </div>
                  </button>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" className="h-9">
              <Music className="mr-2 h-4 w-4" />
              Аудио
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-primary/40 text-primary">
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI Тулзы
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">AI Tools</p>
                {[
                  { icon: ZoomIn, label: "AI Авто-зумы", on: true },
                  { icon: Film, label: "AI Авто B-rolls", on: true },
                  { icon: Mic, label: "Удалить паузы", on: false },
                  { icon: Anchor, label: "AI Hook Title", on: true },
                  { icon: Wand2, label: "Clean Audio", on: false },
                  { icon: Type, label: "Стиль субтитров", on: true },
                ].map((tool, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded hover:bg-accent">
                    <div className="flex items-center gap-2">
                      <tool.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{tool.label}</span>
                    </div>
                    <Switch checked={tool.on} />
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {/* Video */}
          {videoUrl ? (
            <VideoPreview videoUrl={videoUrl} styleId={styleId} words={words} scenes={scenes as any} />
          ) : (
            <div className="aspect-[9/16] bg-surface-1 rounded-2xl flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Editor;
