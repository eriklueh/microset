import { invoke } from "@tauri-apps/api/core";
import { buildCoachContext } from "../context";
import type { ProposedChange } from "../changes";
import type { CoachMessage, CoachProvider, CoachReply } from "../provider";
import { COACH_SYSTEM, anthropicTools } from "../prompt";

/**
 * Anthropic Messages API provider. The HTTP call goes through Rust
 * (`coach_complete`) so the API key stays out of the webview and there's no CORS.
 * The current config snapshot is appended to the system prompt each turn.
 */
export function anthropicProvider(model: string): CoachProvider {
  return {
    async complete(history: CoachMessage[]): Promise<CoachReply> {
      const context = buildCoachContext();
      const system = `${COACH_SYSTEM}\n\n## Contexto actual (JSON)\n${JSON.stringify(context)}`;
      const messages = history.map((m) => ({ role: m.role, content: m.content }));

      const raw = await invoke<string>("coach_complete", {
        model,
        system,
        messages,
        tools: anthropicTools(),
      });

      const data = JSON.parse(raw);
      let text = "";
      const changes: ProposedChange[] = [];
      for (const block of data.content ?? []) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_use") changes.push({ tool: block.name, args: block.input ?? {} });
      }
      return { text: text.trim(), changes };
    },
  };
}
