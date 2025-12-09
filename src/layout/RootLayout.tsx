export function RootLayout(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex h-screen flex-col">
        <header className="border-b border-border bg-card px-6 py-4">
          <h1 className="text-2xl font-bold">Orbit Agent</h1>
        </header>
        <main className="flex-1 overflow-hidden">
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">Welcome to Orbit Agent UI</p>
          </div>
        </main>
      </div>
    </div>
  )
}
