import Phaser from "phaser";
import { saveBestWave } from "../utils/records";
import { saveMatch } from "../utils/history";
import { savePermanentStats } from "../utils/permanentStats";
import { unlockAchievement } from "../utils/achievements";
import { getCharacterClass } from "../utils/characterClasses";
import { CLASS_ABILITIES } from "../utils/abilities";

type UpgradeOption = {
  title: string;
  description: string;
  apply: () => void;
};

type Projectile = {
  shape: Phaser.GameObjects.Shape;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  damage: number;
  expiresAt: number;
};
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

  private escKey!: Phaser.Input.Keyboard.Key;

  private abilityKey!: Phaser.Input.Keyboard.Key;

  private abilityCooldownUntil = 0;

  private abilityCooldown = 0;

  private abilityName = "";

  private shieldActiveUntil = 0;

  private shieldDuration = 3000;

  private shieldDamageReduction = 0.5;

  private shieldVisual?: Phaser.GameObjects.Arc;

  // abilidade do mago
  private mageExplosionDamageMultiplier = 2;
  private mageExplosionRadius = 2.5;
  
  private dashDuration = 250;
  private dashSpeed = 10;
  private dashUntil = 0;
  private dashDirX = 0;
  private dashDirY = 0;

  private matchStartTime = 0;

  private selectedClassId = "warrior";
  private heroTexture = "hero";

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

  private enemySprite!: Phaser.GameObjects.Sprite;
  private enemyFacing: "south" | "north" | "east" | "west" = "south";
  private enemyAttackUntil = 0;

    private getEnemyTexture(): string {
    if (this.enemyType === "runner") return "enemy-ghoul";
    if (this.enemyType === "brute") return "enemy-bloated";
    return "enemy-zombie";
  }

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
  private regenPerSecond = 0;
  private lifeStealPerHit = 0;
  private arrowLevel = 0;
  private fireballLevel = 0;
  private nextArrowTime = 0;
  private nextFireballTime = 0;
  private projectiles: Projectile[] = [];

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

  private dashHasHit = false;
  private dashDamageMultiplier = 2;

  // HUD
  private hudText!: Phaser.GameObjects.Text;
  private healthBar!: Phaser.GameObjects.Graphics;
  private xpBar!: Phaser.GameObjects.Graphics;
  private abilityHudText?: Phaser.GameObjects.Text;
  private abilityHudIcon?: Phaser.GameObjects.Text;
  private abilityCooldownBar?: Phaser.GameObjects.Graphics;
  private gameOver = false;

  private nextDamageTime = 0;
  private readonly contactDamage = 10;
  private readonly damageCooldown = 800;

  private totalEnemiesDefeated = 0;

  private backgroundMusic!: Phaser.Sound.BaseSound;

  constructor() {
    super("ArenaScene");
  }

  init() {
  // Progressão (primeiro, porque outros valores dependem dela)
  this.wave = 1;
  this.enemiesRemainingInWave = 3;
  this.spawnIndex = 0;
  this.totalEnemiesDefeated = 0;

  this.xp = 0;
  this.level = 1;
  this.xpToNextLevel = 3;
  this.playerDamage = 1;
  this.regenPerSecond = 0;
  this.lifeStealPerHit = 0;
  this.arrowLevel = 0;
  this.fireballLevel = 0;
  this.nextArrowTime = 0;
  this.nextFireballTime = 0;
  this.projectiles = [];
  this.enemyMaxHealth = 3;

  // Jogador
  this.worldX = 6;
  this.worldY = 6;
  this.facingX = 1;
  this.facingY = 0;
  this.speed = 3;
  this.playerMaxHealth = 100;
  this.playerHealth = this.playerMaxHealth;
  this.abilityCooldownUntil = 0;
  this.dashUntil = 0;
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
  this.enemyAttackUntil = 0;

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
  this.load.audio("shield-sfx", "assets/audio/shield.wav");
  this.load.audio("dash-sfx", "assets/audio/dash.wav");
  this.load.audio("arcane-explosion-sfx", "assets/audio/arcane-explosion.wav");

  this.load.spritesheet(
    "hero",
    "assets/characters/hero/Hero_Knight_full.png",
    {
      frameWidth: 80,
      frameHeight: 82,
    }
  );
    this.load.spritesheet(
    "hero-assassin",
    "assets/characters/assassin/Cutthroat_full.png",
    { frameWidth: 92, frameHeight: 94 }
  );

  this.load.spritesheet(
    "hero-mage",
    "assets/characters/mage/RenegadeMage_full.png",
    { frameWidth: 92, frameHeight: 94 }
  );
  this.load.audio(
    "background-music",
    "assets/audio/music.mp3",
  );
    this.load.spritesheet("enemy-zombie", "assets/enemies/Zombie_full.png", {
    frameWidth: 82,
    frameHeight: 86,
  });

  this.load.spritesheet("enemy-ghoul", "assets/enemies/Ghoul_full.png", {
    frameWidth: 82,
    frameHeight: 86,
  });

  this.load.spritesheet("enemy-bloated", "assets/enemies/BloatedZombie_full.png", {
    frameWidth: 82,
    frameHeight: 86,
  });
    this.load.atlasXML(
    "terrain",
    "assets/terrain/landscapeTiles_sheet.png",
    "assets/terrain/landscapeTiles_sheet.xml"
  );
 }


  create() {
    this.textures.get("terrain").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.selectedClassId =
    this.registry.get("selectedClassId") ?? "warrior";

    const selectedClass = getCharacterClass(this.selectedClassId);

    const ability = CLASS_ABILITIES[this.selectedClassId];

    this.abilityName = ability.name;
    this.abilityCooldown = ability.cooldown;
    this.abilityHudText = this.add
      .text(this.scale.width - 16, this.scale.height - 30, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#e9d5ff",
        backgroundColor: "#0b0812",
        padding: { x: 12, y: 10 },
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(10001);
    
    const abilityIcons: Record<string, string> = {
      warrior: "🛡",
      assassin: "➤",
      mage: "✦",
    };

    this.abilityHudIcon = this.add
      .text(0, 0, abilityIcons[this.selectedClassId] ?? "?", {
        fontFamily: "monospace",
        fontSize: "34px",
        color: "#e9d5ff",
        backgroundColor: "#0b0812",
        padding: { x: 10, y: 8 },
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(10001);

    this.abilityCooldownBar = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(10001);

    this.playerDamage = selectedClass.damage;
    this.speed = selectedClass.speed;
    this.playerMaxHealth = selectedClass.maxHealth;
    this.playerHealth = selectedClass.maxHealth;
    this.heroTexture = selectedClass.spriteKey;
    this.drawArena();
    this.createRiftDecorations();
    this.createObstacles();
    this.createHeroAnimations();
    this.createEnemyAnimations();
    this.createPlayer();
    this.createEnemy();
    this.createHUD();
    this.matchStartTime = Date.now();
    this.totalEnemiesDefeated = 0;

    const musicVolume = this.registry.get("musicVolume") ?? 0.25;

    this.backgroundMusic = this.sound.add("background-music", {
      loop: true,
      volume: musicVolume,
    });

    this.backgroundMusic.play();

    this.registry.set("backgroundMusicSound", this.backgroundMusic);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.backgroundMusic.stop();
      this.backgroundMusic.destroy();
      this.registry.remove("backgroundMusicSound");
    });

    this.input.keyboard!.removeAllKeys(true);

    this.keys = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      attack: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      dodge: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };

    this.abilityKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.K
    );

    this.escKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.ESC,
    );

    this.escKey.on("down", () => {
      if (this.scene.isActive("ArenaScene")) {
        this.scene.pause("ArenaScene");
        this.scene.launch("PauseScene");
      }
    });
  }

    private activateAssassinDash(): void {
    this.createAbilityParticles(
      this.player.x,
      this.player.y - 40,
      0x9933ff,
      12
    );
    this.dashHasHit = false;
    this.dashDirX = Math.sign(this.facingX);
    this.dashDirY = Math.sign(this.facingY);

    this.dashUntil = this.time.now + this.dashDuration;
    this.invulnerableUntil = this.time.now + this.dashDuration;

    const trail = this.add.circle(
      this.player.x,
      this.player.y - 40,
      22,
      0x9933ff,
      0.45
    );

    trail.setDepth(this.player.depth - 1);

    this.tweens.add({
      targets: trail,
      alpha: 0,
      scale: 2,
      duration: this.dashDuration,
      onComplete: () => trail.destroy(),
    });
    this.time.delayedCall(this.dashDuration, () => {
      this.createAbilityParticles(
        this.player.x,
        this.player.y - 40,
        0x9933ff,
        16
      );
    });
  }

    private checkDashDamage(): void {
    if (this.time.now >= this.dashUntil) return;
    if (this.dashHasHit || !this.enemyAlive) return;

    const distance = Math.hypot(
      this.enemyX - this.worldX,
      this.enemyY - this.worldY,
    );

    if (distance <= 1) {
      this.dashHasHit = true;
      this.hitEnemy(this.playerDamage * this.dashDamageMultiplier);
    }
  }


  private updateAbilityHUD(): void {
    if (
      !this.abilityHudText ||
      !this.abilityHudIcon ||
      !this.abilityCooldownBar
    ) {
      return;
    }

    const remainingTime = Math.max(
      0,
      this.abilityCooldownUntil - this.time.now
    );

    const remainingSeconds = Math.ceil(remainingTime / 1000);

    const cooldownText = remainingTime > 0
      ? `RECARGA: ${remainingSeconds}s`
      : "PRONTA";

    this.abilityHudText.setText(
      `${this.abilityName} [K]\n${cooldownText}`
    );

    this.abilityHudText.setColor(
      remainingTime > 0 ? "#9ca3af" : "#66ff99"
    );

    // Posições calculadas a partir do painel de texto.
    const textRight = this.abilityHudText.x;
    const textLeft = textRight - this.abilityHudText.width;
    const textBottom = this.abilityHudText.y;

    this.abilityHudIcon.setPosition(textLeft - 8, textBottom);
    this.abilityHudIcon.setColor(
      remainingTime > 0 ? "#6b7280" : "#e9d5ff"
    );

    // Progresso da recarga (1 = pronta).
    const progress = Phaser.Math.Clamp(
      1 - remainingTime / this.abilityCooldown,
      0,
      1
    );

    const barX = textLeft;
    const barY = textBottom + 4;
    const barWidth = this.abilityHudText.width;
    const barHeight = 6;

    this.abilityCooldownBar.clear();

    this.abilityCooldownBar.fillStyle(0x374151, 1);
    this.abilityCooldownBar.fillRoundedRect(
      barX, barY, barWidth, barHeight, 3
    );

    this.abilityCooldownBar.fillStyle(
      remainingTime > 0 ? 0x3b82f6 : 0x66ff99,
      1
    );
    this.abilityCooldownBar.fillRoundedRect(
      barX, barY, barWidth * progress, barHeight, 3
    );
  }


private playSfx(key: string, volume = 0.5) {
  if (!this.cache.audio.exists(key)) {
    return;
  }

  const globalVolume = this.registry.get("sfxVolume") ?? 0.5;

  this.sound.play(key, {
    volume: volume * globalVolume,
  });
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
  const key = `${this.heroTexture}-${action}-${this.facingDirection}`;

  if (this.player.anims.currentAnim?.key !== key) {
    this.player.play(key);
  }
}


private showAchievementNotification(id: string): void {
  const achievements: Record<
    string,
    { title: string; description: string }
  > = {
    "first-match": {
      title: "PRIMEIRA BATALHA",
      description: "Você entrou em combate pela primeira vez!",
    },
    "wave-5": {
      title: "SOBREVIVENTE",
      description: "Você alcançou a onda 5!",
    },
    "wave-10": {
      title: "GUERREIRO IMPLACÁVEL",
      description: "Você alcançou a onda 10!",
    },
    "kills-100": {
      title: "CAÇADOR DE MONSTROS",
      description: "Você derrotou 100 inimigos!",
    },
    "survival-10": {
      title: "RESISTÊNCIA",
      description: "Você sobreviveu por 10 minutos!",
    },
  };

  const achievement = achievements[id];

  if (!achievement) return;

  const width = 340;
  const height = 90;

  const notification = this.add.container(
    this.scale.width + width,
    35
  );

  notification.setScrollFactor(0);
  notification.setDepth(10000);

  const background = this.add.rectangle(
    0,
    0,
    width,
    height,
    0x161616,
    0.96
  );

  background.setStrokeStyle(2, 0xfacc15);

  const icon = this.add.text(
    -width / 2 + 35,
    0,
    "★",
    {
      fontSize: "36px",
      color: "#facc15",
    }
  ).setOrigin(0.5);

  const title = this.add.text(
    -width / 2 + 65,
    -17,
    "CONQUISTA DESBLOQUEADA!",
    {
      fontSize: "13px",
      color: "#facc15",
      fontStyle: "bold",
    }
  );

  const name = this.add.text(
    -width / 2 + 65,
    5,
    achievement.title,
    {
      fontSize: "17px",
      color: "#ffffff",
      fontStyle: "bold",
    }
  );

  const description = this.add.text(
    -width / 2 + 65,
    28,
    achievement.description,
    {
      fontSize: "11px",
      color: "#aaaaaa",
    }
  );

  notification.add([
    background,
    icon,
    title,
    name,
    description,
  ]);

  this.tweens.add({
    targets: notification,
    x: this.scale.width - width / 2 - 20,
    duration: 500,
    ease: "Back.Out",
    onComplete: () => {
      this.time.delayedCall(3000, () => {
        this.tweens.add({
          targets: notification,
          x: this.scale.width + width,
          alpha: 0,
          duration: 400,
          ease: "Power2",
          onComplete: () => notification.destroy(),
        });
      });
    },
  });
}


private checkAchievements(): void {
  if (this.wave >= 5) {
    this.unlockAndNotify("wave-5");
  }

  if (this.wave >= 10) {
    this.unlockAndNotify("wave-10");
  }

  if (this.totalEnemiesDefeated >= 100) {
    this.unlockAndNotify("kills-100");
  }

  const survivalTime = Math.floor(
    (Date.now() - this.matchStartTime) / 1000
  );

  if (survivalTime >= 600) {
    this.unlockAndNotify("survival-10");
  }
}

private unlockAndNotify(id: string): void {
  const unlocked = unlockAchievement(id);

  if (unlocked) {
    this.showAchievementNotification(id);
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

  const sheets = [
    { key: "hero", columns: 6 },
    { key: "hero-assassin", columns: 8 },
    { key: "hero-mage", columns: 8 },
  ];

  for (const sheet of sheets) {
    for (const animation of animations) {
      const start = animation.row * sheet.columns;

      this.anims.create({
        key: `${sheet.key}-${animation.name}`,
        frames: this.anims.generateFrameNumbers(sheet.key, {
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


private getUpgradePool(): UpgradeOption[] {
  const arrowName =
    this.arrowLevel === 0 ? "ARCO ARCANO" : `ARCO ARCANO (NV ${this.arrowLevel + 1})`;
  const fireName =
    this.fireballLevel === 0 ? "BOLA DE FOGO" : `BOLA DE FOGO (NV ${this.fireballLevel + 1})`;

  return [
    {
      title: "LAMINA APRIMORADA",
      description: "Aumenta o dano em +1",
      apply: () => {
        this.playerDamage += 1;
      },
    },
    {
      title: "PASSOS VELOZES",
      description: "Aumenta a velocidade em +0.5",
      apply: () => {
        this.speed += 0.5;
      },
    },
    {
      title: "VITALIDADE",
      description: "+20 de vida maxima e recupera 20",
      apply: () => {
        this.playerMaxHealth += 20;
        this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 20);
      },
    },
    {
      title: "REGENERACAO",
      description: `Regenera +1 de vida por segundo (atual: ${this.regenPerSecond})`,
      apply: () => {
        this.regenPerSecond += 1;
      },
    },
    {
      title: "SEDE DE SANGUE",
      description: `Cura +2 de vida a cada golpe (atual: ${this.lifeStealPerHit})`,
      apply: () => {
        this.lifeStealPerHit += 2;
      },
    },
    {
      title: arrowName,
      description:
        this.arrowLevel === 0
          ? "Dispara flechas automaticas no inimigo"
          : "Flechas mais fortes e mais rapidas",
      apply: () => {
        this.arrowLevel += 1;
      },
    },
    {
      title: fireName,
      description:
        this.fireballLevel === 0
          ? "Dispara bolas de fogo de dano alto"
          : "Bolas de fogo mais fortes e frequentes",
      apply: () => {
        this.fireballLevel += 1;
      },
    },
  ];
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

  // Sorteia 3 opções diferentes entre todas as disponíveis.
  const options = Phaser.Utils.Array.Shuffle(this.getUpgradePool()).slice(0, 3);

  options.forEach((option, index) => {
    const y = height / 2 - 45 + index * 75;

    const card = this.add
      .rectangle(width / 2, y, 340, 60, 0x1e1b2e)
      .setStrokeStyle(2, 0x8b5cf6)
      .setScrollFactor(0)
      .setDepth(20001)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(width / 2, y, `${index + 1}. ${option.title}\n${option.description}`, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffffff",
        align: "center",
        lineSpacing: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20002);

    card.on("pointerover", () => card.setFillStyle(0x4c1d95));
    card.on("pointerout", () => card.setFillStyle(0x1e1b2e));
    card.on("pointerdown", () => this.chooseUpgrade(option));

    this.upgradeObjects.push(card, text);
  });
}

private chooseUpgrade(option: UpgradeOption) {
  if (!this.upgradePending) return;

  option.apply();

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
    const frames = [
      "landscapeTiles_067.png", "landscapeTiles_067.png",
      "landscapeTiles_067.png", "landscapeTiles_067.png",
      "landscapeTiles_067.png", "landscapeTiles_067.png",
      "landscapeTiles_067.png", "landscapeTiles_083.png",
      "landscapeTiles_059.png", "landscapeTiles_067.png",
    ];

    for (let x = 0; x < 12; x++) {
      for (let y = 0; y < 12; y++) {
        const center = this.projectPosition(x + 0.5, y + 0.5);

        const frame = frames[(x * 7 + y * 13) % frames.length];

        const tile = this.add.image(center.x, center.y, "terrain", frame);

        tile.setOrigin(0.5, 33 / 99);
        tile.setScale(64 / 132);
        tile.setDepth(-1000 + x + y);
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

    this.enemy = this.add.container(position.x, position.y);

    const textureKey = this.getEnemyTexture();

    const shadow = this.add.ellipse(0, 2, 25, 12, 0x020617, 0.6);

    this.enemySprite = this.add.sprite(0, 0, textureKey);
    this.enemySprite.setOrigin(0.5, 77 / 86);
    this.enemyFacing = "south";
    this.enemySprite.play(`${textureKey}-idle-south`);

    this.enemy.add([shadow, this.enemySprite]);

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
  this.totalEnemiesDefeated++;
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
      -75,
      barWidth,
      barHeight,
    );
  
    this.enemyHealthBar.fillStyle(0xef4444, 1);
    this.enemyHealthBar.fillRect(
      -barWidth / 2,
      -75,
      barWidth * healthRatio,
      barHeight,
    );
  }

    private createEnemyAnimations() {
    const columns = 8;
    const directions = ["south", "north", "east", "west"];

    const textures = ["enemy-zombie", "enemy-ghoul", "enemy-bloated"];

    for (const texture of textures) {
      directions.forEach((direction, index) => {
        const idleStart = index * columns;
        const walkStart = (index + 4) * columns;
        const attackStart = (index + 8) * columns;

        this.anims.create({
          key: `${texture}-attack-${direction}`,
          frames: this.anims.generateFrameNumbers(texture, {
            start: attackStart,
            end: attackStart + 5,
          }),
          frameRate: 12,
          repeat: 0,
        });

        this.anims.create({
          key: `${texture}-idle-${direction}`,
          frames: this.anims.generateFrameNumbers(texture, {
            start: idleStart,
            end: idleStart + 3,
          }),
          frameRate: 5,
          repeat: -1,
        });

        this.anims.create({
          key: `${texture}-walk-${direction}`,
          frames: this.anims.generateFrameNumbers(texture, {
            start: walkStart,
            end: walkStart + 5,
          }),
          frameRate: 9,
          repeat: -1,
        });
      });
    }
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

    const isMoving = distance > 0.7;

    if (Math.abs(dx) > Math.abs(dy)) {
      this.enemyFacing = dx > 0 ? "east" : "west";
    } else {
      this.enemyFacing = dy > 0 ? "south" : "north";
    }

    const enemyKey =
      `${this.getEnemyTexture()}-${isMoving ? "walk" : "idle"}-${this.enemyFacing}`;

       if (
      this.time.now >= this.enemyAttackUntil &&
      this.enemySprite.anims.currentAnim?.key !== enemyKey
    ) {
      this.enemySprite.play(enemyKey);
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
  const facingLength = Math.hypot(this.facingX, this.facingY);
  const facingX = this.facingX / facingLength;
  const facingY = this.facingY / facingLength;

  // Só acerta se o inimigo estiver à frente.
  const dot = (dx / distance) * facingX + (dy / distance) * facingY;

  if (dot < 0.5) return;

  this.hitEnemy(this.playerDamage);
  this.healPlayer(this.lifeStealPerHit);
}

// Aplica dano ao inimigo (golpe, flecha ou bola de fogo).
private hitEnemy(amount: number) {
  if (!this.enemyAlive) return;

  this.enemyHealth -= amount;
  this.playSfx("hit", 0.6);

  this.showDamageNumber(this.enemy.x, this.enemy.y, amount);

  this.createHitEffect(
    this.enemyX,
    this.enemyY,
    this.enemyType === "runner"
      ? 0xf97316
      : this.enemyType === "brute"
        ? 0xa855f7
        : 0xef4444,
  );

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

private healPlayer(amount: number) {
  if (amount <= 0 || this.gameOver) return;

  this.playerHealth = Math.min(
    this.playerMaxHealth,
    this.playerHealth + amount,
  );

  this.updateHUD();
}


  private createPlayer() {
    const position = this.projectPosition(
      this.worldX,
      this.worldY
    );

    this.player = this.add.sprite(
      position.x,
      position.y,
      this.heroTexture
    );

    this.player.setOrigin(0.5, this.heroTexture === "hero" ? 1 : 79 / 94);
    this.player.setScale(1);
    this.player.setDepth(position.y);

    this.player.play(`${this.heroTexture}-idle-south`);
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

    private activateMageExplosion(): void {
    const explosion = this.add.ellipse(
      this.player.x,
      this.player.y,
      this.mageExplosionRadius * this.tileWidth * Math.SQRT2,
      this.mageExplosionRadius * this.tileHeight * Math.SQRT2,
      0x9933ff,
      0.25
    );

    explosion.setStrokeStyle(4, 0xcc99ff, 1);
    explosion.setDepth(this.player.depth - 1);

        this.createAbilityParticles(
      this.player.x,
      this.player.y - 10,
      0x9933ff,
      25
    );

    this.createAbilityParticles(
      this.player.x,
      this.player.y - 10,
      0x66ccff,
      15
    );

    this.tweens.add({
      targets: explosion,
      scale: 1.5,
      alpha: 0,
      duration: 450,
      ease: "Cubic.easeOut",
      onComplete: () => explosion.destroy(),
    });

    if (!this.enemyAlive) return;

    const distance = Math.hypot(
      this.enemyX - this.worldX,
      this.enemyY - this.worldY,
    );

    if (distance <= this.mageExplosionRadius) {
      this.hitEnemy(this.playerDamage * this.mageExplosionDamageMultiplier);
    }
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
  
  this.playEnemyAttack();
  
    const shieldIsActive = this.time.now < this.shieldActiveUntil;

    const finalDamage = shieldIsActive
      ? Math.ceil(this.contactDamage * (1 - this.shieldDamageReduction))
      : this.contactDamage;

  this.playerHealth = Math.max(
    0,
    this.playerHealth - finalDamage,
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

    const bestWave = saveBestWave(this.wave);

    const survivalTime = Math.floor(
      (Date.now() - this.matchStartTime) / 1000
    );

    saveMatch({
      wave: this.wave,
      level: this.level,
      survivalTime,
      enemiesDefeated: this.totalEnemiesDefeated,
      date: new Date().toISOString(),
    });

    savePermanentStats({
      wave: this.wave,
      level: this.level,
      survivalTime,
      enemiesDefeated: this.totalEnemiesDefeated,
    });

    this.unlockAndNotify("first-match");

    this.scene.start("EndScene", {
      result: "defeat",
      wave: this.wave,
      bestWave,
    });
  }
}

private updateRegeneration(delta: number) {
  if (this.regenPerSecond <= 0) return;
  if (this.playerHealth >= this.playerMaxHealth) return;

  this.playerHealth = Math.min(
    this.playerMaxHealth,
    this.playerHealth + this.regenPerSecond * (delta / 1000),
  );
}

private updateAutoWeapons() {
  if (!this.enemyAlive) return;

  const now = this.time.now;

  if (this.arrowLevel > 0 && now >= this.nextArrowTime) {
    this.nextArrowTime =
      now + Math.max(500, 1400 - (this.arrowLevel - 1) * 150);

    const damage =
      Math.max(1, Math.ceil(this.playerDamage / 2)) + (this.arrowLevel - 1);

    this.fireProjectile("arrow", damage);
  }

  if (this.fireballLevel > 0 && now >= this.nextFireballTime) {
    this.nextFireballTime =
      now + Math.max(1500, 3500 - (this.fireballLevel - 1) * 400);

    const damage =
      this.playerDamage * 2 + (this.fireballLevel - 1) * 2;

    this.fireProjectile("fireball", damage);
  }
}

private fireProjectile(kind: "arrow" | "fireball", damage: number) {
  const dx = this.enemyX - this.worldX;
  const dy = this.enemyY - this.worldY;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) return;

  const dirX = dx / distance;
  const dirY = dy / distance;
  const isFireball = kind === "fireball";

  const shape: Phaser.GameObjects.Shape = isFireball
    ? this.add.circle(0, 0, 8, 0xf97316).setStrokeStyle(3, 0xef4444)
    : this.add.rectangle(0, 0, 16, 3, 0xfde68a);

  // Gira a flecha para apontar na direção visual (isométrica).
  shape.setRotation(
    Math.atan2(
      (dirX + dirY) * (this.tileHeight / 2),
      (dirX - dirY) * (this.tileWidth / 2),
    ),
  );

  const projectile: Projectile = {
    shape,
    x: this.worldX,
    y: this.worldY,
    dirX,
    dirY,
    speed: isFireball ? 5 : 9,
    damage,
    expiresAt: this.time.now + 2000,
  };

  this.projectiles.push(projectile);
  this.positionProjectile(projectile);
}

private positionProjectile(projectile: Projectile) {
  const position = this.projectPosition(projectile.x, projectile.y);

  projectile.shape.setPosition(position.x, position.y - 14);
  projectile.shape.setDepth(position.y + 50);
}

  private playEnemyAttack() {
    if (!this.enemySprite || !this.enemySprite.active) return;

    this.enemyAttackUntil = this.time.now + 500;

    this.enemySprite.play(
      `${this.getEnemyTexture()}-attack-${this.enemyFacing}`
    );
  }

private updateProjectiles(delta: number) {
  const step = delta / 1000;

  for (let i = this.projectiles.length - 1; i >= 0; i--) {
    const projectile = this.projectiles[i];

    projectile.x += projectile.dirX * projectile.speed * step;
    projectile.y += projectile.dirY * projectile.speed * step;
    this.positionProjectile(projectile);

    let remove =
      this.time.now > projectile.expiresAt ||
      projectile.x < 0 ||
      projectile.x > 12 ||
      projectile.y < 0 ||
      projectile.y > 12;

    if (
      !remove &&
      this.enemyAlive &&
      Math.hypot(this.enemyX - projectile.x, this.enemyY - projectile.y) < 0.5
    ) {
      this.hitEnemy(projectile.damage);
      remove = true;
    }

    if (remove) {
      projectile.shape.destroy();
      this.projectiles.splice(i, 1);
    }
  }
}


  private createShieldVisual(): void {
    if (this.shieldVisual) {
      this.tweens.killTweensOf(this.shieldVisual);
      this.shieldVisual.destroy();
    }

    this.shieldVisual = this.add.circle(
      this.player.x,
      this.player.y - 40,
      38,
      0x3399ff,
      0.15
    );

    this.shieldVisual.setStrokeStyle(3, 0x66ccff, 0.9);

    this.shieldVisual.setDepth(this.player.depth + 1);

    this.tweens.add({
      targets: this.shieldVisual,
      alpha: 0.35,
      scale: 1.15,
      duration: 350,
      yoyo: true,
      repeat: -1,
    });
        this.createAbilityParticles(
      this.player.x,
      this.player.y - 40,
      0x3399ff,
      18
    );
  }


private createAbilityParticles(
  x: number,
  y: number,
  color: number,
  amount: number
): void {
  for (let i = 0; i < amount; i++) {
    const particle = this.add.circle(
      x,
      y,
      Phaser.Math.Between(2, 4),
      color,
      0.9
    );

    particle.setDepth(this.player.depth + 1);

    const angle = Phaser.Math.FloatBetween(
      0,
      Math.PI * 2
    );

    const distance = Phaser.Math.Between(25, 75);

    const targetX = x + Math.cos(angle) * distance;
    const targetY = y + Math.sin(angle) * distance;

    this.tweens.add({
      targets: particle,
      x: targetX,
      y: targetY,
      alpha: 0,
      scale: 0.2,
      duration: Phaser.Math.Between(350, 650),
      ease: "Cubic.easeOut",
      onComplete: () => particle.destroy(),
    });
  }
}


    private activateClassAbility(): void {
      const currentTime = this.time.now;

      if (currentTime < this.abilityCooldownUntil) {
        return;
      }

      if (this.selectedClassId === "warrior") {
        this.abilityCooldownUntil = currentTime + this.abilityCooldown;

        this.shieldActiveUntil = currentTime + this.shieldDuration;

        this.createShieldVisual();
        this.playSfx("shield-sfx", 0.7);

        console.log(`${this.abilityName} ativada!`);
      }

      if (this.selectedClassId === "assassin") {
        this.abilityCooldownUntil = currentTime + this.abilityCooldown;

        this.activateAssassinDash();
        this.playSfx("dash-sfx", 0.7);

        console.log(`${this.abilityName} ativada!`);
      }

      if (this.selectedClassId === "mage") {
        this.abilityCooldownUntil = currentTime + this.abilityCooldown;

        this.activateMageExplosion();
        this.playSfx("arcane-explosion-sfx", 0.8);

        console.log(`${this.abilityName} ativada!`);
      }
    }


  update(_time: number, delta: number) {

    if (this.gameOver) {
      return;
    }

    this.checkDashDamage();

    if (this.upgradePending) {
      return;
    }

    this.updateRegeneration(delta);
    this.updateHUD();
    this.updateAbilityHUD();
    this.checkAchievements();

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


    if (Phaser.Input.Keyboard.JustDown(this.abilityKey)) {
      this.activateClassAbility();
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
    
    if (this.time.now < this.dashUntil) {
      dx = this.dashDirX;
      dy = this.dashDirY;
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
      this.time.now < this.dashUntil
        ? this.dashSpeed
        : this.time.now < this.dodgeUntil
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

    if (this.shieldVisual) {
      this.shieldVisual.setPosition(
        this.player.x,
        this.player.y - 40
      );

      this.shieldVisual.setDepth(this.player.depth + 1);

      if (this.time.now >= this.shieldActiveUntil) {
        this.tweens.killTweensOf(this.shieldVisual);
        this.shieldVisual.destroy();
        this.shieldVisual = undefined;
      }
    }

    if (!this.isAttacking) {
      const isMoving = dx !== 0 || dy !== 0;

      this.playHeroAnimation(isMoving ? "walk" : "idle");
    }

    this.updateEnemy(delta);
    this.takeDamage();

    if (this.gameOver) {
      return;
    }

    this.updateAutoWeapons();
    this.updateProjectiles(delta);

    // Indica visualmente o período de invulnerabilidade.
    this.player.setAlpha(
      this.time.now < this.invulnerableUntil ? 0.45 : 1
    );

    // Executa um ataque somente no momento em que J é pressionado.
        if (
      Phaser.Input.Keyboard.JustDown(this.keys.attack) &&
      this.time.now >= this.dashUntil
    ) {
      this.performAttack();
    }
  }
}