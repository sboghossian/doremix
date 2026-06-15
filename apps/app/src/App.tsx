import { Navigate, Route, Routes } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { Library } from "@/screens/Library";
import { Brief } from "@/screens/Brief";
import { Booth } from "@/screens/Booth";

export function App() {
  return (
    <div className="min-h-full">
      <AppNav />
      <main className="animate-fade-in">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/brief" element={<Brief />} />
          <Route path="/booth" element={<Booth />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
