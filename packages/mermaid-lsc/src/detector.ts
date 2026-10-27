/** Mermaid's diagram id, also used as the ARIA role description. */
export const id = 'liveSequenceChart';

/** Matches the header keyword. The mode is checked by the parser, which can report a helpful error. */
export const detector = (text: string): boolean => /^\s*lsc(?:-alpha)?(?:\s|$)/.test(text);
