/** Light, dark, or whatever the Mac is set to. */
export type ThemeChoice = "system" | "light" | "dark";

const dark = matchMedia("(prefers-color-scheme: dark)");

export function savedTheme(): ThemeChoice {
  const saved = localStorage.getItem("theme");
  return saved === "light" || saved === "dark" ? saved : "system";
}

/**
 * Puts the chosen look on the page. "system" follows the Mac, and keeps
 * following it while the app is open, when the Mac turns dark at sunset.
 */
let following: (() => void) | null = null;
export function applyTheme(choice: ThemeChoice): void {
  const set = () =>
    document.documentElement.setAttribute(
      "data-theme",
      choice === "dark" || (choice === "system" && dark.matches) ? "dark" : "light",
    );
  if (following) dark.removeEventListener("change", following);
  following = choice === "system" ? set : null;
  if (following) dark.addEventListener("change", following);
  set();
}
