import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette, RotateCcw } from "lucide-react";
import {
  STYLE_LIST, STYLES, StyleId, SubtitleStyle, FONT_OPTIONS, POSITION_OPTIONS,
  DEFAULT_CUSTOM_STYLE, loadCustomStyle, saveCustomStyle,
} from "@/lib/styles";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
  styleId: StyleId;
  onPick: (id: StyleId) => void;
  onCustomChange: (s: SubtitleStyle) => void;
}

export const StylePanel = ({ styleId, onPick, onCustomChange }: Props) => {
  const [custom, setCustom] = useState<SubtitleStyle>(() => loadCustomStyle());

  useEffect(() => { onCustomChange(custom); }, [custom, onCustomChange]);

  const update = <K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) => {
    const next = { ...custom, [key]: value };
    setCustom(next);
    saveCustomStyle(next);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Palette className="mr-2 h-4 w-4" />
          Стиль субтитров
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Стиль субтитров</SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          <Label className="text-xs text-muted-foreground">Готовые пресеты</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {STYLE_LIST.filter(s => s.id !== "custom").map((s) => (
              <button
                key={s.id}
                onClick={() => onPick(s.id)}
                className={`text-left p-3 rounded-lg border transition-smooth hover:border-primary/60 ${
                  styleId === s.id ? "border-primary bg-primary/5" : "border-border/60 bg-surface-1"
                }`}
              >
                <div className="text-lg">{s.emoji}</div>
                <p className="text-sm font-medium mt-1">{s.name}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{s.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border/40">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">🎨 Свой стиль</p>
              <p className="text-xs text-muted-foreground">Настрой субтитры под себя</p>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => { setCustom(DEFAULT_CUSTOM_STYLE); saveCustomStyle(DEFAULT_CUSTOM_STYLE); toast.success("Сброшено"); }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={() => onPick("custom")}
                variant={styleId === "custom" ? "default" : "outline"}
                className="h-8 text-xs"
              >
                {styleId === "custom" ? "Активен" : "Применить"}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Font */}
            <div>
              <Label className="text-xs">Шрифт</Label>
              <Select value={custom.fontFamily} onValueChange={(v) => update("fontFamily", v as any)}>
                <SelectTrigger className="mt-1.5 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      <span style={{ fontFamily: `"${f.value}"` }}>{f.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Position */}
            <div>
              <Label className="text-xs">Позиция</Label>
              <Select value={custom.position} onValueChange={(v) => update("position", v as any)}>
                <SelectTrigger className="mt-1.5 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Size */}
            <div>
              <div className="flex justify-between items-center">
                <Label className="text-xs">Размер</Label>
                <span className="text-xs text-muted-foreground tabular-nums">{custom.fontSize}px</span>
              </div>
              <Slider value={[custom.fontSize]} min={18} max={72} step={1} className="mt-2"
                onValueChange={(v) => update("fontSize", v[0])} />
            </div>

            {/* Weight */}
            <div>
              <div className="flex justify-between items-center">
                <Label className="text-xs">Жирность</Label>
                <span className="text-xs text-muted-foreground tabular-nums">{custom.fontWeight}</span>
              </div>
              <Slider value={[custom.fontWeight]} min={300} max={900} step={100} className="mt-2"
                onValueChange={(v) => update("fontWeight", v[0])} />
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-3">
              <ColorPick label="Цвет текста" value={custom.color} onChange={(v) => update("color", v)} />
              <ColorPick label="Подсветка слова" value={custom.highlightColor} onChange={(v) => update("highlightColor", v)} />
            </div>

            {/* Stroke */}
            <div>
              <div className="flex justify-between items-center">
                <Label className="text-xs">Обводка</Label>
                <span className="text-xs text-muted-foreground tabular-nums">{custom.strokeWidth}px</span>
              </div>
              <Slider value={[custom.strokeWidth]} min={0} max={6} step={0.5} className="mt-2"
                onValueChange={(v) => update("strokeWidth", v[0])} />
              {custom.strokeWidth > 0 && (
                <div className="mt-2">
                  <ColorPick label="Цвет обводки" value={custom.strokeColor} onChange={(v) => update("strokeColor", v)} />
                </div>
              )}
            </div>

            {/* Shadow */}
            <div>
              <div className="flex justify-between items-center">
                <Label className="text-xs">Тень (размытие)</Label>
                <span className="text-xs text-muted-foreground tabular-nums">{custom.shadowBlur}px</span>
              </div>
              <Slider value={[custom.shadowBlur]} min={0} max={30} step={1} className="mt-2"
                onValueChange={(v) => update("shadowBlur", v[0])} />
            </div>

            {/* Background */}
            <div>
              <Label className="text-xs">Фон-плашка</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {[
                  { v: "transparent", l: "Нет" },
                  { v: "rgba(0,0,0,0.55)", l: "Тёмная" },
                  { v: "rgba(255,255,255,0.85)", l: "Светлая" },
                ].map((o) => (
                  <button
                    key={o.v}
                    onClick={() => update("background", o.v)}
                    className={`text-xs h-9 rounded-md border ${
                      custom.background === o.v ? "border-primary bg-primary/5" : "border-border/60"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Uppercase */}
            <div className="flex items-center justify-between p-3 rounded-md bg-surface-1">
              <Label className="text-sm">ВЕРХНИЙ РЕГИСТР</Label>
              <Switch checked={custom.uppercase} onCheckedChange={(v) => update("uppercase", v)} />
            </div>

            {/* Live preview */}
            <div className="rounded-lg bg-black p-6 flex items-center justify-center min-h-[100px]">
              <span
                style={{
                  fontFamily: `"${custom.fontFamily}"`,
                  fontSize: `${Math.min(custom.fontSize, 36)}px`,
                  fontWeight: custom.fontWeight,
                  color: custom.color,
                  WebkitTextStroke: custom.strokeWidth > 0 ? `${custom.strokeWidth}px ${custom.strokeColor}` : undefined,
                  textShadow: custom.shadowBlur > 0 ? `0 4px ${custom.shadowBlur}px ${custom.shadowColor}` : undefined,
                  textTransform: custom.uppercase ? "uppercase" : "none",
                  background: custom.background !== "transparent" ? custom.background : undefined,
                  padding: custom.background !== "transparent" ? "6px 12px" : undefined,
                  borderRadius: 8,
                }}
              >
                Привет <span style={{ color: custom.highlightColor }}>мир</span>!
              </span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const ColorPick = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <div className="flex gap-2 mt-1.5">
      <input
        type="color"
        value={value.startsWith("#") ? value : "#FFFFFF"}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 rounded-md border border-border bg-transparent cursor-pointer"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-xs font-mono" />
    </div>
  </div>
);
