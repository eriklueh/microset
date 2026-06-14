import { invoke } from "@tauri-apps/api/core";
import { buildCoachContext } from "../context";
import type { ProposedChange } from "../changes";
import type { CoachMessage, CoachProvider, CoachReply } from "../provider";
import { COACH_SYSTEM } from "../prompt";
import { COACH_TOOLS } from "../tools";

/** Tool catalog in OpenAI function-calling format. */
function openaiTools() {
  return COACH_TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.params },
  }));
}

/**
 * Local OpenAI-compatible provider (Ollama, LM Studio, …). Same contract as the
 * Anthropic one; the HTTP call goes through Rust (`coach_complete_openai`).
 */
export function localProvider(model: string, endpoint: string): CoachProvider {
  return {
    async complete(history: CoachMessage[]): Promise<CoachReply> {
      const context = buildCoachContext();
      const system = `${COACH_SYSTEM}\n\n## Contexto actual (JSON)\n${JSON.stringify(context)}`;
      const messages = [
        { role: "system", content: system },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ];

      const raw = await invoke<string>("coach_complete_openai", {
        endpoint,
        model,
        messages,
        tools: openaiTools(),
      });

      const data = JSON.parse(raw);
      const msg = data.choices?.[0]?.message ?? {};
      const text: string = msg.content ?? "";
      const changes: ProposedChange[] = [];
      for (const tc of msg.tool_calls ?? []) {
        try {
          changes.push({ tool: tc.function.name, args: JSON.parse(tc.function.arguments || "{}") });
        } catch {
          // skip a malformed tool call rather than failing the whole reply
        }
      }
      return { text: text.trim(), changes };
    },
  };
}
