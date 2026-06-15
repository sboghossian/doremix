import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession, fileToTrack } from "@/store/SessionContext";
import type { PlaylistMatch, Track } from "@/types";
import { TrackChips } from "@/components/TrackChips";
import { fmtDuration } from "@/data/mockLibrary";
import { DoremixMark } from "@/components/Wordmark";

export function Library() {
  const { library, addTracks, importPlaylistText } = useSession();
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [matches, setMatches] = useState<PlaylistMatch[] | null>(null);
  const [paste, setPaste] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function ingestFiles(files: FileList | File[]) {
    const tracks: Track[] = Array.from(files).map((f) => fileToTrack(f.name));
    if (tracks.length > 0) addTracks(tracks);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      ingestFiles(e.dataTransfer.files);
    }
  }

  function runImport() {
    if (!paste.trim()) return;
    setMatches(importPlaylistText(paste));
  }

  const matchedCount = matches?.filter((m) => m.matched).length ?? 0;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tightish">
            Your library
          </h1>
          <p className="mt-1 font-body text-sm text-mist">
            {library.length} tracks analyzed. They never leave your machine.
          </p>
        </div>
        <button
          onClick={() => navigate("/brief")}
          disabled={library.length === 0}
          className="rounded-lg bg-energy px-5 py-2.5 font-display text-sm font-semibold text-ink transition-transform duration-150 ease-confident hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
        >
          New set
        </button>
      </div>

      {/* Drag-drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInput.current?.click()}
        className={`mb-8 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 ease-confident ${
          dragOver ? "border-energy2 bg-ink-2" : "border-ink-3 hover:border-mist/40"
        }`}
      >
        <DoremixMark size={28} />
        <p className="mt-3 font-display text-base text-paper">
          Drag your tracks in — they never leave your machine
        </p>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-mist">
          mp3 · wav · flac · m4a · aiff · drop a folder
        </p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".mp3,.wav,.flac,.m4a,.aiff,.ogg,audio/*"
          className="hidden"
          onChange={(e) => e.target.files && ingestFiles(e.target.files)}
        />
      </div>

      {/* Import from Spotify */}
      <div className="mb-10 panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold">Import from Spotify</h2>
            <p className="font-body text-xs text-mist">
              Paste a playlist (or upload a screenshot). We match names to your library —
              nothing streams, your files do the playing.
            </p>
          </div>
          <button
            onClick={() => setImporting((v) => !v)}
            className="btn-ghost text-xs"
          >
            {importing ? "Close" : "Paste playlist"}
          </button>
        </div>

        {importing && (
          <div className="animate-fade-in">
            <div className="flex flex-col gap-3 md:flex-row">
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={
                  "Salt Air - Mara Vance\nMarble Run - Tessellate\nSome Track Not In Library\nPhosphor - VYL"
                }
                className="h-32 flex-1 resize-none rounded-lg border border-ink-3 bg-ink p-3 font-mono text-xs text-paper outline-none focus:border-mist/40 scroll-thin"
              />
              <div className="flex w-full flex-row gap-2 md:w-44 md:flex-col">
                <button
                  onClick={runImport}
                  className="rounded-lg bg-energy px-4 py-2 font-display text-sm font-semibold text-ink"
                >
                  Match playlist
                </button>
                <button
                  className="btn-ghost text-xs"
                  title="Screenshot OCR is a stub in the prototype"
                  onClick={() =>
                    setPaste(
                      "1. Salt Air - Mara Vance\n2. Marble Run - Tessellate\n3. Sunset Track - Unknown\n4. Phosphor - VYL\n5. Gold Teeth - Amani Sound",
                    )
                  }
                >
                  Upload screenshot
                </button>
              </div>
            </div>

            {matches && (
              <div className="mt-4 animate-fade-in">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-mist">
                  {matchedCount} / {matches.length} in your library
                </p>
                <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                  {matches.map((m, i) => (
                    <li
                      key={i}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                        m.matched
                          ? "border-ink-3 bg-ink-2"
                          : "border-ink-3/60 bg-ink-2/40"
                      }`}
                    >
                      <span
                        className={`font-mono text-xs ${
                          m.matched ? "text-paper" : "text-mist line-through"
                        }`}
                      >
                        {m.matched ? `${m.matched.artist} — ${m.matched.title}` : m.query}
                      </span>
                      <span
                        className={`font-mono text-[10px] uppercase ${
                          m.matched ? "text-energy3" : "text-mist/60"
                        }`}
                      >
                        {m.matched ? "matched" : "not in library"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Library list */}
      {library.length === 0 ? (
        <div className="rounded-xl border border-ink-3 bg-ink-2 px-6 py-16 text-center">
          <p className="font-display text-lg text-mist">Nothing here yet.</p>
          <p className="font-body text-sm text-mist/70">
            Drag in your tracks above. Doremix analyzes BPM, key and energy locally.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-3">
          <div className="grid grid-cols-[1fr_auto] items-center border-b border-ink-3 bg-ink-2 px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-mist">
            <span>Track</span>
            <span className="pr-1">Analysis</span>
          </div>
          <ul>
            {library.map((t, i) => (
              <li
                key={t.id}
                className={`grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 ${
                  i % 2 === 0 ? "bg-ink" : "bg-ink-2/40"
                } transition-colors duration-150 hover:bg-ink-2`}
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-sm text-paper">{t.title}</p>
                  <p className="truncate font-body text-xs text-mist">
                    {t.artist} · <span className="uppercase">{t.genre}</span> ·{" "}
                    <span className="font-mono">{fmtDuration(t.duration)}</span>
                  </p>
                </div>
                <TrackChips track={t} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
