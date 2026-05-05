import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Download, Sparkles, Loader2 } from "lucide-react";
import { ReactNode, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  trigger: ReactNode;
  projectId: string;
  userId: string;
}

const QUALITIES = [
  { id: "720p", label: "720p HD", desc: "Быстро · ~50 МБ" },
  { id: "1080p", label: "1080p Full HD", desc: "Стандарт · ~120 МБ" },
  { id: "4k", label: "4K Ultra HD", desc: "Лучшее качество · ~400 МБ", premium: true },
];

export const ExportDialog = ({ trigger, projectId, userId }: Props) => {
  const qc = useQueryClient();
  const [quality, setQuality] = useState("1080p");
  const [includeCaptions, setIncludeCaptions] = useState(true);
  const [includeMusic, setIncludeMusic] = useState(true);
  const [includeBrolls, setIncludeBrolls] = useState(true);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    const { error } = await supabase.from("export_jobs").insert({
      project_id: projectId,
      user_id: userId,
      quality,
      status: "queued",
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
    if (quality === "4k") {
      toast.success("Экспорт в 4K поставлен в очередь", {
        description: "Это займёт несколько минут. Ссылка появится в проекте.",
      });
    } else {
      toast.success("Экспорт начат", { description: "Ссылка на скачивание появится скоро." });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" /> Экспорт видео
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Качество</Label>
            <div className="space-y-2 mt-2">
              {QUALITIES.map((q) => (
                <button key={q.id} onClick={() => setQuality(q.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-smooth ${
                    quality === q.id ? "border-primary bg-primary/5" : "border-border/60 bg-surface-1"
                  }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        {q.label}
                        {q.premium && <Sparkles className="h-3 w-3 text-primary" />}
                      </p>
                      <p className="text-xs text-muted-foreground">{q.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border/40">
            <ToggleRow label="Субтитры" value={includeCaptions} onChange={setIncludeCaptions} />
            <ToggleRow label="Фоновая музыка" value={includeMusic} onChange={setIncludeMusic} />
            <ToggleRow label="B-roll вставки" value={includeBrolls} onChange={setIncludeBrolls} />
          </div>

          <Button onClick={start} disabled={busy} className="w-full shadow-glow">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Начать экспорт
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ToggleRow = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between py-1">
    <Label className="text-sm">{label}</Label>
    <Switch checked={value} onCheckedChange={onChange} />
  </div>
);
