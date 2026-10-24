
import Phaser from "phaser";

type EndSceneData = {
  result: "victory" | "defeat";
};

export class EndScene extends Phaser.Scene {
  constructor() {
    super("EndScene");
  }

  create(data: EndSceneData) {
    const { width, height } = this.scale;
    const victory = data.result === "victory";

    this.cameras.main.setBackgroundColor("#0b0812");

    // Brilho de fundo
    const glow = this.add.graphics();
    glow.fillStyle(victory ? 0x16a34a : 0x7f1d1d, 0.15);
    glow.fillEllipse(width / 2, height * 0.35, 440, 200);

    // Título
    this.add.text(
      width / 2,
      height * 0.3,
      victory ? "VITÓRIA!" : "FIM DE JOGO",
      {
        fontFamily: "monospace",
        fontSize: "42px",
        fontStyle: "bold",
        color: victory ? "#86efac" : "#fca5a5",
        align: "center",
      },
    ).setOrigin(0.5);

    this.add.text(
      width / 2,
      height * 0.4,
      victory
        ? "Você sobreviveu às fendas."
        : "A arena consumiu você.",
      {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#d1d5db",
        align: "center",
      },
    ).setOrigin(0.5);

    // Botão para reiniciar
    this.createButton(
      width / 2,
      height * 0.57,
      "[ JOGAR NOVAMENTE ]",
      () => this.scene.start("ArenaScene"),
    );

    // Botão para voltar ao menu
    this.createButton(
      width / 2,
      height * 0.7,
      "[ VOLTAR AO MENU ]",
      () => this.scene.start("MenuScene"),
    );

    this.add.text(
      width / 2,
      height * 0.9,
      "RIFTBOUND — EM DESENVOLVIMENTO",
      {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#6b7280",
      },
    ).setOrigin(0.5);
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
