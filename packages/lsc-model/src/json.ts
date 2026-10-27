// A stable, versioned JSON form. The model is plain data, so the JSON form is the model itself;
// `modelVersion` identifies the format.

import type { LscChart } from './model.js';

export const MODEL_VERSION = 1;

/** A JSON-compatible copy of the model. */
export function toJSON(model: LscChart): LscChart {
  return JSON.parse(JSON.stringify(model)) as LscChart;
}

/** Reads a model from its JSON form (a string or a parsed value). Throws if it is not one. */
export function fromJSON(json: unknown): LscChart {
  const value: unknown =
    typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));
  const fail = (why: string): never => {
    throw new Error(`Not an LSC model: ${why}.`);
  };
  if (typeof value !== 'object' || value === null) fail('expected an object');
  const chart = value as Record<string, unknown>;
  if (chart.modelVersion !== MODEL_VERSION) {
    fail(
      `unsupported modelVersion ${JSON.stringify(chart.modelVersion)}; this library reads version ${MODEL_VERSION}`,
    );
  }
  if (chart.kind !== 'chart' && chart.kind !== 'subchart')
    fail('`kind` must be "chart" or "subchart"');
  for (const key of [
    'instances',
    'variables',
    'visibleEvents',
    'messages',
    'conditions',
    'barriers',
    'notes',
  ]) {
    if (!Array.isArray(chart[key])) fail(`\`${key}\` must be an array`);
  }
  const body = chart.body as { items?: unknown } | undefined;
  if (!body || !Array.isArray(body.items)) fail('`body.items` must be an array');
  for (const instance of chart.instances as { id?: unknown; locations?: unknown }[]) {
    if (typeof instance.id !== 'string' || !Array.isArray(instance.locations)) {
      fail('each instance needs an `id` and `locations`');
    }
  }
  return value as LscChart;
}
