import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Bot, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface HeygenAvatar { id: string; name: string; preview_image_url: string | null; gender: string | null }
interface HeygenVoice { id: string; name: string; language: string | null; gender: string | null }

const ASPECT_RATIOS = [
  { id: "9:16", label: "Reels / TikTok", desc: "9:16 вертикаль" },
  { id: "16:9", label: "YouTube", desc: "16:9 горизонталь" },
  { id: "1:1", label: "Квадрат", desc: "1:1" },
];

const UploadAvatar = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [avatars, setAvatars] = useState<HeygenAvatar[]>([]);
  const [voices, setVoices] = useState<HeygenVoice[]>([]);
  const [avatarId, setAvatarId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [loadingResources, setLoadingResources] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [heygenError, setHeygenError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingResources(true);
      try {
        const [avRes, voRes] = await Promise.all([
          supabase.functions.invoke("heygen-api", { body: { action: "list_avatars" } }),
          supabase.functions.invoke("heygen-api", { body: { action: "list_voices" } }),
        ]);
        if (avRes.error || avRes.data?.error) {
          setHeygenError(avRes.data?.error ?? avRes.error?.message ?? "HeyGen недоступен");
        } else {
          const list = (avRes.data?.avatars ?? []) as HeygenAvatar[];
          setAvatars(list);
          if (list[0]) setAvatarId(list[0].id);
        }
        if (!voRes.error && !voRes.data?.error) {
          const list = (voRes.data?.voices ?? []) as HeygenVoice[];
          setVoices(list);
          const ru = list.find((v) => v.language?.toLowerCase().includes("ru")) ?? list[0];
          if (ru) setVoiceId(ru.id);
        }
      } catch (e: any) {
        setHeygenError(e.message);
      } finally {
        setLoadingResources(false);
      }
    })();
  }, []);

  const handleCreate = async () => {
    if (!user || !script.trim() || !avatarId || !voiceId) {
      toast.error("Заполните сценарий и выберите аватар с голосом");
      return;
    }
    if (script.trim().length < 20) {
      toast.error("Сценарий слишком короткий", { description: "Минимум 20 символов" });
      return;
    }
    setBusy(true);
    setProgress(10);
    try {
      const { data: project, error: pErr } = await supabase.from("projects").insert({
        user_id: user.id,
        title: title.trim() || "Экспертное видео",
        style: "educational",
        status: "uploading",
        kind: "avatar",
        format: aspectRatio === "16:9" ? "landscape" : "stories",
        meta: { script: script.trim(), avatar_id: avatarId, voice_id: voiceId, aspect_ratio: aspectRatio },
      } as any).select().single();
      if (pErr || !project) throw pErr ?? new Error("Не удалось создать проект");

      setProgress(40);
      const { data, error } = await supabase.functions.invoke("heygen-api", {
        body: {
          action: "create",
          project_id: project.id,
          avatar_id: avatarId,
          voice_id: voiceId,
          script: script.trim(),
          aspect_ratio: aspectRatio,
          title: title.trim() || "Expert Video",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setProgress(100);
      toast.success("HeyGen генерирует видео...");
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
            <Bot className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">AI Avatar · HeyGen</h1>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl py-10 space-y-8">
        <div>
          <h2 className="text-xl font-semibold mb-1">Экспертное видео с AI-аватаром</h2>
          <p className="text-muted-foreground text-sm">
            Напишите сценарий, выберите аватар и голос. HeyGen создаст talking-head видео, затем AI добавит субтитры и монтаж.
          </p>
        </div>

        {heygenError && (
          <Card className="p-4 border-destructive/40 bg-destructive/10">
            <p className="text-sm text-destructive">{heygenError}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Добавьте HEYGEN_API_KEY в секреты проекта (Lovable Cloud → Secrets).
            </p>
          </Card>
        )}

        <div className="space-y-2">
          <Label htmlFor="title">Название проекта</Label>
          <Input id="title" placeholder="Например: 5 ошибок в маркетинге" value={title}
            onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="script">Сценарий эксперта</Label>
          <Textarea id="script" rows={8} placeholder="Напишите текст, который произнесёт AI-аватар. Говорите естественно, как эксперт в камеру..."
            value={script} onChange={(e) => setScript(e.target.value)} disabled={busy} />
          <p className="text-xs text-muted-foreground">{script.length} символов · рекомендуем 150–600 символов</p>
        </div>

        <div>
          <Label className="mb-3 block">Формат</Label>
          <div className="grid grid-cols-3 gap-3">
            {ASPECT_RATIOS.map((a) => (
              <button key={a.id} onClick={() => setAspectRatio(a.id)} disabled={busy}
                className={cn("p-3 rounded-xl border-2 text-left transition-smooth bg-gradient-card",
                  aspectRatio === a.id ? "border-primary shadow-glow" : "border-border hover:border-primary/40")}>
                <p className="font-semibold text-sm">{a.label}</p>
                <p className="text-xs text-muted-foreground">{a.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-3 block">AI-аватар</Label>
          {loadingResources ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : avatars.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">Аватары не найдены. Проверьте HEYGEN_API_KEY.</Card>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-64 overflow-y-auto">
              {avatars.map((a) => (
                <button key={a.id} onClick={() => setAvatarId(a.id)} disabled={busy}
                  className={cn("rounded-xl border-2 overflow-hidden transition-smooth text-left",
                    avatarId === a.id ? "border-primary shadow-glow" : "border-border hover:border-primary/40")}>
                  {a.preview_image_url ? (
                    <img src={a.preview_image_url} alt={a.name} className="w-full aspect-square object-cover" />
                  ) : (
                    <div className="w-full aspect-square bg-surface-2 flex items-center justify-center text-2xl">🤖</div>
                  )}
                  <p className="text-[10px] p-1.5 truncate font-medium">{a.name}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label className="mb-3 block">Голос</Label>
          {loadingResources ? null : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {voices.slice(0, 30).map((v) => (
                <button key={v.id} onClick={() => setVoiceId(v.id)} disabled={busy}
                  className={cn("p-3 rounded-lg border text-left text-sm transition-smooth",
                    voiceId === v.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40")}>
                  <p className="font-medium truncate">{v.name}</p>
                  <p className="text-[10px] text-muted-foreground">{v.language ?? ""} {v.gender ?? ""}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {busy && (
          <Card className="p-4">
            <Progress value={progress} className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground">Отправляем задачу в HeyGen...</p>
          </Card>
        )}

        <div className="flex justify-end">
          <Button size="lg" onClick={handleCreate}
            disabled={busy || loadingResources || !!heygenError || !script.trim() || !avatarId || !voiceId}
            className="h-12 px-8 shadow-glow">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Создаём...</>
              : <><Sparkles className="mr-2 h-4 w-4" /> Сгенерировать видео</>}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default UploadAvatar;
