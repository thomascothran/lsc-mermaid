// Grammar for Live Sequence Charts (`lsc-alpha` / `lsc`).
//
// The grammar is deliberately permissive about where statements appear: the model builder
// enforces the context rules ("Where statements may appear" in the proposal), so that an error
// can say what is allowed instead of just failing to parse. For the same reason it accepts
// Mermaid's other arrows and `create participant x`, which the builder rejects with a message
// showing the LSC form (V23, V24).
grammar Lsc

entry LscChart:
    NL?
    keyword=HeaderKeyword (mode=ChartMode)?
    (NL statements+=Statement)*
    NL?;

HeaderKeyword returns string: 'lsc-alpha' | 'lsc';

ChartMode returns string: 'universal' | 'existential' | 'subchart';

Statement:
      TitleStatement | AccTitleStatement | AccDescrStatement | DefaultsStatement
    | InstanceDecl | VarDecl | VisibleDecl | ActivationWhen | ActivationOn | Prechart
    | MessageStatement | SendStatement | ReceiveStatement | ConditionStatement
    | ProgressStatement | Coregion | Simultaneous | SubchartBlock | IfBlock
    | CreateStatement | DestroyStatement | TimeoutStatement | NoteStatement;

// ---- Declarations -------------------------------------------------------------------------

TitleStatement: text=TITLE;
AccTitleStatement: text=ACC_TITLE;
AccDescrStatement: text=(ACC_DESCR | ACC_DESCR_BLOCK);

DefaultsStatement: 'defaults' temp=Temp;

InstanceDecl: kind=InstanceKeyword items+=InstanceItem (',' items+=InstanceItem)*;
InstanceItem: name=Name (label=AS_LABEL)?;

VarDecl: 'var' first=Name ('.' second=Name)? (type=TEXT)?;

VisibleDecl: 'visible' (dir=Direction)? from=Name arrow=Arrow to=Name text=TEXT;

ActivationWhen: text=ACTIVATION_WHEN;
ActivationOn: ACTIVATION_ON (dir=Direction)? from=Name arrow=Arrow to=Name text=TEXT;

Prechart: 'prechart' NL (statements+=Statement NL)* 'end';

// ---- Events and conditions ----------------------------------------------------------------

MessageStatement: (temp=Temp)? from=Name arrow=Arrow to=Name text=TEXT;

SendStatement: (temp=Temp)? 'send' (occurrence=OCCURRENCE)? from=Name arrow=Arrow to=Name text=TEXT;

ReceiveStatement: 'receive' (occurrence=OCCURRENCE)? to=Name 'from' from=Name text=TEXT;

ConditionStatement: (temp=Temp)? 'condition' instances+=Name (',' instances+=Name)* text=TEXT;

ProgressStatement: temp=Temp 'progress' instances+=Name (',' instances+=Name)*;

TimeoutStatement: 'timeout' instance=Name text=TEXT;

CreateStatement:
    'create' (mermaidKeyword=InstanceKeyword)? name=Name (label=AS_LABEL)? ('by' creator=Name)?;

DestroyStatement: 'destroy' instance=Name;

NoteStatement:
    keyword=('note' | 'Note')
    ( placement='over' instances+=Name (',' instances+=Name)*
    | placement='left' 'of' instances+=Name
    | placement='right' 'of' instances+=Name )
    text=TEXT;

// ---- Blocks -------------------------------------------------------------------------------

Coregion: 'coregion' instance=Name NL (statements+=Statement NL)* end=End;

Simultaneous:
    'simultaneous' instances+=Name (',' instances+=Name)* NL (statements+=Statement NL)* end=End;

SubchartBlock:
    'subchart' (name=STRING)?
    ('over' over+=Name (',' over+=Name)*)?
    ('repeat' (repeatAny?='*' | repeatCount=INT | repeatVar=Name))?
    NL (statements+=Statement NL)* end=End;

IfBlock:
    'if' (name=STRING)? instances+=Name (',' instances+=Name)* text=TEXT
    NL (then+=Statement NL)*
    (else=ElseClause)?
    end=End;

ElseClause: 'else' (name=STRING)? NL (statements+=Statement NL)*;

// Kept as a node so that the builder knows where a block ends.
End: value='end';

// ---- Shared pieces ------------------------------------------------------------------------

InstanceKeyword returns string: 'instance' | 'participant' | 'actor';
Temp returns string: 'hot' | 'cold';
Direction returns string: 'send' | 'receive';

// `->>` and `-)` are the LSC arrows; the others are Mermaid's, rejected by the builder (V23).
Arrow returns string:
    '->>' | '-)' | '-->>' | '--)' | '->' | '-->' | '-x' | '--x' | '<<->>' | '<<-->>';

// Keywords are contextual: in a name position any keyword except `end` and `else` is a name.
Name returns string:
      NAME | STRING
    | 'lsc' | 'lsc-alpha' | 'universal' | 'existential' | 'subchart' | 'defaults'
    | 'instance' | 'participant' | 'actor' | 'var' | 'visible' | 'prechart'
    | 'hot' | 'cold' | 'progress' | 'send' | 'receive' | 'from' | 'condition'
    | 'coregion' | 'simultaneous' | 'over' | 'repeat' | 'if' | 'create' | 'by'
    | 'destroy' | 'timeout' | 'note' | 'Note' | 'left' | 'right' | 'of';

// ---- Terminals ----------------------------------------------------------------------------
// Chevrotain tries keywords first, then terminals in the order below.

// Whole-line statements. The value converter strips the keyword.
terminal ACC_DESCR_BLOCK: /accDescr[\t ]*\{[^}]*\}/;
terminal ACC_DESCR: /accDescr[\t ]*:[^\n\r]*/;
terminal ACC_TITLE: /accTitle[\t ]*:[^\n\r]*/;
terminal TITLE: /title(?![A-Za-z0-9_])[^\n\r]*/;
terminal ACTIVATION_WHEN: /activation[\t ]+when(?![A-Za-z0-9_])[^\n\r]*/;
terminal ACTIVATION_ON: /activation[\t ]+on(?![A-Za-z0-9_])/;

// `as` and the label: a quoted string, or (unquoted) the rest of the line.
terminal AS_LABEL: /as[\t ]+(?:"[^"\n\r]*"|[^"\s][^\n\r]*)/;

// Everything after `:` to the end of the line: message labels, conditions, notes, types.
terminal TEXT: /:[^\n\r]*/;

terminal OCCURRENCE: /#[A-Za-z][A-Za-z0-9_]*/;
terminal STRING: /"[^"\n\r]*"/;
terminal INT returns number: /[0-9]+/;
terminal NAME: /[A-Za-z_\u00C0-\u024F][A-Za-z0-9_\u00C0-\u024F]*/;

// A line break, together with any blank or comment-only lines after it.
terminal NL: /\r?\n(?:[\t ]*(?:%%[^\n\r]*)?\r?\n)*/;

// `%%` comments are whole lines only. This also skips `%%{init}%%` directives when the parser
// is used outside Mermaid.
hidden terminal COMMENT: /%%[^\n\r]*/;
hidden terminal WS: /[\t ]+/;
