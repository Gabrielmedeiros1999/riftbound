const BEST_WAVE_KEY = "riftbound-best-wave";

export function getBestWave(): number {
  try {
    const saved = localStorage.getItem(BEST_WAVE_KEY);
    const wave = Number(saved);

    return Number.isFinite(wave) && wave > 0 ? wave : 0;
  } catch {
    return 0;
  }
}

export function saveBestWave(wave: number): number {
  const currentRecord = getBestWave();

  if (wave <= currentRecord) {
    return currentRecord;
  }

  try {
    localStorage.setItem(BEST_WAVE_KEY, String(wave));
  } catch (error) {
    console.warn("Não foi possível salvar o recorde.", error);
  }

  return wave;
}