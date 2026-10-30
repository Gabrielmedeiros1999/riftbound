import Phaser from "phaser";
import { loadSettings, saveSettings } from "../utils/settings";

type MusicSound =
  | Phaser.Sound.WebAudioSound
  | Phaser.Sound.HTML5AudioSound;

export class PauseScene extends Phaser.Scene {
  private volumeText!: Phaser.GameObjects.Text;
  private musicVolumeText!: Phaser.GameObjects.Text;
  private sfxVolume = 0.5;
  private musicVolume = 0.25;

  constructor() {
    super("PauseScene");
  }

  create() {
    const { width, height } = this.scale;

    // Fundo escurecido, mantendo a arena visível
    this.add
      .rectangle(width / 2, height / 2, width, height, 0x080510, 0.82)
      .setScrollFactor(0)
      .setDepth(1000);

    this.add
      .text(width / 2, height * 0.13, "PAUSADO", {
        fontFamily: "monospace",
        fontSize: "38px",
        fontStyle: "bold",
        color: "#c4b5fd",
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.add
      .text(width / 2, height * 0.21, "A arena aguarda seu retorno.", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#d1d5db",
      })
      .setOrigin(0.5)
      .setDepth(1001);

    // ---- Carrega os volumes salvos ----
    const settings = loadSettings();
    this.sfxVolume = settings.sfxVolume;
    this.musicVolume = settings.musicVolume;

    // ---- Volume dos efeitos ----
    const sfxY = height * 0.34;

    this.volumeText = this.add
      .text(width / 2, sfxY, "", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#e9d5ff",
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.updateVolumeText();

    this.createButton(width / 2 - 190, sfxY, "[ - ]", () =>
      this.changeVolume(-0.1),
    );
    this.createButton(width / 2 + 190, sfxY, "[ + ]", () =>
      this.changeVolume(0.1),
    );

    // ---- Volume da música ----
    const musicY = height * 0.42;

    this.musicVolumeText = this.add
      .text(width / 2, musicY, "", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#e9d5ff",
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.updateMusicVolumeText();

    this.createButton(width / 2 - 190, musicY, "[ - ]", () =>
      this.changeMusicVolume(-0.1),
    );
    this.createButton(width / 2 + 190, musicY, "[ + ]", () =>
      this.changeMusicVolume(0.1),
    );

    // ---- Botões principais ----
    this.createButton(width / 2, height * 0.54, "[ CONTINUAR ]", () => {
      this.scene.stop("PauseScene");
      this.scene.resume("ArenaScene");
    });

    this.createButton(width / 2, height * 0.64, "[ TELA CHEIA ]", () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        this.scale.startFullscreen();
      }
    });

    this.createButton(width / 2, height * 0.74, "[ REINICIAR ]", () => {
      this.scene.stop("PauseScene");
      this.scene.stop("ArenaScene");
      this.scene.start("ArenaScene");
    });

    this.createButton(width / 2, height * 0.84, "[ VOLTAR AO MENU ]", () => {
      this.scene.stop("PauseScene");
      this.scene.stop("ArenaScene");
      this.scene.start("MenuScene");
    });

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
    const button = this.add
      .text(x, y, label, {
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

  // ---- Efeitos ----
  private changeVolume(amount: number) {
    this.sfxVolume = Phaser.Math.Clamp(
      Math.round((this.sfxVolume + amount) * 10) / 10,
      0,
      1,
    );

    this.registry.set("sfxVolume", this.sfxVolume);

    const settings = loadSettings();
    saveSettings({
      ...settings,
      sfxVolume: this.sfxVolume,
    });

    this.updateVolumeText();
  }

  private updateVolumeText() {
    this.volumeText.setText(
      `VOLUME DOS EFEITOS: ${Math.round(this.sfxVolume * 100)}%`,
    );
  }

  // ---- Música ----
  private changeMusicVolume(amount: number) {
    this.musicVolume = Phaser.Math.Clamp(
      Math.round((this.musicVolume + amount) * 10) / 10,
      0,
      1,
    );

    this.registry.set("musicVolume", this.musicVolume);

    const settings = loadSettings();
    saveSettings({
      ...settings,
      musicVolume: this.musicVolume,
    });

    const music = this.registry.get("backgroundMusicSound") as
      | MusicSound
      | undefined;

    if (music) {
      music.setVolume(this.musicVolume);
    }

    this.updateMusicVolumeText();
  }

  private updateMusicVolumeText() {
    this.musicVolumeText.setText(
      `VOLUME DA MÚSICA: ${Math.round(this.musicVolume * 100)}%`,
    );
  }
}