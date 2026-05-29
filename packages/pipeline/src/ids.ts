/** Stable, human-readable IDs for scenes and slides. */

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

/** Scene IDs are 1-based and zero-padded: s1, s2, … s10, s11. */
export function sceneId(index: number): string {
  return `s${index + 1}`;
}

/** Slide IDs nest under their scene: s1-1, s1-2. */
export function slideId(scene: string, index: number): string {
  return `${scene}-${index + 1}`;
}
