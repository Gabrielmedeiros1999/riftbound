
import Phaser from "phaser";

export class PauseScene extends Phaser.Scene {
  private volumeText!: Phaser.GameObjects.Text;
  private sfxVolume = 0.5;
  
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

  this.add.text(width / 2, height * 0.20, "PAUSADO", {
    fontFamily: "monospace",
    fontSize: "38px",
    fontStyle: "bold",
    color: "#c4b5fd",
  }).setOrigin(0.5).setDepth(1001);

  this.add.text(width / 2, height * 0.28,
    "A arena aguarda seu retorno.", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#d1d5db",
    }).setOrigin(0.5).setDepth(1001);

  // ---- Bloco de volume: texto no centro, [ - ] e [ + ] nas laterais ----
  this.sfxVolume = this.registry.get("sfxVolume") ?? 0.5;

  const volumeY = height * 0.40;

  this.volumeText = this.add.text(width / 2, volumeY, "", {
    fontFamily: "monospace",
    fontSize: "15px",
    color: "#e9d5ff",
  }).setOrigin(0.5).setDepth(1001);

  this.updateVolumeText();

  this.createButton(
    width / 2 - 190,
    volumeY,
    "[ - ]",
    () => this.changeVolume(-0.1),
  );

  this.createButton(
    width / 2 + 190,
    volumeY,
    "[ + ]",
    () => this.changeVolume(0.1),
  );

  // ---- Botões principais ----
  this.createButton(
    width / 2,
    height * 0.54,
    "[ CONTINUAR ]",
    () => {
      this.scene.stop("PauseScene");
      this.scene.resume("ArenaScene");
    },
  );

  this.createButton(
    width / 2,
    height * 0.65,
    "[ REINICIAR ]",
    () => {
      this.scene.stop("PauseScene");
      this.scene.stop("ArenaScene");
      this.scene.start("ArenaScene");
    },
  );

  this.createButton(
    width / 2,
    height * 0.76,
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

   private changeVolume(amount: number) {
  this.sfxVolume = Phaser.Math.Clamp(
    Math.round((this.sfxVolume + amount) * 10) / 10,
    0,
    1,
  );

    this.registry.set("sfxVolume", this.sfxVolume);
    this.updateVolumeText();

  }

  private updateVolumeText() {
    this.volumeText.setText(
      `VOLUME DOS EFEITOS: ${Math.round(this.sfxVolume * 100)}%`,
    );
  }
}
