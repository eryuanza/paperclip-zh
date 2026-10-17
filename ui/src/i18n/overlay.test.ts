// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { setTranslations } from "./overlay";

async function settleMutations(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("DOM translation overlay", () => {
  afterEach(() => {
    document.body.replaceChildren();
    setTranslations({});
  });

  it("does not loop when a translation is identical to its source", async () => {
    setTranslations({ OpenAI: "OpenAI" });
    const label = document.createElement("span");
    label.textContent = "OpenAI";
    document.body.append(label);

    await settleMutations();

    expect(label.textContent).toBe("OpenAI");
  });

  it("still translates changed text added after startup", async () => {
    setTranslations({ "Model source": "模型来源" });
    const label = document.createElement("span");
    label.textContent = "Model source";
    document.body.append(label);

    await settleMutations();

    expect(label.textContent).toBe("模型来源");
  });
});
