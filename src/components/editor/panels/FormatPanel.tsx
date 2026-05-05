import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Smartphone, Layers, Monitor } from "lucide-react";
import { POSITION_OPTIONS } from "@/lib/styles";

export type VideoFormat = "stories" | "split" | "landscape";

export const FORMATS: { id: VideoFormat; name: string; desc: string; icon: any; aspect: string }[] = [
  { id: "stories", name: "Stories / Reels", desc: "9:16 — TikTok, Reels, Shorts", icon: Smartphone, aspect: "9 / 16" },
  { id: "split", name: "Split 50/50", desc: "Сверху B-roll, снизу эксперт", icon: Layers, aspect: "9 / 16" },
  { id: "landscape", name: "Landscape", desc: "16:9 — YouTube, презентации", icon: Monitor, aspect: "16 / 9" },
];

interface Props {
  trigger: ReactNode;
  projectId: string;
  format: VideoFormat;
  subtitlePosition: string;
}

export const FormatPanel = ({ trigger, projectId, format, subtitlePosition }: Props) => {
  const qc = useQueryClient();

  const setFormat = async (f: VideoFormat) => {
    await supabase.from("projects").update({ format: f }).eq("id", projectId);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
    toast.success(`Формат: ${FORMATS.find((x) => x.id === f)?.name}`);
  };

  const setPosition = async (p: string) => {
    await supabase.from("projects").update({ subtitle_position: p }).eq("id", projectId);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-[420px] overflow-y-auto">
        <SheetHeader><SheetTitle>Формат видео</SheetTitle></SheetHeader>

        <div className="mt-6 space-y-5">
          <div>
            <Label className="text-xs text-muted-foreground">Соотношение и шаблон</Label>
            <div className="space-y-2 mt-2">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                const active = format === f.id;
                return (
                  <button key={f.id} onClick={() => setFormat(f.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-smooth flex items-center gap-3 ${
                      active ? "border-primary bg-primary/5" : "border-border/60 bg-surface-1 hover:border-primary/40"
                    }`}>
                    <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{f.desc}</p>
                    </div>
                    <div className="rounded border border-border/60 bg-surface-2 shrink-0" style={{ width: 24, aspectRatio: f.aspect }} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Позиция субтитров</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {POSITION_OPTIONS.map((p) => (
                <button key={p.value} onClick={() => setPosition(p.value)}
                  className={`p-3 rounded-lg border text-sm transition-smooth ${
                    subtitlePosition === p.value ? "border-primary bg-primary/5" : "border-border/60 bg-surface-1 hover:border-primary/40"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {format === "split" && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
              💡 В формате <strong>Split 50/50</strong> верхняя половина — это B-roll или твоё загруженное видео для каждой сцены. Открой панель <strong>Сцены</strong> чтобы назначить верхний клип для каждой сцены, или используй <strong>AI Auto B-rolls</strong> для авто-подбора через Pexels.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
