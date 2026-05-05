import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Anchor, ZoomIn } from "lucide-react";
import { ReactNode, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { formatTime } from "@/lib/format";

interface Scene {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
  zoom: string;
  is_hook: boolean;
  highlight_words: string[];
}

export const ScenesPanel = ({ trigger, scenes, projectId }: { trigger: ReactNode; scenes: Scene[]; projectId: string }) => {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const save = async (id: string) => {
    await supabase.from("scenes").update({ text: editText }).eq("id", id);
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
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
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};
