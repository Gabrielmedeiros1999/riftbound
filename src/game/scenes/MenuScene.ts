import Phaser from "phaser";
import { loadSettings } from "../utils/settings";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor("#0b0812");

    const settings = loadSettings();

    this.registry.set("sfxVolume", settings.sfxVolume);
    this.registry.set("musicVolume", settings.musicVolume);

    // Brilho decorativo central
    const glow = this.add.graphics();
    glow.fillStyle(0x7c3aed, 0.12);
    glow.fillEllipse(width / 2, height * 0.35, 420, 180);

    // Título
    this.add
      .text(width / 2, height * 0.28, "RIFTBOUND", {
        fontFamily: "monospace",
        fontSize: "48px",
        color: "#c4b5fd",
        fontStyle: "bold",
        stroke: "#4c1d95",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.36, "SOBREVIVA ÀS FENDAS", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#a78bfa",
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    // Botão Jogar
    this.createButton(
      width / 2,
      height * 0.55,
      "[ JOGAR ]",
      () => this.scene.start("ArenaScene"),
      "24px",
      { x: 28, y: 14 },
    );

    this.createButton(
    this.scale.width / 2,
    this.scale.height * 0.74,
    "CONQUISTAS",
    () => {
      this.scene.start("AchievementsScene");
    }
  );

    // Botão Estatísticas
    this.createButton(width / 2, height * 0.66, "[ ESTATÍSTICAS ]", () =>
      this.scene.start("StatisticsScene"),
    );

    // Instruções
    this.add
      .text(
        width / 2,
        height * 0.8,
        "WASD: MOVER  |  J: ATACAR  |  ESPAÇO: ESQUIVAR",
        {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#9ca3af",
          align: "center",
        },
      )
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.9, "UM ROGUELITE EM DESENVOLVIMENTO", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#6b7280",
      })
      .setOrigin(0.5);
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    fontSize = "17px",
    padding: { x: number; y: number } = { x: 20, y: 12 },
  ) {
    const button = this.add
      .text(x, y, label, {
        fontFamily: "monospace",
        fontSize,
        color: "#ffffff",
        backgroundColor: "#5b21b6",
        padding,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    button.on("pointerover", () => {
      button.setStyle({ backgroundColor: "#7c3aed" });
    });

    button.on("pointerout", () => {
      button.setStyle({ backgroundColor: "#5b21b6" });
    });

    button.on("pointerdown", onClick);
  }
}