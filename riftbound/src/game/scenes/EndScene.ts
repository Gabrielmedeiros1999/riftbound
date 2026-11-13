import Phaser from "phaser";
import { getBestWave } from "../utils/records";
import { getMatchHistory } from "../utils/history";

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
    const bestWave = getBestWave();
    const history = getMatchHistory();

    this.cameras.main.setBackgroundColor("#0b0812");

    // Brilho de fundo
    const glow = this.add.graphics();
    glow.fillStyle(victory ? 0x16a34a : 0x7f1d1d, 0.15);
    glow.fillEllipse(width / 2, height * 0.2, 440, 200);

    // Título
    this.add
      .text(width / 2, height * 0.14, victory ? "VITÓRIA!" : "FIM DE JOGO", {
        fontFamily: "monospace",
        fontSize: "42px",
        fontStyle: "bold",
        color: victory ? "#86efac" : "#fca5a5",
        align: "center",
      })
      .setOrigin(0.5);

    // Subtítulo
    this.add
      .text(
        width / 2,
        height * 0.24,
        victory
          ? "Você sobreviveu às fendas."
          : `A arena consumiu você.\nRECORDE: ONDA ${bestWave}`,
        {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#d1d5db",
          align: "center",
          lineSpacing: 6,
        },
      )
      .setOrigin(0.5);

    // Botão para reiniciar
    this.createButton(width / 2, height * 0.37, "[ JOGAR NOVAMENTE ]", () =>
      this.scene.start("ArenaScene"),
    );

    // Botão para voltar ao menu
    this.createButton(width / 2, height * 0.47, "[ VOLTAR AO MENU ]", () =>
      this.scene.start("MenuScene"),
    );

    // ---- Histórico das últimas partidas ----
    this.add
      .text(width / 2, height * 0.58, "ÚLTIMAS PARTIDAS", {
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#c4b5fd",
      })
      .setOrigin(0.5);

    const historyText = history
      .slice(0, 5)
      .map((match, index) => {
        const minutes = Math.floor(match.survivalTime / 60);
        const seconds = match.survivalTime % 60;

        return `${index + 1}. Onda ${match.wave} | Nível ${match.level} | ${minutes}:${String(seconds).padStart(2, "0")}`;
      })
      .join("\n");

    this.add
      .text(width / 2, height * 0.72, historyText || "Nenhuma partida registrada", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#cccccc",
        align: "center",
        lineSpacing: 6,
      })
      .setOrigin(0.5);

    // Rodapé
    this.add
      .text(width / 2, height * 0.93, "RIFTBOUND — EM DESENVOLVIMENTO", {
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
  ) {
    const button = this.add
      .text(x, y, label, {
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