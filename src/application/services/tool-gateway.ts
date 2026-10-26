/** A tool exposed to the AI, already namespaced as `serverName__toolName`. */
export interface ToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: {
    type: 'object';
    properties?: unknown;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface ToolExecutionResult {
  /** Text rendering of the tool output (a tool-level failure is reported via `isError`). */
  readonly content: string;
  readonly isError: boolean;
}

/** Port: the application knows the tools only through this abstraction, never MCP. */
export interface ToolGateway {
  getAllTools(): Promise<readonly ToolDefinition[]>;
  /**
   * @param namespacedName name as returned by `getAllTools()`
   * @throws Error when the tool is unknown or cannot be reached
   */
  executeTool(namespacedName: string, args: Record<string, unknown>): Promise<ToolExecutionResult>;
}
