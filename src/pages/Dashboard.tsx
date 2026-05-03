import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sparkles, Plus, Video, LogOut, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { toast } from "sonner";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();
  const [renameProject, setRenameProject] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteProject, setDeleteProject] = useState<{ id: string; title: string; video_path?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const statusLabel: Record<string, { label: string; className: string }> = {
    uploading: { label: "Загрузка", className: "bg-blue-500/20 text-blue-400" },
    transcribing: { label: "Транскрипция", className: "bg-purple-500/20 text-purple-400" },
    analyzing: { label: "AI-анализ", className: "bg-primary/20 text-primary" },
    ready: { label: "Готово", className: "bg-success/20 text-success" },
    failed: { label: "Ошибка", className: "bg-destructive/20 text-destructive" },
  };

  const handleRename = async () => {
    if (!renameProject || !renameValue.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("projects")
      .update({ title: renameValue.trim() })
      .eq("id", renameProject.id);
    setBusy(false);
    if (error) {
      toast.error("Не удалось переименовать");
    } else {
      toast.success("Название обновлено");
      setRenameProject(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
    }
  };

  const handleDelete = async () => {
    if (!deleteProject) return;
    setBusy(true);
    // Best-effort delete of related rows + storage object
    await supabase.from("scenes").delete().eq("project_id", deleteProject.id);
    await supabase.from("subtitles").delete().eq("project_id", deleteProject.id);
    if (deleteProject.video_path) {
      await supabase.storage.from("videos").remove([deleteProject.video_path]);
    }
    const { error } = await supabase.from("projects").delete().eq("id", deleteProject.id);
    setBusy(false);
    if (error) {
      toast.error("Не удалось удалить проект");
    } else {
      toast.success("Проект удалён");
      setDeleteProject(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 backdrop-blur-xl sticky top-0 z-50 bg-background/80">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">AutoCut AI</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut} title="Выйти">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-10">
        {/* Quick start */}
        <section className="mb-12">
          <h1 className="text-3xl font-bold mb-2">Быстрый старт</h1>
          <p className="text-muted-foreground mb-6">Создайте новый ролик или продолжите работу</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/upload">
              <Card className="p-6 bg-gradient-card border-primary/40 hover:border-primary hover:shadow-glow transition-smooth cursor-pointer h-full">
                <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center mb-4 shadow-glow">
                  <Plus className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-semibold mb-1">AI Авто-монтаж</h3>
                <p className="text-xs text-muted-foreground">Загрузи видео — AI сделает остальное</p>
              </Card>
            </Link>
            {[
              { title: "Magic Clips", desc: "Шортсы из длинного видео", emoji: "✂️" },
              { title: "Combine Videos", desc: "Объединение клипов", emoji: "🎬" },
              { title: "AI Avatar", desc: "Видео с AI-аватаром", emoji: "🤖" },
            ].map((card) => (
              <Card key={card.title} className="p-6 bg-gradient-card border-border/60 opacity-60 cursor-not-allowed h-full">
                <div className="text-3xl mb-3">{card.emoji}</div>
                <h3 className="font-semibold mb-1">{card.title}</h3>
                <p className="text-xs text-muted-foreground">{card.desc}</p>
                <Badge variant="outline" className="mt-3 text-[10px]">Скоро</Badge>
              </Card>
            ))}
          </div>
        </section>

        {/* Projects */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Мои проекты</h2>
            <Button asChild>
              <Link to="/upload">
                <Plus className="mr-2 h-4 w-4" /> Новый проект
              </Link>
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !projects || projects.length === 0 ? (
            <Card className="p-16 text-center bg-gradient-card border-dashed">
              <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Пока нет проектов</h3>
              <p className="text-muted-foreground text-sm mb-6">Загрузите первое видео и AI сделает монтаж</p>
              <Button asChild>
                <Link to="/upload">
                  <Plus className="mr-2 h-4 w-4" /> Создать проект
                </Link>
              </Button>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {projects.map((p) => {
                const status = statusLabel[p.status] ?? statusLabel.uploading;
                const link = p.status === "ready" ? `/editor/${p.id}` : `/processing/${p.id}`;
                return (
                  <Card key={p.id} className="overflow-hidden bg-gradient-card border-border/60 hover:border-primary/40 transition-smooth relative group">
                    <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="secondary" size="icon" className="h-7 w-7 bg-black/60 hover:bg-black/80 border-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              setRenameValue(p.title);
                              setRenameProject({ id: p.id, title: p.title });
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Переименовать
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.preventDefault();
                              setDeleteProject({ id: p.id, title: p.title, video_path: p.video_path });
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Link to={link}>
                      <div className="aspect-[9/16] bg-surface-2 relative overflow-hidden cursor-pointer">
                        {p.thumbnail_url ? (
                          <img src={p.thumbnail_url} alt={p.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Video className="h-10 w-10 text-muted-foreground" />
                          </div>
                        )}
                        <Badge className={`absolute top-2 right-2 ${status.className} border-0 text-[10px]`}>
                          {status.label}
                        </Badge>
                        {p.duration && (
                          <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded text-[11px] text-white">
                            {formatDuration(p.duration)}
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-medium truncate">{p.title_suggestion ?? p.title}</p>
                        {p.viral_score !== null && p.viral_score !== undefined && (
                          <div className="flex items-center gap-1 mt-1">
                            <Sparkles className="h-3 w-3 text-primary" />
                            <span className="text-xs text-muted-foreground">Viral score: {p.viral_score}</span>
                          </div>
                        )}
                      </div>
                    </Link>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Rename dialog */}
      <Dialog open={!!renameProject} onOpenChange={(open) => !open && setRenameProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать проект</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Название проекта"
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameProject(null)}>Отмена</Button>
            <Button onClick={handleRename} disabled={busy || !renameValue.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteProject} onOpenChange={(open) => !open && setDeleteProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить проект?</AlertDialogTitle>
            <AlertDialogDescription>
              Проект «{deleteProject?.title}» и все связанные данные (сцены, субтитры, видеофайл) будут удалены безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
