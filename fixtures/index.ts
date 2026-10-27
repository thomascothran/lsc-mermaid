import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FixtureExpectation } from './types.js';

export type { FixtureExpectation } from './types.js';

export const fixturesDir = dirname(fileURLToPath(import.meta.url));

export interface Fixture {
  name: string;
  text: string;
  expected: FixtureExpectation;
}

export const fixtureNames: string[] = readdirSync(fixturesDir)
  .filter((entry) => statSync(join(fixturesDir, entry)).isDirectory())
  .sort();

export async function loadFixture(name: string): Promise<Fixture> {
  const text = readFileSync(join(fixturesDir, name, 'chart.lsc'), 'utf8');
  const module = (await import(`./${name}/expected.ts`)) as { default: FixtureExpectation };
  return { name, text, expected: module.default };
}

export async function loadFixtures(): Promise<Fixture[]> {
  return Promise.all(fixtureNames.map(loadFixture));
}
