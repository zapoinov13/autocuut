import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Anchor, ZoomIn, Upload, Trash2, Loader2, Plus, Film, Image as ImageIcon } from "lucide-react";
import { ReactNode, useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { formatTime } from "@/lib/format";
import { toast } from "sonner";

interface Scene {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
  zoom: string;
  is_hook: boolean;
  highlight_words: string[];
  top_video_url?: string | null;
  broll_url?: string | null;
}

interface Props {
  trigger: ReactNode;
  scenes: Scene[];
  projectId: string;
  userId: string;
  format?: string;
}

// Inline auto-saving text editor for scene text
const SceneText = ({ scene, projectId }: { scene: Scene; projectId: string }) => {
  const qc = useQueryClient();
  const [val, setVal] = useState(scene.text);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setVal(scene.text); }, [scene.text, dirty]);

  const commit = async () => {
    if (val === scene.text) { setDirty(false); return; }
    await supabase.from("scenes").update({ text: val }).eq("id", scene.id);
    setDirty(false);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
  };

  return (
    <Textarea
      value={val}
      onChange={(e) => { setVal(e.target.value); setDirty(true); }}
      onBlur={commit}
      placeholder="Что говорит спикер..."
      className="min-h-[56px] text-sm border-0 bg-transparent focus-visible:ring-1 resize-none px-0"
    />
  );
};

export const ScenesPanel = ({ trigger, scenes, projectId, userId, format }: Props) => {
  const qc = useQueryClient();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<"top" | "broll">("broll");
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const isSplit = format === "split";

  const uploadMedia = async (sceneId: string, file: File, target: "top" | "broll") => {
    setUploadingId(sceneId);
    try {
      const path = `${userId}/${projectId}/scene-${sceneId}-${target}-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("brolls").upload(path, file);
      if (error) throw error;
      const { data: signed } = await supabase.storage.from("brolls").createSignedUrl(path, 60 * 60 * 24 * 30);
      const url = signed?.signedUrl ?? null;
      const patch = target === "top" ? { top_video_url: url } : { broll_url: url };
      await supabase.from("scenes").update(patch).eq("id", sceneId);
      qc.invalidateQueries({ queryKey: ["editor", projectId] });
      toast.success(target === "top" ? "Верхний клип назначен" : "B-roll загружен");
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось загрузить");
    } finally {
      setUploadingId(null);
    }
  };

  const clearMedia = async (sceneId: string, target: "top" | "broll") => {
    const column = target === "top" ? "top_video_url" : "broll_url";
    await supabase.from("scenes").update({ [column]: null }).eq("id", sceneId);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
  };

  const setZoom = async (sceneId: string, zoom: string) => {
    await supabase.from("scenes").update({ zoom }).eq("id", sceneId);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
  };

  const triggerUpload = (sceneId: string, target: "top" | "broll") => {
    setUploadTarget(target);
    fileInputs.current[sceneId]?.click();
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-[460px] sm:w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Сцены ({scenes.length})</SheetTitle>
          <p className="text-xs text-muted-foreground">Редактируй речь спикера и что показывать на экране</p>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {scenes.map((scene) => (
            <div key={scene.id} className="rounded-xl border border-border/50 bg-surface-1/60 p-3">
              {/* Header: timecode + hook badge */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-mono text-muted-foreground">
                  {formatTime(scene.start_time)} — {formatTime(scene.end_time)}
                </span>
                {scene.is_hook && (
                  <Badge className="bg-primary/20 text-primary border-0 text-[10px]">
                    <Anchor className="h-2.5 w-2.5 mr-1" /> HOOK
                  </Badge>
                )}
              </div>

              {/* Speaker text — always editable */}
              <SceneText scene={scene} projectId={projectId} />

              {/* Highlight words */}
              {(scene.highlight_words ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {scene.highlight_words.slice(0, 5).map((w, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">{w}</Badge>
                  ))}
                </div>
              )}

              {/* Hidden file input shared per-scene */}
              <input
                ref={(el) => { fileInputs.current[scene.id] = el; }}
                type="file"
                accept="video/*,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadMedia(scene.id, f, uploadTarget);
                  e.target.value = "";
                }}
              />

              {/* Action chips row — like Submagic */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {/* Zoom chip */}
                <button
                  type="button"
                  onClick={() => setZoom(scene.id, scene.zoom === "none" ? "in" : scene.zoom === "in" ? "out" : "none")}
                  className={`flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs border transition-colors ${
                    scene.zoom !== "none"
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-surface-2 border-border/40 hover:border-primary/40"
                  }`}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                  {scene.zoom === "in" ? "Наезд" : scene.zoom === "out" ? "Отъезд" : "Zoom"}
                </button>

                {/* B-roll chip */}
                {scene.broll_url ? (
                  <div className="flex items-center gap-1 h-8 pl-1 pr-1.5 rounded-md bg-surface-2 border border-border/40">
                    <video src={scene.broll_url} className="h-6 w-6 rounded object-cover bg-black" muted />
                    <span className="text-xs">B-roll</span>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-0.5"
                      onClick={() => clearMedia(scene.id, "broll")}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => triggerUpload(scene.id, "broll")}
                    disabled={uploadingId === scene.id}
                    className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs bg-surface-2 border border-border/40 hover:border-primary/40 transition-colors disabled:opacity-50"
                  >
                    {uploadingId === scene.id && uploadTarget === "broll" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    B-roll
                  </button>
                )}

                {/* Top video chip — only in split format */}
                {isSplit && (
                  scene.top_video_url ? (
                    <div className="flex items-center gap-1 h-8 pl-1 pr-1.5 rounded-md bg-surface-2 border border-border/40">
                      <video src={scene.top_video_url} className="h-6 w-6 rounded object-cover bg-black" muted />
                      <span className="text-xs">Верхний клип</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-0.5"
                        onClick={() => clearMedia(scene.id, "top")}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => triggerUpload(scene.id, "top")}
                      disabled={uploadingId === scene.id}
                      className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs bg-surface-2 border border-border/40 hover:border-primary/40 transition-colors disabled:opacity-50"
                    >
                      {uploadingId === scene.id && uploadTarget === "top" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
                      Верхний клип
                    </button>
                  )
                )}

                {/* Add more (upload custom) */}
                <button
                  type="button"
                  onClick={() => triggerUpload(scene.id, "broll")}
                  className="flex items-center justify-center h-8 w-8 rounded-md bg-surface-2 border border-border/40 hover:border-primary/40 transition-colors"
                  title="Загрузить вставку"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};
