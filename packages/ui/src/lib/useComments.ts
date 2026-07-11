import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import {
  newCommentId,
  parseMentions,
  type CommentThread,
  type CommentMessage,
  type CommentCollaborator,
  type Anchor,
} from "@vortspec/core/comment";

/**
 * Run-Canvas comments controller (change: run-canvas-comments, Phase 2).
 *
 * Loads the repo-backed threads for a project, keeps the guest watching their anchor
 * fingerprints (so pins get live rects), and exposes create/reply/resolve — each
 * persisted through the `comments:*` IPC (Phase 1 store). Author identity is the
 * profile name + the active GitHub account (best-effort; drives Phase-3 mentions).
 */
export interface CommentsController {
  threads: CommentThread[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  author: { name: string; githubLogin: string | null };
  /** Repo collaborators for @mention autocomplete (empty when not a GitHub repo). */
  collaborators: CommentCollaborator[];
  /** The outcome of the last mention-notify (a success note or a fix-it), or null. */
  notice: { ok: boolean; text: string } | null;
  clearNotice: () => void;
  create: (anchor: Anchor, body: string) => Promise<CommentThread | null>;
  reply: (threadId: string, body: string) => Promise<void>;
  setResolved: (threadId: string, resolved: boolean) => Promise<void>;
  /** Push the auto-committed comment commits (manual Share); surfaces the outcome. */
  share: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useComments(
  projectPath: string,
  watchAnchors: (fingerprints: string[]) => void,
  /** Whether the guest bridge is attached — re-sends the watch once the preview mounts. */
  bridgeReady = true,
): CommentsController {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [author, setAuthor] = useState<{ name: string; githubLogin: string | null }>({
    name: "You",
    githubLogin: null,
  });
  const [collaborators, setCollaborators] = useState<CommentCollaborator[]>([]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Author = the profile name + the active GitHub account (best-effort, never blocks).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [profile, auth] = await Promise.all([
        api.getProfile().catch(() => null),
        api.providerAuth(projectPath).catch(() => null),
      ]);
      if (!alive) return;
      setAuthor({
        name: profile?.name?.trim() || "You",
        githubLogin: auth?.authenticated ? auth.activeAccount : null,
      });
    })();
    return () => {
      alive = false;
    };
  }, [projectPath]);

  const reload = useCallback(async () => {
    try {
      setThreads(await api.listComments(projectPath));
    } catch {
      setThreads([]);
    }
  }, [projectPath]);
  useEffect(() => {
    void reload();
  }, [reload]);

  // @mention candidates (repo collaborators/contributors), best-effort.
  useEffect(() => {
    let alive = true;
    void api
      .commentCollaborators(projectPath)
      .then((c) => alive && setCollaborators(c))
      .catch(() => alive && setCollaborators([]));
    return () => {
      alive = false;
    };
  }, [projectPath]);

  // After a post with @mentions, notify via GitHub and surface the outcome.
  const notifyIfMentioned = useCallback(
    async (threadId: string, message: CommentMessage) => {
      if (message.mentions.length === 0) return;
      const res = await api.notifyComment(projectPath, threadId, message.id).catch(() => null);
      if (!res) return;
      setNotice(res.notified ? { ok: true, text: "Notified on GitHub." } : { ok: false, text: res.reason ?? "Could not notify." });
      if (res.notified) void reload(); // pick up the stored receipt
    },
    [projectPath, reload],
  );

  // Keep the guest tracking every thread's anchor so pins get live rects. Re-runs
  // when the bridge becomes ready, so an early watch (before the preview mounts) is
  // re-sent once `<webview>.send` actually works.
  useEffect(() => {
    if (bridgeReady) watchAnchors(threads.map((t) => t.anchor.fingerprint));
  }, [threads, watchAnchors, bridgeReady]);

  const persist = useCallback(
    async (thread: CommentThread): Promise<CommentThread> => {
      const { thread: saved } = await api.upsertComment(projectPath, thread);
      setThreads((prev) => {
        const i = prev.findIndex((t) => t.id === saved.id);
        if (i < 0) return [...prev, saved];
        const next = [...prev];
        next[i] = saved;
        return next;
      });
      return saved;
    },
    [projectPath],
  );

  const mkMessage = useCallback(
    (body: string): CommentMessage => ({
      id: newCommentId(),
      author: { name: author.name, githubLogin: author.githubLogin },
      body,
      mentions: parseMentions(body),
      createdAt: new Date().toISOString(),
    }),
    [author],
  );

  const create = useCallback(
    async (anchor: Anchor, body: string): Promise<CommentThread | null> => {
      if (!body.trim()) return null;
      const now = new Date().toISOString();
      const msg = mkMessage(body);
      const saved = await persist({
        id: newCommentId(),
        anchor,
        createdAt: now,
        updatedAt: now,
        resolved: false,
        messages: [msg],
      });
      setActiveId(saved.id);
      void notifyIfMentioned(saved.id, msg);
      return saved;
    },
    [persist, mkMessage, notifyIfMentioned],
  );

  const reply = useCallback(
    async (threadId: string, body: string): Promise<void> => {
      if (!body.trim()) return;
      const t = threads.find((x) => x.id === threadId);
      if (!t) return;
      const msg = mkMessage(body);
      await persist({ ...t, updatedAt: new Date().toISOString(), messages: [...t.messages, msg] });
      void notifyIfMentioned(threadId, msg);
    },
    [threads, persist, mkMessage, notifyIfMentioned],
  );

  const setResolved = useCallback(
    async (threadId: string, resolved: boolean): Promise<void> => {
      const res = await api.resolveComment(projectPath, threadId, resolved);
      if (res) setThreads((prev) => prev.map((t) => (t.id === threadId ? res.thread : t)));
    },
    [projectPath],
  );

  const share = useCallback(async (): Promise<void> => {
    const res = await api.shareComments(projectPath).catch(() => null);
    if (res) setNotice({ ok: res.ok, text: res.ok ? "Shared — teammates get the comments on pull." : res.message });
  }, [projectPath]);

  return {
    threads,
    activeId,
    setActiveId,
    author,
    collaborators,
    notice,
    clearNotice: useCallback(() => setNotice(null), []),
    create,
    reply,
    setResolved,
    share,
    reload,
  };
}
