import { describe, expect, it } from 'vitest';
import { fromJSON, parseLsc, toJSON } from 'lsc-model';

describe('JSON', () => {
  const { model } = parseLsc('lsc-alpha existential\n  a ->> b: m');

  it('is plain data that survives a round trip', () => {
    const json = toJSON(model!);
    expect(json).not.toBe(model);
    expect(fromJSON(JSON.stringify(json))).toEqual(model);
  });

  it.each([
    [null, /expected an object/],
    [{ ...toJSON(model!), modelVersion: 2 }, /unsupported modelVersion 2/],
    [{ ...toJSON(model!), kind: 'sequence' }, /kind/],
    [{ ...toJSON(model!), messages: {} }, /messages/],
    [{ ...toJSON(model!), body: {} }, /body\.items/],
  ])('rejects what is not a model: %j', (json, message) => {
    expect(() => fromJSON(json)).toThrow(message);
  });
});
