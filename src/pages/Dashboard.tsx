import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Video, LogOut, Loader2 } from "lucide-react";
import { formatDuration } from "@/lib/format";

const Dashboard = () => {
  const { user, signOut } = useAuth();

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
                  <Link key={p.id} to={link}>
                    <Card className="overflow-hidden bg-gradient-card border-border/60 hover:border-primary/40 transition-smooth cursor-pointer">
                      <div className="aspect-[9/16] bg-surface-2 relative overflow-hidden">
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
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
