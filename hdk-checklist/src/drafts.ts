import type { CheckKind, ChecklistSection } from "./types";

/**
 * An inspection in progress, saved on this device as it goes so a closed app or a phone call
 * doesn't lose it. Kept in IndexedDB rather than localStorage because fault photos can be large.
 * The PIN and the drawn signature are never saved: the operator gives them again to continue.
 */
export interface Draft {
  kind: CheckKind;
  operatorName: string;
  /** The period it belongs to (date, week start, …); a draft from an earlier period is dropped */
  periodKey: string;
  startedAt: string;
  savedAt: string;
  sections: ChecklistSection[];
  currentIdx: number;
  phase: "item" | "review" | "outro";
  elapsed: number;
  overallCondition: "Excellent" | "Good" | "Poor" | "";
  comments: string;
  markedAllOk?: number;
}

const DB = "hdk_drafts";
const STORE = "drafts";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  } catch {
    return undefined; // private browsing or storage blocked: carry on without drafts
  }
}

export const loadDraft = (kind: CheckKind) => run<Draft>("readonly", (s) => s.get(kind));
export const saveDraft = (draft: Draft) => run("readwrite", (s) => s.put(draft, draft.kind));
export const deleteDraft = (kind: CheckKind) => run("readwrite", (s) => s.delete(kind));
