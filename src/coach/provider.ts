import { useStore } from "@/store/useStore";
import type { ProposedChange } from "./changes";
import { anthropicProvider } from "./providers/anthropic";
import { localProvider } from "./providers/local";

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

/** Pick the active provider from the user's coach config (provider/model/endpoint). */
export function getProvider(): CoachProvider {
  const c = useStore.getState().coach;
  if (c.provider === "local") return localProvider(c.model, c.endpoint);
  return anthropicProvider(c.model);
}
