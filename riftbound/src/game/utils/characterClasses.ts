
export type CharacterClass = {
  id: string;
  name: string;
  description: string;
  maxHealth: number;
  damage: number;
  speed: number;
  spriteKey: string;
};

export const CHARACTER_CLASSES: CharacterClass[] = [
  {
    id: "warrior",
    name: "Guerreiro",
    description: "Resistente e preparado para combates prolongados.",
    maxHealth: 150,
    damage: 1,
    speed: 2.8,
    spriteKey: "hero",
  },
  {
    id: "assassin",
    name: "Assassino",
    description: "Rápido e mortal, especializado em ataques agressivos.",
    maxHealth: 90,
    damage: 2,
    speed: 3.5,
    spriteKey: "hero-assassin",
  },
  {
    id: "mage",
    name: "Mago",
    description: "Possui grande poder ofensivo, mas pouca resistência.",
    maxHealth: 100,
    damage: 3,
    speed: 3,
    spriteKey: "hero-mage",
  },
];

export function getCharacterClass(
  id: string
): CharacterClass {
  return (
    CHARACTER_CLASSES.find(
      (characterClass) => characterClass.id === id
    ) ?? CHARACTER_CLASSES[0]
  );
}
