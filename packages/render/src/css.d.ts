// CSS is imported only for its side effects (font @font-face registration via
// @fontsource). It has no JS shape, so declare it as an empty module so tsc
// accepts the import; Remotion's bundler handles the actual CSS + woff2 assets.
declare module "*.css";
