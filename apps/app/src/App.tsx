import { Navigate, Route, Routes } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { MeshBackground } from "@/components/MeshBackground";
import { Sets } from "@/screens/Sets";
import { SetWorkspace } from "@/screens/SetWorkspace";

export function App() {
  return (
    <div className="relative min-h-full">
      <MeshBackground />
      <AppNav />
      <main className="animate-fade-in">
        <Routes>
          <Route path="/" element={<Sets />} />
          <Route path="/set/:id" element={<SetWorkspace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
