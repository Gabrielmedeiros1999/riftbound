import Phaser from "phaser";

export class ArenaScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    attack: Phaser.Input.Keyboard.Key;
    dodge: Phaser.Input.Keyboard.Key;
  };

  // Posição lógica do personagem na arena.
  private worldX = 6;
  private worldY = 6;
  private speed = 3;

  // Dimensões de cada losango isométrico.
  private readonly tileWidth = 64;
  private readonly tileHeight = 32;
  private readonly playerRadius = 0.18;

  // Direção para a qual o personagem está olhando.
  private facingX = 1;
  private facingY = 0;

  // Controle do tempo entre ataques.
  private readonly attackCooldown = 350;
  private nextAttackTime = 0;

  // Posição do primeiro inimigo na arena.
  private enemyX = 8;
  private enemyY = 6;

  private enemy!: Phaser.GameObjects.Container;
  private enemyHealthBar!: Phaser.GameObjects.Graphics;

  private enemyHealth = 3;
  private enemyMaxHealth = 3;
  private enemySpeed = 0.9;
  private enemyAlive = true;

  // melhorias  pendentes
  private pendingLevelUps = 0;
  private upgradePending = false;
  private upgradeObjects: Phaser.GameObjects.GameObject[] = [];

  // Ondas e progressão
  private wave = 1;
  private enemiesRemainingInWave = 3;
  private spawnIndex = 0;

  private xp = 0;
  private level = 1;
  private xpToNextLevel = 3;
  private playerDamage = 1;

  // Esquiva
  private dodgeUntil = 0;
  private invulnerableUntil = 0;
  private nextDodgeTime = 0;

  private readonly dodgeDuration = 180;
  private readonly invulnerabilityDuration = 300;
  private readonly dodgeCooldown = 900;
  private readonly dodgeSpeed = 9;

  private dodgeDirX = 1;
  private dodgeDirY = 0;

  private facingDirection:
  | "south"
  | "north"
  | "east"
  | "west" = "south";

  private isAttacking = false;

  private readonly obstacles = [
    { x: 3.5, y: 3.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 4.5, y: 7.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 8.5, y: 3.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 9.5, y: 8.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 6.5, y: 2.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 2.5, y: 9.5, halfWidth: 0.35, halfHeight: 0.35 },
  ];

  private enemyType: "normal" | "runner" | "brute" = "normal";

  private playerHealth = 100;
  private playerMaxHealth = 100;

  // HUD
  private hudText!: Phaser.GameObjects.Text;
  private healthBar!: Phaser.GameObjects.Graphics;
  private xpBar!: Phaser.GameObjects.Graphics;

  private gameOver = false;

  private nextDamageTime = 0;
  private readonly contactDamage = 10;
  private readonly damageCooldown = 800;

  constructor() {
    super("ArenaScene");
  }

  init() {
  // Progressão (primeiro, porque outros valores dependem dela)
  this.wave = 1;
  this.enemiesRemainingInWave = 3;
  this.spawnIndex = 0;

  this.xp = 0;
  this.level = 1;
  this.xpToNextLevel = 3;
  this.playerDamage = 1;
  this.enemyMaxHealth = 3;

  // Jogador
  this.worldX = 6;
  this.worldY = 6;
  this.facingX = 1;
  this.facingY = 0;
  this.speed = 3;
  this.playerMaxHealth = 100;
  this.playerHealth = this.playerMaxHealth;
  
  this.facingDirection = "south";
  this.isAttacking = false;

// Inimigo
  this.enemyX = 8;
  this.enemyY = 6;
  this.enemyType = "normal"; 
  this.enemySpeed = 0.9;  
  this.enemyHealth = this.enemyMaxHealth;
  this.enemyAlive = true;

  // Estado da partida
  this.gameOver = false;
  this.nextAttackTime = 0;
  this.nextDamageTime = 0;

  // Esquiva
  this.dodgeUntil = 0;
  this.invulnerableUntil = 0;
  this.nextDodgeTime = 0;
  this.dodgeDirX = 1;
  this.dodgeDirY = 0;

  // melhorias
  this.pendingLevelUps = 0;
  this.upgradePending = false;
  this.upgradeObjects = [];
}

 preload(){
  this.load.audio("sword", "assets/audio/sword.wav");
  this.load.audio("hit", "assets/audio/hit.wav");
  this.load.audio("dodge", "assets/audio/dodge.wav");
  this.load.audio("level-up", "assets/audio/level-up.wav");
  this.load.spritesheet(
    "hero",
    "assets/characters/hero/Hero_Knight_full.png",
    {
      frameWidth: 80,
      frameHeight: 82,
    }
  );
 }

  create() {
    this.drawArena();
    this.createRiftDecorations();
    this.createObstacles();
    this.createHeroAnimations();
    this.createPlayer();
    this.createEnemy();
    this.createHUD();

    this.input.keyboard!.removeAllKeys(true);

    this.keys = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      attack: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      dodge: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };
  }

private playSfx(key: string, volume = 0.5) {
  if (!this.cache.audio.exists(key)) return;

  this.sound.play(key, { volume });
}

  private projectPosition(x: number, y: number) {
    const originX = this.scale.width / 2;
    const originY = 80;

    return {
      x: originX + (x - y) * (this.tileWidth / 2),
      y: originY + (x + y) * (this.tileHeight / 2),
    };
  }
 
private playHeroAnimation(action: "idle" | "walk" | "attack") {
  const key = `${action}-${this.facingDirection}`;

  if (this.player.anims.currentAnim?.key !== key) {
    this.player.play(key);
  }
}

private gainXP(amount: number) {
  this.xp += amount;

   let leveledUp = false;

  while (this.xp >= this.xpToNextLevel) {
    this.xp -= this.xpToNextLevel;
    this.level += 1;
    this.xpToNextLevel += 2;
    this.pendingLevelUps += 1;
    this.playSfx("level-up", 0.65);
    leveledUp = true;
  }

   if (leveledUp) {
    this.createLevelUpEffect();
  }

  this.updateHUD();

  if (this.pendingLevelUps > 0 && !this.upgradePending) {
    this.showUpgradeSelection();
  }
}

private createHeroAnimations() {
  const animations = [
    { name: "idle-south", row: 0, frames: 4, rate: 5 },
    { name: "idle-north", row: 1, frames: 4, rate: 5 },
    { name: "idle-east", row: 2, frames: 4, rate: 5 },
    { name: "idle-west", row: 3, frames: 4, rate: 5 },

    { name: "walk-south", row: 4, frames: 6, rate: 9 },
    { name: "walk-north", row: 5, frames: 6, rate: 9 },
    { name: "walk-east", row: 6, frames: 6, rate: 9 },
    { name: "walk-west", row: 7, frames: 6, rate: 9 },

    { name: "attack-south", row: 8, frames: 6, rate: 12 },
    { name: "attack-north", row: 9, frames: 6, rate: 12 },
    { name: "attack-east", row: 10, frames: 6, rate: 12 },
    { name: "attack-west", row: 11, frames: 6, rate: 12 },
  ];

  for (const animation of animations) {
    const start = animation.row * 6;

    this.anims.create({
      key: animation.name,
      frames: this.anims.generateFrameNumbers("hero", {
        start,
        end: start + animation.frames - 1,
      }),
      frameRate: animation.rate,
      repeat: animation.name.startsWith("idle") ||
        animation.name.startsWith("walk")
        ? -1
        : 0,
    });
  }
}


private createRiftDecorations() {
  const rifts = [
    { x: 2, y: 3 },
    { x: 10, y: 3 },
    { x: 3, y: 9 },
    { x: 9, y: 10 },
  ];

  for (const rift of rifts) {
    const position = this.projectPosition(rift.x, rift.y);

    const glow = this.add.graphics();
    glow.fillStyle(0x7c3aed, 0.16);
    glow.fillEllipse(0, 0, 64, 28);
    glow.setPosition(position.x, position.y);
    glow.setDepth(position.y - 2);

    const ring = this.add.graphics();
    ring.lineStyle(3, 0xa855f7, 0.9);
    ring.strokeEllipse(0, 0, 36, 16);
    ring.lineStyle(1, 0xe9d5ff, 0.8);
    ring.strokeEllipse(0, 0, 22, 10);
    ring.setPosition(position.x, position.y - 2);
    ring.setDepth(position.y - 1);

    this.tweens.add({
      targets: ring,
      alpha: 0.35,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.tweens.add({
      targets: glow,
      alpha: 0.5,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }
}


private createEnemyDeathEffect(x: number, y: number, color: number) {
  // Explosão central
  const flash = this.add.circle(x, y - 15, 8, color, 0.9);
  flash.setDepth(10000);

  this.tweens.add({
    targets: flash,
    radius: 30,
    alpha: 0,
    duration: 250,
    ease: "Cubic.easeOut",
    onComplete: () => flash.destroy(),
  });

  // Partículas que se espalham
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    const distance = Phaser.Math.Between(15, 35);

    const particle = this.add.circle(
      x,
      y - 15,
      Phaser.Math.Between(2, 4),
      color,
    );

    particle.setDepth(10000);

    this.tweens.add({
      targets: particle,
      x: x + Math.cos(angle) * distance,
      y: y - 15 + Math.sin(angle) * distance,
      alpha: 0,
      scale: 0.2,
      duration: 300,
      ease: "Cubic.easeOut",
      onComplete: () => particle.destroy(),
    });
  }
}


private showUpgradeSelection() {
  this.upgradePending = true;
  this.upgradeObjects = [];

  const width = this.scale.width;
  const height = this.scale.height;

  const overlay = this.add
    .rectangle(width / 2, height / 2, width, height, 0x000000, 0.8)
    .setScrollFactor(0)
    .setDepth(20000);

  this.upgradeObjects.push(overlay);

  const title = this.add
    .text(width / 2, height / 2 - 125, "ESCOLHA UMA MELHORIA", {
      fontFamily: "monospace",
      fontSize: "22px",
      color: "#c4b5fd",
      fontStyle: "bold",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(20001);

  this.upgradeObjects.push(title);

  const options = [
    {
      title: "1. LAMINA APRIMORADA",
      description: "Aumenta o dano em +1",
    },
    {
      title: "2. PASSOS VELOZES",
      description: "Aumenta a velocidade em +0.5",
    },
    {
      title: "3. VITALIDADE",
      description: "+20 de vida maxima e recupera 20",
    },
  ];

  options.forEach((option, index) => {
    const y = height / 2 - 45 + index * 75;

    const card = this.add
      .rectangle(width / 2, y, 340, 60, 0x1e1b2e)
      .setStrokeStyle(2, 0x8b5cf6)
      .setScrollFactor(0)
      .setDepth(20001)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(width / 2, y, `${option.title}\n${option.description}`, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffffff",
        align: "center",
        lineSpacing: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20002);

    card.on("pointerover", () => {
      card.setFillStyle(0x4c1d95);
    });

    card.on("pointerout", () => {
      card.setFillStyle(0x1e1b2e);
    });

    card.on("pointerdown", () => {
      this.chooseUpgrade(index);
    });

    this.upgradeObjects.push(card, text);
  });
}

private chooseUpgrade(index: number) {
  if (!this.upgradePending) return;

  if (index === 0) {
    this.playerDamage += 1;
  } else if (index === 1) {
    this.speed += 0.5;
  } else if (index === 2) {
    this.playerMaxHealth += 20;
    this.playerHealth = Math.min(
      this.playerMaxHealth,
      this.playerHealth + 20
    );
    this.updateHUD();
  }

  this.upgradeObjects.forEach((object) => object.destroy());
  this.upgradeObjects = [];

  this.pendingLevelUps -= 1;
  this.upgradePending = false;

  this.updateHUD();

  if (this.pendingLevelUps > 0) {
    this.showUpgradeSelection();
  }
}


  private drawArena() {
    const graphics = this.add.graphics();

    for (let x = 0; x < 12; x++) {
      for (let y = 0; y < 12; y++) {
        const center = this.projectPosition(x + 0.5, y + 0.5);
        const halfW = this.tileWidth / 2;
        const halfH = this.tileHeight / 2;

        const points = [
          new Phaser.Math.Vector2(center.x, center.y - halfH),
          new Phaser.Math.Vector2(center.x + halfW, center.y),
          new Phaser.Math.Vector2(center.x, center.y + halfH),
          new Phaser.Math.Vector2(center.x - halfW, center.y),
        ];

        graphics.fillStyle(
          (x + y) % 2 === 0 ? 0x1e293b : 0x243047,
          1,
        );
        graphics.fillPoints(points, true);

        graphics.lineStyle(1, 0x334155, 0.8);
        graphics.strokePoints(points, true);
      }
    }
  }

  private createObstacles() {
    for (const obstacle of this.obstacles) {
      const position = this.projectPosition(
        obstacle.x,
        obstacle.y,
      );

      const rock = this.add.container(
        position.x,
        position.y,
      );

      // Sombra da pedra.
      const shadow = this.add.ellipse(
        0, 0, 38, 18, 0x020617, 0.55,
      );

      // Corpo da pedra.
      const body = this.add.rectangle(
        0, -12, 26, 24, 0x475569,
      );

      // Parte superior iluminada.
      const top = this.add.ellipse(
        0, -24, 26, 12, 0x94a3b8,
      );

      rock.add([shadow, body, top]);

      // Mantém a profundidade coerente com o mapa.
      rock.setDepth(position.y);
    }
  }

  private spawnEnemy() {
  if (this.gameOver) return;

  const spawnPoints = [
    { x: 8, y: 6 },
    { x: 9, y: 4 },
    { x: 8, y: 9 },
    { x: 3, y: 6 },
    { x: 6, y: 10 },
  ];

  // Procura um ponto livre e afastado do jogador.
  let selected = spawnPoints[this.spawnIndex % spawnPoints.length];

  for (let i = 0; i < spawnPoints.length; i++) {
    const index =
      (this.spawnIndex + i) % spawnPoints.length;

    const point = spawnPoints[index];

    const distance = Math.hypot(
      point.x - this.worldX,
      point.y - this.worldY,
    );

    if (
      !this.collidesAt(point.x, point.y) &&
      distance > 1.8
    ) {
      selected = point;
      this.spawnIndex = index + 1;
      break;
    }
  }

  const roll = Math.random();

if (this.wave >= 3 && roll < 0.25) {
  this.enemyType = "brute";
} else if (this.wave >= 2 && roll < 0.7) {
  this.enemyType = "runner";
} else {
  this.enemyType = "normal";
}

if (this.enemyType === "runner") {
  this.enemyMaxHealth = Math.max(
    2,
    2 + Math.floor((this.wave - 1) / 2)
  );
  this.enemySpeed = 1.5 + (this.wave - 1) * 0.05;
} else if (this.enemyType === "brute") {
  this.enemyMaxHealth = 5 + (this.wave - 1) * 2;
  this.enemySpeed = 0.55 + (this.wave - 1) * 0.03;
} else {
  this.enemyMaxHealth = 3 + (this.wave - 1) * 2;
  this.enemySpeed = 0.9 + (this.wave - 1) * 0.03;
}

  this.enemyX = selected.x;
  this.enemyY = selected.y;
  this.enemyHealth = this.enemyMaxHealth;
  this.enemyAlive = true;

  this.createEnemy();
}
  
  
  private createEnemy() {
    const position = this.projectPosition(
      this.enemyX,
      this.enemyY,
    );
    
    this.enemy = this.add.container(
      position.x,
    position.y,
  );

  const enemyColor =
  this.enemyType === "runner"
    ? 0xf97316
    : this.enemyType === "brute"
      ? 0xa855f7
      : 0xef4444;
  
  const shadow = this.add.ellipse(
    0, 8, 25, 12, 0x020617, 0.6,
  );
  
  const body = this.add.rectangle(
    0, -5, 22, 22, enemyColor,
  );
  
  const head = this.add.circle(
    0, -21, 8, 0xfca5a5,
  );
  
  // Olhos da criatura.
  const leftEye = this.add.circle(
    -3, -22, 1.5, 0x450a0a,
  );

  const rightEye = this.add.circle(
    3, -22, 1.5, 0x450a0a,
  );

  this.enemy.add([
    shadow,
    body,
    head,
    leftEye,
    rightEye,
  ]);

  // Barra de vida acima da criatura.
  this.enemyHealthBar = this.add.graphics();
  this.enemy.add(this.enemyHealthBar);

  this.updateEnemyHealthBar();
  this.enemy.setDepth(position.y);
 }

 private handleEnemyDefeated() {
  this.enemyAlive = false;

  const enemyColor =
    this.enemyType === "runner"
      ? 0xf97316
      : this.enemyType === "brute"
        ? 0xa855f7
        : 0xef4444;
        
  this.createEnemyDeathEffect(
  this.enemy.x,
  this.enemy.y,
  enemyColor,
  );
  this.createHitEffect(
  this.enemyX,
  this.enemyY,
  0xc4b5fd
  );
  this.enemy.destroy();

  this.gainXP(1);
  this.enemiesRemainingInWave -= 1;
  this.updateHUD();

  this.time.delayedCall(800, () => {
    if (this.gameOver) return;

    if (this.enemiesRemainingInWave > 0) {
      // Ainda existem inimigos nesta onda.
      this.spawnEnemy();
      return;
    }

    // Onda concluída: aumenta a dificuldade.
    this.wave += 1;

    this.enemiesRemainingInWave = 3 + (this.wave - 1);
    

    this.updateHUD();
    this.spawnEnemy();
  });
}

  private updateEnemyHealthBar() {
    this.enemyHealthBar.clear();
  
    const barWidth = 30;
    const barHeight = 4;
    const healthRatio =
      this.enemyHealth / this.enemyMaxHealth;
  
    this.enemyHealthBar.fillStyle(0x450a0a, 1);
    this.enemyHealthBar.fillRect(
      -barWidth / 2,
      -36,
      barWidth,
      barHeight,
    );
  
    this.enemyHealthBar.fillStyle(0xef4444, 1);
    this.enemyHealthBar.fillRect(
      -barWidth / 2,
      -36,
      barWidth * healthRatio,
      barHeight,
    );
  }

  private updateEnemy(delta: number) {
  if (!this.enemyAlive) return;

  const dx = this.worldX - this.enemyX;
  const dy = this.worldY - this.enemyY;

  const distance = Math.hypot(dx, dy);

  // Mantém uma pequena distância do jogador.
  if (distance > 0.7) {
    const movement =
      this.enemySpeed * (delta / 1000);

    const nextX = this.enemyX +
      (dx / distance) * movement;

    const nextY = this.enemyY +
      (dy / distance) * movement;

    // Evita que a criatura atravesse as pedras.
    if (!this.collidesAt(nextX, this.enemyY)) {
      this.enemyX = Phaser.Math.Clamp(
        nextX, 0.2, 11.8,
      );
    }

    if (!this.collidesAt(this.enemyX, nextY)) {
      this.enemyY = Phaser.Math.Clamp(
        nextY, 0.2, 11.8,
      );
    }
  }

  const position = this.projectPosition(
    this.enemyX,
    this.enemyY,
  );

  this.enemy.setPosition(position.x, position.y);
  this.enemy.setDepth(position.y);
 }

 private damageEnemy() {
  if (!this.enemyAlive) return;

  const dx = this.enemyX - this.worldX;
  const dy = this.enemyY - this.worldY;
  const distance = Math.hypot(dx, dy);

  if (distance === 0 || distance > 1.35) {
    return;
  }

  // Normaliza a direção para funcionar na diagonal.
  const facingLength = Math.hypot(
    this.facingX,
    this.facingY,
  );

  const facingX = this.facingX / facingLength;
  const facingY = this.facingY / facingLength;

  // Só acerta se o inimigo estiver à frente.
  const dot =
    (dx / distance) * facingX +
    (dy / distance) * facingY;

  if (dot < 0.5) return;

  this.enemyHealth -= this.playerDamage;
  this.playSfx("hit", 0.6);

     this.showDamageNumber(
        this.enemy.x,
        this.enemy.y,
        this.playerDamage,
      );

  this.createHitEffect(
    this.enemyX,
    this.enemyY,
    this.enemyType === "runner"
      ? 0xf97316
      : this.enemyType === "brute"
        ? 0xa855f7
        : 0xef4444
  );

  if (this.enemyAlive) {
    this.enemy.setAlpha(0.35);

    this.time.delayedCall(90, () => {
      if (this.enemyAlive && this.enemy.active) {
        this.enemy.setAlpha(1);
      }
    });
  }

  // Atualiza a barra de vida.
  this.updateEnemyHealthBar();

  // Efeito visual de dano.
  this.enemy.setAlpha(0.35);

  this.time.delayedCall(100, () => {
    if (this.enemyAlive && this.enemy.active) {
      this.enemy.setAlpha(1);
    }
  });

  if (this.enemyHealth <= 0) {
    this.handleEnemyDefeated();
  }
 }


  private createPlayer() {
    const position = this.projectPosition(
      this.worldX,
      this.worldY
    );

    this.player = this.add.sprite(
      position.x,
      position.y,
      "hero"
    );

    this.player.setOrigin(0.5, 1);
    this.player.setScale(1);
    this.player.setDepth(position.y);

    this.player.play("idle-south");
  }


  private updatePlayerPosition() {
    const position = this.projectPosition(this.worldX, this.worldY);

    this.player.setPosition(position.x, position.y);
    this.player.setDepth(position.y);
  }

  private collidesAt(x: number, y: number): boolean {
  const radius = this.playerRadius;

  return this.obstacles.some((obstacle) => {
    const overlapsX =
      x + radius > obstacle.x - obstacle.halfWidth &&
      x - radius < obstacle.x + obstacle.halfWidth;

    const overlapsY =
      y + radius > obstacle.y - obstacle.halfHeight &&
      y - radius < obstacle.y + obstacle.halfHeight;

    return overlapsX && overlapsY;
  });
  }

  
private createHitEffect(
  worldX: number,
  worldY: number,
  color: number
) {
  const position = this.projectPosition(worldX, worldY);

  const effect = this.add.graphics();
  effect.fillStyle(color, 0.9);
  effect.fillCircle(0, 0, 10);
  effect.setPosition(position.x, position.y - 12);
  effect.setDepth(position.y + 100);
  effect.setScale(0.5);
  effect.setAlpha(1);

  this.tweens.add({
    targets: effect,
    scale: 1.8,
    alpha: 0,
    duration: 180,
    ease: "Cubic.easeOut",
    onComplete: () => effect.destroy(),
  });

  // Partículas mágicas que se espalham ao redor do impacto.
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6;
    const distance = Phaser.Math.Between(12, 24);

    const particle = this.add.circle(
      position.x,
      position.y - 12,
      Phaser.Math.Between(2, 4),
      color,
      1
    );

    particle.setDepth(position.y + 101);

    this.tweens.add({
      targets: particle,
      x: position.x + Math.cos(angle) * distance,
      y: position.y - 12 + Math.sin(angle) * distance,
      alpha: 0,
      scale: 0.2,
      duration: Phaser.Math.Between(180, 300),
      ease: "Cubic.easeOut",
      onComplete: () => particle.destroy(),
    });
  }
}


  private performAttack() {

   if (this.isAttacking) return;

   // Impede ataques muito rápidos.
    if (this.time.now < this.nextAttackTime) {
      return;
    }

    this.isAttacking = true;
    this.playHeroAnimation("attack");
    this.playSfx("sword", 0.45);

    this.player.off("animationcomplete");
    this.player.once("animationcomplete", () => {
      this.isAttacking = false;
      this.playHeroAnimation("idle");
    });
   
  this.tweens.killTweensOf(this.player);

  this.player.setScale(1);

  this.tweens.add({
    targets: this.player,
    scaleX: 1.18,
    scaleY: 0.86,
    duration: 75,
    yoyo: true,
    ease: "Sine.easeInOut",
    onComplete: () => {
      this.player.setScale(1);
    },
  });

    

    this.nextAttackTime =
      this.time.now + this.attackCooldown;

    const position = this.projectPosition(
      this.worldX,
      this.worldY
    );

    // Converte a direção lógica para a direção visual
    // da arena isométrica.
    const screenX =
      (this.facingX - this.facingY) *
      (this.tileWidth / 2);

    const screenY =
      (this.facingX + this.facingY) *
      (this.tileHeight / 2);

    const angle = Math.atan2(screenY, screenX);

    // Coloca o golpe um pouco à frente do personagem.
    const attackX =
      position.x + Math.cos(angle) * 20;

    const attackY =
      position.y - 10 + Math.sin(angle) * 20;

    const slash = this.add.graphics();

    slash.lineStyle(5, 0xc4b5fd, 1);
    slash.beginPath();

    slash.arc(
      attackX,
      attackY,
      22,
      angle - 0.8,
      angle + 0.8,
      false
    );

    slash.strokePath();
    this.damageEnemy();
    slash.setDepth(position.y + 1);

    slash.setDepth(1000);

    // Remove o efeito após 120 milissegundos.
    this.time.delayedCall(120, () => {
      slash.destroy();
    });
  }

  private createHUD() {
    const width = this.scale.width;

    // Painel superior
    const panel = this.add.graphics();
    panel.fillStyle(0x0b0812, 0.9);
    panel.fillRoundedRect(16, 16, width - 32, 92, 12);
    panel.lineStyle(1, 0x6d28d9, 0.8);
    panel.strokeRoundedRect(16, 16, width - 32, 92, 12);
    panel.setScrollFactor(0);
    panel.setDepth(10000);

    this.hudText = this.add
      .text(30, 25, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#e9d5ff",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(10001);

    this.healthBar = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(10001);

    this.xpBar = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(10001);

    this.updateHUD();
  }

private showDamageNumber(
  x: number,
  y: number,
  damage: number,
  isCritical = false,
) {
  const text = this.add.text(
    x + Phaser.Math.Between(-8, 8),
    y - 28,
    `${damage}`,
    {
      fontFamily: "monospace",
      fontSize: isCritical ? "22px" : "16px",
      fontStyle: "bold",
      color: isCritical ? "#fbbf24" : "#ffffff",
      stroke: "#1f102e",
      strokeThickness: 4,
    },
  );

  text.setOrigin(0.5);
  text.setDepth(10000);

  this.tweens.add({
    targets: text,
    y: text.y - 35,
    alpha: 0,
    scale: isCritical ? 1.3 : 1,
    duration: 650,
    ease: "Cubic.easeOut",
    onComplete: () => text.destroy(),
  });
}

  private updateHUD() {
    this.hudText.setText(
      `ONDA ${this.wave}     NÍVEL ${this.level}     XP ${this.xp}/${this.xpToNextLevel}\n` +
      `INIMIGOS RESTANTES: ${this.enemiesRemainingInWave}`
    );

    const width = this.scale.width;
    const barWidth = Math.min(width - 60, 320);
    const barHeight = 12;
    const barX = 30;

    // Barra de vida
    this.healthBar.clear();

    this.healthBar.fillStyle(0x374151, 1);
    this.healthBar.fillRoundedRect(
      barX, 53, barWidth, barHeight, 5
    );

    const healthRatio = Phaser.Math.Clamp(
      this.playerHealth / this.playerMaxHealth, 0, 1
    );

    this.healthBar.fillStyle(
      healthRatio > 0.5 ? 0x22c55e :
      healthRatio > 0.25 ? 0xeab308 : 0xef4444,
      1
    );

    this.healthBar.fillRoundedRect(
      barX, 53, barWidth * healthRatio, barHeight, 5
    );

    // Barra de experiência
    this.xpBar.clear();

    this.xpBar.fillStyle(0x374151, 1);
    this.xpBar.fillRoundedRect(
      barX, 78, barWidth, 8, 4
    );

    const xpRatio = Phaser.Math.Clamp(
      this.xp / this.xpToNextLevel, 0, 1
    );

    this.xpBar.fillStyle(0xa855f7, 1);
    this.xpBar.fillRoundedRect(
      barX, 78, barWidth * xpRatio, 8, 4
    );
  }

  
private createLevelUpEffect() {
  const x = this.player.x;
  const y = this.player.y - 35;

  // Círculo de energia ao redor do jogador
  const ring = this.add.circle(x, y, 12, 0xa855f7, 0.15);
  ring.setStrokeStyle(3, 0xc4b5fd, 1);
  ring.setDepth(10000);

  this.tweens.add({
    targets: ring,
    radius: 65,
    alpha: 0,
    duration: 450,
    ease: "Cubic.easeOut",
    onComplete: () => ring.destroy(),
  });

  // Partículas de energia subindo
  for (let i = 0; i < 14; i++) {
    const particle = this.add.circle(
      x + Phaser.Math.Between(-22, 22),
      y + Phaser.Math.Between(-10, 10),
      Phaser.Math.Between(2, 4),
      i % 2 === 0 ? 0xc4b5fd : 0xa855f7,
    );

    particle.setDepth(10000);

    this.tweens.add({
      targets: particle,
      x: particle.x + Phaser.Math.Between(-45, 45),
      y: particle.y - Phaser.Math.Between(35, 75),
      alpha: 0,
      scale: 0.2,
      duration: Phaser.Math.Between(350, 600),
      ease: "Cubic.easeOut",
      onComplete: () => particle.destroy(),
    });
  }

  // Pequeno destaque visual da câmera
  this.cameras.main.flash(150, 100, 50, 180, false);
}


private takeDamage() {
  if (this.gameOver || !this.enemyAlive) {
    return;
  }

  // Ignora o dano enquanto o jogador estiver invulnerável.
  if (this.time.now < this.invulnerableUntil) {
    return;
  }

  const distance = Phaser.Math.Distance.Between(
    this.worldX,
    this.worldY,
    this.enemyX,
    this.enemyY,
  );

  // O inimigo precisa chegar perto do jogador.
  if (distance > 0.9) {
    return;
  }

  // Impede dano contínuo a cada frame.
  if (this.time.now < this.nextDamageTime) {
    return;
  }

  this.nextDamageTime =
    this.time.now + this.damageCooldown;

  this.playerHealth = Math.max(
    0,
    this.playerHealth - this.contactDamage,
  );


  // efeito de dano no jogador
  this.player
    .setTint(0xffffff)
    .setTintMode(Phaser.TintModes.FILL);

this.time.delayedCall(100, () => {
  if (this.player && this.player.active) {
    this.player.clearTint();
  }
});

  this.updateHUD();

  // Efeito visual ao receber dano.
  this.player.setAlpha(0.35);

  this.time.delayedCall(150, () => {
    if (this.player.active && !this.gameOver) {
      this.player.setAlpha(1);
    }
  });

  if (this.playerHealth <= 0) {
    // takeDamage() já retorna cedo quando gameOver é true,
    // então esta transição acontece uma única vez.
    this.gameOver = true;

    this.scene.start("EndScene", {
      result: "defeat",
    });
  }
}

  update(_time: number, delta: number) {

    if (this.gameOver) {
      return;
    }

    if (this.upgradePending) {
      return;
    }

    this.updateHUD();

    let dx = 0;
    let dy = 0;

    if (this.keys.up.isDown) dy -= 1;
    if (this.keys.down.isDown) dy += 1;
    if (this.keys.left.isDown) dx -= 1;
    if (this.keys.right.isDown) dx += 1;
   
    if (dx !== 0 || dy !== 0) {
      if (Math.abs(dx) > Math.abs(dy)) {
        this.facingDirection = dx > 0 ? "east" : "west";
      } else {
        this.facingDirection = dy > 0 ? "south" : "north";
      }

      this.facingX = dx;
      this.facingY = dy;
    }

    // Inicia a esquiva quando Espaço é pressionado.
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.dodge) &&
      this.time.now >= this.nextDodgeTime
    ) {
      this.playSfx("dodge", 0.4);
      // Usa a última direção em que o jogador olhou.
      this.dodgeDirX = this.facingX;
      this.dodgeDirY = this.facingY;

      // Normaliza a direção para não acelerar na diagonal.
      const length = Math.hypot(
        this.dodgeDirX,
        this.dodgeDirY,
      );

      // A esquiva cancela um ataque em andamento.
      this.isAttacking = false;
      this.player.off("animationcomplete");
      this.playHeroAnimation("walk");

      if (length > 0) {
        this.dodgeDirX /= length;
        this.dodgeDirY /= length;
      }

      this.dodgeUntil =
        this.time.now + this.dodgeDuration;
       
      this.tweens.killTweensOf(this.player);

      this.player.setScale(1);

      this.tweens.add({
        targets: this.player,
        scaleX: 0.78,
        scaleY: 1.2,
        duration: this.dodgeDuration / 2,
        yoyo: true,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.player.setScale(1);
        },
        
      });  

      this.invulnerableUntil =
        this.time.now + this.invulnerabilityDuration;

      this.nextDodgeTime =
        this.time.now + this.dodgeCooldown;
    }

    // Durante a esquiva, mantém a direção escolhida,
    // independentemente das teclas de movimento.
    if (this.time.now < this.dodgeUntil) {
      dx = this.dodgeDirX;
      dy = this.dodgeDirY;
    }
    
    // Atualiza a direção do personagem quando ele se move.
    if (dx !== 0 || dy !== 0) {
      this.facingX = dx;
      this.facingY = dy;
    }

    // Normaliza a diagonal para manter a mesma velocidade.
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    const currentSpeed =
      this.time.now < this.dodgeUntil
       ? this.dodgeSpeed
       : this.speed;

  const movement = currentSpeed * (delta / 1000);

    const nextX = Phaser.Math.Clamp(
    this.worldX + dx * movement,
    0.2,
    11.8,
    );

    const nextY = Phaser.Math.Clamp(
    this.worldY + dy * movement,
    0.2,
    11.8,
    );

    // Tenta movimentar no eixo X.
    if (!this.collidesAt(nextX, this.worldY)) {
    this.worldX = nextX;
    }

    // Tenta movimentar no eixo Y.
    if (!this.collidesAt(this.worldX, nextY)) {
    this.worldY = nextY;
    }

    this.updatePlayerPosition();

    if (!this.isAttacking) {
      const isMoving = dx !== 0 || dy !== 0;

      this.playHeroAnimation(isMoving ? "walk" : "idle");
    }

    this.updateEnemy(delta);
    this.takeDamage();

    if (this.gameOver) {
      return;
    }

    // Indica visualmente o período de invulnerabilidade.
    this.player.setAlpha(
      this.time.now < this.invulnerableUntil ? 0.45 : 1
    );

    // Executa um ataque somente no momento em que J é pressionado.
    if (Phaser.Input.Keyboard.JustDown(this.keys.attack)) {
      this.performAttack();
    }
  }
}