import Phaser from "phaser";
import { loadSettings } from "../utils/settings";

const MONO = "monospace";

// Cores dos botões (normal e destacado).
const BUTTON_FILL = 0x5b21b6;
const BUTTON_FILL_ACTIVE = 0x7c3aed;
const BUTTON_STROKE = 0x8b5cf6;

type MenuButton = {
  root: Phaser.GameObjects.Container; // posição e entrada na tela
  inner: Phaser.GameObjects.Container; // escala (destaque / clique)
  bg: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Rectangle;
  leftArrow: Phaser.GameObjects.Text;
  rightArrow: Phaser.GameObjects.Text;
  scaleTween?: Phaser.Tweens.Tween;
  glowTween?: Phaser.Tweens.Tween;
  arrowTweens: Phaser.Tweens.Tween[];
  primary: boolean;
  onClick: () => void;
};

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
  }

  private backgroundMusic?: Phaser.Sound.BaseSound;

  private buttons: MenuButton[] = [];
  private focusIndex = 0;
  private leaving = false;
  private pressing = false; // um botão já foi acionado
  private ready = false; // os botões já terminaram de entrar na tela

  private titleLetters: Phaser.GameObjects.Text[] = [];
  private titleLayer!: Phaser.GameObjects.Container;
  private subtitle!: Phaser.GameObjects.Text;

  private portal!: Phaser.GameObjects.Container;
  private portalBaseX = 0;
  private portalBaseY = 0;
  private emberLayer!: Phaser.GameObjects.Container;
  private flash!: Phaser.GameObjects.Rectangle;

  // Paralaxe: posição do mouse de -0.5 a 0.5 (alvo e valor suavizado).
  private parallaxTarget = { x: 0, y: 0 };
  private parallax = { x: 0, y: 0 };

  private skipIntro = false;

  // Durante a rotação do celular, as animações de entrada terminam na hora.
  private d(ms: number) {
    return this.skipIntro ? 1 : ms;
  }

  preload() {
    this.load.audio("menu-music", "assets/audio/menu.wav");
  }

  create() {
    const { width, height } = this.scale;

    // A cena pode ser reaberta: zera o estado.
    this.buttons = [];
    this.focusIndex = 0;
    this.leaving = false;
    this.pressing = false;
    this.ready = false;
    this.titleLetters = [];
    this.parallaxTarget = { x: 0, y: 0 };
    this.parallax = { x: 0, y: 0 };

    // A rotação do celular reinicia a cena só para refazer o layout:
    // nesse caso pula a abertura (letras, botões, fade e música).
    this.skipIntro = this.registry.get("menuRelayout") === true;
    this.registry.remove("menuRelayout");

    this.cameras.main.setBackgroundColor("#0b0812");
    if (!this.skipIntro) this.cameras.main.fadeIn(350, 0, 0, 0);

    const settings = loadSettings();

    this.registry.set("sfxVolume", settings.sfxVolume);
    this.registry.set("musicVolume", settings.musicVolume);

    // Na rotação a música continua tocando, sem reiniciar.
    if (!(this.skipIntro && this.backgroundMusic?.isPlaying)) {
      this.backgroundMusic = this.sound.add("menu-music", {
        loop: true,
        volume: settings.musicVolume,
      });

      this.backgroundMusic.play();
    }

    // Para a música quando o jogador sair do menu.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.registry.get("menuRelayout") === true) return; // só rotação
      this.backgroundMusic?.stop();
      this.backgroundMusic?.destroy();
      this.backgroundMusic = undefined;
    });

    this.createBackground();
    this.createEmbers();
    this.createPortal();
    this.createTitle();
    this.createButtons();
    this.createFooter();
    this.createInput();

    this.scheduleFlicker();

    // Paralaxe: o fundo se mexe de leve conforme o mouse.
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.parallaxTarget.x = pointer.x / width - 0.5;
      this.parallaxTarget.y = pointer.y / height - 0.5;
    });
  }

  update() {
    // Suaviza o movimento do paralaxe.
    this.parallax.x += (this.parallaxTarget.x - this.parallax.x) * 0.08;
    this.parallax.y += (this.parallaxTarget.y - this.parallax.y) * 0.08;

    // Cada camada anda uma quantidade diferente: dá sensação de profundidade.
    this.portal.setPosition(
      this.portalBaseX - this.parallax.x * 18,
      this.portalBaseY - this.parallax.y * 12,
    );
    this.emberLayer.setPosition(
      -this.parallax.x * 40,
      -this.parallax.y * 24,
    );
    this.titleLayer.setPosition(this.parallax.x * 8, this.parallax.y * 5);
  }

  // -------------------------------------------------------------------------
  // Fundo
  // -------------------------------------------------------------------------

  private createBackground() {
    const { width, height } = this.scale;

    // Degradê vertical feito em faixas (funciona em WebGL e Canvas).
    const bands = 32;
    const top = Phaser.Display.Color.ValueToColor(0x0b0812);
    const bottom = Phaser.Display.Color.ValueToColor(0x1e1233);

    for (let i = 0; i < bands; i++) {
      const mix = Phaser.Display.Color.Interpolate.ColorWithColor(
        top,
        bottom,
        bands - 1,
        i,
      );

      this.add
        .rectangle(
          width / 2,
          (i + 0.5) * (height / bands),
          width,
          height / bands + 1,
          Phaser.Display.Color.GetColor(mix.r, mix.g, mix.b),
        )
        .setDepth(-100);
    }

    // Vinheta: bordas escuras com várias camadas translúcidas.
    for (let i = 0; i < 8; i++) {
      const size = (i + 1) * 16;

      this.add
        .rectangle(size / 2, height / 2, size, height, 0x000000, 0.07)
        .setDepth(-50);
      this.add
        .rectangle(width - size / 2, height / 2, size, height, 0x000000, 0.07)
        .setDepth(-50);
      this.add
        .rectangle(width / 2, size / 2, width, size, 0x000000, 0.07)
        .setDepth(-50);
      this.add
        .rectangle(width / 2, height - size / 2, width, size, 0x000000, 0.07)
        .setDepth(-50);
    }

    // Camada de clarão usada pelos "relâmpagos" da fenda.
    this.flash = this.add
      .rectangle(width / 2, height / 2, width, height, 0xc4b5fd, 1)
      .setAlpha(0)
      .setDepth(5000);
  }

  // Brasas e bolhas de luz subindo pelo fundo.
  private createEmbers() {
    const { width, height } = this.scale;

    this.emberLayer = this.add.container(0, 0).setDepth(-70);

    const colors = [0xa78bfa, 0xc4b5fd, 0x7c3aed];

    for (let i = 0; i < 48; i++) {
      const size = Phaser.Math.Between(2, 4);
      const startX = Phaser.Math.Between(-40, width + 40);
      const duration = Phaser.Math.Between(5000, 10000);
      const delay = Phaser.Math.Between(0, 7000);

      const ember = this.add
        .rectangle(
          startX,
          height + 10,
          size,
          size,
          Phaser.Utils.Array.GetRandom(colors),
        )
        .setAlpha(0);

      this.emberLayer.add(ember);

      this.tweens.add({
        targets: ember,
        y: -20,
        duration,
        delay,
        repeat: -1,
      });

      this.tweens.add({
        targets: ember,
        alpha: Phaser.Math.FloatBetween(0.35, 0.85),
        duration: duration / 2,
        delay,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      this.tweens.add({
        targets: ember,
        x: startX + Phaser.Math.Between(-35, 35),
        duration: duration / 3,
        delay,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Bolhas grandes e translúcidas, bem lentas.
    for (let i = 0; i < 7; i++) {
      const radius = Phaser.Math.Between(20, 50);
      const startX = Phaser.Math.Between(0, width);
      const duration = Phaser.Math.Between(14000, 22000);
      const delay = Phaser.Math.Between(0, 9000);

      const bubble = this.add
        .circle(startX, height + radius, radius, 0x8b5cf6)
        .setAlpha(0);

      this.emberLayer.add(bubble);

      this.tweens.add({
        targets: bubble,
        y: -radius,
        duration,
        delay,
        repeat: -1,
      });

      this.tweens.add({
        targets: bubble,
        alpha: Phaser.Math.FloatBetween(0.05, 0.1),
        duration: duration / 2,
        delay,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  // "Fenda" atrás do título: brilho que pulsa e dois anéis girando.
  private createPortal() {
    const { width, height } = this.scale;

    this.portalBaseX = width / 2;
    this.portalBaseY = height * 0.3;

    this.portal = this.add
      .container(this.portalBaseX, this.portalBaseY)
      .setDepth(-60);

    const glowOuter = this.add.ellipse(0, 0, 560, 240, 0x7c3aed, 0.07);
    const glowMiddle = this.add.ellipse(0, 0, 420, 180, 0x7c3aed, 0.1);
    const glowInner = this.add.ellipse(0, 0, 280, 120, 0xa78bfa, 0.14);

    this.portal.add([glowOuter, glowMiddle, glowInner]);

    this.tweens.add({
      targets: [glowOuter, glowMiddle, glowInner],
      scale: 1.1,
      alpha: 0.6,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Anéis tracejados girando em sentidos opostos.
    const ringA = this.createDashedRing(150, 0xa78bfa, 0.45, 28, 2);
    const ringB = this.createDashedRing(112, 0x7c3aed, 0.55, 18, 3);

    this.portal.add([ringA, ringB]);

    this.tweens.add({
      targets: ringA,
      rotation: Math.PI * 2,
      duration: 40000,
      repeat: -1,
    });

    this.tweens.add({
      targets: ringB,
      rotation: -Math.PI * 2,
      duration: 26000,
      repeat: -1,
    });
  }

  private createDashedRing(
    radius: number,
    color: number,
    alpha: number,
    segments: number,
    thickness: number,
  ): Phaser.GameObjects.Graphics {
    const ring = this.add.graphics();
    const step = (Math.PI * 2) / segments;

    ring.lineStyle(thickness, color, alpha);

    for (let i = 0; i < segments; i++) {
      ring.beginPath();
      ring.arc(0, 0, radius, i * step, i * step + step * 0.55);
      ring.strokePath();
    }

    return ring;
  }

  // "Relâmpagos" ocasionais vindos da fenda.
  private scheduleFlicker() {
    this.time.delayedCall(Phaser.Math.Between(3500, 7000), () => {
      if (this.leaving) return;

      this.tweens.add({
        targets: this.flash,
        alpha: 0.18,
        duration: 60,
        yoyo: true,
        repeat: 1,
      });

      this.cameras.main.shake(110, 0.002);

      this.scheduleFlicker();
    });
  }

  // -------------------------------------------------------------------------
  // Título
  // -------------------------------------------------------------------------

  private createTitle() {
    const { width, height } = this.scale;

    const text = "RIFTBOUND";
    const y = height * 0.28;

    const style = {
      fontFamily: MONO,
      fontSize: "48px",
      color: "#c4b5fd",
      fontStyle: "bold",
      stroke: "#4c1d95",
      strokeThickness: 4,
    };

    // Largura de uma letra (a fonte é monoespaçada).
    const probe = this.add.text(0, 0, "M", style);
    const letterWidth = probe.width + 4;
    probe.destroy();

    const startX = width / 2 - (text.length * letterWidth) / 2 + letterWidth / 2;

    this.titleLayer = this.add.container(0, 0).setDepth(10);

    text.split("").forEach((character, index) => {
      const letter = this.add
        .text(startX + index * letterWidth, y - 140, character, style)
        .setOrigin(0.5)
        .setAlpha(0)
        .setScale(1.7)
        .setAngle(Phaser.Math.Between(-18, 18));

      this.titleLayer.add(letter);
      this.titleLetters.push(letter);

      // Cada letra "cai" e quica até o lugar, uma depois da outra.
      this.tweens.add({
        targets: letter,
        y,
        alpha: 1,
        scale: 1,
        angle: 0,
        duration: this.d(520),
        delay: this.d(250 + index * 80),
        ease: "Bounce.easeOut",
        onComplete: () => {
          // Depois de pousar, a letra flutua suavemente.
          this.tweens.add({
            targets: letter,
            y: y - 3,
            duration: 1300,
            delay: index * 120,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });

          if (index === text.length - 1) {
            this.onTitleLanded(y);
          }
        },
      });
    });

    // Subtítulo: aparece letra por letra depois que o título pousa.
    this.subtitle = this.add
      .text(width / 2, height * 0.36, "", {
        fontFamily: MONO,
        fontSize: "13px",
        color: "#a78bfa",
        letterSpacing: 3,
      })
      .setOrigin(0.5)
      .setDepth(10);
  }

  // Chamado quando a última letra do título pousa.
 private onTitleLanded(titleY: number) {
  const { width } = this.scale;
  const fullText = "SOBREVIVA ÀS FENDAS";

  if (this.skipIntro) {
    this.subtitle.setText(fullText);
  } else {
    // Pequeno tremor + onda de energia saindo do título.
    this.cameras.main.shake(140, 0.004);

    const wave = this.add
      .ellipse(width / 2, titleY, 120, 40)
      .setStrokeStyle(3, 0xc4b5fd, 0.9)
      .setDepth(9);

    this.tweens.add({
      targets: wave,
      scale: 6,
      alpha: 0,
      duration: 700,
      ease: "Cubic.easeOut",
      onComplete: () => wave.destroy(),
    });

    // Subtítulo digitado.
    this.time.addEvent({
      delay: 50,
      repeat: fullText.length - 1,
      callback: () => {
        const next = Math.min(this.subtitle.text.length + 1, fullText.length);
        this.subtitle.setText(fullText.slice(0, next));
      },
    });
  }

  // Brilho que varre as letras de tempos em tempos.
  this.time.addEvent({
    delay: 4200,
    loop: true,
    callback: () => this.shimmerTitle(),
  });
}

  private shimmerTitle() {
    this.titleLetters.forEach((letter, index) => {
      this.time.delayedCall(index * 70, () => {
        if (!letter.active) return;

        letter.setColor("#ffffff");

        this.time.delayedCall(140, () => {
          if (letter.active) letter.setColor("#c4b5fd");
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // Botões
  // -------------------------------------------------------------------------

  private createButtons() {
    const { width, height } = this.scale;

    const definitions = [
      {
        label: "[ JOGAR ]",
        y: height * 0.55,
        w: 290,
        h: 60,
        fontSize: "24px",
        primary: true,
        scene: "SelectionScene",
      },
      {
        label: "[ ESTATÍSTICAS ]",
        y: height * 0.66,
        w: 290,
        h: 48,
        fontSize: "17px",
        primary: false,
        scene: "StatisticsScene",
      },
      {
        label: "[ CONQUISTAS ]",
        y: height * 0.77,
        w: 290,
        h: 48,
        fontSize: "17px",
        primary: false,
        scene: "AchievementsScene",
      },
    ];

      // Telas baixas (celular na horizontal): posições em pixels, com folga fixa
      // entre os botões, em vez de porcentagem da altura.
      if (height < 560) {
        const gap = 22;
        let y = height * 0.41 + definitions[0].h / 2; // topo do primeiro botão

        definitions.forEach((definition, i) => {
          definition.y = y;
          y += definition.h / 2 + gap + (definitions[i + 1]?.h ?? 0) / 2;
        });
      }

    definitions.forEach((definition, index) => {
      const glow = this.add.rectangle(
        0,
        0,
        definition.w + 28,
        definition.h + 18,
        0x7c3aed,
        1,
      );
      glow.setAlpha(definition.primary ? 0.12 : 0);

      const bg = this.add
        .rectangle(0, 0, definition.w, definition.h, BUTTON_FILL)
        .setStrokeStyle(2, BUTTON_STROKE);

      const label = this.add
        .text(0, 0, definition.label, {
          fontFamily: MONO,
          fontSize: definition.fontSize,
          color: "#ffffff",
        })
        .setOrigin(0.5);

      const arrowStyle = {
        fontFamily: MONO,
        fontSize: "18px",
        color: "#c4b5fd",
      };

      const leftArrow = this.add
        .text(-definition.w / 2 - 24, 0, "▶", arrowStyle)
        .setOrigin(0.5)
        .setAlpha(0);

      const rightArrow = this.add
        .text(definition.w / 2 + 24, 0, "◀", arrowStyle)
        .setOrigin(0.5)
        .setAlpha(0);

      const inner = this.add.container(0, 0, [
        glow,
        bg,
        label,
        leftArrow,
        rightArrow,
      ]);

      // O container "root" é quem entra deslizando; o "inner" cresce no destaque.
      const root = this.add
        .container(width / 2, definition.y, [inner])
        .setDepth(20);

      const button: MenuButton = {
        root,
        inner,
        bg,
        glow,
        leftArrow,
        rightArrow,
        arrowTweens: [],
        primary: definition.primary,
        onClick: () => this.goTo(definition.scene),
      };

      this.buttons.push(button);

      // Entrada: desliza alternando esquerda/direita, um de cada vez.
      const fromLeft = index % 2 === 0;

      root.setX(width / 2 + (fromLeft ? -260 : 260)).setAlpha(0);

      this.tweens.add({
        targets: root,
        x: width / 2,
        alpha: 1,
        duration: this.d(520),
        delay: this.d(1100 + index * 140),
        ease: "Back.easeOut",
        onComplete: () => {
          // Só libera clique/teclado quando o último botão terminou de entrar.
          if (index === definitions.length - 1) {
            this.ready = true;
          }
        },
      });

      // O botão principal tem um brilho que "respira".
      if (definition.primary) {
        this.tweens.add({
          targets: glow,
          scaleX: 1.1,
          scaleY: 1.25,
          duration: 1000,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      bg.setInteractive({ useHandCursor: true });

      bg.on("pointerover", () => this.setFocus(index));
      bg.on("pointerdown", () => this.pressButton(index));
    });

    this.setFocus(0, true);
  }

  // Destaca um botão: cresce, clareia, brilha e mostra as setinhas.
  // Os tweens anteriores do botão são parados antes de criar os novos,
  // para passar o mouse rápido não deixar animações brigando.
  private setFocus(index: number, instant = false) {
    if (this.pressing) return;

    this.focusIndex = index;

    this.buttons.forEach((button, i) => {
      const active = i === index;
      const scale = active ? 1.07 : 1;
      const glowAlpha = active ? 0.35 : button.primary ? 0.12 : 0;
      const arrowAlpha = active ? 1 : 0;

      button.scaleTween?.stop();
      button.glowTween?.stop();
      button.arrowTweens.forEach((tween) => tween.stop());
      button.arrowTweens = [];

      button.bg.setFillStyle(active ? BUTTON_FILL_ACTIVE : BUTTON_FILL);

      const leftX = -button.bg.width / 2 - 24;
      const rightX = button.bg.width / 2 + 24;

      button.leftArrow.setX(leftX);
      button.rightArrow.setX(rightX);

      if (instant) {
        button.inner.setScale(scale);
        button.glow.setAlpha(glowAlpha);
        button.leftArrow.setAlpha(arrowAlpha);
        button.rightArrow.setAlpha(arrowAlpha);
      } else {
        button.scaleTween = this.tweens.add({
          targets: button.inner,
          scale,
          duration: 140,
          ease: "Back.easeOut",
        });

        button.glowTween = this.tweens.add({
          targets: button.glow,
          alpha: glowAlpha,
          duration: 160,
        });

        button.arrowTweens.push(
          this.tweens.add({
            targets: [button.leftArrow, button.rightArrow],
            alpha: arrowAlpha,
            duration: 140,
          }),
        );
      }

      // As setinhas balançam enquanto o botão está destacado.
      if (active) {
        button.arrowTweens.push(
          this.tweens.add({
            targets: button.leftArrow,
            x: leftX + 5,
            duration: 380,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          }),
          this.tweens.add({
            targets: button.rightArrow,
            x: rightX - 5,
            duration: 380,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          }),
        );
      }
    });
  }

  // Clique: o botão "afunda" um instante e então a tela troca.
  // A troca usa um temporizador (e não o fim da animação), para que nada
  // possa cancelar o clique no meio do caminho.
  private pressButton(index: number) {
    if (!this.ready || this.leaving || this.pressing) return;

    this.pressing = true;

    const button = this.buttons[index];

    button.scaleTween?.stop();

    this.tweens.add({
      targets: button.inner,
      scale: 0.94,
      duration: 80,
      yoyo: true,
    });

    this.time.delayedCall(170, () => button.onClick());
  }

  // Troca de tela com fade.
  private goTo(sceneKey: string) {
    if (this.leaving) return;

    this.leaving = true;

    this.cameras.main.fadeOut(280, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start(sceneKey);
    });
  }

  // -------------------------------------------------------------------------
  // Rodapé e teclado
  // -------------------------------------------------------------------------

  private createFooter() {
    const { width, height } = this.scale;

    const instructions = this.add
      .text(
        width / 2,
        height * 0.88,
        "WASD: MOVER  |  J: ATACAR  |  K: HABILIDADE  |  ESPAÇO: ESQUIVAR  |  ESC: MENU",
        {
          fontFamily: MONO,
          fontSize: "11px",
          color: "#9ca3af",
          align: "center",
        },
      )
      .setOrigin(0.5)
      .setDepth(20)
      .setAlpha(0);

    const footer = this.add
      .text(width / 2, height * 0.94, "UM ROGUELITE EM DESENVOLVIMENTO", {
        fontFamily: MONO,
        fontSize: "10px",
        color: "#6b7280",
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setAlpha(0);

    this.tweens.add({
      targets: instructions,
      alpha: 1,
      duration: this.d(600), 
      delay: this.d(1700)
    });

    this.tweens.add({
      targets: footer,
      alpha: 1,
      duration: this.d(600), 
      delay: this.d(1900),
      onComplete: () => {
        // O rodapé "respira" bem de leve.
        this.tweens.add({
          targets: footer,
          alpha: 0.45,
          duration: 1800,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      },
    });
  }

  private createInput() {
    const keyboard = this.input.keyboard;

    if (!keyboard) return;

    ["UP", "W"].forEach((key) =>
      keyboard.on(`keydown-${key}`, () => this.moveFocus(-1)),
    );

    ["DOWN", "S"].forEach((key) =>
      keyboard.on(`keydown-${key}`, () => this.moveFocus(1)),
    );

    ["ENTER", "SPACE"].forEach((key) =>
      keyboard.on(`keydown-${key}`, () => this.pressButton(this.focusIndex)),
    );
  }

  private moveFocus(delta: number) {
    if (!this.ready || this.leaving || this.pressing) return;

    const total = this.buttons.length;

    this.setFocus((this.focusIndex + delta + total) % total);
  }
}
