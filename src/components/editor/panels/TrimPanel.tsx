import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ReactNode, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { formatTime } from "@/lib/format";
import { toast } from "sonner";

interface Props {
  trigger: ReactNode;
  projectId: string;
  duration: number;
  trimStart: number | null;
  trimEnd: number | null;
}

export const TrimPanel = ({ trigger, projectId, duration, trimStart, trimEnd }: Props) => {
  const qc = useQueryClient();
  const [range, setRange] = useState<[number, number]>([trimStart ?? 0, trimEnd ?? duration]);

  const save = async () => {
    await supabase.from("projects").update({ trim_start: range[0], trim_end: range[1] }).eq("id", projectId);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
    toast.success("Обрезка сохранена");
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-[400px]">
        <SheetHeader><SheetTitle>Обрезать видео</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-6">
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>Старт: {formatTime(range[0])}</span>
              <span>Конец: {formatTime(range[1])}</span>
            </div>
            <Slider
              min={0} max={duration} step={0.1}
              value={range}
              onValueChange={(v) => setRange([v[0], v[1]] as [number, number])}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Длительность после обрезки: {formatTime(range[1] - range[0])}
            </p>
          </div>
          <Button onClick={save} className="w-full">Сохранить обрезку</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
