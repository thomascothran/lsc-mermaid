// Semantic model for Live Sequence Charts.
//
// Project-setup skeleton: chart-level fields only. Phase 1 adds instances,
// locations, messages, conditions, regions and the rest of the model
// described in the proposal's "Semantic model and public API" section.

export type HeaderKeyword = 'lsc-alpha' | 'lsc';

export type ChartMode = 'universal' | 'existential' | 'subchart';

export interface LscChart {
  keyword: HeaderKeyword;
  mode: ChartMode;
  title?: string;
  accTitle?: string;
  accDescr?: string;
}
