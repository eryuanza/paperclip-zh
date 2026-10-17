import path from "path";
import { createRequire } from "node:module";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createUiDevWatchOptions } from "./src/lib/vite-watch";
import { createApiProxy } from "./src/lib/vite-api-proxy";
import { serviceWorkerBuildIdPlugin } from "./src/lib/vite-sw-build-id";
import { readBrowserBuildCommit } from "./src/lib/vite-build-commit";

// ---------------------------------------------------------------------------
// Simplified Chinese overlay
//
// Vite 8's @vitejs/plugin-react is Oxc-based and no longer accepts
// `babel.plugins`. Run our Babel pass as a separate `pre` plugin over UI TSX.
// It only wraps visible copy in `__pcT("English")`; the runtime dictionary in
// ui/src/i18n/zh-CN.overlay.json supplies the translation.
// ---------------------------------------------------------------------------
const nodeRequire = createRequire(path.join(__dirname, "vite.config.ts"));
const babelCore = nodeRequire(
  nodeRequire.resolve("@babel/core", {
    paths: [path.dirname(nodeRequire.resolve("@vitejs/plugin-react"))],
  }),
);
const paperclipZhOverlay = nodeRequire("./scripts/babel-plugin-paperclip-zh.cjs");

function paperclipZhPlugin(): Plugin {
  // Vite normalizes module ids to forward slashes on Windows too.
  const srcRoot = path.resolve(__dirname, "src").replace(/\\/g, "/") + "/";
  return {
    name: "paperclip-zh-overlay",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0].replace(/\\/g, "/");
      if (!file.endsWith(".tsx") || !file.startsWith(srcRoot)) return null;
      const result = babelCore.transformSync(code, {
        filename: file,
        configFile: false,
        babelrc: false,
        sourceMaps: true,
        parserOpts: { plugins: ["jsx", "typescript"] },
        plugins: [paperclipZhOverlay],
      });
      if (!result?.code) return null;
      return { code: result.code, map: result.map ?? null };
    },
  };
}

const apiProxy = createApiProxy();

export default defineConfig(({ mode }) => ({
  define: {
    __PAPERCLIP_BUILD_COMMIT__: JSON.stringify(
      readBrowserBuildCommit(__dirname),
    ),
  },
  plugins: [
    paperclipZhPlugin(),
    react(),
    tailwindcss(),
    serviceWorkerBuildIdPlugin(),
  ],
  build: {
    minify: "esbuild",
  },
  esbuild:
    mode === "production"
      ? {
          // React's component trace uses function names. Keep those useful in
          // error reports without publishing source maps or page context.
          keepNames: true,
          drop: ["console", "debugger"],
          legalComments: "none",
        }
      : undefined,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      lexical: path.resolve(__dirname, "./node_modules/lexical/dist/Lexical.mjs"),
    },
  },
  server: {
    port: 5173,
    watch: createUiDevWatchOptions(process.cwd()),
    proxy: apiProxy,
  },
  preview: {
    port: 3101,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: apiProxy,
  },
}));
