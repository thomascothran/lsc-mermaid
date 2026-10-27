import type { LscChart, Region } from 'lsc-model';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function countSubcharts(region: Region | undefined): number {
  let n = 0;
  for (const item of region?.items ?? []) {
    if (item.kind === 'subchart') n += 1 + countSubcharts(item.body);
    else if (item.kind === 'alt') {
      n += 1 + countSubcharts(item.then.body) + countSubcharts(item.else?.body);
    }
  }
  return n;
}

/**
 * The accessible description used when a chart has no `accDescr`, for example
 * "Universal chart, 3 instances, 5 messages, activated by setDest".
 */
export function describeChart(model: LscChart): string {
  const kind =
    model.kind === 'subchart'
      ? 'Standalone subchart'
      : model.mode === 'existential'
        ? 'Existential chart'
        : 'Universal chart';
  const parts = [model.title ? `${kind} "${model.title}"` : kind];
  const names = new Set(model.instances.map((i) => i.name));
  parts.push(plural(names.size, 'instance'), plural(model.messages.length, 'message'));
  const blocks =
    model.kind === 'subchart' ? countSubcharts(model.body) - 1 : countSubcharts(model.body);
  if (blocks > 0) parts.push(plural(blocks, 'subchart'));
  if (model.prechart) parts.push('with a pre-chart');
  const activation = model.activation;
  if (activation?.message) parts.push(`activated by ${activation.message.name}`);
  if (activation?.conditionText !== undefined) {
    parts.push(`${activation.message ? 'when' : 'activated when'} ${activation.conditionText}`);
  }
  return parts.join(', ');
}
