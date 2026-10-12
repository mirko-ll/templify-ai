// Every LLM the app calls, in one place. When a model is deprecated or
// replaced, change it here. templaito-backend picks its own translation
// models in src/services/translation.ts.

/** Product extraction and email copy: high volume, cost-sensitive. */
export const OPENAI_FAST_MODEL = "gpt-6-luna";
export const OPENAI_FAST_EFFORT = "medium";

/** HTML email design (GPT engine) and the English preview translation. */
export const OPENAI_MAIN_MODEL = "gpt-6.1-sol";
export const OPENAI_MAIN_EFFORT = "low";

/** HTML email design and multi-product copy (Claude engine). */
export const CLAUDE_MODEL = "claude-sonnet-5-5";
// Keep thinking on: in testing, Sonnet 5.5 with thinking off ("between_tools")
// left {{product_link}} / {{image_url}} unfilled in a template's HTML.
export const CLAUDE_THINKING = { type: "adaptive" } as const;
// Thinking (when on) shares this budget, and Claude 4.7+ tokenizers produce
// ~30% more tokens for the same HTML, so leave plenty of headroom.
export const CLAUDE_MAX_TOKENS = 16000;
