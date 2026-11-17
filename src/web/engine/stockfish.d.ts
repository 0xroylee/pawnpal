declare module "stockfish" {
  type StockfishEngine = {
    processCommand: (line: string) => void;
    terminate?: () => void;
  };
  type InitStockfish = (
    enginePath: string,
    onMessage?: (message: unknown) => void,
  ) => StockfishEngine;
  const initStockfish: InitStockfish;
  export default initStockfish;
}
