import type { ExternalDiagramDefinition } from 'mermaid';
import { detector, id } from './detector.js';

/** Register with `mermaid.registerExternalDiagrams([lsc])`. */
const lsc: ExternalDiagramDefinition = {
  id,
  detector,
  loader: async () => {
    const { diagram } = await import('./diagram.js');
    return { id, diagram };
  },
};

export default lsc;
