import { LscDb } from './db.js';
import { injectUtils, type DiagramDefinition } from './mermaid-adapter.js';
import { parser } from './parser.js';
import { renderer } from './renderer.js';
import { styles } from './styles.js';

export const diagram: DiagramDefinition = {
  parser,
  get db() {
    return new LscDb();
  },
  renderer,
  styles,
  injectUtils,
};
