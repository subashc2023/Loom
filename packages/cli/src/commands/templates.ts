import { TEMPLATES, TEMPLATE_KEYS } from "@loom/pipeline";
import { log, c } from "../log";

/** `loom templates` — list the available project templates and what each is for. */
export function templates(): void {
  log.info("");
  log.info(c.bold("Templates") + c.dim("  (use with: loom init <name> --template <key>  or  loom plan … --template <key>)"));
  log.info("");
  for (const key of TEMPLATE_KEYS) {
    const t = TEMPLATES[key];
    log.info(`  ${c.cyan(key.padEnd(13))} ${t.description}`);
    log.info(`  ${" ".repeat(13)} ${c.dim(`accent ${t.style.palette.accent} · ${t.scenes} scenes · favours ${t.layouts.join(", ")}`)}`);
  }
  log.info("");
}
