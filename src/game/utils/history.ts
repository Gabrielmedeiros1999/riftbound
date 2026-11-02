export type MatchRecord = {
  wave: number;
  level: number;
  survivalTime: number;
  enemiesDefeated: number;
  date: string;
};

const HISTORY_KEY = "riftbound-match-history";
const MAX_MATCHES = 10;

export function getMatchHistory(): MatchRecord[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);

    if (!saved) return [];

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (match) =>
          match &&
          typeof match.wave === "number" &&
          typeof match.level === "number" &&
          typeof match.survivalTime === "number" &&
          typeof match.date === "string",
      )
      .map(
        (match): MatchRecord => ({
          wave: match.wave,
          level: match.level,
          survivalTime: match.survivalTime,
          // Partidas antigas não tinham esse campo
          enemiesDefeated:
            typeof match.enemiesDefeated === "number"
              ? match.enemiesDefeated
              : 0,
          date: match.date,
        }),
      );
  } catch {
    return [];
  }
}

export function saveMatch(record: MatchRecord): void {
  try {
    const history = getMatchHistory();

    history.unshift(record);

    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history.slice(0, MAX_MATCHES)),
    );
  } catch (error) {
    console.warn("Não foi possível salvar o histórico.", error);
  }
}