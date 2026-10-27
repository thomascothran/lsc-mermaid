// Colours come only from theme variables. The diagram's own variables default
// to values derived from Mermaid's standard ones and can be overridden through
// `themeVariables`.

export interface LscThemeVariables {
  lscFrameColor?: string;
  lscHotColor?: string;
  lscColdColor?: string;
  lscConditionFill?: string;
  lineColor?: string;
  primaryColor?: string;
  mainBkg?: string;
  textColor?: string;
  fontFamily?: string;
}

export function lscThemeVariables(options: LscThemeVariables) {
  return {
    frame: options.lscFrameColor ?? options.lineColor,
    hot: options.lscHotColor ?? options.lineColor,
    cold: options.lscColdColor ?? options.lineColor,
    conditionFill: options.lscConditionFill ?? options.mainBkg ?? options.primaryColor,
    text: options.textColor,
  };
}

export const styles = (options: LscThemeVariables): string => {
  const v = lscThemeVariables(options);
  return `
  .lsc-frame {
    fill: none;
    stroke: ${v.frame};
    stroke-width: 1.5px;
  }
  .lsc-hot {
    stroke-dasharray: none;
  }
  .lsc-cold {
    stroke-dasharray: 6 4;
  }
  .lsc-tab-text {
    fill: ${v.text};
    font-family: ${options.fontFamily};
  }
`;
};
