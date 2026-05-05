import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Music, Upload, Play, Pause, Trash2 } from "lucide-react";
import { ReactNode, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  trigger: ReactNode;
  projectId: string;
  userId: string;
  musicUrl: string | null;
  musicVolume: number;
}

const LIBRARY = [
  { name: "Lo-Fi Chill", url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3" },
  { name: "Corporate Upbeat", url: "https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73467.mp3" },
  { name: "Energetic Pop", url: "https://cdn.pixabay.com/audio/2023/05/15/audio_3df5e3d9f3.mp3" },
  { name: "Inspiring Cinematic", url: "https://cdn.pixabay.com/audio/2022/10/25/audio_4e3c1e5354.mp3" },
];

export const MusicPanel = ({ trigger, projectId, userId, musicUrl, musicVolume }: Props) => {
  const qc = useQueryClient();
  const [volume, setVolume] = useState(musicVolume);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = (url: string) => {
    if (audioRef.current) { audioRef.current.pause(); }
    if (playing === url) { setPlaying(null); return; }
    const a = new Audio(url);
    a.volume = 0.5;
    a.play();
    audioRef.current = a;
    setPlaying(url);
    a.onended = () => setPlaying(null);
  };

  const apply = async (url: string) => {
    await supabase.from("projects").update({ music_url: url, music_volume: volume }).eq("id", projectId);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
    toast.success("Музыка добавлена");
  };

  const remove = async () => {
    await supabase.from("projects").update({ music_url: null }).eq("id", projectId);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
    toast.success("Музыка удалена");
  };

  const updateVolume = async (v: number) => {
    setVolume(v);
    await supabase.from("projects").update({ music_volume: v }).eq("id", projectId);
    qc.invalidateQueries({ queryKey: ["editor", projectId] });
  };

  const upload = async (file: File) => {
    const path = `${userId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("music").upload(path, file);
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("music").getPublicUrl(path);
    apply(data.publicUrl);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-[420px] overflow-y-auto">
        <SheetHeader><SheetTitle>Фоновая музыка</SheetTitle></SheetHeader>

        <div className="mt-6 space-y-5">
          {musicUrl && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm">
                  <Music className="h-4 w-4 text-primary" />
                  Музыка добавлена
                </div>
                <Button size="sm" variant="ghost" onClick={remove}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Label className="text-xs">Громкость: {volume}%</Label>
              <Slider value={[volume]} min={0} max={100} step={1} className="mt-2"
                onValueChange={(v) => setVolume(v[0])}
                onValueCommit={(v) => updateVolume(v[0])} />
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Библиотека</Label>
            <div className="space-y-2 mt-2">
              {LIBRARY.map((track) => (
                <div key={track.url} className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-1 border border-border/40">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => preview(track.url)}>
                    {playing === track.url ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <span className="text-sm flex-1 truncate">{track.name}</span>
                  <Button size="sm" variant={musicUrl === track.url ? "default" : "outline"} onClick={() => apply(track.url)}>
                    {musicUrl === track.url ? "Активна" : "Выбрать"}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Загрузить свой mp3
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
