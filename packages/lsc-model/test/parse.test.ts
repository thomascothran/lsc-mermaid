import { describe, expect, it } from 'vitest';
import { parseLsc } from 'lsc-model';

describe('parseLsc', () => {
  it.each(['universal', 'existential', 'subchart'] as const)('reads the %s header', (mode) => {
    const { model, diagnostics } = parseLsc(`lsc-alpha ${mode}\n`);
    expect(diagnostics).toEqual([]);
    expect(model).toEqual({ keyword: 'lsc-alpha', mode });
  });

  it('accepts the stable keyword lsc', () => {
    expect(parseLsc('lsc universal').model?.keyword).toBe('lsc');
  });

  it('reads title and accessibility statements', () => {
    const { model, diagnostics } = parseLsc(
      [
        '%% leading comment',
        'lsc-alpha universal',
        '  title Car departure',
        '  accTitle: Departure',
        '  accDescr {',
        '    Car and handler',
        '    agree to depart',
        '  }',
        '',
      ].join('\n'),
    );
    expect(diagnostics).toEqual([]);
    expect(model).toEqual({
      keyword: 'lsc-alpha',
      mode: 'universal',
      title: 'Car departure',
      accTitle: 'Departure',
      accDescr: 'Car and handler\nagree to depart',
    });
  });

  it('reports a missing mode with a position instead of throwing', () => {
    const { model, diagnostics } = parseLsc('lsc-alpha\n');
    expect(model).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'syntax' });
    expect(diagnostics[0]?.span?.start.line).toBeGreaterThanOrEqual(1);
  });

  it('rejects an unknown header keyword', () => {
    const { model, diagnostics } = parseLsc('sequenceDiagram\n');
    expect(model).toBeUndefined();
    expect(diagnostics[0]?.span?.start).toMatchObject({ line: 1, column: 1 });
  });
});
