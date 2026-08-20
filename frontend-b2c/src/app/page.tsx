import { PawPrint } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex items-center gap-3">
        <PawPrint className="size-10 text-brand" aria-hidden />
        <h1 className="text-4xl font-bold tracking-tight">VetoLib</h1>
      </div>
      <p className="text-muted-foreground text-lg">Portail propriétaires</p>
      <Button size="lg">Prendre rendez-vous</Button>
      <span className="text-muted-foreground rounded-full border px-3 py-1 font-mono text-sm">
        port 3000
      </span>
    </main>
  );
}
