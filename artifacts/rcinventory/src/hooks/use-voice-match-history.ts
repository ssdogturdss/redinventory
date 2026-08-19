const STORAGE_KEY = "rcinventory_voice_match_history";

export type MatchHistory = Record<number, { accepted: number; rejected: number }>;

function load(): MatchHistory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MatchHistory) : {};
  } catch {
    return {};
  }
}

function save(history: MatchHistory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // storage unavailable — silently ignore
  }
}

export function useVoiceMatchHistory() {
  const getHistory = (): MatchHistory => load();

  const getScore = (chemicalId: number): number => {
    const h = load()[chemicalId];
    if (!h) return 0;
    return h.accepted - h.rejected;
  };

  const recordOutcomes = (
    acceptedIds: number[],
    rejectedIds: number[]
  ): void => {
    const history = load();
    for (const id of acceptedIds) {
      if (!history[id]) history[id] = { accepted: 0, rejected: 0 };
      history[id].accepted += 1;
    }
    for (const id of rejectedIds) {
      if (!history[id]) history[id] = { accepted: 0, rejected: 0 };
      history[id].rejected += 1;
    }
    save(history);
  };

  return { getHistory, getScore, recordOutcomes };
}
