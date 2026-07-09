/**
 * The VortSpec IDE MCP contract — shared by the main-process bridge and the
 * stdio forwarder (`server.mjs`). The forwarder is generic: it pulls this
 * catalog from the bridge at connect time and forwards `tools/call`s, so the
 * tool set lives here alone.
 *
 * Two tiers:
 *  - **reads / navigation** (`get_*`, `open_file`) — safe, reversible; run immediately.
 *  - **state-changing** (`open_folder`, `clone_repo`, `switch_project`) — swap the
 *    user's workspace, so the host MUST surface a confirmation and only act on
 *    approval. `stateChanging: true` marks these; the bridge never bypasses them.
 */

/** A JSON-Schema object (loosely typed — it is forwarded verbatim to Claude). */
export type JsonSchema = Record<string, unknown>;

export interface IdeTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** True for tools that change the user's workspace; the host must gate them. */
  stateChanging: boolean;
}

const noArgs: JsonSchema = { type: "object", properties: {}, additionalProperties: false };

/** The canonical tool set Claude sees as `mcp__vortspec-ide__*`. */
export const IDE_TOOLS: IdeTool[] = [
  {
    name: "get_workspace_folders",
    description: "List the folders open in the VortSpec IDE (the active project root).",
    inputSchema: noArgs,
    stateChanging: false,
  },
  {
    name: "get_open_editors",
    description: "List the files currently open as tabs in the IDE editor, and which is active.",
    inputSchema: noArgs,
    stateChanging: false,
  },
  {
    name: "get_selection",
    description:
      "Get the user's current editor selection (active file, 1-based line range, and the selected text), if any.",
    inputSchema: noArgs,
    stateChanging: false,
  },
  {
    name: "open_file",
    description: "Open a file in the IDE editor and optionally reveal a line range. Path is relative to the project root.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project-relative path to open." },
        startLine: { type: "number", description: "Optional 1-based line to reveal." },
        endLine: { type: "number", description: "Optional 1-based end line to select through." },
      },
      required: ["path"],
      additionalProperties: false,
    },
    stateChanging: false,
  },
  {
    name: "open_folder",
    description:
      "Open a folder as the IDE workspace. Prompts the user to confirm (or to pick a folder if no path is given) before switching.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to open. Omit to let the user pick." },
      },
      additionalProperties: false,
    },
    stateChanging: true,
  },
  {
    name: "clone_repo",
    description:
      "Clone a Git repository and open it as the IDE workspace. Prompts the user to confirm before cloning.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The repository URL to clone (https or ssh)." },
      },
      required: ["url"],
      additionalProperties: false,
    },
    stateChanging: true,
  },
  {
    name: "switch_project",
    description:
      "Switch the IDE to one of the user's recent projects. Prompts the user to confirm before switching.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path of the recent project to switch to." },
        name: { type: "string", description: "Or the project name, if the path is unknown." },
      },
      additionalProperties: false,
    },
    stateChanging: true,
  },
];

/** The result of invoking a tool; `message` is the text Claude receives. */
export interface IdeToolResult {
  ok: boolean;
  message: string;
}

/**
 * What the bridge dispatches to. The IDE main process supplies this, backed by
 * renderer state (reads) and a confirmation flow (state-changing tools).
 */
export interface IdeMcpHost {
  /** The tool catalog to advertise (defaults to {@link IDE_TOOLS}). */
  catalog(): IdeTool[];
  /** Run a tool. Implementations MUST gate every `stateChanging` tool. */
  invoke(tool: string, args: Record<string, unknown>): Promise<IdeToolResult>;
}

// --- Bridge wire protocol (newline-delimited JSON over a local socket) --------

export type BridgeClientMessage =
  | { type: "hello"; token: string }
  | { type: "call"; id: number; tool: string; args: Record<string, unknown> };

export type BridgeServerMessage =
  | { type: "welcome"; catalog: IdeTool[] }
  | { type: "denied"; message: string }
  | { type: "result"; id: number; ok: boolean; message: string };
