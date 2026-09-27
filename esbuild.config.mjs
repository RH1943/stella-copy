import esbuild from "esbuild";
import fs from "fs";
import path from "path";

// 테스트 vault 자동 복사(선택): 환경변수 OBSIDIAN_PLUGIN_DIR 에
// "<vault>/.obsidian/plugins/<plugin-id>" 경로를 지정하면 빌드 후 3개 파일을 복사한다.
const VAULT_PLUGIN_DIR = process.env.OBSIDIAN_PLUGIN_DIR;
const isWatch = process.argv.includes("--watch");

const vaultAvailable = Boolean(VAULT_PLUGIN_DIR) && fs.existsSync(VAULT_PLUGIN_DIR);

const copyPlugin = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      if (!vaultAvailable) {
        console.log(
          `[${new Date().toLocaleTimeString()}] ✅ 빌드 완료 (OBSIDIAN_PLUGIN_DIR 미설정 — 복사 건너뜀)`
        );
        return;
      }
      for (const file of ["main.js", "styles.css", "manifest.json"]) {
        if (fs.existsSync(file)) {
          fs.copyFileSync(file, path.join(VAULT_PLUGIN_DIR, file));
        }
      }
      console.log(`[${new Date().toLocaleTimeString()}] ✅ 빌드 완료 → 볼트에 복사됨`);
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian", "electron",
    "@codemirror/*", "@lezer/*",
    "http", "https", "events", "fs", "path", "os", "url", "crypto", "stream",
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: false,
  treeShaking: true,
  outfile: "main.js",
  plugins: [copyPlugin],
});

if (isWatch) {
  await ctx.watch();
  console.log("👀 Watch 모드 — .ts 저장 시 자동 빌드");
} else {
  await ctx.rebuild();
  ctx.dispose();
}
