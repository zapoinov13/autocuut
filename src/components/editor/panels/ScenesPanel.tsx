import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Anchor, ZoomIn, Upload, Trash2, Layers, Loader2 } from "lucide-react";
import { ReactNode, useRef, useState } from "react";
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

export const ScenesPanel = ({ trigger, scenes, projectId, userId, format }: Props) => {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const isSplit = format === "split";

  const save = async (id: string) => {
    await supabase.from("scenes").update({ text: editText }).eq("id", id);
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
  };

  const uploadTop = async (sceneId: string, file: File) => {
    setUploadingId(sceneId);
    const path = `${userId}/${projectId}/scene-${sceneId}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("brolls").upload(path, file);
    if (error) { toast.error(error.message); setUploadingId(null); return; }
    // brolls bucket private — generate signed url for ~7d (we'll just save the path; or use signed url)
    const { data: signed } = await supabase.storage.from("brolls").createSignedUrl(path, 60 * 60 * 24 * 30);
    await supabase.from("scenes").update({ top_video_url: signed?.signedUrl ?? null }).eq("id", sceneId);
    setUploadingId(null);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
    toast.success("Верхнее видео назначено");
  };

  const clearTop = async (sceneId: string) => {
    await supabase.from("scenes").update({ top_video_url: null }).eq("id", sceneId);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-[440px] sm:w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Сцены ({scenes.length})</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {scenes.map((scene) => {
            const isEditing = editingId === scene.id;
            return (
              <div key={scene.id}>
                <div className="flex items-center gap-2 mb-1.5">
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
                    if (!isEditing) { setEditingId(scene.id); setEditText(scene.text); }
                  }}
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[60px] text-sm bg-surface-2" autoFocus />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingId(null); }}>Отмена</Button>
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); save(scene.id); }}>Сохранить</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed">{scene.text}</p>
                  )}
                </Card>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {scene.zoom !== "none" && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <ZoomIn className="h-2.5 w-2.5" />
                      Зум {scene.zoom === "in" ? "наезд" : "отъезд"}
                    </Badge>
                  )}
                  {(scene.highlight_words ?? []).slice(0, 3).map((w, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">{w}</Badge>
                  ))}
                </div>

                {isSplit && (
                  <div className="mt-2 p-2 rounded-md bg-surface-2/50 border border-border/30 flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}>
                    <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-[11px] text-muted-foreground flex-1 truncate">
                      {scene.top_video_url ? "✓ Верхний клип назначен" : "Верх пуст"}
                    </span>
                    <input
                      ref={(el) => { fileInputs.current[scene.id] = el; }}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadTop(scene.id, e.target.files[0])}
                    />
                    <Button size="sm" variant="ghost" className="h-7 px-2"
                      onClick={() => fileInputs.current[scene.id]?.click()}
                      disabled={uploadingId === scene.id}>
                      {uploadingId === scene.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    </Button>
                    {scene.top_video_url && (
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => clearTop(scene.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};
