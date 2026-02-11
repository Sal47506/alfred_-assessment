import ImageUpload from "./components/ImageUpload";

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-16">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Anki Notes
          </p>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">
            Capture images, turn them into cards.
          </h1>
          <p className="max-w-2xl text-base text-slate-300 sm:text-lg">
            Drop a screenshot, scan, or notes image to kick off your workflow.
          </p>
        </header>

        <ImageUpload />
      </div>
    </div>
  );
}

export default App;
