
export type GameSettings = {
  sfxVolume: number;
  musicVolume: number;
};

const SETTINGS_KEY = "riftbound-settings";

export const DEFAULT_SETTINGS: GameSettings = {
  sfxVolume: 0.5,
  musicVolume: 0.25,
};

export function loadSettings(): GameSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);

    if (!saved) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(saved);

    return {
      sfxVolume: isValidVolume(parsed.sfxVolume)
        ? parsed.sfxVolume
        : DEFAULT_SETTINGS.sfxVolume,
      musicVolume: isValidVolume(parsed.musicVolume)
        ? parsed.musicVolume
        : DEFAULT_SETTINGS.musicVolume,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Não foi possível salvar as configurações.", error);
  }
}

function isValidVolume(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}
