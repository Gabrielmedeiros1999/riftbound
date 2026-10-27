
import Phaser from "phaser";

export class PauseScene extends Phaser.Scene {
  constructor() {
    super("PauseScene");
  }

  create() {
    const { width, height } = this.scale;

    // Fundo escurecido, mantendo a arena visível
    this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x080510,
      0.82,
    ).setScrollFactor(0).setDepth(1000);

    this.add.text(width / 2, height * 0.28, "PAUSADO", {
      fontFamily: "monospace",
      fontSize: "38px",
      fontStyle: "bold",
      color: "#c4b5fd",
    }).setOrigin(0.5).setDepth(1001);

    this.add.text(width / 2, height * 0.38,
      "A arena aguarda seu retorno.", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#d1d5db",
      }).setOrigin(0.5).setDepth(1001);

    this.createButton(
      width / 2,
      height * 0.52,
      "[ CONTINUAR ]",
      () => {
        this.scene.stop("PauseScene");
        this.scene.resume("ArenaScene");
      },
    );

    this.createButton(
      width / 2,
      height * 0.63,
      "[ REINICIAR ]",
      () => {
        this.scene.stop("PauseScene");
        this.scene.stop("ArenaScene");
        this.scene.start("ArenaScene");
      },
    );

    this.createButton(
      width / 2,
      height * 0.74,
      "[ VOLTAR AO MENU ]",
      () => {
        this.scene.stop("PauseScene");
        this.scene.stop("ArenaScene");
        this.scene.start("MenuScene");
      },
    );

    // ESC também retoma a partida
    this.input.keyboard?.once("keydown-ESC", () => {
      this.scene.stop("PauseScene");
      this.scene.resume("ArenaScene");
    });
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ) {
    const button = this.add.text(x, y, label, {
      fontFamily: "monospace",
      fontSize: "17px",
      color: "#ffffff",
      backgroundColor: "#5b21b6",
      padding: { x: 20, y: 12 },
    })
      .setOrigin(0.5)
      .setDepth(1001)
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
