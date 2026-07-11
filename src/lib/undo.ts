import { Task, AllData } from "./types";

const MAX_UNDO_STACK = 20;

export interface UndoSnapshot {
  allData: AllData;
  backlog: Task[];
}

export interface UndoState {
  _undoStack: UndoSnapshot[];
  _redoStack: UndoSnapshot[];
  _snapshot: () => void;
  _undo: () => UndoSnapshot | null;
  _redo: () => UndoSnapshot | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

/**
 * Undo/redo mixin — not a Zustand middleware, but a set of helpers
 * that the store calls manually. This keeps the approach simple while
 * providing full undo/redo for allData + backlog mutations.
 */
export function createUndoHelpers() {
  const undoStack: UndoSnapshot[] = [];
  const redoStack: UndoSnapshot[] = [];

  function snapshot(getState: () => { allData: AllData; backlog: Task[] }) {
    const { allData, backlog } = getState();
    // Deep-clone allData (only the non-empty months)
    const cloneAllData: AllData = {};
    for (const key of Object.keys(allData)) {
      cloneAllData[Number(key)] = allData[Number(key)].map((t) => ({
        ...t,
        commentLog: [...t.commentLog],
      }));
    }
    // Deep-clone backlog
    const cloneBacklog = backlog.map((t) => ({
      ...t,
      commentLog: [...t.commentLog],
    }));

    // Push current state to undo stack, clear redo
    if (undoStack.length >= MAX_UNDO_STACK) {
      undoStack.shift();
    }
    undoStack.push({ allData: cloneAllData, backlog: cloneBacklog });
    redoStack.length = 0; // Clear redo on new action
  }

  function undo(
    getState: () => { allData: AllData; backlog: Task[] }
  ): UndoSnapshot | null {
    if (undoStack.length === 0) return null;
    const { allData, backlog } = getState();

    // Save current state to redo stack
    const cloneAllData: AllData = {};
    for (const key of Object.keys(allData)) {
      cloneAllData[Number(key)] = allData[Number(key)].map((t) => ({
        ...t,
        commentLog: [...t.commentLog],
      }));
    }
    const cloneBacklog = backlog.map((t) => ({
      ...t,
      commentLog: [...t.commentLog],
    }));
    if (redoStack.length >= MAX_UNDO_STACK) {
      redoStack.shift();
    }
    redoStack.push({ allData: cloneAllData, backlog: cloneBacklog });

    // Pop from undo stack
    const prev = undoStack.pop()!;
    return prev;
  }

  function redo(
    getState: () => { allData: AllData; backlog: Task[] }
  ): UndoSnapshot | null {
    if (redoStack.length === 0) return null;
    const { allData, backlog } = getState();

    // Save current state to undo stack
    const cloneAllData: AllData = {};
    for (const key of Object.keys(allData)) {
      cloneAllData[Number(key)] = allData[Number(key)].map((t) => ({
        ...t,
        commentLog: [...t.commentLog],
      }));
    }
    const cloneBacklog = backlog.map((t) => ({
      ...t,
      commentLog: [...t.commentLog],
    }));
    if (undoStack.length >= MAX_UNDO_STACK) {
      undoStack.shift();
    }
    undoStack.push({ allData: cloneAllData, backlog: cloneBacklog });

    // Pop from redo stack
    const next = redoStack.pop()!;
    return next;
  }

  return {
    snapshot,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    /** Полный сброс истории — например, когда с сервера пришли чужие
     *  правки: откат к локальному снимку перезаписал бы их. */
    clear: () => { undoStack.length = 0; redoStack.length = 0; },
  };
}
