export type Theme = "light" | "dark";

export function getInitialTheme(): Theme {
  const storedTheme = window.localStorage.getItem("theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function initializeTheme(): Theme {
  const theme = getInitialTheme();
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function getAppliedTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : getInitialTheme();
}
