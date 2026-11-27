import Phaser from "phaser";

/**
 * Controles touch para o Riftbound (Android/iOS).
 *
 * - Joystick flutuante: aparece onde o polegar tocar, na metade esquerda da tela.
 * - Botões à direita: ATAQUE (segurar repete), ESQUIVA e HABILIDADE.
 * - Botão de pausa no canto superior direito.
 *
 * Coloque em: src/game/utils/mobileControls.ts
 */

export type MobileControlsOptions = {
  /** Ícone mostrado no botão de habilidade da classe (🛡, ➤, ✦...). */
  abilityIcon?: string;
  /** Chamado ao tocar no botão de pausa. */
  onPause?: () => void;
};

const DEPTH = 15000; // acima do HUD (10001), abaixo da tela de melhorias (20000)
const FILL_IDLE = 0x1b1230;
const FILL_PRESSED = 0x6d28d9;
const STROKE = 0xc4b5fd;
const STROKE_READY = 0x66ff99;

/**
 * Detecta se o jogo está rodando em um celular/tablet.
 * Dica de teste no PC: abra o jogo com ?mobile=1 na URL para forçar os controles.
 */
export function isMobileDevice(scene: Phaser.Scene): boolean {
  if (typeof window !== "undefined") {
    const forced = new URLSearchParams(window.location.search).get("mobile");
    if (forced === "1") return true;
    if (forced === "0") return false;
  }

  const device = scene.sys.game.device;
  const coarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  return device.os.android || device.os.iOS || (device.input.touch && coarsePointer);
}

type PointerHandler = (
  pointer: Phaser.Input.Pointer,
  over?: Phaser.GameObjects.GameObject[],
) => void;

export class MobileControls {
  private readonly scene: Phaser.Scene;
  private readonly visuals: (Phaser.GameObjects.Arc | Phaser.GameObjects.Text)[] = [];
  private enabled = true;

  // Joystick
  private stickPointerId: number | null = null;
  private readonly stickCenter = new Phaser.Math.Vector2();
  private readonly stickVector = new Phaser.Math.Vector2();
  private readonly stickRadius = 70;
  private readonly deadZone = 0.18;
  private readonly stickHome: { x: number; y: number };
  private stickBase!: Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Arc;

  // Estado dos botões
  /** true enquanto o botão de ataque está pressionado. */
  attackHeld = false;
  private dodgeQueued = false;
  private abilityQueued = false;

  // Botão de habilidade (mostra a recarga)
  private abilityCircle!: Phaser.GameObjects.Arc;
  private abilityLabel!: Phaser.GameObjects.Text;
  private readonly abilityIcon: string;
  private abilityReady = true;
  private abilitySeconds = -1;

  // Cada botão lembra qual dedo o está segurando.
  private readonly buttonStates: { pointerId: number | null; release: () => void }[] = [];

  // Painel de debug (abra o jogo com ?debug=1)
  private debugText?: Phaser.GameObjects.Text;
  private readonly refreshDebug = () => {
    if (!this.debugText) return;
    const input = this.scene.input;
    this.debugText.setText(
      `stick ${this.stickVector.x.toFixed(2)},${this.stickVector.y.toFixed(2)}` +
        ` | atk ${this.attackHeld ? "ON" : "off"}` +
        ` | enabled ${this.enabled}` +
        ` | ptr ${input.manager.pointersTotal}` +
        ` | last ${this.lastEvent}`,
    );
  };
  private lastEvent = "-";

  private readonly onPointerDown: PointerHandler;
  private readonly onPointerMove: PointerHandler;
  private readonly onPointerUp: PointerHandler;
  private readonly onGameOut: () => void;

  constructor(scene: Phaser.Scene, options: MobileControlsOptions = {}) {
    this.scene = scene;
    this.abilityIcon = options.abilityIcon ?? "✦";

    const width = scene.scale.width;
    const height = scene.scale.height;

    // Joystick + 2 botões ao mesmo tempo = precisa de 3 toques simultâneos.
    // (mouse + 3 toques = 4 ponteiros)
    const missing = 4 - scene.input.manager.pointersTotal;
    if (missing > 0) scene.input.addPointer(missing);

    // ---------- Joystick (base "fantasma" na posição padrão) ----------
    this.stickHome = { x: 130, y: height - 130 };

    this.stickBase = scene.add
      .circle(this.stickHome.x, this.stickHome.y, this.stickRadius, FILL_IDLE, 0.25)
      .setStrokeStyle(3, STROKE, 0.35)
      .setScrollFactor(0)
      .setDepth(DEPTH);

    this.stickKnob = scene.add
      .circle(this.stickHome.x, this.stickHome.y, 30, STROKE, 0.3)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1);

    this.visuals.push(this.stickBase, this.stickKnob);

    // ---------- Botões ----------
    // Ataque (grande, segurar = ataca repetidamente)
    this.createButton(width - 120, height - 120, 62, "⚔", 44, {
      onDown: () => (this.attackHeld = true),
      onUp: () => (this.attackHeld = false),
    });

    // Esquiva
    this.createButton(width - 255, height - 75, 44, "💨", 32, {
      onDown: () => (this.dodgeQueued = true),
    });

    // Habilidade da classe
    const ability = this.createButton(width - 90, height - 250, 46, this.abilityIcon, 34, {
      onDown: () => (this.abilityQueued = true),
    });
    this.abilityCircle = ability.circle;
    this.abilityLabel = ability.label;

    // Pausa
    this.createButton(width - 44, 44, 24, "II", 22, {
      onDown: () => options.onPause?.(),
    });

    // ---------- Entrada global: joystick flutuante ----------
    this.onPointerDown = (pointer) => {
      this.lastEvent = `down@${Math.round(pointer.x)},${Math.round(pointer.y)}`;
      if (!this.enabled || this.stickPointerId !== null) return;
      if (pointer.x > this.scene.scale.width * 0.5) return; // só metade esquerda (sem botões lá)

      this.stickPointerId = pointer.id;
      this.stickCenter.set(pointer.x, pointer.y);
      this.stickBase.setPosition(pointer.x, pointer.y).setAlpha(0.6);
      this.stickKnob.setPosition(pointer.x, pointer.y).setAlpha(0.8);
      this.stickVector.set(0, 0);
    };

    this.onPointerMove = (pointer) => {
      if (!this.enabled || pointer.id !== this.stickPointerId) return;

      const dx = pointer.x - this.stickCenter.x;
      const dy = pointer.y - this.stickCenter.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, this.stickRadius);
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 0;

      this.stickKnob.setPosition(
        this.stickCenter.x + nx * clamped,
        this.stickCenter.y + ny * clamped,
      );

      const magnitude = clamped / this.stickRadius;
      if (magnitude < this.deadZone) {
        this.stickVector.set(0, 0);
      } else {
        this.stickVector.set(nx * magnitude, ny * magnitude);
      }
    };

    this.onPointerUp = (pointer) => {
      this.lastEvent = "up";
      if (pointer.id === this.stickPointerId) this.releaseStick();
      this.buttonStates.forEach((b) => {
        if (b.pointerId === pointer.id) b.release();
      });
    };

    this.onGameOut = () => this.releaseAll();

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    scene.input.on(Phaser.Input.Events.GAME_OUT, this.onGameOut);

    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "1"
    ) {
      this.debugText = scene.add
        .text(width / 2, height - 6, "", {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#66ff99",
          backgroundColor: "#000000aa",
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5, 1)
        .setScrollFactor(0)
        .setDepth(DEPTH + 2);
      this.visuals.push(this.debugText);
      scene.events.on(Phaser.Scenes.Events.UPDATE, this.refreshDebug);
    }

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  // ------------------------------------------------------------------
  // API usada pela ArenaScene
  // ------------------------------------------------------------------

  /**
   * Direção do joystick convertida para os eixos do MUNDO isométrico
   * (os mesmos eixos de worldX/worldY). Empurrar o stick para cima faz o
   * personagem subir NA TELA. O tamanho do vetor (0..1) é a força do stick.
   * Retorna null quando o stick está parado.
   */
  getWorldMove(tileWidth: number, tileHeight: number): { x: number; y: number } | null {
    const sx = this.stickVector.x;
    const sy = this.stickVector.y;
    if (sx === 0 && sy === 0) return null;

    // Inverso da projeção: telaX = (wx - wy) * tw/2 ; telaY = (wx + wy) * th/2
    const a = sx / (tileWidth / 2);
    const b = sy / (tileHeight / 2);
    const wx = (a + b) / 2;
    const wy = (b - a) / 2;

    const len = Math.hypot(wx, wy);
    if (len === 0) return null;

    const strength = Math.min(1, Math.hypot(sx, sy));
    return { x: (wx / len) * strength, y: (wy / len) * strength };
  }

  /** true uma única vez por toque no botão de esquiva. */
  consumeDodge(): boolean {
    const pressed = this.dodgeQueued;
    this.dodgeQueued = false;
    return pressed;
  }

  /** true uma única vez por toque no botão de habilidade. */
  consumeAbility(): boolean {
    const pressed = this.abilityQueued;
    this.abilityQueued = false;
    return pressed;
  }

  /** Atualiza o botão de habilidade. progress: 0..1 (1 = pronta). */
  setAbilityCooldown(progress: number, remainingSeconds: number): void {
    const ready = progress >= 1;
    if (ready === this.abilityReady && remainingSeconds === this.abilitySeconds) return;

    this.abilityReady = ready;
    this.abilitySeconds = remainingSeconds;

    this.abilityLabel.setText(ready ? this.abilityIcon : `${remainingSeconds}`);
    this.abilityCircle.setStrokeStyle(3, ready ? STROKE_READY : STROKE, 0.8);
    this.abilityCircle.setFillStyle(FILL_IDLE, ready ? 0.6 : 0.35);
  }

  /**
   * Mostra/esconde os controles. Use false durante a tela de melhorias
   * (senão os toques "atravessam" o overlay).
   */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.visuals.forEach((v) => v.setVisible(enabled));
    if (!enabled) this.releaseAll();
  }

  destroy(): void {
    const input = this.scene.input;
    input?.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    input?.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    input?.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    input?.off(Phaser.Input.Events.GAME_OUT, this.onGameOut);
    this.scene.events?.off(Phaser.Scenes.Events.UPDATE, this.refreshDebug);
    this.visuals.forEach((v) => v.destroy());
    this.visuals.length = 0;
  }

  // ------------------------------------------------------------------
  // Internos
  // ------------------------------------------------------------------

  private releaseStick(): void {
    this.stickPointerId = null;
    this.stickVector.set(0, 0);
    this.stickBase.setPosition(this.stickHome.x, this.stickHome.y).setAlpha(0.25);
    this.stickKnob.setPosition(this.stickHome.x, this.stickHome.y).setAlpha(0.3);
  }

  private releaseAll(): void {
    this.buttonStates.forEach((b) => {
      if (b.pointerId !== null) b.release();
    });
    this.releaseStick();
    this.attackHeld = false;
    this.dodgeQueued = false;
    this.abilityQueued = false;
  }

  private createButton(
    x: number,
    y: number,
    radius: number,
    label: string,
    fontSize: number,
    handlers: { onDown?: () => void; onUp?: () => void },
  ): { circle: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text } {
    const circle = this.scene.add
      .circle(x, y, radius, FILL_IDLE, 0.55)
      .setStrokeStyle(3, STROKE, 0.8)
      .setScrollFactor(0)
      .setDepth(DEPTH);

    // Área de toque 30% maior que o desenho, mais fácil de acertar com o dedo.
    circle.setInteractive(
      new Phaser.Geom.Circle(radius, radius, radius * 1.3),
      Phaser.Geom.Circle.Contains,
    );

    const text = this.scene.add
      .text(x, y, label, {
        fontFamily: "monospace",
        fontSize: `${fontSize}px`,
        fontStyle: "bold",
        color: "#e9d5ff",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1);

    const state = { pointerId: null as number | null, release: () => {} };

    state.release = () => {
      state.pointerId = null;
      circle.setScale(1);
      circle.setFillStyle(FILL_IDLE, 0.55);
      handlers.onUp?.();
    };

    circle.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.lastEvent = `btn:${label}`;
      if (!this.enabled) return;
      state.pointerId = pointer.id;
      circle.setScale(0.92);
      circle.setFillStyle(FILL_PRESSED, 0.8);
      handlers.onDown?.();
    });

    // O soltar é tratado no POINTER_UP global (onPointerUp), pelo id do dedo.
    this.buttonStates.push(state);

    this.visuals.push(circle, text);
    return { circle, label: text };
  }
}