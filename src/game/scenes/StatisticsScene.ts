import Phaser from "phaser";
import { getStatistics } from "../utils/statistics";

export class StatisticsScene extends Phaser.Scene {
  constructor() {
    super("StatisticsScene");
  }

  create() {
    const stats = getStatistics();

    const centerX = this.scale.width / 2;

    this.add.rectangle(
      centerX,
      this.scale.height / 2,
      this.scale.width,
      this.scale.height,
      0x0f0c0f
    );

    this.add.text(
      centerX,
      80,
      "ESTATÍSTICAS",
      {
        fontSize: "36px",
        color: "#facc15",
        fontStyle: "bold",
      }
    ).setOrigin(0.5);

    const minutes = Math.floor(stats.totalSurvivalTime / 60);
    const seconds = stats.totalSurvivalTime % 60;

    const statisticsText = [
      `PARTIDAS JOGADAS: ${stats.totalMatches}`,
      `MAIOR ONDA: ${stats.bestWave}`,
      `MAIOR NÍVEL: ${stats.highestLevel}`,
      `TEMPO TOTAL: ${minutes}m ${seconds}s`,
      `MÉDIA DE ONDAS: ${stats.averageWave}`,
    ].join("\n\n");

    this.add.text(
      centerX,
      this.scale.height / 2,
      statisticsText,
      {
        fontSize: "22px",
        color: "#ffffff",
        align: "center",
        lineSpacing: 12,
      }
    ).setOrigin(0.5);

    const backButton = this.add.text(
      centerX,
      this.scale.height - 80,
      "VOLTAR",
      {
        fontSize: "22px",
        color: "#facc15",
        backgroundColor: "#252025",
        padding: {
          x: 25,
          y: 12,
        },
      }
    )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    backButton.on("pointerover", () => {
      backButton.setStyle({ color: "#ffffff" });
    });

    backButton.on("pointerout", () => {
      backButton.setStyle({ color: "#facc15" });
    });

    backButton.on("pointerdown", () => {
      this.scene.start("MenuScene");
    });
  }
}