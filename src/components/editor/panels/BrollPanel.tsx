import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Upload, Film, Sparkles, Loader2, Layers, CheckCircle2, XCircle,
  AlertCircle, Info, RefreshCw, Search, Trash2, Plus,
} from "lucide-react";
import { ReactNode, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatTime } from "@/lib/format";

interface Decision {
  block_id: string;
  i: number;
  start: number;
  end: number;
  seconds: number;
  text: string;
  use: boolean;
  query: string;
  queries: string[];
  reason: string;
  broll_url: string | null;
  status: "applied" | "skipped_ai" | "skipped_adjacent" | "no_pexels_match";
}

interface PexelsHit {
  id: number;
  url: string;
  thumb: string;
  duration: number;
}

interface Scene {
  id: string;
  start_time: number;
  end_time: number;
  broll_url?: string | null;
  broll_meta?: any;
}

interface Props {
  trigger: ReactNode;
  projectId: string;
  userId: string;
  format?: string;
  scenes: Scene[];
}

const STATUS: Record<Decision["status"], { label: string; cls: string; icon: any }> = {
  applied:           { label: "B-roll применён", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  skipped_ai:        { label: "Пропущен AI",     cls: "bg-muted/50 text-muted-foreground border-border",         icon: XCircle },
  skipped_adjacent:  { label: "Соседний блок",   cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",      icon: AlertCircle },
  no_pexels_match:   { label: "Нет на Pexels",   cls: "bg-rose-500/15 text-rose-400 border-rose-500/30",         icon: AlertCircle },
};

export const BrollPanel = ({ trigger, projectId, userId, format, scenes }: Props) => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const fileBlockRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null); // "auto"|"top"|"upload"|`block-${i}-action`
  const [report, setReport] = useState<Decision[] | null>(null);
  const [stats, setStats] = useState<{ updated: number; applied_scenes: number; total_blocks: number; total_scenes: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PexelsHit[]>([]);
  const [uploadBlockIdx, setUploadBlockIdx] = useState<number | null>(null);

  const isSplit = format === "split";

  // Group scenes into blocks based on broll_meta.block_id (same id => same block)
  const sceneBlocks = (() => {
    const map = new Map<string, Scene[]>();
    for (const s of scenes) {
      const bid = (s.broll_meta as any)?.block_id;
      if (!bid) continue;
      const arr = map.get(bid) ?? [];
      arr.push(s);
      map.set(bid, arr);
    }
    return map;
  })();

  const sceneIdsForBlock = (i: number, blockId?: string): string[] => {
    if (blockId && sceneBlocks.has(blockId)) {
      return sceneBlocks.get(blockId)!.map((s) => s.id);
    }
    // fallback: derive from report block start/end
    const d = report?.find((r) => r.i === i);
    if (!d) return [];
    return scenes.filter((s) => s.start_time >= d.start - 0.01 && s.end_time <= d.end + 0.01).map((s) => s.id);
  };

  const autoApply = async (target: "broll_url" | "top_video_url") => {
    setBusy(target === "broll_url" ? "auto" : "top");
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
      toast.success(`AI выбрал ${data?.updated ?? 0} из ${data?.total_blocks ?? 0} блоков`);
      qc.invalidateQueries({ queryKey: ["editor", projectId] });
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
    } finally {
      setBusy(null);
    }
  };

  const blockAction = async (
    d: Decision,
    action: "regenerate" | "clear" | "search" | "pick",
    extra: any = {},
  ) => {
    const sceneIds = sceneIdsForBlock(d.i, d.block_id);
    if (!sceneIds.length && action !== "search") {
      toast.error("Не найдены сцены блока");
      return;
    }
    setBusy(`block-${d.i}-${action}`);
    try {
      const { data, error } = await supabase.functions.invoke("broll-block-action", {
        body: { projectId, sceneIds, action, orientation: "portrait", target: "broll_url", ...extra },
      });
      if (error) throw error;
      if (action === "search") {
        setSearchResults(data?.results ?? []);
        return;
      }
      // update local report
      if (action === "regenerate" || action === "pick") {
        setReport((prev) =>
          prev?.map((r) =>
            r.i === d.i
              ? { ...r, broll_url: data?.url ?? r.broll_url, status: "applied", use: true, query: extra.query ?? r.query }
              : r,
          ) ?? prev,
        );
        toast.success("B-roll обновлён");
      }
      if (action === "clear") {
        setReport((prev) =>
          prev?.map((r) =>
            r.i === d.i ? { ...r, broll_url: null, status: "skipped_ai", use: false, reason: "Снят вручную" } : r,
          ) ?? prev,
        );
        toast.success("B-roll снят");
      }
      qc.invalidateQueries({ queryKey: ["editor", projectId] });
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
    } finally {
      setBusy(null);
    }
  };

  const openSearch = (d: Decision) => {
    setSearchOpen(d.i);
    setSearchQuery(d.query || d.queries?.[0] || "");
    setSearchResults([]);
  };

  const runSearch = async (d: Decision) => {
    if (!searchQuery.trim()) return;
    await blockAction(d, "search", { query: searchQuery.trim() });
  };

  const pickFromSearch = async (d: Decision, hit: PexelsHit) => {
    await blockAction(d, "pick", { url: hit.url, query: searchQuery.trim() });
    setSearchOpen(null);
  };

  const uploadCustom = async (files: FileList) => {
    setBusy("upload");
    for (const file of Array.from(files)) {
      const path = `${userId}/${projectId}/${Date.now()}-${file.name}`;
      await supabase.storage.from("brolls").upload(path, file);
    }
    setBusy(null);
    toast.success(`${files.length} клипов загружено`, {
      description: "Назначь их в панели «Сцены»",
    });
  };

  const uploadIntoBlock = async (file: File, d: Decision) => {
    const sceneIds = sceneIdsForBlock(d.i, d.block_id);
    if (!sceneIds.length) { toast.error("Нет сцен блока"); return; }
    setBusy(`block-${d.i}-upload`);
    try {
      const path = `${userId}/${projectId}/block-${d.i}-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("brolls").upload(path, file);
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("brolls").createSignedUrl(path, 60 * 60 * 24 * 30);
      if (!signed?.signedUrl) throw new Error("Нет URL");
      await blockAction(d, "pick", { url: signed.signedUrl, query: "uploaded" });
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка загрузки");
      setBusy(null);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-[480px] sm:w-[560px] overflow-y-auto">
        <SheetHeader><SheetTitle>B-roll вставки</SheetTitle></SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Правила */}
          <div className="p-3 rounded-lg bg-surface-1 border border-border/40">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold">Как AI выбирает B-roll</p>
            </div>
            <ul className="text-[11px] text-muted-foreground space-y-1 leading-relaxed">
              <li>• Учитывает <b>тему ролика</b>, не только текст блока.</li>
              <li>• Блоки <b>5–9 сек</b>, клип не короче блока — без миганий.</li>
              <li>• Только <b>конкретные визуалы</b>, не стоковая абстракция.</li>
              <li>• <b>Два соседних блока</b> подряд с B-roll запрещены.</li>
              <li>• Покрытие <b>40–60%</b> блоков.</li>
            </ul>
          </div>

          {/* AI Auto */}
          <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">AI Auto B-rolls (Pexels)</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              AI разберёт текст с учётом темы и подставит релевантные клипы.
            </p>
            <Button onClick={() => autoApply("broll_url")} disabled={busy !== null} className="w-full">
              {busy === "auto" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
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

          {/* Свои клипы общая загрузка */}
          <div className="p-4 rounded-lg bg-surface-1 border border-border/40">
            <div className="flex items-center gap-2 mb-2">
              <Film className="h-4 w-4" />
              <p className="text-sm font-semibold">Свои клипы в библиотеку</p>
            </div>
            <input ref={fileRef} type="file" accept="video/*" multiple className="hidden"
              onChange={(e) => e.target.files && uploadCustom(e.target.files)} />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === "upload" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Загрузить клипы
            </Button>
          </div>

          {/* hidden input for per-block upload */}
          <input
            ref={fileBlockRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              const d = report?.find((r) => r.i === uploadBlockIdx);
              if (f && d) uploadIntoBlock(f, d);
              e.target.value = "";
            }}
          />

          {/* Отчёт */}
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
              <div className="space-y-2">
                {report.map((d) => {
                  const S = STATUS[d.status];
                  const Icon = S.icon;
                  const isApplied = d.status === "applied" && d.broll_url;
                  const blockBusyKey = `block-${d.i}-`;
                  const isBusy = !!busy?.startsWith(blockBusyKey);
                  return (
                    <div
                      key={`${d.block_id}-${d.i}`}
                      className={`rounded-lg border p-3 ${
                        isApplied
                          ? "bg-emerald-500/5 border-emerald-500/20"
                          : "bg-surface-1/60 border-border/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {formatTime(d.start)}—{formatTime(d.end)} · {d.seconds}с
                        </span>
                        <Badge variant="outline" className={`text-[10px] gap-1 ${S.cls}`}>
                          <Icon className="h-2.5 w-2.5" />
                          {S.label}
                        </Badge>
                      </div>
                      <p className="text-xs leading-snug line-clamp-2 mb-1.5">{d.text}</p>
                      {d.reason && (
                        <p className="text-[11px] text-muted-foreground italic mb-1.5">«{d.reason}»</p>
                      )}

                      {/* Preview video */}
                      {isApplied && d.broll_url && (
                        <video
                          src={d.broll_url}
                          className="w-full h-28 object-cover rounded-md bg-black mb-2"
                          muted
                          playsInline
                          loop
                          onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                          onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                        />
                      )}

                      {d.query && (
                        <p className="text-[10px] text-primary/80 font-mono mb-2 truncate">→ {d.query}</p>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-1.5">
                        {isApplied ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              disabled={isBusy}
                              onClick={() => blockAction(d, "regenerate")}
                            >
                              {busy === `block-${d.i}-regenerate` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              <span className="ml-1">Другой</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              disabled={isBusy}
                              onClick={() => openSearch(d)}
                            >
                              <Search className="h-3 w-3" />
                              <span className="ml-1">Свой запрос</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              disabled={isBusy}
                              onClick={() => { setUploadBlockIdx(d.i); fileBlockRef.current?.click(); }}
                            >
                              {busy === `block-${d.i}-upload` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              <span className="ml-1">Файл</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2 text-rose-400 hover:text-rose-300"
                              disabled={isBusy}
                              onClick={() => blockAction(d, "clear")}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              disabled={isBusy}
                              onClick={() => openSearch(d)}
                            >
                              <Plus className="h-3 w-3" />
                              <span className="ml-1">Добавить B-roll</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              disabled={isBusy}
                              onClick={() => { setUploadBlockIdx(d.i); fileBlockRef.current?.click(); }}
                            >
                              {busy === `block-${d.i}-upload` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              <span className="ml-1">Свой файл</span>
                            </Button>
                          </>
                        )}
                      </div>

                      {/* Inline search */}
                      {searchOpen === d.i && (
                        <div className="mt-3 p-2 rounded-md bg-surface-2/60 border border-border/40">
                          <div className="flex gap-1.5">
                            <Input
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && runSearch(d)}
                              placeholder="Английский запрос для Pexels"
                              className="h-8 text-xs"
                            />
                            <Button size="sm" className="h-8" onClick={() => runSearch(d)}
                              disabled={busy === `block-${d.i}-search`}>
                              {busy === `block-${d.i}-search` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setSearchOpen(null)}>
                              ✕
                            </Button>
                          </div>
                          {searchResults.length > 0 && (
                            <div className="grid grid-cols-3 gap-1.5 mt-2">
                              {searchResults.map((hit) => (
                                <button
                                  key={hit.id}
                                  type="button"
                                  onClick={() => pickFromSearch(d, hit)}
                                  className="relative aspect-video rounded overflow-hidden border border-border/40 hover:border-primary/60 transition-colors group"
                                  disabled={busy === `block-${d.i}-pick`}
                                >
                                  <img src={hit.thumb} alt="" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                                  <span className="absolute bottom-0.5 right-0.5 text-[9px] font-mono bg-black/60 text-white px-1 rounded">
                                    {Math.round(hit.duration)}с
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
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
