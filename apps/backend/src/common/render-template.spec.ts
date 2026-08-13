import { renderTemplate } from "./render-template";

describe("renderTemplate", () => {
  it("substitutes known placeholders", () => {
    expect(renderTemplate("Hi {{name}}, link: {{cfaUrl}}", { name: "Ana", cfaUrl: "https://x" })).toBe(
      "Hi Ana, link: https://x",
    );
  });

  it("leaves unknown placeholders untouched", () => {
    expect(renderTemplate("Hi {{name}}", {})).toBe("Hi {{name}}");
  });

  it("ignores null/undefined values", () => {
    expect(renderTemplate("Hi {{name}}", { name: null })).toBe("Hi {{name}}");
  });
});
