const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

const RE_HTML = /[&<>"']/g;

export function sanitize(text: string | undefined | null): string {
  return (text ?? "").replace(RE_HTML, (c) => ENTITIES[c] ?? c);
}
