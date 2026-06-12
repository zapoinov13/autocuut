import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Anchor, Copy, Save } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  trigger: ReactNode;
  projectId: string;
  titleSuggestion: string | null;
  fallbackTitle: string;
}

export const HookTitlePanel = ({ trigger, projectId, titleSuggestion, fallbackTitle }: Props) => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(titleSuggestion ?? fallbackTitle);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValue(titleSuggestion ?? fallbackTitle);
  }, [open, titleSuggestion, fallbackTitle]);

  const save = async () => {
    const next = value.trim();
    if (!next) {
      toast.error("Заголовок не может быть пустым");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("projects").update({ title_suggestion: next }).eq("id", projectId);
    setSaving(false);
    if (error) {
      toast.error("Не удалось сохранить", { description: error.message });
      return;
    }
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
    toast.success("Заголовок-крючок сохранён");
    setOpen(false);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(value.trim());
    toast.success("Скопировано в буфер");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-[420px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Anchor className="h-4 w-4 text-primary" />
            Заголовок-крючок
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Короткий цепляющий заголовок для обложки и первого кадра. AI генерирует его при анализе сцен — здесь можно отредактировать.
          </p>
          <div>
            <Label className="text-xs">Текст заголовка</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={80}
              className="mt-1.5"
              placeholder="Например: 3 ошибки, из-за которых SMM не работает"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">{value.length}/80 символов</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              Сохранить
            </Button>
            <Button variant="outline" onClick={copy}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
