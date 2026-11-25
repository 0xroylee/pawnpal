export class LibraryFault extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 429;

  constructor(status: LibraryFault["status"], message: string) {
    super(message);
    this.status = status;
  }
}
