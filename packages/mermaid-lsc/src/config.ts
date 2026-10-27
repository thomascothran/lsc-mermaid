import { mermaidConfig } from './mermaid-adapter.js';

/** The diagram's `lsc` config block (front matter or `%%{init}%%`). Phase 2 adds the remaining options. */
export interface LscConfig {
  useMaxWidth: boolean;
}

export const defaultLscConfig: LscConfig = {
  useMaxWidth: true,
};

export function lscConfig(): LscConfig {
  const fromMermaid = (mermaidConfig() as { lsc?: Partial<LscConfig> }).lsc ?? {};
  return { ...defaultLscConfig, ...fromMermaid };
}
