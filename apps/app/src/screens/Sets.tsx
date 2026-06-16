import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession, fileToTrack } from "@/store/SessionContext";
import { importScreenshot } from "@/conductor/screenshotImport";
import type { DoremixSet, PlaylistMatch, Track } from "@/types";
import { SetThumbnail } from "@/components/SetThumbnail";
import { TrackChips } from "@/components/TrackChips";
import { DoremixMark } from "@/components/Wordmark";
import { fmtDuration } from "@/data/mockLibrary";
import { bpmRange, relativeTime } from "@/lib/arc";

/** One project card on the dashboard. */
function SetCard({ set }: { set: DoremixSet }) {
  const { library, renameSet, deleteSet } = useSession();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(set.name);

  const crateTracks = library.filter((t) => set.crate.includes(t.id));
  const live = set.cueSheet !== null;

  function commitName() {
    renameSet(set.id, name);
    setEditing(false);
  }

  return (
    <div className="group glass relative flex flex-col overflow-hidden p-0 transition-transform duration-200 ease-confident hover:-translate-y-1 hover:shadow-glow-violet">
      {/* thumbnail */}
      <button
        onClick={() => navigate(`/set/${set.id}`)}
        className="relative block w-full bg-black/20 px-3 pt-3 text-left"
        aria-label={`Open ${set.name}`}
      >
        <SetThumbnail arc={set.brief.arc} sheet={set.cueSheet} uid={set.id} height={72} />
        {live && (
          <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-ink/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-live backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-live" />
            spun
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col p-4">
        {/* editable name */}
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setName(set.name);
                setEditing(false);
              }
            }}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1 font-display text-lg font-semibold text-paper outline-none focus:border-cyan/60"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-left font-display text-lg font-semibold tracking-tightish text-paper hover:text-spectrum"
            title="Click to rename"
          >
            {set.name}
          </button>
        )}

        <p className="mt-1 line-clamp-2 min-h-[2.4em] font-body text-sm text-mist">
          {set.brief.text.trim() || "No vibe yet — open to describe the night."}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="chip">{set.brief.lengthMin} min</span>
          <span className="chip">{bpmRange(crateTracks)} BPM</span>
          <span className="chip">{crateTracks.length} tracks</span>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-[11px] text-mist/70">
            {relativeTime(set.updatedAt)}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => deleteSet(set.id)}
              className="font-mono text-[11px] text-mist/50 opacity-0 transition-opacity hover:text-magenta group-hover:opacity-100"
            >
              delete
            </button>
            <button
              onClick={() => navigate(`/set/${set.id}`)}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The glowing "New set" CTA card. */
function NewSetCard() {
  const { createSet } = useSession();
  const navigate = useNavigate();
  function go() {
    const s = createSet();
    navigate(`/set/${s.id}`);
  }
  return (
    <button
      onClick={go}
      className="group glass relative flex min-h-[260px] flex-col items-center justify-center gap-3 p-6 text-center transition-transform duration-200 ease-confident hover:-translate-y-1 hover:shadow-glow-magenta"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-spectrum bg-[length:200%_auto] text-3xl font-light text-ink shadow-glow-magenta animate-gradient-pan">
        +
      </span>
      <span className="font-display text-lg font-semibold text-paper">New set</span>
      <span className="font-body text-sm text-mist">
        Describe the night, Doremix spins it.
      </span>
    </button>
  );
}

/** The shared global crate (library) — collapsible, drag-drop + Spotify match. */
function GlobalCrate() {
  const { library, addTracks, importPlaylistText } = useSession();
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [paste, setPaste] = useState("");
  const [matches, setMatches] = useState<PlaylistMatch[] | null>(null);
  const [shotBusy, setShotBusy] = useState(false);
  const [shotNote, setShotNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const shotInput = useRef<HTMLInputElement>(null);

  function ingest(files: FileList | File[]) {
    // Keep the real File on each Track so the RealEngine can decode it.
    const tracks: Track[] = Array.from(files)
      .filter((f) => /\.(mp3|wav|flac|m4a|aiff|ogg)$/i.test(f.name) || f.type.startsWith("audio/"))
      .map((f) => fileToTrack(f.name, f));
    if (tracks.length > 0) addTracks(tracks);
  }

  /**
   * Upload a playlist screenshot → vision model reads the songs → feed the
   * names through the SAME fuzzy matcher the pasted-text import uses, so the
   * matched/not-in-crate UI below renders identically.
   */
  async function ingestScreenshot(file: File) {
    setShotBusy(true);
    setShotNote(null);
    const res = await importScreenshot(file);
    setShotBusy(false);
    if (!res.ok) {
      setShotNote(res.message);
      return;
    }
    const text = res.tracks
      .map((t) => (t.artist ? `${t.artist} - ${t.title}` : t.title))
      .join("\n");
    setPaste(text);
    setMatches(importPlaylistText(text));
    setShotNote(`Read ${res.tracks.length} songs from the screenshot.`);
  }

  const matchedCount = matches?.filter((m) => m.matched).length ?? 0;

  return (
    <div className="glass mt-10 p-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <div className="text-left">
          <h2 className="font-display text-base font-semibold text-paper">
            Your crate
          </h2>
          <p className="font-body text-xs text-mist">
            {library.length} tracks, shared across every set. They never leave your
            machine.
          </p>
        </div>
        <span className="font-mono text-xs text-mist">{open ? "hide" : "manage"}</span>
      </button>

      {open && (
        <div className="mt-5 animate-fade-in">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length > 0) ingest(e.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-glass border-2 border-dashed px-6 py-8 text-center transition-colors duration-150 ${
              dragOver ? "border-cyan bg-white/5" : "border-white/15 hover:border-white/30"
            }`}
          >
            <DoremixMark size={26} />
            <p className="mt-3 font-display text-sm text-paper">
              Drop your tracks in — they never leave your machine
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
              onChange={(e) => e.target.files && ingest(e.target.files)}
            />
          </div>

          {/* Spotify match — paste a tracklist OR upload a screenshot */}
          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={"Salt Air - Mara Vance\nMarble Run - Tessellate\nPhosphor - VYL"}
              className="h-24 flex-1 resize-none rounded-glass border border-white/12 bg-black/30 p-3 font-mono text-xs text-paper outline-none focus:border-cyan/50 scroll-thin"
            />
            <div className="flex flex-col gap-2 md:w-44">
              <button
                type="button"
                onClick={() => paste.trim() && setMatches(importPlaylistText(paste))}
                className="btn-spectrum h-fit px-4 py-2 text-sm"
              >
                Match playlist
              </button>
              <button
                type="button"
                onClick={() => shotInput.current?.click()}
                disabled={shotBusy}
                className="btn-ghost h-fit px-4 py-2 text-sm disabled:opacity-50"
                title="Read a Spotify/playlist screenshot with your OpenRouter key"
              >
                {shotBusy ? "reading…" : "Upload screenshot"}
              </button>
              <input
                ref={shotInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void ingestScreenshot(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {shotNote && (
            <p className="mt-2 font-mono text-[11px] text-mist animate-fade-in">{shotNote}</p>
          )}

          {matches && (
            <div className="mt-3 animate-fade-in">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-mist">
                {matchedCount} / {matches.length} in your crate
              </p>
              <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {matches.map((m, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-white/8 bg-white/5 px-3 py-2"
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
                        m.matched ? "text-teal" : "text-mist/60"
                      }`}
                    >
                      {m.matched ? "matched" : "not in crate"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* crate list */}
          <ul className="mt-4 grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {library.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-sm text-paper">{t.title}</p>
                  <p className="truncate font-body text-xs text-mist">
                    {t.artist} · <span className="font-mono">{fmtDuration(t.duration)}</span>
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

export function Sets() {
  const { sets } = useSession();

  return (
    <div className="mx-auto max-w-[1480px] px-5 py-10">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-bold tracking-tightish text-spectrum md:text-5xl">
          Your sets
        </h1>
        <p className="mt-2 font-body text-base text-mist">
          One set, one project. Describe the night, steer it live.
        </p>
      </div>

      {sets.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center px-6 py-20 text-center">
          <DoremixMark size={40} />
          <p className="mt-4 font-display text-xl text-paper">
            Drop your tracks, start your first set.
          </p>
          <p className="mt-1 font-body text-sm text-mist">
            Doremix analyzes BPM, key and energy locally — nothing leaves your machine.
          </p>
          <div className="mt-8 w-full max-w-xs">
            <NewSetCard />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <NewSetCard />
          {sets.map((s) => (
            <SetCard key={s.id} set={s} />
          ))}
        </div>
      )}

      <GlobalCrate />
    </div>
  );
}
