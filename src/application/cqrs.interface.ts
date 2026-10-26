/** Handles a write operation (command) and optionally returns a result such as the new id. */
export interface CommandHandler<TCommand, TResult = void> {
  execute(command: TCommand): Promise<TResult>;
}

/** Handles a read operation (query). It never changes the state of the system. */
export interface QueryHandler<TQuery, TResult> {
  execute(query: TQuery): Promise<TResult>;
}
