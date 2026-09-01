import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import appStyles from "../media-qa/styles.css?raw";
import appMarkup from "../media-qa/markup.html?raw";
import appScript from "../media-qa/app.js?raw";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gen Z Studio — Audio/Video QA Automation Tool" },
      {
        name: "description",
        content:
          "Review, approve, reject, trim and crop audio/video files for quality assurance. Export approved and trimmed media as a ZIP.",
      },
      { property: "og:title", content: "Gen Z Studio" },
      {
        property: "og:description",
        content:
          "Review, approve, reject, trim and crop audio/video files for quality assurance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MediaQAStudio,
});

const EXTERNAL_SCRIPTS = [
  "https://cdn.tailwindcss.com",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js",
];

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function MediaQAStudio() {
  const mountRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;

    const mount = mountRef.current;
    if (!mount) return;

    // 1. Inject custom CSS rules (trim/crop/zoom) used by the studio.
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-media-qa", "");
    styleEl.textContent = appStyles;
    document.head.appendChild(styleEl);

    // 2. Inject the full studio markup into the mount node.
    mount.innerHTML = appMarkup;

    // 3. Load external libs in order, then run the app script.
    (async () => {
      for (const src of EXTERNAL_SCRIPTS) {
        try {
          await loadScript(src);
        } catch (err) {
          console.error(err);
        }
      }
      const s = document.createElement("script");
      s.textContent = appScript;
      document.body.appendChild(s);
    })();

    return () => {
      // Dev StrictMode re-mount: leave the injected app in place so playback
      // state survives. Cleanup only the style tag if the node is gone.
      if (!document.body.contains(mount)) {
        styleEl.remove();
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="bg-slate-950 font-sans text-slate-100 h-screen w-screen flex flex-col overflow-hidden"
    />
  );
}
