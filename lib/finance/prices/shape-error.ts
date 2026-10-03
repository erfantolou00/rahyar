export class MarketShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketShapeError";
  }
}
