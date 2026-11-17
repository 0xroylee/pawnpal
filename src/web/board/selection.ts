export type SelectionState = {
  selected: string | null;
  targets: string[];
  move?: { from: string; to: string };
};
export type SelectionEvent = { square: string; pieceColor?: "w" | "b" | null };
export type SelectionRules = {
  kidColor: "w" | "b";
  legalTargets: (square: string) => string[];
  interactive?: boolean;
};

export function selectionReducer(
  selection: SelectionState,
  event: SelectionEvent,
  rules: SelectionRules,
): SelectionState {
  if (rules.interactive === false)
    return selection.selected ? { selected: null, targets: [] } : selection;

  if (event.pieceColor === rules.kidColor) {
    return {
      selected: event.square,
      targets: rules.legalTargets(event.square),
    };
  }

  if (selection.selected && selection.targets.includes(event.square)) {
    return {
      selected: null,
      targets: [],
      move: { from: selection.selected, to: event.square },
    };
  }

  return selection.selected ? { selected: null, targets: [] } : selection;
}
