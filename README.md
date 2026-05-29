# Loom

**Talk to Claude Code, get a finished video.** Loom is a poor mans After Effects for
AI-native video creation: you describe the video you want, AI writes it, and Loom
renders it to an MP4 — no timeline, no clicking around a video editor.

```sh
loom init my-video && cd projects/my-video
loom plan "a 90-second explainer on how DNS works"
loom script && loom voice && loom align && loom slides
loom render --quality final          #  →  output/final.mp4
```

---

## Install

You need:

- **[Bun](https://bun.sh) ≥ 1.3** — the runtime and package manager.
- **ffmpeg** on your `PATH` — Loom uses it for audio, recording, and rendering.

Then, from the repo root:

```sh
bun install
```

Optional extras, only if you use specific features:

- **[Manim Community](https://docs.manim.community)** on `PATH` — only for `manim`
  slides (math/technical animations).

> **Tip:** every example below uses `loom …`. If you haven't put it on your `PATH`,
> run it through Bun from the repo root instead: `bun run loom …`.

---

## The one idea behind Loom

A Loom video is **not** a binary project file you open in an app. It's a single
plain-text file, `project.json`, that describes the whole video — every scene, line
of narration, image, chart, and transition.

```
       prompt
         │
         ▼
   ┌───────────┐   each step reads project.json,
   │project.json│   changes one part of it, and writes it back
   └───────────┘
         │
         ▼
       MP4
```

This means:

- **Everything is editable** — open `project.json` in any editor (or ask Claude to
  change it) and the next render reflects it.
- **Every piece is independently re-rollable** — don't like one image? Regenerate
  just that one. Don't like a voice-over? Re-record just that scene. Nothing else
  changes.
- **The renderer is a pure function** — the same `project.json` always produces the
  same video, frame for frame.

You drive all of this through the `loom` command (and through Claude Code, which
edits `project.json` for you).

---

## API keys (bring your own)

Loom never ships keys — the AI steps use **your** accounts. Put them in a `.env`
file inside your project directory (or in your environment):

```sh
ANTHROPIC_API_KEY=...     # plan, script  (writing the video)
ELEVENLABS_API_KEY=...    # voice, align  (text-to-speech + caption timing)
GEMINI_API_KEY=...        # slides         (image generation)  — or GOOGLE_API_KEY
```

**You don't need any key to try Loom.** These commands work with zero keys:

| Command            | What it does                                            |
|--------------------|---------------------------------------------------------|
| `init`             | scaffold a new project                                  |
| `templates`        | list the built-in style templates                       |
| `record`           | narrate a scene from your own microphone                |
| `voice --import`   | use an audio file you recorded elsewhere                |
| `source`           | pull real, freely-licensed images from Commons + Openverse|
| `cut`              | snap slide changes onto emphasis beats                  |
| `manim`            | render Manim animations (needs the Manim binary, no key)|
| `compose`          | validate the spec and print the timeline                |
| `render`           | render the video to an MP4                              |

So you can `init` → `render` immediately and watch a real (placeholder) video before
spending a cent. `record` and `voice --import` even let you make a fully narrated
video without an ElevenLabs key, using your own voice.

---

## Quickstart

### 1. The fastest possible look

Scaffold a project and render it right away — no keys, no AI, just to see the shape:

```sh
loom init my-video
cd projects/my-video
loom render            #  →  output/draft.mp4
```

The fresh project renders as a **storyboard**: real layouts and motion, with neat
placeholders where images and narration will go. This is intentional — a
just-planned video is watchable before any assets exist.

### 2. Make a real video from a prompt

```sh
loom init my-video                 # add --aspect mobile for a vertical 9:16 video
cd projects/my-video

# 1. Write the video  (needs ANTHROPIC_API_KEY)
loom plan "a 90-second explainer on how DNS works"
loom script

# 2. Add narration  (needs ELEVENLABS_API_KEY) …
loom voice
loom align            # word-level caption timing

#    … or use YOUR OWN voice instead (no key):
#    loom record --scene s1          # mic, with playback + keep/redo
#    loom voice  --scene s1 --import take.wav

# 3. Add imagery
loom source           # real images from Commons + Openverse (no key) — review + adopt
loom slides           # Gemini fills any briefs without a real image (needs GEMINI_API_KEY)

# 4. Polish + render
loom cut              # snap multi-slide cuts to emphasis beats
loom compose         # validate + preview the timeline in your terminal
loom render --quality final     #  →  output/final.mp4
```

You don't have to run every step or run them in order — each one just edits
`project.json`. Skip narration, skip images, re-run a step later; the rest is
untouched.

---

## The commands, in the order you'd use them

Every command takes `--project <dir>` (defaults to the current directory; a bare
name also resolves under `projects/`, so `loom render -p my-video` works from the
repo root). Run `loom help` for the full option list.

### Setup

- **`loom init <name>`** — scaffold a new project under `projects/<name>` with a
  starter `project.json` and an `.env` template. The `projects/` dir is gitignored,
  so the code repo stays shareable without your individual runs. Add `--template <key>` to start from a
  preset style (see below), and `--aspect <ratio>` to set the output shape:
  `16:9` (default landscape), `9:16` (vertical/mobile — aliases `mobile`,
  `vertical`), or `1:1` (square). Everything downstream — the renderer's
  dimensions, layout stacking, and even how the planner writes — adapts to it.
- **`loom templates`** — list the built-in templates with their descriptions.

### Writing the video (AI)

- **`loom plan "<prompt>"`** — Claude turns your one-line prompt into a full outline:
  multiple scenes, each with slide *briefs* (what each slide should show). Use
  `--template <key>` to steer the tone, or `--scenes <n>` to force an exact count.
- **`loom script`** — Claude rewrites the rough narration into polished spoken lines
  and marks the emphasis/timing beats other steps rely on.

### Narration

- **`loom voice`** — ElevenLabs reads the script aloud, producing the audio and
  measuring its real duration (so timing stays accurate). `--voice-id <id>` picks a
  voice (or set `ELEVENLABS_VOICE_ID` in your `.env`).
  - **Free-tier note:** free ElevenLabs accounts can only use the *premade* voices
    via the API, not "library" voices. The shipped default (`Sarah`) is a premade
    voice, so it works out of the box; pick another with `--voice-id`. Browse your
    usable voices at <https://elevenlabs.io/app/voice-library>.
- **`loom record`** — record narration **in your own voice** from your microphone,
  with instant playback and a keep-or-redo prompt. `--scene <id>` records one scene;
  `--device <name>` picks a mic.
- **`loom voice --import <file> --scene <id>`** — bring in audio you recorded
  elsewhere; it's transcoded into the same slot, so everything downstream treats it
  identically to TTS.
- **`loom align`** — ElevenLabs forced alignment figures out *when each word is
  spoken*, giving you word-level captions with a current-word highlight (on by
  default).

### Imagery & visuals

- **`loom source`** — find **real** images for slide briefs from two public
  libraries — [Wikimedia Commons](https://commons.wikimedia.org) and
  [Openverse](https://openverse.org) (which aggregates Flickr, the Met, NASA,
  Smithsonian and ~50 more) — instead of generating them. No API key. For each
  image brief it searches the keywords the planner emitted across both, dedups
  (Openverse re-serves much of Commons), then ranks the combined pool by an
  *authoritative quality signal* so you review a handful, not the whole web:
  community **Featured / Quality / Valued** assessments first, then how many wiki
  articles use the image, then resolution. Only freely-licensed images that are
  commercially usable **and** modifiable are kept (NC/ND licences dropped, since we
  crop and overlay). SVG diagrams from Commons are **rasterised to PNG** via
  Commons' own thumbnail render, so technical diagrams are usable too. It downloads
  the top thumbnails to `assets/refs/candidates/`
  for review; adopt one with `--slide <id> --pick <n>` (the full image is fetched
  and a `credit` is attached), or `--auto` to take the top pick for every brief.
  `--query "<terms>"` overrides a slide's search. Slides with no good match stay
  briefs for `loom slides` to fill — that's the intended hybrid: real photos where
  they exist, AI for the gaps. Sourced images get a small on-screen credit and an
  entry in the project's `CREDITS.md`.
- **`loom slides`** — Gemini generates an image for every image brief in the plan,
  matching your project's style. `--variations <n>` makes several candidates for one
  slide and lets you pick; `--reroll` regenerates an existing one.
  - **Style lock** — `loom slides --set-reference <slide-id-or-file>` points the
    project's `style.slideReference` at an image, which is then passed into *every*
    `slides` call as a visual anchor, so the whole deck shares one palette, lighting,
    and rendering style instead of drifting slide to slide. The usual workflow:
    generate slide one, like it, `--set-reference s1-1`, then `--reroll` the rest.
    The chosen image is copied to `assets/refs/style-lock.png` so re-rolling the
    source slide later won't change the lock. It nudges toward the reference's *look*
    (it's not a hard hex-exact palette lock), and it's the single biggest lever for
    not-looking-AI-generated.
- **`loom manim`** — for technical/math content: renders a [Manim](https://docs.manim.community)
  animation from the Python scene embedded in a `manim` slide and embeds the result.
  Needs the Manim binary, but no API key.

### Polish, check, render

- **`loom cut`** — automatically snaps slide changes in multi-slide scenes onto the
  script's emphasis/punchline beats, so cuts land on the right words.
- **`loom compose`** — validates the whole spec, checks that referenced assets exist,
  and prints the timeline to your terminal. Add `--strict` to fail (not just warn) on
  missing assets.
- **`loom render`** — renders `project.json` to an MP4. `--quality draft` (default,
  fast, half-resolution) or `--quality final` (full quality). Output goes to
  `output/<quality>.mp4`, or wherever `--out <path>` points.

### Re-rolling one thing at a time

This is the heart of the workflow — fix one asset without touching anything else:

```sh
loom slides --scene s3 --slide s3-1 --reroll     # one image
loom voice  --scene s3 --reroll                  # one scene's narration
loom align  --scene s3 --reroll                  # one scene's caption timing
loom slides --slide s3-1 --variations 4          # 4 options, you choose one
```

---

## Templates

`loom init --template <key>` (and `loom plan --template <key>`) bundle a style preset,
plan steering, and a layout palette so a whole video has a consistent feel:

| Key            | Feel                                                          |
|----------------|--------------------------------------------------------------|
| `explainer`    | Tight, well-paced concept explainer — the default Loom feel.  |
| `lesson`       | Friendly mini-lesson: hook, one analogy per idea, payoff.     |
| `tutorial`     | Step-by-step how-to.                                          |
| `pitch`        | Punchy investor/product pitch: problem → solution → ask.      |
| `news`         | Authoritative news segment: lead with the headline, neutral.  |
| `product-demo` | Show the product doing the thing.                             |

Run `loom templates` to see the live list.

---

## Slide layouts

Each slide picks a `layout`; the renderer knows how to draw all of these:

| Layout      | What it shows                                                            |
|-------------|-------------------------------------------------------------------------|
| `title`     | A title + subtitle card.                                                 |
| `image`     | A full-frame image (with a gentle automatic Ken Burns zoom/pan).         |
| `imageText` | An image with a heading + body caption.                                  |
| `chart`     | An animated bar / line / area / pie chart, drawn straight from data.     |
| `bullets`   | A title with a cascading, staggered list.                               |
| `quote`     | A centered pull-quote with an accent mark + attribution.                 |
| `code`      | A syntax-highlighted code card; can emphasize lines or show a `diff`.    |
| `manim`     | An embedded Manim animation (storyboard placeholder until it's rendered).|

Niceties that apply automatically: image slides get a deterministic **Ken Burns
move** by default (turn off per-slide with `motion: { type: "none" }` or
project-wide with `style.kenBurns: false`); scenes with caption timing show
**word-level captions** (`style.captions: false` to disable); and background
**music ducks** under narration. Slides that don't have their asset yet render as
clean placeholders, so the video is always watchable.

---

## Try the built-in demo

There's a self-contained 3-scene fixture (plus chart/bullets/quote/code/manim demo
scenes) that renders offline with no keys and no downloads:

```sh
# Generate the fixture assets (gradient/grid PNGs + sine-tone audio, via ffmpeg)
bun run packages/render/scripts/make-fixtures.ts

# Render it to an MP4
cd packages/render && bun run render        #  →  packages/render/out/video.mp4

# …or open Remotion Studio to preview and scrub through it
cd packages/render && bun run studio
```

---

## How the repo is organized

Loom is a Bun workspace with four packages:

```
packages/
  spec/      # @loom/spec     — the project.json contract: types, Zod schema,
             #                  and the timing math everything derives from.
  pipeline/  # @loom/pipeline — the authoring steps (plan, script, voice, align,
             #                  slides, cut, manim, templates). Each one reads
             #                  project.json, changes a part, and writes it back.
  render/    # @loom/render   — the Remotion renderer: spec → every frame. A pure
             #                  function of project.json.
  cli/       # @loom/cli      — the `loom` command that wires it all together.
```

`project.json` is the durable artifact at the center: every pipeline step reads and
writes it, and the renderer derives **everything** — dimensions, fps, duration,
every frame — from it. To render any real project, just point the renderer at its
`project.json`; no code changes needed.

For contributors:

```sh
bun run typecheck      # type-check the whole workspace
bun run spec:test      # run the spec tests
bun test packages      # run all tests
```

See [PLAN.md](./PLAN.md) for the full design and roadmap.
