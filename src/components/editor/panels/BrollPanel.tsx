import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Film, Sparkles, Loader2, Layers } from "lucide-react";
import { ReactNode, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  trigger: ReactNode;
  projectId: string;
  userId: string;
  format?: string;
}

export const BrollPanel = ({ trigger, projectId, userId, format }: Props) => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"broll" | "top" | "upload" | null>(null);

  const autoApply = async (target: "broll_url" | "top_video_url") => {
    setBusy(target === "broll_url" ? "broll" : "top");
    try {
      const { data, error } = await supabase.functions.invoke("fetch-broll", {
        body: { projectId, target, orientation: "portrait" },
      });
      if (error) throw error;
      toast.success(`AI подобрал ${data?.updated ?? 0} клипов из Pexels`, {
        description: target === "top_video_url" ? "Назначены в верхнюю половину сцен" : "Готово к показу как B-roll",
      });
      qc.invalidateQueries({ queryKey: ["editor", projectId] });
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка Pexels");
    } finally {
      setBusy(null);
    }
  };

  const upload = async (files: FileList) => {
    setBusy("upload");
    for (const file of Array.from(files)) {
      const path = `${userId}/${projectId}/${Date.now()}-${file.name}`;
      await supabase.storage.from("brolls").upload(path, file);
    }
    setBusy(null);
    toast.success(`${files.length} клипов загружено`, {
      description: "Назначь их в панели «Сцены» для выбранной сцены",
    });
  };

  const isSplit = format === "split";

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-[420px] overflow-y-auto">
        <SheetHeader><SheetTitle>B-roll вставки</SheetTitle></SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">AI Auto B-rolls (Pexels)</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              AI возьмёт ключевые слова каждой сцены и подберёт релевантный стоковый клип из Pexels (бесплатно, коммерческая лицензия).
            </p>
            <Button onClick={() => autoApply("broll_url")} disabled={busy !== null} className="w-full">
              {busy === "broll" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Подобрать B-roll
            </Button>
          </div>

          {isSplit && (
            <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Заполнить верх Split 50/50</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Подобрать видео для верхней половины каждой сцены через Pexels.
              </p>
              <Button onClick={() => autoApply("top_video_url")} disabled={busy !== null} className="w-full">
                {busy === "top" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
                Авто-заполнить верх
              </Button>
            </div>
          )}

          <div className="p-4 rounded-lg bg-surface-1 border border-border/40">
            <div className="flex items-center gap-2 mb-2">
              <Film className="h-4 w-4" />
              <p className="text-sm font-semibold">Свои клипы</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Загрузи свои видео — потом назначь их сценам в панели «Сцены».
            </p>
            <input ref={fileRef} type="file" accept="video/*" multiple className="hidden"
              onChange={(e) => e.target.files && upload(e.target.files)} />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === "upload" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Загрузить клипы
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
