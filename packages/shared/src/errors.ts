export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly meta?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DomainError";
  }
}
