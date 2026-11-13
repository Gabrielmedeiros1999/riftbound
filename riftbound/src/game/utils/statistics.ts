import { getMatchHistory } from "./history";
import { getBestWave } from "./records";

export function getStatistics() {
  const history = getMatchHistory();

  const totalMatches = history.length;

  const highestLevel = history.reduce(
    (highest, match) => Math.max(highest, match.level),
    0
  );

  const totalSurvivalTime = history.reduce(
    (total, match) => total + match.survivalTime,
    0
  );

  const averageWave =
    totalMatches > 0
      ? history.reduce((total, match) => total + match.wave, 0) /
        totalMatches
      : 0;

  return {
    totalMatches,
    bestWave: getBestWave(),
    highestLevel,
    totalSurvivalTime,
    averageWave: averageWave.toFixed(1),
  };
}