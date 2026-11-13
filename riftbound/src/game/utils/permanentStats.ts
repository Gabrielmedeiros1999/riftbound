
const STATS_KEY = "riftbound-permanent-stats";

export type PermanentStats = {
  totalMatches: number;
  totalSurvivalTime: number;
  highestWave: number;
  highestLevel: number;
  totalEnemiesDefeated: number;
};

const DEFAULT_STATS: PermanentStats = {
  totalMatches: 0,
  totalSurvivalTime: 0,
  highestWave: 0,
  highestLevel: 0,
  totalEnemiesDefeated: 0,
};

export function getPermanentStats(): PermanentStats {
  try {
    const saved = localStorage.getItem(STATS_KEY);

    if (!saved) return { ...DEFAULT_STATS };

    const parsed = JSON.parse(saved);

    return {
      totalMatches: validNumber(parsed.totalMatches),
      totalSurvivalTime: validNumber(parsed.totalSurvivalTime),
      highestWave: validNumber(parsed.highestWave),
      highestLevel: validNumber(parsed.highestLevel),
      totalEnemiesDefeated: validNumber(parsed.totalEnemiesDefeated),
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

function validNumber(value: unknown): number {
  return typeof value === "number" &&
    Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

export function savePermanentStats(
  match: {
    wave: number;
    level: number;
    survivalTime: number;
    enemiesDefeated: number;
  }
): void {
  const current = getPermanentStats();

  const updated: PermanentStats = {
    totalMatches: current.totalMatches + 1,
    totalSurvivalTime: current.totalSurvivalTime + match.survivalTime,
    highestWave: Math.max(current.highestWave, match.wave),
    highestLevel: Math.max(current.highestLevel, match.level),
    totalEnemiesDefeated:
      current.totalEnemiesDefeated + match.enemiesDefeated,
  };

  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn("Não foi possível salvar as estatísticas.", error);
  }
}
