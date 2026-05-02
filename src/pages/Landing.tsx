import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Zap, Wand2, Subtitles, Scissors, Play } from "lucide-react";
import { STYLE_LIST } from "@/lib/styles";
import { useAuth } from "@/hooks/useAuth";

const Landing = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-xl sticky top-0 z-50 bg-background/80">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">AutoCut AI</span>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <Button asChild>
                <Link to="/dashboard">Открыть редактор</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/auth">Войти</Link>
                </Button>
                <Button asChild>
                  <Link to="/auth">Начать бесплатно</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="container py-24 md:py-32 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-2 border border-border/60 text-sm text-muted-foreground mb-8">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI-режиссёр для вертикальных видео
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6">
            Загружай видео — <br />
            <span className="text-gradient">AI делает viral-монтаж</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Автоматическая нарезка, динамические субтитры, зумы и хайлайты под выбранный стиль.
            Готовый Reels за минуты, а не часы.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" className="text-base h-12 px-8 shadow-glow" asChild>
              <Link to={user ? "/dashboard" : "/auth"}>
                <Zap className="mr-2 h-5 w-5" />
                Создать ролик
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base h-12 px-8">
              <Play className="mr-2 h-4 w-4" />
              Посмотреть демо
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-24">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">
          Всё, что нужно для viral-контента
        </h2>
        <p className="text-muted-foreground text-center mb-16 max-w-xl mx-auto">
          AI понимает смысл вашего видео и сам собирает монтаж как pro-редактор
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Subtitles,
              title: "Умные субтитры",
              desc: "Word-by-word синхронизация, выделение ключевых слов цветом",
            },
            {
              icon: Scissors,
              title: "AI-нарезка",
              desc: "Анализ смысла и эмоций — сцены под темп выбранного стиля",
            },
            {
              icon: Wand2,
              title: "Авто-зумы",
              desc: "Динамические зумы на самых ярких моментах для удержания",
            },
          ].map((f) => (
            <Card key={f.title} className="p-6 bg-gradient-card border-border/60 hover:border-primary/40 transition-smooth">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <f.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Styles */}
      <section className="container py-24 border-t border-border/40">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">
          4 стиля монтажа
        </h2>
        <p className="text-muted-foreground text-center mb-16">
          Выбери настроение — AI подстроит темп, субтитры и эффекты
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STYLE_LIST.map((s) => (
            <Card key={s.id} className="p-6 bg-gradient-card border-border/60 hover:border-primary/40 transition-smooth">
              <div className="text-4xl mb-3">{s.emoji}</div>
              <h3 className="font-semibold mb-1">{s.name}</h3>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container py-24 text-center">
        <Card className="p-12 bg-gradient-card border-primary/30 shadow-glow">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Готов сделать первый ролик?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Регистрация за 30 секунд. Бесплатные кредиты в подарок.
          </p>
          <Button size="lg" className="h-12 px-8" asChild>
            <Link to={user ? "/dashboard" : "/auth"}>
              <Sparkles className="mr-2 h-5 w-5" />
              Начать бесплатно
            </Link>
          </Button>
        </Card>
      </section>

      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        © 2026 AutoCut AI · AI-редактор вертикальных видео
      </footer>
    </div>
  );
};

export default Landing;
