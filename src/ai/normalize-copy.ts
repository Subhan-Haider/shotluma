// Models are told to use `\n` for line breaks in tool JSON. Correctly escaped
// newlines become real line breaks after parse; double-escaped ones arrive as the
// two-character sequence `\` + `n` and render literally on canvas until a repair
// pass. Collapse that common mistake at the tool boundary.

export const normalizeAiCopy = (text: string): string => text.replaceAll('\\n', '\n')

export const normalizeAiHighlights = <T extends { text: string }>(highlights: T[]): T[] =>
  highlights.map((highlight) => ({ ...highlight, text: normalizeAiCopy(highlight.text) }))
