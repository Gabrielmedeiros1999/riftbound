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
type EnemyType = "normal" | "runner" | "brute" | "spitter" | "bomber";

type Enemy = {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  speed: number;
  alive: boolean;
  facing: "south" | "north" | "east" | "west";
  attackUntil: number;
  nextDamageTime: number;
  // Cuspidor: quando pode atirar de novo.
  nextShotTime: number;
  // Bomba: instante em que explode (0 = pavio apagado).
  fuseUntil: number;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  healthBar: Phaser.GameObjects.Graphics;
};

// Projétil disparado por um inimigo (cuspidor).
type EnemyProjectile = {
  shape: Phaser.GameObjects.Arc;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  damage: number;
  expiresAt: number;
};

type XpGem = {
  x: number;
  y: number;
  value: number;
  age: number;
  attracted: boolean;
  speed: number;
  bobOffset: number;
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  diamond: Phaser.GameObjects.Rectangle;
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
  // Tamanho da arena em tiles (arena quadrada: arenaSize x arenaSize).
  // Era 12. Altere este valor para aumentar ou diminuir o mapa.
  private readonly arenaSize = 20;

  private worldX = this.arenaSize / 2;
  private worldY = this.arenaSize / 2;
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

  // Inimigos atualmente vivos na arena.
  private enemies: Enemy[] = [];
  private nextEnemyId = 0;

  // Inimigos da onda que ainda não foram criados.
  private enemiesToSpawn = 8;
  // Inimigos já agendados para aparecer (evita passar do limite).
  private pendingSpawns = 0;
  // Limite máximo de inimigos simultâneos, em qualquer onda.
  private readonly maxConcurrentEnemiesCap = 14;

  // Projéteis inimigos (cuspidor).
  private enemyProjectiles: EnemyProjectile[] = [];
  private readonly spitterProjectileSpeed = 4.5; // tiles/s (dá para desviar)
  private readonly spitterProjectileDamage = 8;

  // Bomba: pavio, raio e dano da explosão.
  private readonly bomberFuseTime = 600; // ms entre chegar perto e explodir
  private readonly bomberBlastRadius = 1.6; // tiles
  private readonly bomberBlastDamage = 12; // dano no jogador
  private readonly bomberBlastEnemyDamage = 4; // dano nos outros inimigos (reação em cadeia)

  // Gemas de XP no chão (dropadas pelos inimigos ao morrer).
  private xpGems: XpGem[] = [];
  // Distância (em tiles) em que a gema começa a ser puxada até o jogador.
  private gemMagnetRadius = 1.6;
  // Alcance máximo que a melhoria "Ímã" pode atingir.
  private readonly gemMagnetRadiusMax = 5.5;
  // Distância em que a gema é coletada.
  private readonly gemCollectRadius = 0.35;
  // Tempo (ms) após cair até a gema poder ser puxada.
  private readonly gemPickupDelay = 250;
  // Depois desse tempo (ms) a gema voa até o jogador sozinha, para não se perder.
  private readonly gemAutoAttractTime = 7000;
  // Aceleração e velocidade máxima (tiles/s) da gema ao ser puxada.
  private readonly gemAcceleration = 22;
  private readonly gemMaxSpeed = 14;

  // Hit-stop: pausa curtíssima ao acertar/matar, para dar peso aos golpes.
  private hitStopUntil = 0;
  private nextHitStopTime = 0;
  private readonly hitStopCooldown = 120;

  // Inimigos já atingidos pelo dash atual (cada um leva só um golpe).
  private dashHitEnemies = new Set<number>();

  private getEnemyTexture(type: EnemyType): string {
    if (type === "runner") return "enemy-ghoul";
    if (type === "brute" || type === "bomber") return "enemy-bloated";
    return "enemy-zombie";
  }

  // melhorias  pendentes
  private pendingLevelUps = 0;
  private upgradePending = false;
  private upgradeObjects: Phaser.GameObjects.GameObject[] = [];

  // Ondas e progressão
  private wave = 1;
  private enemiesRemainingInWave = 8;
  

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
    // Perto do centro
    { x: 9.5, y: 8.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 12.5, y: 6.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 10.5, y: 13.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 6.5, y: 10.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 13.5, y: 11.5, halfWidth: 0.35, halfHeight: 0.35 },
    // Região noroeste
    { x: 3.5, y: 3.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 6.5, y: 2.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 8.5, y: 4.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 4.5, y: 7.5, halfWidth: 0.35, halfHeight: 0.35 },
    // Região nordeste
    { x: 14.5, y: 3.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 17.5, y: 5.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 16.5, y: 9.5, halfWidth: 0.35, halfHeight: 0.35 },
    // Região sudoeste
    { x: 2.5, y: 12.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 5.5, y: 15.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 8.5, y: 17.5, halfWidth: 0.35, halfHeight: 0.35 },
    // Região sudeste
    { x: 14.5, y: 15.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 17.5, y: 13.5, halfWidth: 0.35, halfHeight: 0.35 },
    { x: 12.5, y: 17.5, halfWidth: 0.35, halfHeight: 0.35 },
  ];

  

  private playerHealth = 100;
  private playerMaxHealth = 100;

  
  private dashDamageMultiplier = 2;

  // HUD
  private hudText!: Phaser.GameObjects.Text;
  private healthBar!: Phaser.GameObjects.Graphics;
  private xpBar!: Phaser.GameObjects.Graphics;
  private abilityHudText?: Phaser.GameObjects.Text;
  private abilityHudIcon?: Phaser.GameObjects.Text;
  private abilityCooldownBar?: Phaser.GameObjects.Graphics;
  private gameOver = false;

  
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
  this.enemiesRemainingInWave = this.getWaveEnemyCount(1);
  this.enemiesToSpawn = this.getWaveEnemyCount(1);
  this.pendingSpawns = 0;
  this.xpGems = [];
  this.enemyProjectiles = [];
  this.gemMagnetRadius = 1.6;
  this.hitStopUntil = 0;
  this.nextHitStopTime = 0;
  
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
  

  // Jogador
  this.worldX = this.arenaSize / 2;
  this.worldY = this.arenaSize / 2;
  this.facingX = 1;
  this.facingY = 0;
  this.speed = 3;
  this.playerMaxHealth = 100;
  this.playerHealth = this.playerMaxHealth;
  this.abilityCooldownUntil = 0;
  this.dashUntil = 0;
  this.facingDirection = "south";
  this.isAttacking = false;

  // Inimigos
  this.enemies = [];
  this.nextEnemyId = 0;
  this.dashHitEnemies = new Set<number>();

  // Estado da partida
  this.gameOver = false;
  this.nextAttackTime = 0;
  

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
      frameWidth: 68,
      frameHeight: 68,
    }
  );
    this.load.spritesheet(
    "hero-assassin",
    "assets/characters/assassin/Cutthroat_full.png",
    { frameWidth: 64, frameHeight: 64 }
  );

  this.load.spritesheet(
    "hero-mage",
    "assets/characters/mage/RenegadeMage_full.png",
    { frameWidth: 68, frameHeight: 68 }
  );
  this.load.audio(
    "background-music",
    "assets/audio/music.mp3",
  );
    this.load.spritesheet("enemy-zombie", "assets/enemies/Zombie_full.png", {
    frameWidth: 64,
    frameHeight: 64,
  });

  this.load.spritesheet("enemy-ghoul", "assets/enemies/Ghoul_full.png", {
    frameWidth: 68,
    frameHeight: 68,
  });

  this.load.spritesheet("enemy-bloated", "assets/enemies/BloatedZombie_full.png", {
    frameWidth: 60,
    frameHeight: 60,
  });
  this.load.image("terrain-grass", "assets/terrain/grass_tile.png");
  this.load.image("terrain-dirt", "assets/terrain/dirt_tile.png");
  this.load.image("terrain-sand", "assets/terrain/sand_tile.png");
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
    this.createPixelLabEnemyAnimations("enemy-zombie");
    this.createPixelLabEnemyAnimations("enemy-ghoul");
    this.createPixelLabEnemyAnimations("enemy-bloated");
    this.createPlayer();
    this.setupCamera();
    this.fillEnemies();
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
    this.dashHitEnemies.clear();
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


     private createPixelLabAnimations(
    textureKey: string,
    walkFirstRow: number,
    attackFirstRow: number
  ) {
    const columns = 16;

    const directions = [
      { name: "south", index: 0 },
      { name: "east", index: 2 },
      { name: "north", index: 4 },
      { name: "west", index: 6 },
    ];

    for (const direction of directions) {
      // Idle: um quadro por direção (linha 0).
      this.anims.create({
        key: `${textureKey}-idle-${direction.name}`,
        frames: [{ key: textureKey, frame: direction.index }],
        frameRate: 1,
        repeat: -1,
      });

      // Walk: 8 quadros.
      const walkStart = (walkFirstRow + direction.index) * columns;

      this.anims.create({
        key: `${textureKey}-walk-${direction.name}`,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: walkStart,
          end: walkStart + 7,
        }),
        frameRate: 10,
        repeat: -1,
      });

      // Ataque: 16 quadros.
      const attackStart = (attackFirstRow + direction.index) * columns;

      this.anims.create({
        key: `${textureKey}-attack-${direction.name}`,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: attackStart,
          end: attackStart + 15,
        }),
        frameRate: 32,
        repeat: 0,
      });
    }
  }

  private checkDashDamage(): void {
    if (this.time.now >= this.dashUntil) return;

    for (const enemy of [...this.enemies]) {
      if (!enemy.alive || this.dashHitEnemies.has(enemy.id)) continue;

      const distance = Math.hypot(
        enemy.x - this.worldX,
        enemy.y - this.worldY,
      );

      if (distance <= 1) {
        this.dashHitEnemies.add(enemy.id);
        this.hitEnemy(enemy, this.playerDamage * this.dashDamageMultiplier);
      }
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


    this.createPixelLabAnimations("hero", 9, 1);
    this.createPixelLabAnimations("hero-assassin", 1, 9);
    this.createPixelLabAnimations("hero-mage", 9, 1);

}


private createRiftDecorations() {
  const rifts = [
    { x: 2, y: 3 },
    { x: 16, y: 2 },
    { x: 11, y: 4 },
    { x: 3, y: 10 },
    { x: 17, y: 11 },
    { x: 9, y: 15 },
    { x: 3, y: 17 },
    { x: 16, y: 17 },
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
    ...(this.gemMagnetRadius < this.gemMagnetRadiusMax
      ? [
          {
            title: "IMA DE GEMAS",
            description: `Aumenta o alcance de coleta em +0.8 (atual: ${this.gemMagnetRadius.toFixed(1)})`,
            apply: () => {
              this.gemMagnetRadius = Math.min(
                this.gemMagnetRadius + 0.8,
                this.gemMagnetRadiusMax,
              );
              this.showMagnetPulse();
            },
          },
        ]
      : []),
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
    const textures = [
      "terrain-grass", "terrain-grass", "terrain-grass",
      "terrain-grass", "terrain-grass", "terrain-grass",
      "terrain-grass", "terrain-dirt", "terrain-sand",
      "terrain-grass",
    ];

    for (let x = 0; x < this.arenaSize; x++) {
      for (let y = 0; y < this.arenaSize; y++) {
        const center = this.projectPosition(x + 0.5, y + 0.5);

        // Sorteio fixo por tile (sempre o mesmo a cada partida).
        let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
        hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
        const key = textures[(hash >>> 0) % textures.length];

        const tile = this.add.image(center.x, center.y, key);

        tile.setOrigin(0.5, 27.5 / 64);
        tile.setScale(64 / 54, 32 / 35);
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

  // Vida e velocidade. A vida cresce DEVAGAR com as ondas: a dificuldade vem
  // principalmente da quantidade e da variedade de inimigos, não de "esponjas".
  private getEnemyStats(type: EnemyType): { maxHealth: number; speed: number } {
    const w = this.wave - 1;

    switch (type) {
      case "runner":
        return {
          maxHealth: 2 + Math.floor(w / 3),
          speed: Math.min(1.5 + w * 0.05, 2.4),
        };
      case "brute":
        return {
          maxHealth: 6 + w,
          speed: Math.min(0.55 + w * 0.03, 1.0),
        };
      case "spitter":
        return {
          maxHealth: 2 + Math.floor(w / 3),
          speed: Math.min(0.8 + w * 0.02, 1.1),
        };
      case "bomber":
        return {
          maxHealth: 2 + Math.floor(w / 3),
          speed: Math.min(1.25 + w * 0.04, 1.9),
        };
      default:
        return {
          maxHealth: 3 + Math.floor(w / 2),
          speed: Math.min(0.9 + w * 0.03, 1.6),
        };
    }
  }

  private getEnemyColor(type: EnemyType): number {
    if (type === "runner") return 0xf97316;
    if (type === "brute") return 0xa855f7;
    if (type === "spitter") return 0x38bdf8;
    if (type === "bomber") return 0xfb923c;
    return 0xef4444;
  }

  // Cor aplicada ao sprite (0xffffff = cores originais).
  // Cuspidor e bomba reaproveitam sprites existentes, distinguidos pela cor.
  private getEnemyTint(type: EnemyType): number {
    if (type === "spitter") return 0x7dd3fc;
    if (type === "bomber") return 0xfb923c;
    return 0xffffff;
  }

  // Dano por contato de cada tipo (a base é contactDamage).
  // Como agora há muito mais inimigos ao mesmo tempo, cada um bate mais fraco.
  private getContactDamage(type: EnemyType): number {
    switch (type) {
      case "brute":
        return this.contactDamage;
      case "runner":
      case "spitter":
        return Math.round(this.contactDamage * 0.4);
      case "bomber":
        return 0; // o perigo da bomba é a explosão
      default:
        return Math.round(this.contactDamage * 0.5);
    }
  }

  // Quantos inimigos tem cada onda: 8, 12, 16, 20...
  private getWaveEnemyCount(wave: number): number {
    return 8 + 4 * (wave - 1);
  }

  // Sorteia o tipo do próximo inimigo. Tipos novos entram conforme as ondas
  // avançam e o "normal" vai perdendo espaço, aumentando a variedade.
  private pickEnemyType(): EnemyType {
    const w = this.wave;

    const weights: [EnemyType, number][] = [["normal", 10]];

    if (w >= 2) weights.push(["runner", Math.min(2 + w, 6)]);
    if (w >= 3) weights.push(["spitter", Math.min(1 + w, 5)]);
    if (w >= 3) weights.push(["brute", Math.min(w - 1, 4)]);
    if (w >= 4) weights.push(["bomber", Math.min(w, 5)]);

    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = Math.random() * total;

    for (const [type, weight] of weights) {
      roll -= weight;
      if (roll < 0) return type;
    }

    return "normal";
  }

  // Quantos inimigos podem estar vivos ao mesmo tempo:
  // 4 na onda 1, +1 por onda, até o limite.
  private getMaxConcurrentEnemies(): number {
    return Math.min(3 + this.wave, this.maxConcurrentEnemiesCap);
  }

  // Agenda o surgimento de inimigos até preencher o limite simultâneo.
  private fillEnemies() {
    if (this.gameOver) return;

    const freeSlots =
      this.getMaxConcurrentEnemies() -
      this.enemies.length -
      this.pendingSpawns;

    const count = Math.min(freeSlots, this.enemiesToSpawn);

    for (let i = 0; i < count; i++) {
      this.enemiesToSpawn--;
      this.pendingSpawns++;

      // Pequeno intervalo entre cada um para não nascerem juntos.
      this.time.delayedCall(i * 450, () => {
        this.pendingSpawns--;
        this.spawnEnemy();
      });
    }
  }

  private spawnEnemy() {
    if (this.gameOver) return;

    const margin = 0.8;
    const max = this.arenaSize - margin;

    let spawnX = 0;
    let spawnY = 0;
    let found = false;

    // Sorteia um ponto livre a uma distância média do jogador:
    // nem em cima dele, nem tão longe a ponto de demorar para chegar.
    for (let attempt = 0; attempt < 40 && !found; attempt++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.FloatBetween(3.5, 7);

      const x = this.worldX + Math.cos(angle) * distance;
      const y = this.worldY + Math.sin(angle) * distance;

      if (x < margin || y < margin || x > max || y > max) continue;
      if (this.collidesAt(x, y)) continue;

      const crowded = this.enemies.some(
        (enemy) => Math.hypot(enemy.x - x, enemy.y - y) < 1.2,
      );

      if (crowded) continue;

      spawnX = x;
      spawnY = y;
      found = true;
    }

    // Plano B: o canto da arena mais distante do jogador.
    if (!found) {
      const corners = [
        { x: margin, y: margin },
        { x: max, y: margin },
        { x: margin, y: max },
        { x: max, y: max },
      ];

      const farthest = corners.reduce((best, corner) =>
        Math.hypot(corner.x - this.worldX, corner.y - this.worldY) >
        Math.hypot(best.x - this.worldX, best.y - this.worldY)
          ? corner
          : best,
      );

      spawnX = farthest.x;
      spawnY = farthest.y;
    }

    this.enemies.push(
      this.createEnemy(this.pickEnemyType(), spawnX, spawnY),
    );
  }


  private createEnemy(type: EnemyType, x: number, y: number): Enemy {
    const position = this.projectPosition(x, y);
    const stats = this.getEnemyStats(type);
    const textureKey = this.getEnemyTexture(type);

    const container = this.add.container(position.x, position.y);

    const shadow = this.add.ellipse(0, 2, 25, 12, 0x020617, 0.6);

    const sprite = this.add.sprite(0, 0, textureKey);

    const enemyOrigins: Record<string, number> = {
      "enemy-zombie": 53 / 64,
      "enemy-ghoul": 56 / 68,
      "enemy-bloated": 50 / 60,
    };

    sprite.setOrigin(0.5, enemyOrigins[textureKey]);
    sprite.setScale(
      type === "brute"
        ? 1.3
        : type === "bomber"
          ? 1.05
          : type === "spitter"
            ? 0.95
            : 1,
    );

    const tint = this.getEnemyTint(type);

    if (tint !== 0xffffff) {
      sprite.setTint(tint);
    }
    sprite.play(`${textureKey}-idle-south`);

    // Barra de vida acima da criatura.
    const healthBar = this.add.graphics();

    container.add([shadow, sprite, healthBar]);
    container.setDepth(position.y);

    const enemy: Enemy = {
      id: this.nextEnemyId++,
      type,
      x,
      y,
      health: stats.maxHealth,
      maxHealth: stats.maxHealth,
      speed: stats.speed,
      alive: true,
      facing: "south",
      attackUntil: 0,
      nextDamageTime: 0,
      nextShotTime: this.time.now + 1500 + Math.random() * 1500,
      fuseUntil: 0,
      container,
      sprite,
      healthBar,
    };

    this.updateEnemyHealthBar(enemy);

    return enemy;
  }

  private handleEnemyDefeated(enemy: Enemy) {
    enemy.alive = false;
    this.enemies = this.enemies.filter((other) => other !== enemy);

    // Bomba: explode ao morrer (por qualquer causa), ferindo quem estiver perto.
    if (enemy.type === "bomber") {
      this.explodeBomber(enemy);
    }

    this.createEnemyDeathEffect(
      enemy.container.x,
      enemy.container.y,
      this.getEnemyColor(enemy.type),
    );
    this.createHitEffect(
      enemy.x,
      enemy.y,
      0xc4b5fd
    );
    enemy.container.destroy();

    this.dropXpGem(enemy);
    this.totalEnemiesDefeated++;
    this.enemiesRemainingInWave -= 1;

    // Última criatura da onda: todas as gemas voam até o jogador.
    if (this.enemiesRemainingInWave <= 0) {
      this.attractAllGems();
    }

    this.playKillFeedback(enemy.type);
    this.updateHUD();

    this.time.delayedCall(800, () => {
      if (this.gameOver) return;

      if (this.enemiesRemainingInWave > 0) {
        // Ainda existem inimigos nesta onda: repõe os que faltam.
        this.fillEnemies();
        return;
      }

      // Onda concluída: aumenta a dificuldade.
      this.wave += 1;

      this.enemiesRemainingInWave = this.getWaveEnemyCount(this.wave);
      this.enemiesToSpawn = this.enemiesRemainingInWave;

      this.updateHUD();
      this.fillEnemies();
    });
  }

  // ---------------------------------------------------------------------
  // Impacto: hit-stop e tremor de tela
  // ---------------------------------------------------------------------

  // Congela a simulação por alguns milissegundos. Tem um intervalo mínimo
  // entre usos para não causar travadinhas quando vários inimigos morrem juntos.
  private hitStop(duration: number) {
    const now = this.time.now;

    if (now < this.hitStopUntil || now < this.nextHitStopTime) return;

    this.hitStopUntil = now + duration;
    this.nextHitStopTime = now + duration + this.hitStopCooldown;
  }

  private playKillFeedback(type: EnemyType) {
    const isBrute = type === "brute";

    this.hitStop(isBrute ? 80 : 50);

    // Tremor leve; se já houver um em andamento, o Phaser ignora este.
    this.cameras.main.shake(isBrute ? 140 : 80, isBrute ? 0.005 : 0.0025);
  }

  // ---------------------------------------------------------------------
  // Gemas de XP
  // ---------------------------------------------------------------------

  private dropXpGem(enemy: Enemy) {
    const value = enemy.type === "brute" ? 2 : 1;
    const color = value > 1 ? 0xc084fc : 0x67e8f9;
    const size = value > 1 ? 11 : 8;

    const x = Phaser.Math.Clamp(
      enemy.x + Phaser.Math.FloatBetween(-0.25, 0.25),
      0.3,
      this.arenaSize - 0.3,
    );
    const y = Phaser.Math.Clamp(
      enemy.y + Phaser.Math.FloatBetween(-0.25, 0.25),
      0.3,
      this.arenaSize - 0.3,
    );

    const position = this.projectPosition(x, y);

    const container = this.add.container(position.x, position.y);

    const shadow = this.add.ellipse(0, 2, size * 1.4, size * 0.7, 0x020617, 0.5);
    const glow = this.add.circle(0, -7, size * 1.1, color, 0.25);
    const diamond = this.add.rectangle(0, -7, size, size, color);

    diamond.setAngle(45);
    diamond.setStrokeStyle(1, 0xffffff, 0.85);

    container.add([shadow, glow, diamond]);
    container.setDepth(position.y);
    container.setScale(0);

    this.xpGems.push({
      x,
      y,
      value,
      age: 0,
      attracted: false,
      speed: 3,
      bobOffset: Math.random() * Math.PI * 2,
      container,
      glow,
      diamond,
    });
  }

  // Faz todas as gemas do chão voarem até o jogador (fim da onda).
  private attractAllGems() {
    for (const gem of this.xpGems) {
      gem.attracted = true;
    }
  }

  private collectXpGem(gem: XpGem) {
    this.xpGems = this.xpGems.filter((other) => other !== gem);
    gem.container.destroy();

    this.gainXP(gem.value);
  }

  // Anel que se expande a partir do jogador mostrando o novo alcance do ímã.
  private showMagnetPulse() {
    const position = this.projectPosition(this.worldX, this.worldY);

    // Um círculo de raio r (em tiles) vira, na projeção isométrica,
    // uma elipse de r*tileWidth*√2 por r*tileHeight*√2.
    const width = this.gemMagnetRadius * this.tileWidth * Math.SQRT2;
    const height = this.gemMagnetRadius * this.tileHeight * Math.SQRT2;

    const ring = this.add.ellipse(position.x, position.y, width, height);

    ring.setStrokeStyle(2, 0x67e8f9, 0.9);
    ring.setDepth(10000);
    ring.setScale(0.2);

    this.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 650,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  private updateXpGems(delta: number) {
    if (this.xpGems.length === 0) return;

    const dt = delta / 1000;

    for (const gem of [...this.xpGems]) {
      gem.age += delta;

      const dx = this.worldX - gem.x;
      const dy = this.worldY - gem.y;
      const distance = Math.hypot(dx, dy);

      const canPickUp = gem.age >= this.gemPickupDelay;

      if (
        canPickUp &&
        !gem.attracted &&
        (distance <= this.gemMagnetRadius ||
          gem.age >= this.gemAutoAttractTime)
      ) {
        gem.attracted = true;
      }

      if (canPickUp && gem.attracted) {
        gem.speed = Math.min(
          gem.speed + this.gemAcceleration * dt,
          this.gemMaxSpeed,
        );

        const step = gem.speed * dt;

        if (distance <= this.gemCollectRadius || step >= distance) {
          this.collectXpGem(gem);
          continue;
        }

        gem.x += (dx / distance) * step;
        gem.y += (dy / distance) * step;
      }

      // Visual: "pulinho" ao cair e leve flutuação.
      const pop = Math.min(1, gem.age / 250);
      gem.container.setScale(Phaser.Math.Easing.Back.Out(pop));

      const bobY = -7 + Math.sin(gem.age / 220 + gem.bobOffset) * 2;
      gem.diamond.y = bobY;
      gem.glow.y = bobY;

      const position = this.projectPosition(gem.x, gem.y);

      gem.container.setPosition(position.x, position.y);
      gem.container.setDepth(position.y);
    }
  }

  private updateEnemyHealthBar(enemy: Enemy) {
    enemy.healthBar.clear();

    const barY =
      enemy.type === "runner"
        ? -56
        : enemy.type === "brute"
          ? -60
          : enemy.type === "bomber"
            ? -50
            : -52;
    const barWidth = 30;
    const barHeight = 4;
    const healthRatio =
      Math.max(0, enemy.health) / enemy.maxHealth;

    enemy.healthBar.fillStyle(0x450a0a, 1);
    enemy.healthBar.fillRect(
      -barWidth / 2,
      barY,
      barWidth,
      barHeight,
    );

    enemy.healthBar.fillStyle(0xef4444, 1);
    enemy.healthBar.fillRect(
      -barWidth / 2,
      barY,
      barWidth * healthRatio,
      barHeight,
    );
  }

    private createPixelLabEnemyAnimations(textureKey: string) {
    const columns = 8;

    const directions = [
      { name: "south", index: 0 },
      { name: "east", index: 2 },
      { name: "north", index: 4 },
      { name: "west", index: 6 },
    ];

    for (const direction of directions) {
      // Idle: um quadro por direção (linha 0).
      this.anims.create({
        key: `${textureKey}-idle-${direction.name}`,
        frames: [{ key: textureKey, frame: direction.index }],
        frameRate: 1,
        repeat: -1,
      });

      // Walk: linhas 1 a 8, 8 quadros.
      const walkStart = (1 + direction.index) * columns;

      this.anims.create({
        key: `${textureKey}-walk-${direction.name}`,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: walkStart,
          end: walkStart + 7,
        }),
        frameRate: 12,
        repeat: -1,
      });

      // Ataque: linhas 9 a 16, 8 quadros (0,5 s).
      const attackStart = (9 + direction.index) * columns;

      this.anims.create({
        key: `${textureKey}-attack-${direction.name}`,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: attackStart,
          end: attackStart + 7,
        }),
        frameRate: 16,
        repeat: 0,
      });
    }
  }



  private updateEnemies(delta: number) {
    for (const enemy of this.enemies) {
      this.updateEnemy(enemy, delta);
    }
  }

  private updateEnemy(enemy: Enemy, delta: number) {
    if (!enemy.alive) return;

    const dx = this.worldX - enemy.x;
    const dy = this.worldY - enemy.y;

    const distance = Math.hypot(dx, dy);

    // Separação: empurra o inimigo para longe dos vizinhos,
    // para que não fiquem todos empilhados no mesmo ponto.
    const separationRadius = 0.6;
    let pushX = 0;
    let pushY = 0;

    for (const other of this.enemies) {
      if (other === enemy || !other.alive) continue;

      const ox = enemy.x - other.x;
      const oy = enemy.y - other.y;
      const otherDistance = Math.hypot(ox, oy);

      if (otherDistance > 0 && otherDistance < separationRadius) {
        const strength =
          (separationRadius - otherDistance) / separationRadius;

        pushX += (ox / otherDistance) * strength;
        pushY += (oy / otherDistance) * strength;
      }
    }

    // +1 = aproxima do jogador, -1 = se afasta, 0 = fica parado.
    const chase = this.getChaseDirection(enemy, distance);
    const isMoving = chase !== 0;

    let moveX = pushX * 1.2;
    let moveY = pushY * 1.2;

    if (isMoving && distance > 0) {
      moveX += (dx / distance) * chase;
      moveY += (dy / distance) * chase;
    }

    const moveLength = Math.hypot(moveX, moveY);

    if (moveLength > 0.0001) {
      const strength = isMoving ? 1 : Math.min(1, moveLength);
      const movement = enemy.speed * (delta / 1000) * strength;

      const nextX = enemy.x + (moveX / moveLength) * movement;
      const nextY = enemy.y + (moveY / moveLength) * movement;

      // Evita que a criatura atravesse as pedras.
      if (!this.collidesAt(nextX, enemy.y)) {
        enemy.x = Phaser.Math.Clamp(nextX, 0.2, this.arenaSize - 0.2);
      }

      if (!this.collidesAt(enemy.x, nextY)) {
        enemy.y = Phaser.Math.Clamp(nextY, 0.2, this.arenaSize - 0.2);
      }
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      enemy.facing = dx > 0 ? "east" : "west";
    } else {
      enemy.facing = dy > 0 ? "south" : "north";
    }

    const enemyKey =
      `${this.getEnemyTexture(enemy.type)}-${isMoving ? "walk" : "idle"}-${enemy.facing}`;

    if (
      this.time.now >= enemy.attackUntil &&
      enemy.sprite.anims.currentAnim?.key !== enemyKey
    ) {
      enemy.sprite.play(enemyKey);
    }

    const position = this.projectPosition(
      enemy.x,
      enemy.y,
    );

    enemy.container.setPosition(position.x, position.y);
    enemy.container.setDepth(position.y);

    if (enemy.type === "spitter") {
      this.updateSpitter(enemy, distance);
    } else if (enemy.type === "bomber") {
      this.updateBomber(enemy, distance);
    }
  }

  private getChaseDirection(enemy: Enemy, distance: number): number {
    if (enemy.type === "spitter") {
      // Atira de longe: aproxima se estiver longe, recua se o jogador chegar perto.
      if (distance > 6) return 1;
      if (distance < 4) return -1;
      return 0;
    }

    // Bomba com o pavio aceso fica parada esperando explodir.
    if (enemy.type === "bomber" && enemy.fuseUntil > 0) return 0;

    return distance > 0.7 ? 1 : 0;
  }

  // ---------------------------------------------------------------------
  // Cuspidor: atira projéteis lentos (dá para desviar ou usar o dash)
  // ---------------------------------------------------------------------

  private updateSpitter(enemy: Enemy, distance: number) {
    if (!enemy.alive || distance > 9) return;
    if (this.time.now < enemy.nextShotTime) return;

    enemy.nextShotTime = this.time.now + 2200 + Math.random() * 600;

    this.playEnemyAttack(enemy);
    this.fireEnemyProjectile(enemy);
  }

  private fireEnemyProjectile(enemy: Enemy) {
    const dx = this.worldX - enemy.x;
    const dy = this.worldY - enemy.y;
    const distance = Math.hypot(dx, dy);

    if (distance === 0) return;

    // Mira onde o jogador está agora (não prevê movimento), então andar desvia.
    const shape = this.add.circle(0, 0, 5, 0x84cc16);
    shape.setStrokeStyle(1, 0xecfccb, 0.9);

    const projectile: EnemyProjectile = {
      shape,
      x: enemy.x,
      y: enemy.y,
      dirX: dx / distance,
      dirY: dy / distance,
      speed: this.spitterProjectileSpeed,
      damage: this.spitterProjectileDamage,
      expiresAt: this.time.now + 3000,
    };

    this.positionEnemyProjectile(projectile);
    this.enemyProjectiles.push(projectile);
  }

  private positionEnemyProjectile(projectile: EnemyProjectile) {
    const position = this.projectPosition(projectile.x, projectile.y);

    projectile.shape.setPosition(position.x, position.y - 22);
    projectile.shape.setDepth(position.y + 1);
  }

  private updateEnemyProjectiles(delta: number) {
    const step = delta / 1000;

    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const projectile = this.enemyProjectiles[i];

      projectile.x += projectile.dirX * projectile.speed * step;
      projectile.y += projectile.dirY * projectile.speed * step;
      this.positionEnemyProjectile(projectile);

      let remove =
        this.time.now > projectile.expiresAt ||
        projectile.x < 0 ||
        projectile.x > this.arenaSize ||
        projectile.y < 0 ||
        projectile.y > this.arenaSize ||
        this.collidesAt(projectile.x, projectile.y); // bate nas pedras

      // Durante o dash o projétil atravessa o jogador.
      if (
        !remove &&
        this.time.now >= this.invulnerableUntil &&
        Math.hypot(this.worldX - projectile.x, this.worldY - projectile.y) < 0.45
      ) {
        this.hurtPlayer(projectile.damage);
        remove = true;
      }

      if (remove) {
        projectile.shape.destroy();
        this.enemyProjectiles.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Bomba: corre até o jogador, acende o pavio e explode (ou explode ao morrer)
  // ---------------------------------------------------------------------

  private updateBomber(enemy: Enemy, distance: number) {
    if (!enemy.alive) return;

    const now = this.time.now;

    if (enemy.fuseUntil === 0) {
      if (distance <= 1.1) {
        enemy.fuseUntil = now + this.bomberFuseTime;
        this.playEnemyAttack(enemy);
        this.showBomberWarning(enemy);
      }

      return;
    }

    // Pisca em vermelho enquanto o pavio queima.
    const lit = Math.floor((enemy.fuseUntil - now) / 90) % 2 === 0;
    enemy.sprite.setTint(lit ? 0xff2d2d : this.getEnemyTint(enemy.type));

    if (now >= enemy.fuseUntil) {
      enemy.health = 0;
      this.handleEnemyDefeated(enemy);
    }
  }

  // Círculo no chão mostrando o alcance da explosão (para o jogador poder fugir).
  private showBomberWarning(enemy: Enemy) {
    const width = this.bomberBlastRadius * this.tileWidth * Math.SQRT2;
    const height = this.bomberBlastRadius * this.tileHeight * Math.SQRT2;

    const warning = this.add.ellipse(0, 2, width, height, 0xff5a1f, 0.12);
    warning.setStrokeStyle(1, 0xff5a1f, 0.8);

    // Fica dentro do container: some junto com o inimigo.
    enemy.container.addAt(warning, 0);
  }

  private explodeBomber(enemy: Enemy) {
    const radius = this.bomberBlastRadius;
    const position = this.projectPosition(enemy.x, enemy.y);

    const width = radius * this.tileWidth * Math.SQRT2;
    const height = radius * this.tileHeight * Math.SQRT2;

    const blast = this.add.ellipse(position.x, position.y, width, height, 0xfb923c, 0.4);
    blast.setStrokeStyle(2, 0xfff7ed, 0.9);
    blast.setDepth(10000);
    blast.setScale(0.3);

    this.tweens.add({
      targets: blast,
      scale: 1,
      alpha: 0,
      duration: 350,
      ease: "Cubic.easeOut",
      onComplete: () => blast.destroy(),
    });

    this.cameras.main.shake(160, 0.006);
    this.playSfx("hit", 0.9);

    // Ffere o jogador se estiver no raio.
    if (Math.hypot(this.worldX - enemy.x, this.worldY - enemy.y) <= radius) {
      this.hurtPlayer(this.bomberBlastDamage);
    }

    // Reação em cadeia: fere os outros inimigos no raio (inclusive outras bombas).
    for (const other of [...this.enemies]) {
      if (!other.alive) continue;

      if (Math.hypot(other.x - enemy.x, other.y - enemy.y) <= radius) {
        this.hitEnemy(other, this.bomberBlastEnemyDamage);
      }
    }
  }

  // Golpe corpo a corpo: atinge todos os inimigos à frente, dentro do alcance.
  private damageEnemies() {
    const facingLength = Math.hypot(this.facingX, this.facingY);
    const facingX = this.facingX / facingLength;
    const facingY = this.facingY / facingLength;

    for (const enemy of [...this.enemies]) {
      if (!enemy.alive) continue;

      const dx = enemy.x - this.worldX;
      const dy = enemy.y - this.worldY;
      const distance = Math.hypot(dx, dy);

      if (distance === 0 || distance > 1.35) continue;

      // Só acerta se o inimigo estiver à frente.
      const dot = (dx / distance) * facingX + (dy / distance) * facingY;

      if (dot < 0.5) continue;

      this.hitEnemy(enemy, this.playerDamage);
      this.healPlayer(this.lifeStealPerHit);
      this.hitStop(35);
    }
  }

  // Aplica dano a um inimigo (golpe, flecha, bola de fogo, dash ou explosão).
  private hitEnemy(enemy: Enemy, amount: number) {
    if (!enemy.alive) return;

    enemy.health -= amount;
    this.playSfx("hit", 0.6);

    this.showDamageNumber(enemy.container.x, enemy.container.y, amount);

    this.createHitEffect(
      enemy.x,
      enemy.y,
      this.getEnemyColor(enemy.type),
    );

    this.updateEnemyHealthBar(enemy);

    // Efeito visual de dano.
    enemy.container.setAlpha(0.35);

    this.time.delayedCall(100, () => {
      if (enemy.alive && enemy.container.active) {
        enemy.container.setAlpha(1);
      }
    });

    if (enemy.health <= 0) {
      this.handleEnemyDefeated(enemy);
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


  // A arena é maior que a tela: a câmera segue o jogador
  // e fica limitada às bordas do mapa.
  private setupCamera() {
    const halfWidth = (this.arenaSize * this.tileWidth) / 2;
    const originX = this.scale.width / 2;

    const left = originX - halfWidth - 120;
    const top = 80 - 140; // folga extra no topo por causa do painel do HUD
    const right = originX + halfWidth + 120;
    const bottom = 80 + this.arenaSize * this.tileHeight + 100;

    this.cameras.main.setBounds(left, top, right - left, bottom - top);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
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

    this.player.setOrigin(0.5, this.heroTexture === "hero" ? 56 / 68 : 79 / 94);
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

    for (const enemy of [...this.enemies]) {
      if (!enemy.alive) continue;

      const distance = Math.hypot(
        enemy.x - this.worldX,
        enemy.y - this.worldY,
      );

      if (distance <= this.mageExplosionRadius) {
        this.hitEnemy(
          enemy,
          this.playerDamage * this.mageExplosionDamageMultiplier,
        );
      }
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
    this.damageEnemies();
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
    if (this.gameOver || this.enemies.length === 0) {
      return;
    }

    // Ignora o dano enquanto o jogador estiver invulnerável.
    if (this.time.now < this.invulnerableUntil) {
      return;
    }

    // Cada inimigo próximo ataca com o seu próprio tempo de recarga e dano.
    let totalDamage = 0;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      const contactDamage = this.getContactDamage(enemy.type);

      if (contactDamage <= 0) continue;

      const distance = Phaser.Math.Distance.Between(
        this.worldX,
        this.worldY,
        enemy.x,
        enemy.y,
      );

      // O inimigo precisa chegar perto do jogador.
      if (distance > 0.9) continue;

      // Impede dano contínuo a cada frame.
      if (this.time.now < enemy.nextDamageTime) continue;

      enemy.nextDamageTime = this.time.now + this.damageCooldown;
      this.playEnemyAttack(enemy);
      totalDamage += contactDamage;
    }

    if (totalDamage === 0) return;

    this.hurtPlayer(totalDamage);
  }

  // Aplica dano ao jogador (contato, projétil ou explosão).
  // Respeita a invulnerabilidade do dash e a redução do escudo.
  private hurtPlayer(rawDamage: number) {
    if (this.gameOver) return;
    if (this.time.now < this.invulnerableUntil) return;

    const shieldIsActive = this.time.now < this.shieldActiveUntil;

    const finalDamage = shieldIsActive
      ? Math.ceil(rawDamage * (1 - this.shieldDamageReduction))
      : rawDamage;

    this.playerHealth = Math.max(0, this.playerHealth - finalDamage);

    // Efeito de dano no jogador.
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
      // hurtPlayer() já retorna cedo quando gameOver é true,
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
    if (this.enemies.length === 0) return;

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

// Inimigo vivo mais próximo do jogador (alvo das armas automáticas).
  private getNearestEnemy(): Enemy | undefined {
    let nearest: Enemy | undefined;
    let bestDistance = Infinity;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      const distance = Math.hypot(
        enemy.x - this.worldX,
        enemy.y - this.worldY,
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = enemy;
      }
    }

    return nearest;
  }

  private fireProjectile(kind: "arrow" | "fireball", damage: number) {
    const target = this.getNearestEnemy();

    if (!target) return;

    const dx = target.x - this.worldX;
    const dy = target.y - this.worldY;
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

  private playEnemyAttack(enemy: Enemy) {
    if (!enemy.sprite || !enemy.sprite.active) return;

    enemy.attackUntil = this.time.now + 500;

    enemy.sprite.play(
      `${this.getEnemyTexture(enemy.type)}-attack-${enemy.facing}`
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
      projectile.x > this.arenaSize ||
      projectile.y < 0 ||
      projectile.y > this.arenaSize;

    if (!remove) {
      const target = this.enemies.find(
        (enemy) =>
          enemy.alive &&
          Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) < 0.5,
      );

      if (target) {
        this.hitEnemy(target, projectile.damage);
        remove = true;
      }
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

    // Hit-stop: durante alguns milissegundos a simulação fica parada.
    if (this.time.now < this.hitStopUntil) {
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
    this.arenaSize - 0.2,
    );

    const nextY = Phaser.Math.Clamp(
    this.worldY + dy * movement,
    0.2,
    this.arenaSize - 0.2,
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

    this.updateXpGems(delta);
    this.updateEnemies(delta);
    this.updateEnemyProjectiles(delta);
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