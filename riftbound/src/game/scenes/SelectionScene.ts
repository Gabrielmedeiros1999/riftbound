import Phaser from "phaser";
import { CHARACTER_CLASSES } from "../utils/characterClasses";
import type { CharacterClass } from "../utils/characterClasses";
import { CLASS_ABILITIES } from "../utils/abilities";

// ---------------------------------------------------------------------------
// Dados visuais de cada classe
// ---------------------------------------------------------------------------

type ClassTheme = {
  color: number; // cor de destaque do menu quando a classe está selecionada
  icon: string; // ícone da habilidade (emoji)
  role: string; // etiqueta curta sob o nome
};

const CLASS_THEMES: Record<string, ClassTheme> = {
  warrior: { color: 0xf59e0b, icon: "🛡️", role: "TANQUE" },
  assassin: { color: 0xa855f7, icon: "🗡️", role: "VELOCISTA" },
  mage: { color: 0x38bdf8, icon: "✨", role: "CONJURADOR" },
};

const DEFAULT_THEME: ClassTheme = {
  color: 0xfacc15,
  icon: "⭐",
  role: "AVENTUREIRO",
};

// Mesmos arquivos e tamanhos usados no ArenaScene. A linha 0 de cada folha
// tem 8 quadros de idle (um por direção) e a animação de ataque (16 quadros)
// começa na linha "attackRow". "originY" é a altura dos pés dentro do quadro.
type HeroSheet = {
  path: string;
  size: number;
  attackRow: number;
  originY: number;
};

const HERO_SHEETS: Record<string, HeroSheet> = {
  hero: {
    path: "assets/characters/hero/Hero_Knight_full.png",
    size: 68,
    attackRow: 1,
    originY: 56 / 68,
  },
  "hero-assassin": {
    path: "assets/characters/assassin/Cutthroat_full.png",
    size: 68,
    attackRow: 9,
    originY: 79 / 94,
  },
  "hero-mage": {
    path: "assets/characters/mage/RenegadeMage_full.png",
    size: 68,
    attackRow: 1,
    originY: 79 / 94,
  },
};

const DEFAULT_SHEET: HeroSheet = HERO_SHEETS.hero;

const SHEET_COLUMNS = 16;
const HERO_SCALE = 3;
const MONO = "monospace";

type ClassCard = {
  index: number;
  baseX: number;
  hovered: boolean;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  marker: Phaser.GameObjects.Rectangle;
  sprite: Phaser.GameObjects.Sprite;
};

type StatRow = {
  key: "maxHealth" | "damage" | "speed";
  label: string;
  decimals: number;
  max: number;
  displayed: number;
  valueText: Phaser.GameObjects.Text;
  barFill: Phaser.GameObjects.Rectangle;
  counter?: Phaser.Tweens.Tween;
};

export class SelectionScene extends Phaser.Scene {
  private selectedIndex = 0;
  private heroShownIndex = 0;
  private accent = DEFAULT_THEME.color;
  private accentListeners: Array<(color: number) => void> = [];
  private accentTween?: Phaser.Tweens.Tween;

  private isStarting = false;
  private isRolling = false; // sorteio em andamento
  private randomButton!: Phaser.GameObjects.Container;
  private randomIcon!: Phaser.GameObjects.Text;
  private isSwapping = false;
  private isShowcase = false;
  private showcaseId = 0;
  private turnIndex = 0;

  private stageX = 0;
  private stageY = 0;

  private cards: ClassCard[] = [];
  private statRows: StatRow[] = [];

  private hero!: Phaser.GameObjects.Sprite;
  private squashTween?: Phaser.Tweens.Tween;
  private backgroundMusic?: Phaser.Sound.BaseSound;

  private title!: Phaser.GameObjects.Text;
  private titleLine!: Phaser.GameObjects.Rectangle;
  private nameText!: Phaser.GameObjects.Text;
  private descriptionText!: Phaser.GameObjects.Text;
  private roleText!: Phaser.GameObjects.Text;
  private platform!: Phaser.GameObjects.Container;

  private panel!: Phaser.GameObjects.Container;
  private abilityIconText!: Phaser.GameObjects.Text;
  private abilityNameText!: Phaser.GameObjects.Text;
  private abilityCooldownText!: Phaser.GameObjects.Text;
  private abilityDescriptionText!: Phaser.GameObjects.Text;

  private startButton!: Phaser.GameObjects.Container;

  constructor() {
    super("SelectionScene");
  }

  // Os sprites dos heróis eram carregados só na arena; aqui garantimos que
  // existam. Se já estiverem no cache, o Phaser simplesmente não carrega de novo.
  preload() {
    Object.entries(HERO_SHEETS).forEach(([key, sheet]) => {
      if (!this.textures.exists(key)) {
        this.load.spritesheet(key, sheet.path, {
          frameWidth: sheet.size,
          frameHeight: sheet.size,
        });
      }
    });
    this.load.audio(
      "selection-music",
      "assets/audio/dark-fantasy-orchestral-cinematic-medieval-fanta.wav"
    );
  }

  create() {
    const { width, height } = this.scale;

    // A cena pode ser reaberta: zera todo o estado.
    this.accentListeners = [];
    this.cards = [];
    this.statRows = [];
    this.isStarting = false;
    this.isRolling = false;
    this.isSwapping = false;
    this.isShowcase = false;
    this.showcaseId = 0;
    this.turnIndex = 0;

    this.stageX = width / 2;
    this.stageY = Math.round(height * 0.63);

    // Lembra a última classe escolhida (antes sempre voltava para o Guerreiro).
    const savedId = this.registry.get("selectedClassId");
    const savedIndex = CHARACTER_CLASSES.findIndex((c) => c.id === savedId);

    this.selectedIndex = savedIndex >= 0 ? savedIndex : 0;
    this.heroShownIndex = this.selectedIndex;
    this.accent = this.getTheme(CHARACTER_CLASSES[this.selectedIndex]).color;

    this.cameras.main.fadeIn(300, 0, 0, 0);

    // Música ambiente da seleção de personagens.
    this.backgroundMusic = this.sound.add("selection-music", {
      loop: true,
      volume: 0.35,
    });

    this.backgroundMusic.play();

    // Para a música quando a cena for encerrada.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.backgroundMusic?.stop();
      this.backgroundMusic?.destroy();
      this.backgroundMusic = undefined;
    });

    this.createAttackAnimations();
    this.createBackground();
    this.createEmbers();
    this.createTitle();
    this.createStage();
    this.createCards();
    this.createRandomButton();
    this.createInfoPanel();
    this.createButtons();
    this.createInput();

    this.renderSelection(false);
    this.playIntro();

    // Pedestal giratório: o herói vira de direção a cada instante.
    this.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => this.turnHero(),
    });
  }

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------

  private getTheme(characterClass: CharacterClass): ClassTheme {
    return CLASS_THEMES[characterClass.id] ?? DEFAULT_THEME;
  }

  private getSheet(spriteKey: string): HeroSheet {
    return HERO_SHEETS[spriteKey] ?? DEFAULT_SHEET;
  }

  private css(color: number): string {
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  // Escurece uma cor (amount de 0 a 100).
  private shade(color: number, amount: number): number {
    const c = Phaser.Display.Color.ValueToColor(color);
    c.darken(amount);
    return c.color;
  }

  // Registra algo que muda de cor junto com a classe selecionada.
  private onAccent(listener: (color: number) => void) {
    this.accentListeners.push(listener);
    listener(this.accent);
  }

  private setAccent(color: number) {
    this.accent = color;
    this.accentListeners.forEach((listener) => listener(color));
    this.cards.forEach((card) => this.styleCard(card));
  }

  // Transição suave entre a cor atual e a da nova classe.
  private tweenAccent(to: number) {
    this.accentTween?.stop();

    const from = Phaser.Display.Color.ValueToColor(this.accent);
    const target = Phaser.Display.Color.ValueToColor(to);

    this.accentTween = this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: 450,
      ease: "Sine.easeInOut",
      onUpdate: (tween: Phaser.Tweens.Tween) => {
        const mix = Phaser.Display.Color.Interpolate.ColorWithColor(
          from,
          target,
          100,
          Number(tween.getValue()),
        );

        this.setAccent(Phaser.Display.Color.GetColor(mix.r, mix.g, mix.b));
      },
      onComplete: () => this.setAccent(to),
    });
  }

  // Troca o texto com um pequeno "deslize" (some para baixo, volta por cima).
  private swapText(target: Phaser.GameObjects.Text, value: string) {
    if (target.text === value) return;

    const baseY = target.getData("baseY") as number;

    this.tweens.killTweensOf(target);

    this.tweens.add({
      targets: target,
      alpha: 0,
      y: baseY + 8,
      duration: 90,
      onComplete: () => {
        target.setText(value);
        target.setY(baseY - 8);

        this.tweens.add({
          targets: target,
          alpha: 1,
          y: baseY,
          duration: 180,
          ease: "Cubic.easeOut",
        });
      },
    });
  }

  private rememberBaseY(target: Phaser.GameObjects.Text) {
    target.setData("baseY", target.y);
  }

  // -------------------------------------------------------------------------
  // Animações do herói
  // -------------------------------------------------------------------------

  // Animação de ataque (sentido sul) usada como "pose de exibição".
  // Chaves próprias do menu para não interferir com as da arena.
  private createAttackAnimations() {
    Object.entries(HERO_SHEETS).forEach(([key, sheet]) => {
      const animKey = `select-${key}-attack`;

      if (this.anims.exists(animKey) || !this.textures.exists(key)) return;

      const start = sheet.attackRow * SHEET_COLUMNS;

      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(key, {
          start,
          end: start + 15,
        }),
        frameRate: 32,
        repeat: 0,
      });
    });
  }

  // Gira o herói para a próxima direção (S, SE, L, NE, N, NO, O, SO).
  private turnHero() {
    if (this.isShowcase || this.isSwapping || this.isStarting) return;

    this.turnIndex = (this.turnIndex + 1) % 8;
    this.hero.setFrame(this.turnIndex);

    // Pequeno "achatamento" para dar sensação de giro.
    this.squashTween?.stop();
    this.hero.setScale(HERO_SCALE);

    this.squashTween = this.tweens.add({
      targets: this.hero,
      scaleX: HERO_SCALE * 0.93,
      duration: 60,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  // Pose de exibição: o herói de frente executa o ataque.
  private playFlourish() {
    if (this.isShowcase || this.isSwapping) return;

    const animKey = `select-${CHARACTER_CLASSES[this.heroShownIndex].spriteKey}-attack`;

    if (!this.anims.exists(animKey)) return;

    this.isShowcase = true;
    this.turnIndex = 0;

    const id = ++this.showcaseId;

    this.squashTween?.stop();
    this.hero.setScale(HERO_SCALE);
    this.hero.play(animKey);

    this.hero.once("animationcomplete", () => {
      if (id !== this.showcaseId) return;

      this.isShowcase = false;
      this.hero.setFrame(this.turnIndex);
    });
  }

  // Troca o herói exibido pelo da classe selecionada, com um "flip" e um clarão.
  private swapHero() {
    if (this.isSwapping) return; // ao terminar, verifica se precisa trocar de novo

    const target = CHARACTER_CLASSES[this.selectedIndex];
    const sheet = this.getSheet(target.spriteKey);

    this.isSwapping = true;
    this.showcaseId++;
    this.isShowcase = false;
    this.squashTween?.stop();
    this.hero.stop();

    this.tweens.add({
      targets: this.hero,
      scaleX: 0,
      scaleY: HERO_SCALE * 1.12,
      duration: 110,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.heroShownIndex = this.selectedIndex;
        this.turnIndex = 0;

        this.hero.setTexture(target.spriteKey);
        this.hero.setOrigin(0.5, sheet.originY);
        this.hero.setFrame(0);

        this.spawnSwapFlash();

        this.tweens.add({
          targets: this.hero,
          scaleX: HERO_SCALE,
          scaleY: HERO_SCALE,
          duration: 280,
          ease: "Back.easeOut",
          onComplete: () => {
            this.isSwapping = false;

            // O jogador pode ter clicado em outra classe durante a troca.
            if (this.heroShownIndex !== this.selectedIndex) {
              this.swapHero();
            } else {
              this.playFlourish();
            }
          },
        });
      },
    });
  }

  // Clarão no pedestal + feixe de luz subindo atrás do herói.
  private spawnSwapFlash() {
    const ring = this.add
      .ellipse(this.stageX, this.stageY, 40, 12, 0xffffff, 0.9)
      .setDepth(4);

    this.tweens.add({
      targets: ring,
      scale: 6,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });

    const beam = this.add
      .rectangle(this.stageX, this.stageY - 110, 90, 260, this.accent, 0.45)
      .setDepth(4);

    this.tweens.add({
      targets: beam,
      scaleX: 0.1,
      alpha: 0,
      duration: 380,
      ease: "Cubic.easeIn",
      onComplete: () => beam.destroy(),
    });
  }

  // -------------------------------------------------------------------------
  // Construção da cena
  // -------------------------------------------------------------------------

  private createBackground() {
    const { width, height } = this.scale;

    // Degradê vertical feito em faixas (funciona em WebGL e Canvas).
    const bands = 32;
    const top = Phaser.Display.Color.ValueToColor(0x0b0814);
    const bottom = Phaser.Display.Color.ValueToColor(0x1d1230);

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

    // Brilho grande atrás do herói, na cor da classe.
    const glowOuter = this.add
      .ellipse(this.stageX, this.stageY - 70, 560, 440, this.accent, 0.08)
      .setDepth(-90);
    const glowInner = this.add
      .ellipse(this.stageX, this.stageY - 70, 360, 300, this.accent, 0.12)
      .setDepth(-89);

    this.onAccent((color) => {
      glowOuter.setFillStyle(color, 0.08);
      glowInner.setFillStyle(color, 0.12);
    });

    this.tweens.add({
      targets: [glowOuter, glowInner],
      scale: 1.08,
      alpha: 0.7,
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Vinheta: bordas escuras feitas com várias camadas translúcidas.
    for (let i = 0; i < 8; i++) {
      const size = (i + 1) * 16;

      this.add
        .rectangle(size / 2, height / 2, size, height, 0x000000, 0.07)
        .setDepth(-80);
      this.add
        .rectangle(width - size / 2, height / 2, size, height, 0x000000, 0.07)
        .setDepth(-80);
      this.add
        .rectangle(width / 2, size / 2, width, size, 0x000000, 0.07)
        .setDepth(-80);
      this.add
        .rectangle(width / 2, height - size / 2, width, size, 0x000000, 0.07)
        .setDepth(-80);
    }
  }

  // Brasas subindo pelo fundo.
  private createEmbers() {
    const { width, height } = this.scale;

    for (let i = 0; i < 36; i++) {
      const size = Phaser.Math.Between(2, 4);
      const startX = Phaser.Math.Between(0, width);
      const duration = Phaser.Math.Between(5000, 9000);
      const delay = Phaser.Math.Between(0, 6000);

      const ember = this.add
        .rectangle(startX, height + 10, size, size, this.accent, 0)
        .setDepth(-70);

      this.onAccent((color) => ember.setFillStyle(color));

      this.tweens.add({
        targets: ember,
        y: -20,
        duration,
        delay,
        repeat: -1,
      });

      this.tweens.add({
        targets: ember,
        alpha: Phaser.Math.FloatBetween(0.35, 0.8),
        duration: duration / 2,
        delay,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      this.tweens.add({
        targets: ember,
        x: startX + Phaser.Math.Between(-30, 30),
        duration: duration / 3,
        delay,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private createTitle() {
    const { width } = this.scale;

    this.title = this.add
      .text(width / 2, 46, "ESCOLHA SUA CLASSE", {
        fontFamily: MONO,
        fontSize: "30px",
        fontStyle: "bold",
        color: "#facc15",
        stroke: "#1f102e",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.titleLine = this.add
      .rectangle(width / 2, 74, 260, 3, this.accent)
      .setDepth(10);

    this.onAccent((color) => this.titleLine.setFillStyle(color));
  }

  // Pedestal, herói, nome e descrição no centro da tela.
  private createStage() {
    const x = this.stageX;
    const y = this.stageY;

    // Plataforma: brilho, dois anéis pulsantes e uma base escura.
    // Tudo dentro de um container: a entrada escala o container e os
    // pulsos mexem só nos filhos, sem um brigar com o outro.
    const base = this.add.ellipse(0, 4, 250, 76, 0x07040d, 0.7);
    const glow = this.add.ellipse(0, 0, 230, 68, this.accent, 0.25);
    const ringOuter = this.add.ellipse(0, 0, 260, 80);
    const ringInner = this.add.ellipse(0, 0, 170, 50);

    this.platform = this.add
      .container(x, y, [base, glow, ringOuter, ringInner])
      .setDepth(2);

    this.onAccent((color) => {
      glow.setFillStyle(color, 0.25);
      ringOuter.setStrokeStyle(3, color, 0.9);
      ringInner.setStrokeStyle(1, 0xffffff, 0.6);
    });

    this.tweens.add({
      targets: ringOuter,
      scale: 1.08,
      alpha: 0.5,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.tweens.add({
      targets: glow,
      alpha: 0.55,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Herói.
    const current = CHARACTER_CLASSES[this.selectedIndex];
    const sheet = this.getSheet(current.spriteKey);

    this.hero = this.add
      .sprite(x, y, current.spriteKey, 0)
      .setOrigin(0.5, sheet.originY)
      .setScale(HERO_SCALE)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });

    // Clicar no herói repete a pose de exibição.
    this.hero.on("pointerdown", () => this.playFlourish());

    // "Respiração": sobe e desce alguns pixels.
    this.tweens.add({
      targets: this.hero,
      y: y - 4,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Nome, etiqueta e descrição.
    this.nameText = this.add
      .text(x, y + 52, "", {
        fontFamily: MONO,
        fontSize: "30px",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#1f102e",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.rememberBaseY(this.nameText);

    this.roleText = this.add
      .text(x, y + 78, "", {
        fontFamily: MONO,
        fontSize: "12px",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.rememberBaseY(this.roleText);

    this.descriptionText = this.add
      .text(x, y + 98, "", {
        fontFamily: MONO,
        fontSize: "13px",
        color: "#d4c9e8",
        align: "center",
        wordWrap: { width: 380 },
      })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.rememberBaseY(this.descriptionText);

    this.onAccent((color) => {
      this.nameText.setColor(this.css(color));
      this.roleText.setColor(this.css(color));
    });
  }

  // Lista de classes à esquerda.
  private createCards() {
    const cardWidth = 236;
    const cardHeight = 84;
    const spacing = 98;
    const baseX = 24 + cardWidth / 2;
    const startY = 330 - ((CHARACTER_CLASSES.length - 1) * spacing) / 2;

    CHARACTER_CLASSES.forEach((characterClass, index) => {
      const theme = this.getTheme(characterClass);
      const sheet = this.getSheet(characterClass.spriteKey);
      const y = startY + index * spacing;

      const container = this.add.container(baseX, y).setDepth(20);

      const bg = this.add
        .rectangle(0, 0, cardWidth, cardHeight, 0x16121c)
        .setStrokeStyle(2, 0x3b3347);

      const marker = this.add
        .rectangle(-cardWidth / 2 + 3, 0, 6, cardHeight, theme.color)
        .setAlpha(0);

      const sprite = this.add
        .sprite(-78, 30, characterClass.spriteKey, 0)
        .setOrigin(0.5, sheet.originY)
        .setScale(0.85);

      const name = this.add
        .text(-38, -16, characterClass.name.toUpperCase(), {
          fontFamily: MONO,
          fontSize: "17px",
          fontStyle: "bold",
          color: "#ffffff",
        })
        .setOrigin(0, 0.5);

      const role = this.add
        .text(-38, 8, theme.role, {
          fontFamily: MONO,
          fontSize: "11px",
          fontStyle: "bold",
          color: this.css(theme.color),
        })
        .setOrigin(0, 0.5);

      const icon = this.add
        .text(cardWidth / 2 - 26, 0, theme.icon, {
          fontFamily: MONO,
          fontSize: "22px",
        })
        .setOrigin(0.5);

      container.add([bg, marker, sprite, name, role, icon]);

      const card: ClassCard = {
        index,
        baseX,
        hovered: false,
        container,
        bg,
        marker,
        sprite,
      };

      this.cards.push(card);

      bg.setInteractive({ useHandCursor: true });

      bg.on("pointerover", () => {
        card.hovered = true;
        card.sprite.setFrame(2); // olha para o lado
        this.styleCard(card);
        this.animateCard(card);
      });

      bg.on("pointerout", () => {
        card.hovered = false;
        card.sprite.setFrame(0);
        this.styleCard(card);
        this.animateCard(card);
      });

      bg.on("pointerdown", () => this.selectClass(index));
    });
  }

    // Botão "ALEATÓRIO" logo abaixo da lista de classes.
  private createRandomButton() {
    const x = 24 + 236 / 2;
    const y = 508;

    const bg = this.add
      .rectangle(0, 0, 236, 44, 0x16121c)
      .setStrokeStyle(2, 0x3b3347);

    this.randomIcon = this.add
      .text(-86, 0, "🎲", { fontFamily: MONO, fontSize: "22px" })
      .setOrigin(0.5);

    const label = this.add
      .text(-56, 0, "ALEATÓRIO", {
        fontFamily: MONO,
        fontSize: "15px",
        fontStyle: "bold",
        color: "#c4b8da",
      })
      .setOrigin(0, 0.5);

    // Lembrete da tecla de atalho.
    const hint = this.add
      .text(104, 0, "R", {
        fontFamily: MONO,
        fontSize: "11px",
        fontStyle: "bold",
        color: "#6f6585",
      })
      .setOrigin(0.5);

    this.randomButton = this.add
      .container(x, y, [bg, this.randomIcon, label, hint])
      .setDepth(20);

    // Cresce ao passar o mouse (parando o tween anterior para não brigar).
    let scaleTween: Phaser.Tweens.Tween | undefined;

    const scaleTo = (scale: number) => {
      scaleTween?.stop();
      scaleTween = this.tweens.add({
        targets: this.randomButton,
        scale,
        duration: 120,
        ease: "Back.easeOut",
      });
    };

    bg.setInteractive({ useHandCursor: true });

    bg.on("pointerover", () => {
      bg.setFillStyle(0x221b2c);
      bg.setStrokeStyle(2, this.accent);
      scaleTo(1.05);
    });

    bg.on("pointerout", () => {
      bg.setFillStyle(0x16121c);
      bg.setStrokeStyle(2, 0x3b3347);
      scaleTo(1);
    });

    bg.on("pointerdown", () => this.rollRandomClass());
  }

  // Sorteia a classe: o destaque percorre as classes cada vez mais devagar,
  // como uma roleta, e para na sorteada. Com startAfter = true, a partida
  // começa sozinha logo depois do resultado.
  private rollRandomClass(startAfter = false) {
    const total = CHARACTER_CLASSES.length;

    if (this.isRolling || this.isStarting || total < 2) return;

    this.isRolling = true;

    const target = Phaser.Math.Between(0, total - 1);

    // Tempo (ms) entre cada passo: começa rápido e desacelera.
    const delays = [70, 70, 80, 90, 110, 140, 180, 230, 300, 380];
    const steps = delays.length;
    const duration = delays.reduce((sum, delay) => sum + delay, 0);

    // O dado gira durante o sorteio.
    this.randomIcon.setAngle(0);

    this.tweens.add({
      targets: this.randomIcon,
      angle: 720,
      duration,
      ease: "Cubic.easeOut",
    });

    let elapsed = 0;

    for (let step = 0; step < steps; step++) {
      elapsed += delays[step];

      // Os índices avançam de um em um e o último cai exatamente no sorteado.
      const index = (((target - (steps - 1 - step)) % total) + total) % total;

      this.time.delayedCall(elapsed, () => {
        this.selectClass(index, true);

        if (step === steps - 1) {
          this.isRolling = false;

          if (startAfter) {
            this.time.delayedCall(900, () => this.startGame());
          }
        }
      });
    }
  }

  // Painel à direita: atributos (barras animadas) e habilidade.
  private createInfoPanel() {
    const { width } = this.scale;

    const panelWidth = 250;
    const panelHeight = 380;
    const left = -panelWidth / 2 + 18;
    const right = panelWidth / 2 - 18;
    const barWidth = panelWidth - 36;

    this.panel = this.add
      .container(width - 24 - panelWidth / 2, 330)
      .setDepth(20);

    const bg = this.add
      .rectangle(0, 0, panelWidth, panelHeight, 0x120e1a, 0.92)
      .setStrokeStyle(2, this.accent, 0.6);

    this.onAccent((color) => bg.setStrokeStyle(2, color, 0.6));

    const headerStyle = {
      fontFamily: MONO,
      fontSize: "12px",
      fontStyle: "bold",
      color: "#8a7fa0",
    };

    const attributesHeader = this.add
      .text(left, -170, "ATRIBUTOS", headerStyle)
      .setOrigin(0, 0.5);

    this.panel.add([bg, attributesHeader]);

    // Barras de atributo. O máximo de cada uma é o maior valor entre as classes.
    const rows: Array<Pick<StatRow, "key" | "label" | "decimals">> = [
      { key: "maxHealth", label: "VIDA", decimals: 0 },
      { key: "damage", label: "DANO", decimals: 0 },
      { key: "speed", label: "VELOCIDADE", decimals: 1 },
    ];

    rows.forEach((row, i) => {
      const y = -135 + i * 52;

      const label = this.add
        .text(left, y, row.label, {
          fontFamily: MONO,
          fontSize: "13px",
          fontStyle: "bold",
          color: "#c4b8da",
        })
        .setOrigin(0, 0.5);

      const valueText = this.add
        .text(right, y, "0", {
          fontFamily: MONO,
          fontSize: "15px",
          fontStyle: "bold",
          color: "#ffffff",
        })
        .setOrigin(1, 0.5);

      const barBg = this.add
        .rectangle(left, y + 20, barWidth, 10, 0x0b0814)
        .setOrigin(0, 0.5)
        .setStrokeStyle(1, 0x3b3347);

      const barFill = this.add
        .rectangle(left, y + 20, barWidth, 10, this.accent)
        .setOrigin(0, 0.5)
        .setScale(0, 1);

      this.onAccent((color) => barFill.setFillStyle(color));

      this.panel.add([label, valueText, barBg, barFill]);

      this.statRows.push({
        key: row.key,
        label: row.label,
        decimals: row.decimals,
        max: Math.max(...CHARACTER_CLASSES.map((c) => c[row.key])),
        displayed: 0,
        valueText,
        barFill,
      });
    });

    // Divisória e habilidade.
    const divider = this.add.rectangle(0, 12, barWidth, 1, 0x3b3347);

    const abilityHeader = this.add
      .text(left, 32, "HABILIDADE", headerStyle)
      .setOrigin(0, 0.5);

    const iconFrame = this.add
      .rectangle(left + 26, 82, 50, 50, 0x0b0814)
      .setStrokeStyle(2, this.accent);

    this.onAccent((color) => iconFrame.setStrokeStyle(2, color));

    this.abilityIconText = this.add
      .text(left + 26, 82, "", { fontFamily: MONO, fontSize: "26px" })
      .setOrigin(0.5);

    this.abilityNameText = this.add
      .text(left + 62, 70, "", {
        fontFamily: MONO,
        fontSize: "13px",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0, 0.5);
    this.rememberBaseY(this.abilityNameText);

    this.abilityCooldownText = this.add
      .text(left + 62, 92, "", {
        fontFamily: MONO,
        fontSize: "11px",
        color: "#8a7fa0",
      })
      .setOrigin(0, 0.5);
    this.rememberBaseY(this.abilityCooldownText);

    this.abilityDescriptionText = this.add
      .text(left, 124, "", {
        fontFamily: MONO,
        fontSize: "12px",
        color: "#d4c9e8",
        wordWrap: { width: barWidth },
        lineSpacing: 3,
      })
      .setOrigin(0, 0);
    this.rememberBaseY(this.abilityDescriptionText);

    this.onAccent((color) => this.abilityNameText.setColor(this.css(color)));

    this.panel.add([
      divider,
      abilityHeader,
      iconFrame,
      this.abilityIconText,
      this.abilityNameText,
      this.abilityCooldownText,
      this.abilityDescriptionText,
    ]);
  }

  private createButtons() {
    const { width, height } = this.scale;

    // Botão "INICIAR PARTIDA" com brilho e pulso.
    const glow = this.add.rectangle(0, 0, 320, 64, this.accent, 0.25);
    const bg = this.add.rectangle(0, 0, 300, 52, 0x000000);
    const label = this.add
      .text(0, 0, "INICIAR PARTIDA", {
        fontFamily: MONO,
        fontSize: "21px",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.startButton = this.add
      .container(width / 2, height - 60, [glow, bg, label])
      .setDepth(30);

    this.onAccent((color) => {
      glow.setFillStyle(color, 0.25);
      bg.setFillStyle(this.shade(color, 45));
      bg.setStrokeStyle(2, color);
    });

    this.tweens.add({
      targets: glow,
      alpha: 0.05,
      scaleX: 1.08,
      scaleY: 1.2,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    bg.setInteractive({ useHandCursor: true });

    bg.on("pointerover", () => {
      this.tweens.add({
        targets: this.startButton,
        scale: 1.06,
        duration: 120,
        ease: "Cubic.easeOut",
      });
    });

    bg.on("pointerout", () => {
      this.tweens.add({
        targets: this.startButton,
        scale: 1,
        duration: 120,
        ease: "Cubic.easeOut",
      });
    });

    bg.on("pointerdown", () => this.startGame());

    // Botão voltar.
    const back = this.add
      .text(24, 26, "◀ VOLTAR", {
        fontFamily: MONO,
        fontSize: "15px",
        fontStyle: "bold",
        color: "#a89cc0",
      })
      .setOrigin(0, 0.5)
      .setDepth(30)
      .setInteractive({ useHandCursor: true });

    back.on("pointerover", () => back.setColor("#ffffff"));
    back.on("pointerout", () => back.setColor("#a89cc0"));
    back.on("pointerdown", () => this.goBack());

    // Dica de teclas.
    this.add
      .text(
        width / 2,
        height - 18,
        "SETAS: ESCOLHER   ·   R: ALEATÓRIO   ·   ENTER: INICIAR   ·   ESC: VOLTAR",
        { fontFamily: MONO, fontSize: "11px", color: "#6f6585" },
      )
      .setOrigin(0.5)
      .setDepth(30);
  }

  private createInput() {
    const keyboard = this.input.keyboard;

    if (!keyboard) return;

    ["LEFT", "UP", "A", "W"].forEach((key) =>
      keyboard.on(`keydown-${key}`, () => this.cycleClass(-1)),
    );

    ["RIGHT", "DOWN", "D", "S"].forEach((key) =>
      keyboard.on(`keydown-${key}`, () => this.cycleClass(1)),
    );

    ["ENTER", "SPACE"].forEach((key) =>
      keyboard.on(`keydown-${key}`, () => this.startGame()),
    );

    keyboard.on("keydown-R", () => this.rollRandomClass());

    keyboard.on("keydown-ESC", () => this.goBack());
  }

  // -------------------------------------------------------------------------
  // Seleção
  // -------------------------------------------------------------------------

  private cycleClass(delta: number) {
    const total = CHARACTER_CLASSES.length;

    this.selectClass((this.selectedIndex + delta + total) % total);
  }

  private selectClass(index: number, fromRoll = false) {
    // Durante o sorteio, só o próprio sorteio pode trocar de classe.
    if (this.isRolling && !fromRoll) return;
    if (this.isStarting || index === this.selectedIndex) return;

    this.selectedIndex = index;
    this.renderSelection(true);
  }

  // Atualiza tudo o que depende da classe selecionada.
  // animate = false apenas na primeira montagem da tela.
  private renderSelection(animate: boolean) {
    const characterClass = CHARACTER_CLASSES[this.selectedIndex];
    const theme = this.getTheme(characterClass);
    const ability = CLASS_ABILITIES[characterClass.id];

    // Cor de destaque.
    if (animate) {
      this.tweenAccent(theme.color);
    } else {
      this.setAccent(theme.color);
    }

    // Textos.
    const setText = (target: Phaser.GameObjects.Text, value: string) => {
      if (animate) {
        this.swapText(target, value);
      } else {
        target.setText(value);
      }
    };

    setText(this.nameText, characterClass.name.toUpperCase());
    setText(this.roleText, theme.role);
    setText(this.descriptionText, characterClass.description);

    setText(this.abilityNameText, ability ? ability.name : "—");
    setText(
      this.abilityCooldownText,
      ability ? `RECARGA: ${(ability.cooldown / 1000).toFixed(0)}s` : "",
    );
    setText(this.abilityDescriptionText, ability ? ability.description : "");

    this.abilityIconText.setText(theme.icon);

    if (animate) {
      this.abilityIconText.setScale(0.4);
      this.tweens.add({
        targets: this.abilityIconText,
        scale: 1,
        duration: 260,
        ease: "Back.easeOut",
      });
    }

    // Barras de atributo.
    this.statRows.forEach((row) => {
      const target = characterClass[row.key];
      const ratio = Phaser.Math.Clamp(target / row.max, 0, 1);

      row.counter?.stop();

      if (!animate) {
        row.displayed = target;
        row.valueText.setText(target.toFixed(row.decimals));
        row.barFill.setScale(ratio, 1);
        return;
      }

      this.tweens.add({
        targets: row.barFill,
        scaleX: ratio,
        duration: 500,
        ease: "Cubic.easeOut",
      });

      const from = row.displayed;

      row.counter = this.tweens.addCounter({
        from,
        to: target,
        duration: 500,
        ease: "Cubic.easeOut",
        onUpdate: (tween: Phaser.Tweens.Tween) => {
          row.displayed = Number(tween.getValue());
          row.valueText.setText(row.displayed.toFixed(row.decimals));
        },
        onComplete: () => {
          row.displayed = target;
          row.valueText.setText(target.toFixed(row.decimals));
        },
      });
    });

    // Cartas.
    this.cards.forEach((card) => {
      this.styleCard(card);
      this.animateCard(card);
    });

    // Herói (na primeira montagem ele já nasce correto).
    if (animate) {
      this.swapHero();
    }
  }

  private styleCard(card: ClassCard) {
    const selected = card.index === this.selectedIndex;

    if (selected) {
      card.bg.setFillStyle(this.shade(this.accent, 72));
      card.bg.setStrokeStyle(2, this.accent);
      card.marker.setFillStyle(this.accent);
      card.marker.setAlpha(1);
      return;
    }

    card.marker.setAlpha(0);

    if (card.hovered) {
      card.bg.setFillStyle(0x221b2c);
      card.bg.setStrokeStyle(2, 0x8b7fa8);
    } else {
      card.bg.setFillStyle(0x16121c);
      card.bg.setStrokeStyle(2, 0x3b3347);
    }
  }

  // A carta selecionada desliza um pouco para a direita; com o mouse em cima, cresce.
  private animateCard(card: ClassCard) {
    const selected = card.index === this.selectedIndex;

    this.tweens.killTweensOf(card.container);

    this.tweens.add({
      targets: card.container,
      x: card.baseX + (selected ? 14 : 0),
      scale: card.hovered ? 1.05 : 1,
      alpha: 1,
      duration: 180,
      ease: "Back.easeOut",
    });
  }

  // -------------------------------------------------------------------------
  // Entrada e saída
  // -------------------------------------------------------------------------

  private playIntro() {
    // Título e linha.
    const titleY = this.title.y;
    this.title.setY(titleY - 40).setAlpha(0);

    this.tweens.add({
      targets: this.title,
      y: titleY,
      alpha: 1,
      duration: 450,
      ease: "Back.easeOut",
    });

    this.titleLine.setScale(0, 1);

    this.tweens.add({
      targets: this.titleLine,
      scaleX: 1,
      duration: 500,
      delay: 250,
      ease: "Cubic.easeOut",
    });

    // Cartas entram uma de cada vez, vindo da esquerda.
    this.cards.forEach((card, i) => {
      const targetX = card.baseX + (card.index === this.selectedIndex ? 14 : 0);

      this.tweens.killTweensOf(card.container);
      card.container.setX(card.baseX - 300).setAlpha(0);

      this.tweens.add({
        targets: card.container,
        x: targetX,
        alpha: 1,
        duration: 450,
        delay: 150 + i * 90,
        ease: "Back.easeOut",
      });
    });

    // O botão "Aleatório" entra logo depois das cartas.
    const randomX = this.randomButton.x;

    this.randomButton.setX(randomX - 300).setAlpha(0);

    this.tweens.add({
      targets: this.randomButton,
      x: randomX,
      alpha: 1,
      duration: 450,
      delay: 150 + this.cards.length * 90,
      ease: "Back.easeOut",
    });

    // Painel entra pela direita.
    const panelX = this.panel.x;
    this.panel.setX(panelX + 90).setAlpha(0);

    this.tweens.add({
      targets: this.panel,
      x: panelX,
      alpha: 1,
      duration: 450,
      delay: 250,
      ease: "Cubic.easeOut",
    });

    // Pedestal e herói "brotam".
    this.platform.setScale(0);

    this.tweens.add({
      targets: this.platform,
      scale: 1,
      duration: 500,
      delay: 150,
      ease: "Cubic.easeOut",
    });

    this.isSwapping = true;
    this.hero.setScale(0);

    this.tweens.add({
      targets: this.hero,
      scale: HERO_SCALE,
      duration: 450,
      delay: 350,
      ease: "Back.easeOut",
      onComplete: () => {
        this.isSwapping = false;
        this.playFlourish();
      },
    });

    // Nome e descrição aparecem depois do herói.
    [this.nameText, this.roleText, this.descriptionText].forEach((text) => {
      text.setAlpha(0);

      this.tweens.add({
        targets: text,
        alpha: 1,
        duration: 350,
        delay: 600,
      });
    });

    // Botão de iniciar sobe de baixo.
    const buttonY = this.startButton.y;
    this.startButton.setY(buttonY + 50).setAlpha(0);

    this.tweens.add({
      targets: this.startButton,
      y: buttonY,
      alpha: 1,
      duration: 450,
      delay: 550,
      ease: "Back.easeOut",
    });
  }

  private startGame() {
    if (this.isStarting || this.isRolling) return;

    this.isStarting = true;

    const characterClass = CHARACTER_CLASSES[this.selectedIndex];

    this.registry.set("selectedClassId", characterClass.id);

    // O herói faz a pose de ataque enquanto a tela escurece.
    this.playFlourish();

    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("ArenaScene");
    });
  }

  private goBack() {
    if (this.isStarting) return;

    this.isStarting = true;

    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("MenuScene");
    });
  }
}