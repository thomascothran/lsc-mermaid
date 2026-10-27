// Grammar for Live Sequence Charts (`lsc-alpha` / `lsc`).
//
// Project-setup skeleton: header, title and accessibility statements only.
// The full statement grammar is built in Phase 1, following the
// "Text notation specification" section of the proposal.
grammar Lsc

entry LscChart:
    NEWLINE*
    keyword=HeaderKeyword mode=ChartMode
    (NEWLINE+ statements+=Statement)*
    NEWLINE*;

HeaderKeyword returns string: 'lsc-alpha' | 'lsc';

ChartMode returns string: 'universal' | 'existential' | 'subchart';

Statement: TitleStatement | AccTitleStatement | AccDescrStatement;

TitleStatement: text=TITLE;
AccTitleStatement: text=ACC_TITLE;
AccDescrStatement: text=(ACC_DESCR | ACC_DESCR_BLOCK);

// Whole-line statements. The value converter strips the keyword.
terminal ACC_DESCR_BLOCK: /[\t ]*accDescr[\t ]*\{[^}]*\}/;
terminal ACC_DESCR: /[\t ]*accDescr[\t ]*:[^\n\r]*/;
terminal ACC_TITLE: /[\t ]*accTitle[\t ]*:[^\n\r]*/;
terminal TITLE: /[\t ]*title(?:[\t ][^\n\r]*)?/;

terminal NEWLINE: /\r?\n/;

// `%%` comments are whole lines only. This also skips `%%{init}%%`
// directives when the parser is used outside Mermaid.
hidden terminal COMMENT: /[\t ]*%%[^\n\r]*/;
hidden terminal WS: /[\t ]+/;
