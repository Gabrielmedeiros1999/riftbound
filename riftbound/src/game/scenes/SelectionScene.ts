
import Phaser from "phaser";
import { CHARACTER_CLASSES } from "../utils/characterClasses";

export class SelectionScene extends Phaser.Scene {
  private selectedClassId = "warrior";

  constructor() {
    super("SelectionScene");
  }

  create() {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    this.selectedClassId = "warrior";

    this.add.rectangle(
      centerX,
      centerY,
      this.scale.width,
      this.scale.height,
      0x0f0c0f
    );

    this.add.text(centerX, 65, "ESCOLHA SUA CLASSE", {
      fontSize: "32px",
      color: "#facc15",
      fontStyle: "bold",
    }).setOrigin(0.5);

    const cardWidth = 220;
    const cardHeight = 260;
    const gap = 25;

    const totalWidth = cardWidth * 3 + gap * 2;
    const startX = centerX - totalWidth / 2 + cardWidth / 2;

    CHARACTER_CLASSES.forEach((characterClass, index) => {
      const x = startX + index * (cardWidth + gap);
      const y = centerY - 5;

      const background = this.add.rectangle(
        x,
        y,
        cardWidth,
        cardHeight,
        characterClass.id === this.selectedClassId
          ? 0x393020
          : 0x201c20
      );

      background.setStrokeStyle(
        2,
        characterClass.id === this.selectedClassId
          ? 0xfacc15
          : 0x555555
      );

      background.setInteractive({ useHandCursor: true });

      const name = this.add.text(
        x,
        y - 85,
        characterClass.name.toUpperCase(),
        {
          fontSize: "21px",
          color: "#ffffff",
          fontStyle: "bold",
        }
      ).setOrigin(0.5);

      const description = this.add.text(
        x,
        y - 30,
        characterClass.description,
        {
          fontSize: "13px",
          color: "#cccccc",
          align: "center",
          wordWrap: { width: 185 },
        }
      ).setOrigin(0.5);

      const attributes = this.add.text(
        x,
        y + 55,
        [
          `VIDA: ${characterClass.maxHealth}`,
          `DANO: ${characterClass.damage}`,
          `VELOCIDADE: ${characterClass.speed}`,
        ].join("\n\n"),
        {
          fontSize: "15px",
          color: "#facc15",
          align: "center",
        }
      ).setOrigin(0.5);

      background.on("pointerdown", () => {
        this.selectedClassId = characterClass.id;

        this.children.list.forEach((child) => {
          if (child instanceof Phaser.GameObjects.Rectangle &&
              child.input) {
            child.setFillStyle(0x201c20);
            child.setStrokeStyle(2, 0x555555);
          }
        });

        background.setFillStyle(0x393020);
        background.setStrokeStyle(2, 0xfacc15);
      });
    });

    const startButton = this.add.text(
      centerX,
      this.scale.height - 75,
      "INICIAR PARTIDA",
      {
        fontSize: "22px",
        color: "#ffffff",
        backgroundColor: "#6b4b16",
        padding: { x: 25, y: 14 },
        fontStyle: "bold",
      }
    )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    startButton.on("pointerover", () => {
      startButton.setStyle({ backgroundColor: "#987022" });
    });

    startButton.on("pointerout", () => {
      startButton.setStyle({ backgroundColor: "#6b4b16" });
    });

    startButton.on("pointerdown", () => {
      this.registry.set("selectedClassId", this.selectedClassId);
      this.scene.start("ArenaScene");
    });

    const backButton = this.add.text(
      70,
      45,
      "VOLTAR",
      {
        fontSize: "17px",
        color: "#cccccc",
      }
    )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    backButton.on("pointerdown", () => {
      this.scene.start("MenuScene");
    });
  }
}
