/**
 * The animated gradient-mesh background — drifting blurred blobs of
 * magenta/cyan/violet = the room's moving club lights, with a film-grain
 * overlay on top. Sits behind all glass. Motion freezes under
 * prefers-reduced-motion (handled globally in index.css).
 */
export function MeshBackground() {
  return (
    <div
      aria-hidden="true"
      className="grain pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* magenta */}
      <div
        className="absolute -left-[12%] -top-[14%] h-[55vmax] w-[55vmax] rounded-full animate-blob-a"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,46,151,0.42), rgba(255,46,151,0) 62%)",
          filter: "blur(60px)",
        }}
      />
      {/* cyan */}
      <div
        className="absolute -right-[14%] top-[8%] h-[52vmax] w-[52vmax] rounded-full animate-blob-b"
        style={{
          background:
            "radial-gradient(circle at center, rgba(46,168,255,0.36), rgba(46,168,255,0) 62%)",
          filter: "blur(64px)",
        }}
      />
      {/* violet */}
      <div
        className="absolute bottom-[-18%] left-[22%] h-[58vmax] w-[58vmax] rounded-full animate-blob-c"
        style={{
          background:
            "radial-gradient(circle at center, rgba(155,92,255,0.40), rgba(155,92,255,0) 62%)",
          filter: "blur(66px)",
        }}
      />
      {/* teal accent, smaller */}
      <div
        className="absolute right-[18%] bottom-[6%] h-[34vmax] w-[34vmax] rounded-full animate-blob-a"
        style={{
          background:
            "radial-gradient(circle at center, rgba(46,230,196,0.28), rgba(46,230,196,0) 62%)",
          filter: "blur(56px)",
        }}
      />
    </div>
  );
}
