
import Phaser from "phaser";
import { getAchievements } from "../utils/achievements";

export class AchievementsScene extends Phaser.Scene {
  constructor() {
    super("AchievementsScene");
  }

  create() {
    const centerX = this.scale.width / 2;
    const achievements = getAchievements();

    this.add.rectangle(
      centerX,
      this.scale.height / 2,
      this.scale.width,
      this.scale.height,
      0x0f0c0f
    );

    this.add.text(centerX, 55, "CONQUISTAS", {
      fontSize: "34px",
      color: "#facc15",
      fontStyle: "bold",
    }).setOrigin(0.5);

    const unlockedCount = achievements.filter(
      (achievement) => achievement.unlocked
    ).length;

    this.add.text(
      centerX,
      105,
      `${unlockedCount} / ${achievements.length} desbloqueadas`,
      {
        fontSize: "18px",
        color: "#aaaaaa",
      }
    ).setOrigin(0.5);

    achievements.forEach((achievement, index) => {
      const y = 165 + index * 75;

      this.add.text(
        centerX,
        y,
        `${achievement.unlocked ? "★" : "🔒"} ${achievement.title}`,
        {
          fontSize: "20px",
          color: achievement.unlocked ? "#facc15" : "#777777",
          fontStyle: "bold",
        }
      ).setOrigin(0.5);

      this.add.text(
        centerX,
        y + 27,
        achievement.description,
        {
          fontSize: "14px",
          color: "#aaaaaa",
        }
      ).setOrigin(0.5);
    });

    const backButton = this.add.text(
      centerX,
      this.scale.height - 45,
      "VOLTAR",
      {
        fontSize: "20px",
        color: "#facc15",
        backgroundColor: "#252025",
        padding: { x: 20, y: 10 },
      }
    )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    backButton.on("pointerdown", () => {
      this.scene.start("MenuScene");
    });
  }
}
