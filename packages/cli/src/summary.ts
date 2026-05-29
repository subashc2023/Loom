import type { Project } from "@loom/spec";
import { log, c } from "./log";

/** A compact per-scene overview shared by the authoring commands. */
export function printScenes(project: Project): void {
  log.info("");
  for (const scene of project.scenes) {
    const slide = scene.slides[0];
    const layout = slide ? slide.layout : c.dim("no slide");
    const needsImage =
      slide && (slide.layout === "image" || slide.layout === "imageText") && !slide.content.src;
    const flags = [
      scene.audio ? c.green("voiced") : c.yellow("no audio"),
      needsImage ? c.yellow("brief") : null,
    ]
      .filter(Boolean)
      .join(c.dim(" · "));
    log.info(`  ${c.bold(scene.id.padEnd(4))} ${String(layout).padEnd(10)} ${c.dim("·")} ${flags}`);
    log.info(`       ${c.dim(truncate(scene.script, 76))}`);
  }
  log.info("");
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
