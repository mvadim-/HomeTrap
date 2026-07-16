import { beforeEach, vi } from "vitest";

import indexHtml from "../index.html?raw";

const reactRoot = vi.hoisted(() => ({
  createRoot: vi.fn(),
  render: vi.fn(),
}));

vi.mock("react-dom/client", () => ({ createRoot: reactRoot.createRoot }));
vi.mock("./App", () => ({ App: () => null }));

beforeEach(() => {
  vi.resetModules();
  reactRoot.createRoot.mockReset();
  reactRoot.render.mockReset();
  reactRoot.createRoot.mockReturnValue({ render: reactRoot.render });
  document.body.innerHTML = '<div id="root"></div>';
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("application bootstrap", () => {
  it("runs the inline theme bootstrap before loading the application module", async () => {
    const bootstrapMatch = indexHtml.match(
      /<script data-theme-bootstrap>([\s\S]*?)<\/script>/,
    );
    expect(bootstrapMatch).not.toBeNull();

    const bootstrapStart = indexHtml.indexOf("<script data-theme-bootstrap>");
    const headEnd = indexHtml.indexOf("</head>");
    const applicationStart = indexHtml.indexOf('<script type="module" src="/src/main.tsx">');
    expect(bootstrapStart).toBeLessThan(headEnd);
    expect(bootstrapStart).toBeLessThan(applicationStart);

    window.localStorage.setItem("theme", "dark");
    Function(bootstrapMatch![1])();

    reactRoot.createRoot.mockImplementation(() => {
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      return { render: reactRoot.render };
    });

    await import("./main");

    expect(reactRoot.createRoot).toHaveBeenCalledWith(document.getElementById("root"));
    expect(reactRoot.render).toHaveBeenCalledTimes(1);
  });
});
