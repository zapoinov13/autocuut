import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Film, Sparkles, Loader2, Layers, CheckCircle2, XCircle, AlertCircle, Info } from "lucide-react";
import { ReactNode, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatTime } from "@/lib/format";

interface Decision {
  i: number;
  start: number;
  end: number;
  seconds: number;
  text: string;
  use: boolean;
  query: string;
  reason: string;
  broll_url: string | null;
  status: "applied" | "skipped_ai" | "skipped_adjacent" | "no_pexels_match";
}

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
  const [report, setReport] = useState<Decision[] | null>(null);
  const [stats, setStats] = useState<{ updated: number; applied_scenes: number; total_blocks: number; total_scenes: number } | null>(null);

  const autoApply = async (target: "broll_url" | "top_video_url") => {
    setBusy(target === "broll_url" ? "broll" : "top");
    setReport(null);
    setStats(null);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-broll", {
        body: { projectId, target, orientation: "portrait" },
      });
      if (error) throw error;
      setReport(data?.decisions ?? []);
      setStats({
        updated: data?.updated ?? 0,
        applied_scenes: data?.applied_scenes ?? 0,
        total_blocks: data?.total_blocks ?? 0,
        total_scenes: data?.total_scenes ?? 0,
      });
      toast.success(`AI выбрал ${data?.updated ?? 0} из ${data?.total_blocks ?? 0} блоков`, {
        description: `Покрыто ${data?.applied_scenes ?? 0} сцен из ${data?.total_scenes ?? 0}`,
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

  const STATUS: Record<Decision["status"], { label: string; cls: string; icon: any }> = {
    applied:           { label: "Добавлен B-roll", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
    skipped_ai:        { label: "Пропущен AI",     cls: "bg-muted/50 text-muted-foreground border-border",         icon: XCircle },
    skipped_adjacent:  { label: "Соседний блок",   cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",      icon: AlertCircle },
    no_pexels_match:   { label: "Нет на Pexels",   cls: "bg-rose-500/15 text-rose-400 border-rose-500/30",         icon: AlertCircle },
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-[460px] sm:w-[520px] overflow-y-auto">
        <SheetHeader><SheetTitle>B-roll вставки</SheetTitle></SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Правила AI */}
          <div className="p-3 rounded-lg bg-surface-1 border border-border/40">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold">Как AI выбирает B-roll</p>
            </div>
            <ul className="text-[11px] text-muted-foreground space-y-1 leading-relaxed">
              <li>• Сцены группируются в блоки <b>5–9 сек</b> — клип не мигает.</li>
              <li>• Берётся только там, где есть <b>конкретный визуальный объект</b> (место, действие, предмет).</li>
              <li>• Пропускаются интро, CTA, общие фразы, переходы.</li>
              <li>• <b>Два соседних блока подряд</b> с B-roll запрещены.</li>
              <li>• Цель покрытия — <b>40–60%</b> блоков, не больше.</li>
            </ul>
          </div>

          <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">AI Auto B-rolls (Pexels)</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              AI разберёт текст, выберет осмысленные блоки и подставит релевантные клипы.
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
            <input ref={fileRef} type="file" accept="video/*" multiple className="hidden"
              onChange={(e) => e.target.files && upload(e.target.files)} />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === "upload" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Загрузить клипы
            </Button>
          </div>

          {/* Отчёт по блокам */}
          {report && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold">Разбор по блокам</p>
                {stats && (
                  <span className="text-[11px] text-muted-foreground">
                    {stats.updated}/{stats.total_blocks} блоков · {stats.applied_scenes}/{stats.total_scenes} сцен
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {report.map((d) => {
                  const S = STATUS[d.status];
                  const Icon = S.icon;
                  return (
                    <div
                      key={d.i}
                      className={`rounded-lg border p-2.5 ${
                        d.status === "applied"
                          ? "bg-emerald-500/5 border-emerald-500/20"
                          : "bg-surface-1/60 border-border/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {formatTime(d.start)}—{formatTime(d.end)} · {d.seconds}с
                        </span>
                        <Badge variant="outline" className={`text-[10px] gap-1 ${S.cls}`}>
                          <Icon className="h-2.5 w-2.5" />
                          {S.label}
                        </Badge>
                      </div>
                      <p className="text-xs leading-snug line-clamp-2 mb-1">{d.text}</p>
                      {d.reason && (
                        <p className="text-[11px] text-muted-foreground italic">«{d.reason}»</p>
                      )}
                      {d.query && d.use && (
                        <p className="text-[10px] text-primary/80 font-mono mt-0.5">→ {d.query}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
