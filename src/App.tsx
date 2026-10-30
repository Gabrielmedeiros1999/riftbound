import { GameCanvas } from "./components/GameCanvas";

function App() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <header className="mx-auto mb-6 max-w-5xl">
        <p className="text-sm font-bold tracking-[0.3em] text-violet-400">
          PROJECT RIFTBOUND
        </p>

        <h1 className="mt-2 text-4xl font-black tracking-tight">
          Riftbound
        </h1>

        <p className="mt-2 text-slate-400">
          Sobreviva à fenda. Derrote as criaturas. Encontre seu caminho.
        </p>
      </header>

      <section className="mx-auto max-w-5xl">
        <div className="aspect-3/2 overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
          <GameCanvas />
        </div>

        <div className="mt-4 grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2">
          <div>
            <h2 className="font-bold text-violet-300">Controles</h2>
            <p className="mt-1 text-sm text-slate-400">
              WASD — movimentar o personagem
              <br />
              J — ataque básico
              <br />
              Espaço — esquiva
              <br />
              ESC — menu
            </p>
          </div>

          <div>
            <h2 className="font-bold text-violet-300">Objetivo atual</h2>
            <p className="mt-1 text-sm text-slate-400">
              Explore a arena e teste a movimentação isométrica.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;