import type { ProposedChange } from "./changes";
import { anthropicProvider } from "./providers/anthropic";

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CoachReply {
  text: string;
  changes: ProposedChange[];
}

/** A provider drives one LLM (API, local, …); the contract (context/tools/prompt)
 *  is shared. `complete` gets the conversation and returns reply text + proposed
 *  tool calls; the UI handles review-and-apply. */
export interface CoachProvider {
  complete(history: CoachMessage[]): Promise<CoachReply>;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Pick the active provider. For now: Anthropic API (Sonnet). Phase F adds local
 *  + a coach.json selector. */
export function getProvider(): CoachProvider {
  return anthropicProvider(DEFAULT_MODEL);
}
