import Phaser from "phaser";
import { getPermanentStats } from "../utils/permanentStats";

export class StatisticsScene extends Phaser.Scene {
  constructor() {
    super("StatisticsScene");
  }

  create() {
    const centerX = this.scale.width / 2;
    const permanent = getPermanentStats();

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

    const minutes = Math.floor(permanent.totalSurvivalTime / 60);
    const seconds = permanent.totalSurvivalTime % 60;

    const statisticsText = [
      `PARTIDAS JOGADAS: ${permanent.totalMatches}`,
      `MAIOR ONDA: ${permanent.highestWave}`,
      `MAIOR NÍVEL: ${permanent.highestLevel}`,
      `INIMIGOS DERROTADOS: ${permanent.totalEnemiesDefeated}`,
      `TEMPO TOTAL: ${minutes}m ${seconds}s`,
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