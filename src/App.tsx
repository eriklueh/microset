import { Button } from "@/components/ui/button";

function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">microset</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          Tu coach de pausas activas para el home office. Pronto te va a avisar
          cuándo toca tu próxima serie de dominadas o fondos.
        </p>
      </div>
      <div className="flex gap-3">
        <Button>Empezar</Button>
        <Button variant="outline">Configurar rutina</Button>
      </div>
      <p className="text-muted-foreground text-xs">
        M0 — scaffold listo · Tauri + React + Tailwind + shadcn
      </p>
    </main>
  );
}

export default App;
