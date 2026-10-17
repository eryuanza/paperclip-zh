import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const nodeRequire = createRequire(import.meta.url);
const babelCore = nodeRequire(
  nodeRequire.resolve("@babel/core", {
    paths: [path.dirname(nodeRequire.resolve("@vitejs/plugin-react"))],
  }),
) as {
  transformSync: (
    source: string,
    options: Record<string, unknown>,
  ) => { code?: string | null } | null;
};
const paperclipZhOverlay = nodeRequire("../../scripts/babel-plugin-paperclip-zh.cjs");

function transform(source: string): string {
  const result = babelCore.transformSync(source, {
    filename: path.join(process.cwd(), "ui", "src", "Fixture.tsx"),
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [paperclipZhOverlay],
  });
  return result?.code ?? "";
}

describe("paperclip zh Babel overlay", () => {
  it("keeps component protocol values unchanged while translating visible expressions", () => {
    const output = transform(`
      export function Fixture({ awake, handoff, name }) {
        return (
          <>
            <AnimatePresence mode={handoff ? "wait" : "sync"} />
            <AgentAvatar pose={awake ? "rest" : "sleepy"} />
            <Status value={\`Waiting for ${"${name}"}\`} />
            <Card label={awake ? "Ready" : "Waiting"} />
            <span>{awake ? "Ready" : "Waiting"}</span>
          </>
        );
      }
    `);

    expect(output).not.toContain('__pcT("wait")');
    expect(output).not.toContain('__pcT("sync")');
    expect(output).not.toContain('__pcT("rest")');
    expect(output).not.toContain('__pcT("sleepy")');
    expect(output).not.toContain('__pcTt("Waiting for {{0}}"');
    expect(output.match(/__pcT\("Ready"\)/g)).toHaveLength(2);
    expect(output.match(/__pcT\("Waiting"\)/g)).toHaveLength(2);
  });
});
