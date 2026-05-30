export { PipelineError } from "./errors";
export { loadEnv, requireKey } from "./env";
export { DEFAULT_MODEL, resolveModel, generateStructured } from "./llm";
export { attachAudio, estimateNarrationMs, probeDurationMs, transcodeToMp3 } from "./audio";
export {
  captureArgs,
  captureInputFormat,
  detectInputDevice,
  firstDshowAudioDevice,
  ingestAudioFile,
  type IngestResult,
} from "./record";
export { sceneId, slideId, slugify } from "./ids";

export { applyCuts, type CutResult } from "./cut";
export { renderManim, type ManimOptions, type ManimResult } from "./manim";
export { getTemplate, TEMPLATES, TEMPLATE_KEYS, type Template, type TemplateKey } from "./templates";
export { planVideo, type PlanOptions } from "./plan";
export { writeScript, type ScriptOptions } from "./script";
export {
  searchCommons,
  downloadImage,
  rasterUrl,
  type StockCandidate,
  type StockProvider,
  type CommonsCandidate,
  type Assessment,
  type SearchOptions,
} from "./commons";
export { searchOpenverse, type OpenverseOptions } from "./openverse";
export { searchStock, dedupeStock, type StockSearchOptions } from "./stock";
export {
  findStockCandidates,
  applyStock,
  collectCredits,
  type SourceCandidate,
  type SourceResult,
  type SourceOptions,
} from "./source";
export { synthesizeVoice, type VoiceOptions, type VoiceResult } from "./voice";
export { alignCaptions, type AlignOptions, type AlignResult } from "./align";
export {
  applyVariation,
  canonicalImageRelPath,
  generateSlides,
  generateVariations,
  setStyleReference,
  variantRelPath,
  type SetReferenceResult,
  type SlidesOptions,
  type SlideResult,
  type Variation,
  type VariationsResult,
} from "./slides";
