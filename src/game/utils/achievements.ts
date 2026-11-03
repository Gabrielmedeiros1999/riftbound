
export type Achievement = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
};

const ACHIEVEMENTS_KEY = "riftbound-achievements";

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-match",
    title: "Primeira Batalha",
    description: "Jogue sua primeira partida.",
    unlocked: false,
  },
  {
    id: "wave-5",
    title: "Sobrevivente",
    description: "Alcance a onda 5.",
    unlocked: false,
  },
  {
    id: "wave-10",
    title: "Guerreiro Implacável",
    description: "Alcance a onda 10.",
    unlocked: false,
  },
  {
    id: "kills-100",
    title: "Caçador de Monstros",
    description: "Derrote 100 inimigos.",
    unlocked: false,
  },
  {
    id: "survival-10",
    title: "Resistência",
    description: "Sobreviva por 10 minutos em uma partida.",
    unlocked: false,
  },
];

export function getAchievements(): Achievement[] {
  try {
    const saved = localStorage.getItem(ACHIEVEMENTS_KEY);

    if (!saved) {
      return ACHIEVEMENTS.map((achievement) => ({
        ...achievement,
      }));
    }

    const unlockedIds: string[] = JSON.parse(saved);

    return ACHIEVEMENTS.map((achievement) => ({
      ...achievement,
      unlocked: unlockedIds.includes(achievement.id),
    }));
  } catch {
    return ACHIEVEMENTS.map((achievement) => ({
      ...achievement,
    }));
  }
}

export function unlockAchievement(id: string): boolean {
  const achievements = getAchievements();

  const achievement = achievements.find((item) => item.id === id);

  if (!achievement || achievement.unlocked) {
    return false;
  }

  const unlockedIds = achievements
    .filter((item) => item.unlocked)
    .map((item) => item.id);

  unlockedIds.push(id);

  try {
    localStorage.setItem(
      ACHIEVEMENTS_KEY,
      JSON.stringify(unlockedIds)
    );

    return true;
  } catch (error) {
    console.warn("Não foi possível salvar a conquista.", error);
    return false;
  }
}
