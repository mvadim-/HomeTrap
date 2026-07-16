import { beforeEach, vi } from "vitest";

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
  it("applies the stored theme before React mounts", async () => {
    window.localStorage.setItem("theme", "dark");
    reactRoot.createRoot.mockImplementation(() => {
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      return { render: reactRoot.render };
    });

    await import("./main");

    expect(reactRoot.createRoot).toHaveBeenCalledWith(document.getElementById("root"));
    expect(reactRoot.render).toHaveBeenCalledTimes(1);
  });
});
