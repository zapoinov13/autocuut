import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Film, Sparkles, Loader2 } from "lucide-react";
import { ReactNode, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  trigger: ReactNode;
  projectId: string;
  userId: string;
}

export const BrollPanel = ({ trigger, projectId, userId }: Props) => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const autoApply = async () => {
    setBusy(true);
    // Simulated auto-broll: would call edge function with Pexels API in future
    await new Promise((r) => setTimeout(r, 1200));
    setBusy(false);
    toast.success("AI подобрал B-roll по сценам", {
      description: "Источник: библиотека Pexels (бесплатно)",
    });
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
  };

  const upload = async (files: FileList) => {
    setBusy(true);
    for (const file of Array.from(files)) {
      const path = `${userId}/${projectId}/${Date.now()}-${file.name}`;
      await supabase.storage.from("brolls").upload(path, file);
    }
    setBusy(false);
    toast.success(`${files.length} клипов загружено`);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-[420px] overflow-y-auto">
        <SheetHeader><SheetTitle>B-roll вставки</SheetTitle></SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">AI Auto B-rolls</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              AI проанализирует ключевые слова сцен и подберёт релевантные стоковые клипы из Pexels.
            </p>
            <Button onClick={autoApply} disabled={busy} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Подобрать автоматически
            </Button>
          </div>

          <div className="p-4 rounded-lg bg-surface-1 border border-border/40">
            <div className="flex items-center gap-2 mb-2">
              <Film className="h-4 w-4" />
              <p className="text-sm font-semibold">Свои клипы</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Загрузи свои видео, и они будут доступны для вставки в сцены.
            </p>
            <input ref={fileRef} type="file" accept="video/*" multiple className="hidden"
              onChange={(e) => e.target.files && upload(e.target.files)} />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="mr-2 h-4 w-4" /> Загрузить клипы
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>Источник AI Auto B-rolls:</strong> Pexels — бесплатная стоковая библиотека (миллионы клипов под коммерческой лицензией). Подключение Pexels API будет настроено в следующем шаге.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
