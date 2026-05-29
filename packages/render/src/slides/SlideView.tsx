import { resolveMotion, type Slide } from "@loom/spec";
import { TitleSlide } from "./TitleSlide";
import { ImageSlide } from "./ImageSlide";
import { ImageTextSlide } from "./ImageTextSlide";
import { ChartSlide } from "./ChartSlide";
import { BulletsSlide } from "./BulletsSlide";
import { QuoteSlide } from "./QuoteSlide";
import { CodeSlide } from "./CodeSlide";
import { ManimSlide } from "./ManimSlide";

/**
 * Dispatch a slide to its layout component. The spec's discriminated union makes
 * this exhaustive: adding a layout to the schema surfaces here as a type error
 * until it's handled (the `assertNever` default enforces it at compile time).
 *
 * `kenBurns` is the project-wide auto-motion toggle; image-bearing slides
 * without their own `motion` get a gentle default when it's on.
 */
export function SlideView({ slide, kenBurns }: { slide: Slide; kenBurns: boolean }) {
  switch (slide.layout) {
    case "title":
      return <TitleSlide content={slide.content} />;
    case "image":
      return <ImageSlide content={slide.content} motion={resolveMotion(slide.motion, kenBurns, slide.id)} />;
    case "imageText":
      return <ImageTextSlide content={slide.content} motion={resolveMotion(slide.motion, kenBurns, slide.id)} />;
    case "chart":
      return <ChartSlide content={slide.content} />;
    case "bullets":
      return <BulletsSlide content={slide.content} />;
    case "quote":
      return <QuoteSlide content={slide.content} />;
    case "code":
      return <CodeSlide content={slide.content} />;
    case "manim":
      return <ManimSlide content={slide.content} />;
    default:
      return assertNever(slide);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled slide layout: ${JSON.stringify(x)}`);
}
