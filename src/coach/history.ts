import { appConfigDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

export interface AppliedRecord {
  ts: string;
  changes: string[]; // humanized change descriptions
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  messages: ChatMsg[];
  applied: AppliedRecord[];
  source?: "app" | "claude-code";
}

export interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  source: "app" | "claude-code";
}

/**
 * In-app coach conversations, one JSON per thread under <config>/chats/. Managed
 * separately from the config file-sync (different churn). Phase 2 will merge in
 * read-only Claude Code sessions read from disk.
 */
let dir = "";
async function chatsDir(): Promise<string> {
  if (!dir) dir = await join(await appConfigDir(), "chats");
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return dir;
}

export async function listConversations(): Promise<ConversationMeta[]> {
  try {
    const d = await chatsDir();
    const entries = await readDir(d);
    const metas: ConversationMeta[] = [];
    for (const e of entries) {
      if (!e.isFile || !e.name.endsWith(".json")) continue;
      try {
        const c = JSON.parse(await readTextFile(await join(d, e.name))) as Conversation;
        metas.push({
          id: c.id,
          title: c.title || "Sin título",
          updatedAt: c.updatedAt,
          messageCount: c.messages?.length ?? 0,
          source: "app",
        });
      } catch {
        // skip a malformed file
      }
    }
    metas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return metas;
  } catch {
    return [];
  }
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  try {
    const p = await join(await chatsDir(), `${id}.json`);
    if (!(await exists(p))) return null;
    return JSON.parse(await readTextFile(p)) as Conversation;
  } catch {
    return null;
  }
}

export async function saveConversation(c: Conversation): Promise<void> {
  try {
    const p = await join(await chatsDir(), `${c.id}.json`);
    await writeTextFile(p, JSON.stringify(c, null, 2));
  } catch {
    // not in Tauri / fs unavailable
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    const p = await join(await chatsDir(), `${id}.json`);
    if (await exists(p)) await remove(p);
  } catch {
    // ignore
  }
}
