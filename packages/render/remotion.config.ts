import { Config } from "@remotion/cli/config";

// public/ holds fixture assets resolved by staticFile(); it's the default, set
// explicitly for clarity. A real user project would point this at its own tree.
Config.setPublicDir("public");
Config.setVideoImageFormat("jpeg");
Config.overrideWebpackConfig((config) => config);
