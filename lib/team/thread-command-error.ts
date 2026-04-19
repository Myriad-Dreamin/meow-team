export class TeamThreadCommandError extends Error {
  readonly statusCode: 400 | 404 | 409;

  constructor(message: string, statusCode: 400 | 404 | 409) {
    super(message);
    this.name = "TeamThreadCommandError";
    this.statusCode = statusCode;
  }
}
