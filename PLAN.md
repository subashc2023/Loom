# PLAN.md — Loom (working name)

A discount After Effects for AI-native video creation. Talk to Claude Code, get a finished MP4.

## Thesis

End-to-end text-to-video is not good enough for content that has to actually say something. The winning workflow for the next 12-24 months is a structured pipeline: planner → script → TTS → AI-generated visuals → programmatic assembly. This project is the assembly layer plus the orchestration glue, optimized for editability through natural language rather than a timeline GUI.

The core insight: the video is a JSON/TS spec. AI generates and mutates that spec. Remotion renders it. Claude Code is the UI.

## Goals

- Produce broadcast-quality explainer/educational/marketing videos from a prompt in under 10 minutes of wall-clock time
- Every artifact (script, slide brief, image, audio segment) is independently re-rollable without re-running upstream stages
- Editing happens through conversation with Claude Code, not a timeline
- Output is a normal MP4 — no proprietary container, no platform lock-in
- Sane defaults that look professional out of the box (Ken Burns, captions, audio ducking, transitions)

## Non-goals

- General-purpose NLE replacing Premiere or Resolve
- Real-time collaborative editing
- Live video, streaming, or any non-rendered output
- Effects-heavy motion graphics, particle systems, or 3D
- Mobile-first vertical content as a primary target (we'll support 9:16, but the design center is 16:9 long-form)

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    project.json (spec)                   │
│  scenes, beats, asset refs, layouts, transitions, music  │
└──────────────────────────────────────────────────────────┘
        ▲                                            │
        │ mutations                                  │ reads
        │                                            ▼
┌───────────────┐                       ┌─────────────────────┐
│  Claude Code  │                       │  Remotion renderer  │
│  (the "UI")   │                       │  → MP4              │
└───────────────┘                       └─────────────────────┘
        │
        ├── plan  → Opus → outline + slide briefs
        ├── script → Opus → narration with beat markers
        ├── voice → ElevenLabs → audio segments + durations
        ├── align → Whisper/EL forced alignment → word timing
        ├── slides → Nano Banana → images (style-locked)
        └── compose → updates project.json
```

Every stage is a CLI command. Every stage reads and writes the same `project.json`. The renderer is pure: spec in, video out.

## Core abstractions

**Project** — top-level container. Resolution, FPS, style tokens, master audio settings.

**Scene** — a coherent narrative unit, usually one paragraph of narration. Owns its audio segment, one or more slides, and timing. Renders as a Remotion `<Sequence>`.

**Slide** — a visual. Either a generated image or a code-defined layout (title card, bullet list, quote, chart). Has a layout type, content, and an optional Ken Burns spec.

**Beat** — a timing marker emitted by the script stage. Used to align slide changes, emphasis effects, and captions to specific moments in narration.

**Asset** — anything on disk: audio file, image, music track. Content-addressed by hash so re-generation invalidates downstream cleanly.

**Caption** — derived from script + forced alignment. Word-level timing, burned in at render.

**Transition** — between scenes. Default is a 200ms crossfade. Options: cut, fade, slide, none.

## project.json schema (sketch)

```typescript
type Project = {
  id: string;
  meta: { title: string; aspectRatio: "16:9" | "9:16" | "1:1"; fps: 30 | 60; resolution: [number, number] };
  style: {
    palette: { bg: string; fg: string; accent: string };
    fonts: { display: string; body: string };
    slideReference?: string;  // path to style-lock reference image
  };
  music?: { track: string; volume: number; duckTo: number };
  scenes: Scene[];
};

type Scene = {
  id: string;
  script: string;                    // narration text
  audio: { path: string; duration: number };
  beats: Beat[];
  slides: Slide[];
  transition: { type: "cut" | "fade" | "slide"; durationMs: number };
};

type Slide = {
  id: string;
  layout: "image" | "imageText" | "title" | "bullets" | "quote" | "chart" | "manim";
  content: Record<string, unknown>;  // layout-specific
  startMs: number;                   // relative to scene
  durationMs: number;
  motion?: { type: "kenBurns"; from: Rect; to: Rect } | { type: "none" };
};

type Beat = { tMs: number; tag: string };  // e.g. "emphasis", "slide-change", "punchline"
```

## Pipeline stages (CLI)

```
loom init <name>                    # scaffold project
loom plan "<prompt>"                # Opus → outline + slide briefs → project.json
loom script                         # Opus → narration with beat markers
loom voice [--scene N] [--voice X]  # ElevenLabs → audio
loom align                          # word-level timing for captions
loom slides [--scene N] [--slide M] # Nano Banana → images
loom compose                        # validate spec, write Remotion entry
loom preview [--scene N]            # dev server with hot reload
loom render [--quality draft|final] # MP4
```

Each command is idempotent and incremental. `loom slides --scene 3 --slide 2` regenerates exactly one image; everything else is cached.

## Tech stack

- **Remotion** — rendering. React-based, programmable, ffmpeg under the hood, mature.
- **TypeScript** — everything. Spec is typed, Remotion is typed, CLI is typed.
- **Anthropic SDK** — Claude Opus for plan + script + edits.
- **ElevenLabs SDK** — TTS. Use their alignment endpoint when available, fall back to Whisper.
- **Gemini API (Nano Banana)** — image generation. Pluggable: also support fal.ai for Flux/SDXL.
- **Whisper (whisper.cpp local)** — forced alignment fallback.
- **ffmpeg** — final mux and any pre-processing Remotion doesn't handle natively.
- **Zod** — runtime schema validation on project.json.
- **Bun** — runtime + package manager. Fast, single binary, native TS. (Node 22 acceptable fallback.)

## Project layout

```
loom/
  packages/
    cli/                  # `loom` command
    spec/                 # project.json types + Zod schemas
    pipeline/             # plan, script, voice, align, slides modules
    render/               # Remotion components and entry
    style/                # default tokens, layouts
  templates/
    explainer/
    tutorial/
    pitch/
    news/
  examples/

# What a user's project looks like (under a gitignored projects/ dir):
projects/my-video/
  project.json
  script.md             # human-editable source of truth for narration
  assets/
    audio/scene-001.mp3
    images/scene-001-slide-001.png
    music/bg.mp3
    refs/style-lock.png
  output/
    draft.mp4
    final.mp4
```

## MVP feature set (Phase 1)

Goal: end-to-end pipeline producing a watchable 2-minute explainer.

- Project spec + Zod validation
- `plan`, `script`, `voice`, `slides`, `compose`, `render` commands
- Three layouts: `image`, `imageText`, `title`
- Crossfade and cut transitions
- Static slides (no motion yet)
- Mono ElevenLabs voice
- Render to 1080p30 MP4

Cut from MVP: captions, Ken Burns, music, style lock, alignment, preview server.

## Phase 2 — the things that make it not look AI-generated

- **Word-level captions** burned in with current-word highlight. Single biggest retention lever.
- **Ken Burns motion** on every static slide. Configurable but on by default.
- **Style lock** — pass a reference image into every Nano Banana call so visual style is consistent across slides. This is currently the biggest quality cliff in AI slide decks.
- **Background music** with sidechain-style ducking under narration.
- **Forced alignment** for caption timing and beat snapping.
- **Preview server** — Remotion Studio integration, hot reload on spec changes.
- **Re-roll UX** — `loom slides --scene 3 --slide 2 --variations 4` shows a grid, you pick one.

## Phase 3 — templates and specialization

- **Template system** — explainer, tutorial, pitch, news, product demo. Each is a plan prompt + style preset + layout palette.
- **Manim integration** for technical/math content. `layout: "manim"` runs a Manim scene and embeds the result.
- **Chart layout** — pass data + chart type, get a Recharts render baked into the slide.
- **B-roll search** — Pexels/Pixabay/internal library, semantic search via embeddings.
- **Multi-voice** — for Q&A, interviews, dialogue formats.
- **Cuts on emphasis** — automatic slide changes on beats tagged `emphasis` or `punchline`.

## Phase 4 — speculative

- **Live preview during script editing** — type a word in script.md, see captions update in the preview window without re-rendering audio.
- **Tone/pace controls** — "make this section punchier" → Opus rewrites + re-voices + re-cuts.
- **A/B variants** — generate three versions of a hook, pick the best.
- **YouTube-aware** — auto-generate thumbnail, title variants, description, chapter markers from beats.
- **Edit by transcript** — delete a sentence from script.md, audio and visuals auto-rebuild around it.

## Key design decisions

**Why a JSON spec instead of a Remotion-first approach?**
The spec is the durable artifact. Remotion components are derived from it. This lets Claude Code edit the video by editing JSON, which is something it's extremely good at. It also lets us swap renderers later (e.g. server-side cloud render) without changing the user model.

**Why CLI instead of a GUI?**
Because the GUI is Claude Code. The user says "swap slide 3 for something with a darker tone and add emphasis on the word 'never'" — Claude Code edits project.json and re-runs the affected stages. Building a timeline UI is a year of work to end up with a worse version of After Effects.

**Why Remotion specifically?**
Mature, React-based (so layouts are just components), ffmpeg under the hood, server-renderable, well-documented, actively maintained, MIT licensed. The alternative is hand-rolling ffmpeg filtergraphs, which is hostile to iteration.

**Why decouple script from slides?**
If slides come first, narration gets bent to fit images. If script comes first (or co-generated with slide briefs), the message stays primary and visuals serve it. The pipeline enforces this ordering.

**Local vs cloud rendering?**
Local first. Remotion renders fine on a laptop for 1080p. Cloud render is a Phase 3 feature for 4K and long-form.

## Open questions

1. **License/distribution.** MIT and let people self-host, or hosted service with a free tier? Hosted is a much bigger product. Start MIT, see what happens.
2. **API key handling.** Users bring their own keys (Anthropic, ElevenLabs, Gemini) — that's the simple answer for MVP. Aggregate billing later if we go hosted.
3. **Determinism.** Image gen and LLMs are non-deterministic. Do we cache aggressively by seed/prompt hash, or accept that re-rendering produces variation? Probably aggressive cache with explicit `--reroll`.
4. **Long-form scaling.** Plan works fine for 2-5 minute videos. For 20+ minute content the script stage needs chunking and the slide consistency problem gets worse. Defer.
5. **Editing semantics.** When a user says "make scene 3 shorter," do we re-voice (Opus rewrites the script) or just speed up the audio? Probably the former, but it's slower and costs tokens. Make it explicit.

## Success criteria for v1

- A non-technical user can produce a 2-minute explainer in one Claude Code session
- Output is visibly better than a generic Synthesia-style avatar video
- Script edits propagate correctly: change script.md, run `loom voice` + `loom align` + `loom render`, get a coherent updated video
- Style is consistent across slides without manual intervention
- Captions are accurate to within 100ms

## What this is not competing with

- Premiere/Resolve/Final Cut — actual NLEs for human-shot footage
- Synthesia/HeyGen — avatar-based talking-head video
- Runway/Sora/Veo — generative video models for short cinematic clips
- Canva video — template-based drag-and-drop

The niche is *structured explainer content where the message is the point* and the creator wants AI to handle production but not authorship.

## Immediate next steps

1. Lock the spec schema. Write the Zod types. This is the contract everything else depends on.
2. Build the renderer with hardcoded fixture data. Prove Remotion can produce the look we want before wiring AI.
3. Build the pipeline stages one at a time, each producing valid spec mutations.
4. Dogfood: build the launch video for the tool using the tool.