export { handleCompletion as provideCompletions } from './completions';
export { handleDefinition as provideDefinition } from './definition';
export { validateDocument } from './diagnostics';
export { handleHover as provideHover } from './hover';
export {
  handleSemanticTokens as provideSemanticTokens,
  legend as semanticTokensLegend,
} from './semantic-tokens';
