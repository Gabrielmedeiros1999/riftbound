
export type ClassAbility = {
  name: string;
  description: string;
  cooldown: number;
};

export const CLASS_ABILITIES: Record<string, ClassAbility> = {
  warrior: {
    name: "Escudo defensivo",
    description: "Reduz o dano recebido temporariamente.",
    cooldown: 8000,
  },

  assassin: {
    name: "Investida sombria",
    description: "Avança rapidamente na direção atual.",
    cooldown: 5000,
  },

  mage: {
    name: "Explosão arcana",
    description: "Causa dano nos inimigos próximos.",
    cooldown: 7000,
  },
};
