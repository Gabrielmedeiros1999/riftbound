import Phaser from "phaser";
import { saveBestWave } from "../utils/records";
import { saveMatch } from "../utils/history";
import { savePermanentStats } from "../utils/permanentStats";
import { unlockAchievement } from "../utils/achievements";
import { getCharacterClass } from "../utils/characterClasses";
import { CLASS_ABILITIES } from "../utils/abilities";


type DamageSource = "melee" | "arrow" | "fire" | "ice" | "lightning" | "aura" | "synergy";

type EnemyStatus = {
  burnUntil: number;
  chillUntil: number;
  nextBurnTick: number;
  burnDamage: number;
  burning: boolean;
  chilled: boolean;
};

type UpgradeOption = {
  title: string;
  description: string;
  apply: () => void;
};

type UpgradeButton = {
  box: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

type Projectile = {
    shape:
    | Phaser.GameObjects.Shape
    | Phaser.GameObjects.Sprite
    | Phaser.GameObjects.Container;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  damage: number;
  expiresAt: number;
  source?: DamageSource;
  statuses?: ("burn" | "chill")[];
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
  shadow?: boolean; // inimigo sombra (aparece depois do portal)
  boss?: boolean;   // chefe do estágio final
  status?: EnemyStatus;
  baseSpeed?: number;
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

  private nextHitSfxTime = 0;
  private readonly hitSfxCooldown = 90; // ms entre sons de acerto

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
  private readonly attackRange = 1.7;        // alcance do golpe (era 1.35)
  private readonly attackConeDot = 0.25;     // cone mais largo (era 0.5)
  private readonly attackAimRange = 2.4;     // distância máxima da auto-mira
  private readonly attackLungeDistance = 0.45; // avanço do personagem ao atacar
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
  // Atraso (ms) do tiro após iniciar a animação: o cuspe aparece por volta do 5º quadro.
  private readonly spitterShotDelay = 280;

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
    if (type === "brute") return "enemy-bloated";
    if (type === "spitter") return "enemy-spitter";
    if (type === "bomber") return "enemy-bomber";
    return "enemy-zombie";
  }

  // sinergias
  private frostLevel = 0;
  private lightningLevel = 0;
  private nextFrostTime = 0;
  private nextLightningTime = 0;
  private synergies = new Set<string>();

  private auraLevel = 0;
  private nextAuraTick = 0;
  private auraRing?: Phaser.GameObjects.Ellipse;
  private firePatches: {
    x: number;
    y: number;
    until: number;
    nextTick: number;
    shape: Phaser.GameObjects.Ellipse;
  }[] = [];
  private nextPatchTime = 0;

  // melhorias  pendentes
  private pendingLevelUps = 0;
  private upgradePending = false;
  private upgradeObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly upgradeIcons: Record<string, { key: string; emoji: string }> = {
    // Melhorias base
    "LAMINA APRIMORADA": { key: "icon-blade", emoji: "⚔️" },
    "PASSOS VELOZES": { key: "icon-speed", emoji: "👟" },
    "VITALIDADE": { key: "icon-vitality", emoji: "❤️" },
    "REGENERACAO": { key: "icon-regen", emoji: "💚" },
    "SEDE DE SANGUE": { key: "icon-bloodthirst", emoji: "🩸" },
    "IMA DE GEMAS": { key: "icon-magnet", emoji: "🧲" },
    "ARCO ARCANO": { key: "icon-arrow", emoji: "🏹" },
    "BOLA DE FOGO": { key: "icon-fireball", emoji: "🔥" },

    // Armas novas
    "LANCA DE GELO": { key: "icon-frost", emoji: "❄️" },
    "RAIO ENCADEADO": { key: "icon-lightning", emoji: "⚡" },
    "AURA DE ESPINHOS": { key: "icon-aura", emoji: "🌀" },

    // Sinergias entre armas
    "CHOQUE TERMICO": { key: "icon-thermal-shock", emoji: "💥" },
    "CONDUTOR": { key: "icon-conductor", emoji: "🔗" },
    "TEMPESTADE IGNEA": { key: "icon-firestorm", emoji: "🌩️" },
    "FLECHAS ELEMENTARES": { key: "icon-elemental-arrows", emoji: "✨" },
    "AURA GELIDA": { key: "icon-frost-aura", emoji: "🧊" },
    "AURA IGNEA": { key: "icon-fire-aura", emoji: "☄️" },
    "BANQUETE": { key: "icon-feast", emoji: "🍖" },
    "ESTILHACO EM CADEIA": { key: "icon-shatter-chain", emoji: "💎" },

    // Sinergias de classe
    "RASTRO ARDENTE": { key: "icon-ember-dash", emoji: "🌋" },
    "EXPLOSAO GELIDA": { key: "icon-frost-nova", emoji: "🌨️" },
    "ESCUDO ESPINHOSO": { key: "icon-thorn-shield", emoji: "🛡️" },
  };

    // Reroll / Pular / Banir: cargas por partida.
  private readonly maxUpgradeRerolls = 3;
  private readonly maxUpgradeSkips = 3;
  private readonly maxUpgradeBanishes = 3;
  private rerollsLeft = 0;
  private skipsLeft = 0;
  private banishesLeft = 0;
  private banishedUpgrades = new Set<string>();
  private banishMode = false;

  private currentUpgradeOptions: UpgradeOption[] = [];
  private upgradeCardObjects: Phaser.GameObjects.GameObject[] = [];
  private upgradeTitle!: Phaser.GameObjects.Text;
  private rerollButton?: UpgradeButton;
  private skipButton?: UpgradeButton;
  private banishButton?: UpgradeButton;

  // Ondas e progressão
  private wave = 1;
  private enemiesRemainingInWave = 8;

  // Estágios e portal
  private readonly stageDuration = 10 * 60 * 1000; // 10:00 (para testar: 20_000)
  private readonly finalStage = 3;
  private currentStage = 1;
  private stagePhase: "normal" | "portal" | "boss" = "normal";
  private stageTimeLeft = 10 * 60 * 1000;
  private survivalMs = 0;      // tempo vivo (não conta pausa nem menu de upgrade)
  private overtimeMs = 0;      // tempo desde que o portal abriu
  private shadowSpawnTimer = 0;
  private bossDefeated = false;
  private bossEnemy?: Enemy;
  private nextBossShotTime = 0;
  private portal?: {
    x: number;
    y: number;
    container: Phaser.GameObjects.Container;
  };
  private arenaTiles: Phaser.GameObjects.Image[] = [];
  private stageText!: Phaser.GameObjects.Text;
  private bossBar!: Phaser.GameObjects.Graphics;
  

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

  // Combo de mortes seguidas.
  private comboCount = 0;
  private bestCombo = 0;
  // Tempo restante (ms) até o combo acabar. Conta só enquanto o jogo roda
  // (não durante pausa, escolha de melhoria ou hit-stop).
  private comboTimeLeft = 0;
  // Janela (ms) para matar o próximo inimigo e manter o combo.
  private readonly comboWindow = 3500;
  private comboLabel!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private comboBestText!: Phaser.GameObjects.Text;
  private comboBar!: Phaser.GameObjects.Graphics;
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
  this.comboCount = 0;
  this.bestCombo = 0;
  this.comboTimeLeft = 0;
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

  this.upgradeCardObjects = [];
  this.currentUpgradeOptions = [];
  this.rerollsLeft = this.maxUpgradeRerolls;
  this.skipsLeft = this.maxUpgradeSkips;
  this.banishesLeft = this.maxUpgradeBanishes;
  this.banishedUpgrades = new Set<string>();
  this.banishMode = false;

  // ondas
  this.currentStage = 1;
  this.stagePhase = "normal";
  this.stageTimeLeft = this.stageDuration;
  this.survivalMs = 0;
  this.overtimeMs = 0;
  this.shadowSpawnTimer = 0;
  this.bossDefeated = false;
  this.bossEnemy = undefined;
  this.portal = undefined;
  this.arenaTiles = [];

  // sinergias
  this.frostLevel = 0;
  this.lightningLevel = 0;
  this.nextFrostTime = 0;
  this.nextLightningTime = 0;
  this.synergies = new Set<string>();
  this.auraLevel = 0;
  this.nextAuraTick = 0;
  this.auraRing = undefined;
  this.firePatches = [];
  this.nextPatchTime = 0;
}

 preload(){
  this.load.audio("sword", "assets/audio/sword.wav");
  this.load.audio("hit", "assets/audio/hit.wav");
  this.load.audio("dodge", "assets/audio/dodge.wav");
  this.load.audio("level-up", "assets/audio/level-up.wav");
  this.load.audio("shield-sfx", "assets/audio/shield.wav");
  this.load.audio("dash-sfx", "assets/audio/dash.wav");
  this.load.audio("arcane-explosion-sfx", "assets/audio/arcane-explosion.wav");
  this.load.image("proj-arrow", "assets/projectiles/arrow.png");
  this.load.image("proj-fireball", "assets/projectiles/fireball.png");

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
    { frameWidth: 68, frameHeight: 68 }
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
  this.load.spritesheet("enemy-spitter", "assets/enemies/Spitter_full.png", {
    frameWidth: 64,
    frameHeight: 64,
  });

  this.load.spritesheet("enemy-bomber", "assets/enemies/Bomber_full.png", {
    frameWidth: 64,
    frameHeight: 64,
  });

  this.load.image("terrain-grass", "assets/terrain/grass_tile.png");
  this.load.image("terrain-dirt", "assets/terrain/dirt_tile.png");
  this.load.image("terrain-sand", "assets/terrain/sand_tile.png");
      // Ícones das melhorias (PNG 48x48). Se um arquivo não existir, o jogo
    // usa o emoji provisório no lugar (o navegador só avisa o 404 no console).
    [
      "blade",
      "speed",
      "vitality",
      "regen",
      "bloodthirst",
      "magnet",
      "arrow",
      "fireball",
    ].forEach((name) => {
      this.load.image(`icon-${name}`, `assets/icons/upgrades/${name}.png`);
    });
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

    // Os sprites novos têm outro formato: 9 colunas, 9 quadros por animação
    // e o ATAQUE vem antes da caminhada na folha.
    this.createPixelLabEnemyAnimations("enemy-spitter", {
      columns: 9,
      frames: 9,
      attackFirst: true,
      attackFrameRate: 18, // 9 quadros em 0,5 s
      walkFrameRate: 12,
    });

    this.createPixelLabEnemyAnimations("enemy-bomber", {
      columns: 9,
      frames: 9,
      attackFirst: true,
      attackFrameRate: 15, // 9 quadros em 0,6 s = duração do pavio
      walkFrameRate: 16,
    });
    this.createPlayer();
    this.setupCamera();
    this.fillEnemies();
    this.createHUD();
    this.createStageHUD();
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
  attackFirstRow: number,
  layout: { columns?: number; walkFrames?: number; attackFrames?: number;
            walkFrameRate?: number; attackFrameRate?: number } = {}
) {
  const columns = layout.columns ?? 16;
  const walkFrames = layout.walkFrames ?? 8;
  const attackFrames = layout.attackFrames ?? 16;
  const walkFrameRate = layout.walkFrameRate ?? 10;
  const attackFrameRate = layout.attackFrameRate ?? 32;

  const directions = [
    { name: "south", index: 0 },
    { name: "east", index: 2 },
    { name: "north", index: 4 },
    { name: "west", index: 6 },
  ];

  for (const direction of directions) {
    this.anims.create({
      key: `${textureKey}-idle-${direction.name}`,
      frames: [{ key: textureKey, frame: direction.index }],
      frameRate: 1,
      repeat: -1,
    });

    const walkStart = (walkFirstRow + direction.index) * columns;
    this.anims.create({
      key: `${textureKey}-walk-${direction.name}`,
      frames: this.anims.generateFrameNumbers(textureKey, {
        start: walkStart,
        end: walkStart + walkFrames - 1,
      }),
      frameRate: walkFrameRate,
      repeat: -1,
    });

    const attackStart = (attackFirstRow + direction.index) * columns;
    this.anims.create({
      key: `${textureKey}-attack-${direction.name}`,
      frames: this.anims.generateFrameNumbers(textureKey, {
        start: attackStart,
        end: attackStart + attackFrames - 1,
      }),
      frameRate: attackFrameRate,
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

 // Toca o som de acerto no máximo uma vez a cada hitSfxCooldown ms.
private playHitSfx(volume = 0.6) {
  const now = this.time.now;
  if (now < this.nextHitSfxTime) return;

  this.nextHitSfxTime = now + this.hitSfxCooldown;
  this.playSfx("hit", volume);
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
    this.createPixelLabAnimations("hero-assassin", 1, 9, {
      columns: 9,
      walkFrames: 9,
      attackFrames: 9,
      walkFrameRate: 11,
      attackFrameRate: 18,   
    });
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
  const frostName =
     this.frostLevel === 0 ? "LANCA DE GELO" : `LANCA DE GELO (NV ${this.frostLevel + 1})`;
  const lightningName =
    this.lightningLevel === 0 ? "RAIO ENCADEADO" : `RAIO ENCADEADO (NV ${this.lightningLevel + 1})`;
  const auraName =
     this.auraLevel === 0 ? "AURA DE ESPINHOS" : `AURA DE ESPINHOS (NV ${this.auraLevel + 1})`;  

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
      title: auraName,
      description:
        this.auraLevel === 0
          ? "Aura que fere continuamente quem chega perto"
          : "Aura maior, mais forte e mais rapida",
      apply: () => {
        this.auraLevel += 1;
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
    {
      title: frostName,
      description:
        this.frostLevel === 0
          ? "Dispara lancas que retardam os inimigos"
          : "Lancas mais fortes, rapidas e gelidas",
      apply: () => {
        this.frostLevel += 1;
      },
    },
    {
      title: lightningName,
      description:
        this.lightningLevel === 0
          ? "Raio que salta entre inimigos proximos"
          : "Mais saltos, mais dano e recarga menor",
      apply: () => {
        this.lightningLevel += 1;
      },
    },
    ...this.getSynergyUpgrades(),
  ];
}

  // Identificador estável: tira o "(NV 2)" do título, para o banimento
  // continuar valendo mesmo quando a melhoria sobe de nível.
  private getUpgradeId(option: UpgradeOption): string {
    return option.title.replace(/\s*\(NV \d+\)$/, "");
  }

  // Melhorias que ainda não foram banidas.
  private getAvailableUpgrades(): UpgradeOption[] {
    return this.getUpgradePool().filter(
      (option) => !this.banishedUpgrades.has(this.getUpgradeId(option)),
    );
  }

  private showUpgradeSelection() {
    // Todas as melhorias foram banidas: não há o que escolher,
    // então o nível é consumido sem abrir a tela.
    if (this.getAvailableUpgrades().length === 0) {
      this.pendingLevelUps -= 1;
      this.updateHUD();

      if (this.pendingLevelUps > 0) {
        this.showUpgradeSelection();
      }

      return;
    }

    this.upgradePending = true;
    this.upgradeObjects = [];
    this.upgradeCardObjects = [];
    this.currentUpgradeOptions = [];
    this.banishMode = false;

    const width = this.scale.width;
    const height = this.scale.height;

    const overlay = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.8)
      .setScrollFactor(0)
      .setDepth(20000);

    this.upgradeTitle = this.add
      .text(width / 2, height / 2 - 125, "ESCOLHA UMA MELHORIA", {
        fontFamily: "monospace",
        fontSize: "22px",
        color: "#c4b5fd",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20001);

    this.upgradeObjects.push(overlay, this.upgradeTitle);

    // Os 3 botões ficam fixos; só as cartas mudam ao rerolar ou banir.
    const buttonY = height / 2 + 175;

    this.rerollButton = this.createUpgradeButton(width / 2 - 155, buttonY, () =>
      this.rerollUpgrades(),
    );
    this.skipButton = this.createUpgradeButton(width / 2, buttonY, () =>
      this.skipUpgrade(),
    );
    this.banishButton = this.createUpgradeButton(width / 2 + 155, buttonY, () =>
      this.toggleBanishMode(),
    );

    this.rollUpgradeOptions(false);
  }

 
  // ---------------------------------------------------------------------
// Sinergias
// ---------------------------------------------------------------------

private getSynergyDefs() {
  const cls = this.selectedClassId;

  return [
    // --- Entre armas ---
    {
      id: "thermal-shock",
      title: "CHOQUE TERMICO",
      description:
        "Bola de fogo em inimigo gelado estilhaca: +60% de dano e explosao que congela vizinhos",
      requires: () => this.fireballLevel > 0 && this.frostLevel > 0,
    },
    {
      id: "conductor",
      title: "CONDUTOR",
      description: "Raio salta +2 vezes e causa +50% de dano em inimigos gelados",
      requires: () => this.frostLevel > 0 && this.lightningLevel > 0,
    },
    {
      id: "firestorm",
      title: "TEMPESTADE IGNEA",
      description: "Todo inimigo atingido pelo raio e incendiado",
      requires: () => this.fireballLevel > 0 && this.lightningLevel > 0,
    },
    {
      id: "elemental-arrows",
      title: "FLECHAS ELEMENTARES",
      description: "As flechas herdam queimadura e/ou gelo das suas outras armas",
      requires: () =>
        this.arrowLevel > 0 && (this.fireballLevel > 0 || this.frostLevel > 0),
    },
    {
      id: "frost-aura",
      title: "AURA GELIDA",
      description: "A aura retarda todos os inimigos que ela toca",
      requires: () => this.auraLevel > 0 && this.frostLevel > 0,
    },
    {
      id: "fire-aura",
      title: "AURA IGNEA",
      description: "A aura incendeia todos os inimigos que ela toca",
      requires: () => this.auraLevel > 0 && this.fireballLevel > 0,
    },
    {
      id: "feast",
      title: "BANQUETE",
      description: "Matar um inimigo em chamas cura 4 de vida",
      requires: () => this.lifeStealPerHit > 0 && this.fireballLevel > 0,
    },
    {
      id: "shatter-chain",
      title: "ESTILHACO EM CADEIA",
      description:
        "Inimigo gelado que morre explode em gelo, ferindo e congelando os vizinhos",
      requires: () => this.frostLevel >= 2,
    },

    // --- Por classe ---
    {
      id: "ember-dash",
      title: "RASTRO ARDENTE",
      description: "O dash deixa um rastro de fogo que incendeia quem pisar nele",
      requires: () => cls === "assassin" && this.fireballLevel > 0,
    },
    {
      id: "frost-nova",
      title: "EXPLOSAO GELIDA",
      description: "A explosao arcana tambem congela todos os inimigos atingidos",
      requires: () => cls === "mage" && this.frostLevel > 0,
    },
    {
      id: "thorn-shield",
      title: "ESCUDO ESPINHOSO",
      description: "Com o escudo ativo, a aura causa o triplo de dano",
      requires: () => cls === "warrior" && this.auraLevel > 0,
    },
  ];
}

private getSynergyUpgrades(): UpgradeOption[] {
  return this.getSynergyDefs()
    .filter((def) => !this.synergies.has(def.id) && def.requires())
    .map((def) => ({
      title: def.title,
      description: def.description,
      apply: () => {
        this.synergies.add(def.id);
        this.showStageBanner(`SINERGIA: ${def.title}`);
      },
    }));
}

private isSynergyOption(option: UpgradeOption): boolean {
  return this.getSynergyDefs().some((def) => def.title === option.title);
}

// Chamado antes do dano: pode aumentar o dano e disparar efeitos extras.
private resolveSynergies(enemy: Enemy, amount: number, source: DamageSource): number {
  const now = this.time.now;
  const status = enemy.status;
  const chilled = !!status && now < status.chillUntil;

  // Fogo em alvo gelado: choque termico.
  if (source === "fire" && chilled && this.synergies.has("thermal-shock")) {
    status!.chillUntil = 0;
    status!.chilled = false;
    this.refreshStatusTint(enemy);
    this.thermalShatter(enemy, amount);
    return Math.ceil(amount * 1.6);
  }

  // Raio em alvo gelado: dano extra.
  if (source === "lightning" && chilled && this.synergies.has("conductor")) {
    return Math.ceil(amount * 1.5);
  }

  return amount;
}

private thermalShatter(origin: Enemy, baseDamage: number) {
  this.createHitEffect(origin.x, origin.y, 0x7dd3fc);

  for (const other of [...this.enemies]) {
    if (other === origin || !other.alive) continue;
    if (Math.hypot(other.x - origin.x, other.y - origin.y) > 1.4) continue;

    this.hitEnemy(other, Math.ceil(baseDamage * 0.5), "synergy");
    this.applyStatus(other, "chill", 1500);
  }
}

// ---------------------------------------------------------------------
// Aura de espinhos
// ---------------------------------------------------------------------

private updateAura() {
  if (this.auraLevel <= 0) return;

  const now = this.time.now;
  const radius = 1.3 + (this.auraLevel - 1) * 0.25;

  if (!this.auraRing) {
    this.auraRing = this.add.ellipse(0, 0, 10, 10, 0xa78bfa, 0.12);
  }

  const color = this.synergies.has("fire-aura")
    ? 0xfb923c
    : this.synergies.has("frost-aura")
      ? 0x7dd3fc
      : 0xa78bfa;

  this.auraRing
    .setPosition(this.player.x, this.player.y - 2)
    .setSize(
      radius * this.tileWidth * Math.SQRT2,
      radius * this.tileHeight * Math.SQRT2,
    )
    .setFillStyle(color, 0.1 + 0.04 * Math.sin(now / 200))
    .setStrokeStyle(2, color, 0.7)
    .setDepth(this.player.depth - 1);

  if (now < this.nextAuraTick) return;
  this.nextAuraTick = now + Math.max(350, 700 - (this.auraLevel - 1) * 60);

  const thorn =
    this.synergies.has("thorn-shield") && now < this.shieldActiveUntil;

  const damage =
    (Math.max(1, Math.ceil(this.playerDamage / 3)) + (this.auraLevel - 1)) *
    (thorn ? 3 : 1);

  for (const enemy of [...this.enemies]) {
    if (!enemy.alive) continue;

    const distance = Math.hypot(enemy.x - this.worldX, enemy.y - this.worldY);
    if (distance > radius) continue;

    this.hitEnemy(enemy, damage, "aura");
  }
}

// ---------------------------------------------------------------------
// Sinergias de classe e efeitos de morte
// ---------------------------------------------------------------------

private addFirePatch(x: number, y: number) {
  const pos = this.projectPosition(x, y);
  const shape = this.add
    .ellipse(pos.x, pos.y, 46, 22, 0xf97316, 0.5)
    .setDepth(pos.y - 1);

  this.firePatches.push({
    x,
    y,
    until: this.time.now + 3000,
    nextTick: 0,
    shape,
  });
}

private updateClassSynergies() {
  const now = this.time.now;

  // Assassino: o dash deixa poças de fogo pelo caminho.
  if (
    this.synergies.has("ember-dash") &&
    now < this.dashUntil &&
    now >= this.nextPatchTime
  ) {
    this.nextPatchTime = now + 60;
    this.addFirePatch(this.worldX, this.worldY);
  }

  for (let i = this.firePatches.length - 1; i >= 0; i--) {
    const patch = this.firePatches[i];

    if (now >= patch.until) {
      patch.shape.destroy();
      this.firePatches.splice(i, 1);
      continue;
    }

    patch.shape.setAlpha(0.35 + 0.15 * Math.sin(now / 120));

    if (now < patch.nextTick) continue;
    patch.nextTick = now + 300;

    for (const enemy of [...this.enemies]) {
      if (!enemy.alive) continue;

      if (Math.hypot(enemy.x - patch.x, enemy.y - patch.y) < 0.8) {
        this.applyStatus(enemy, "burn", 2000);
      }
    }
  }
}

// Chamado quando um inimigo morre (ele já saiu da lista de inimigos).
private onEnemyKilledSynergies(enemy: Enemy) {
  const status = enemy.status;
  if (!status) return;

  const now = this.time.now;

  // Banquete: matar alguém em chamas cura o jogador.
  if (this.synergies.has("feast") && now < status.burnUntil) {
    this.healPlayer(4);
  }

  // Estilhaço em cadeia: inimigo gelado explode e congela os vizinhos.
  if (this.synergies.has("shatter-chain") && now < status.chillUntil) {
    this.createHitEffect(enemy.x, enemy.y, 0x7dd3fc);

    const damage = Math.max(1, Math.ceil(this.playerDamage * 0.8));

    for (const other of [...this.enemies]) {
      if (!other.alive) continue;
      if (Math.hypot(other.x - enemy.x, other.y - enemy.y) > 1.6) continue;

      // Gela antes de ferir: se o vizinho morrer, ele também estilhaça.
      this.applyStatus(other, "chill", 2000);
      this.hitEnemy(other, damage, "synergy");
    }
  }
}

// ---------------------------------------------------------------------
// Status: queimadura e gelo
// ---------------------------------------------------------------------

// Efeito que cada fonte de dano aplica por conta propria.
private applySourceStatus(enemy: Enemy, source: DamageSource) {
  if (source === "fire") {
    this.applyStatus(enemy, "burn", 3000);
  } else if (source === "ice") {
    this.applyStatus(enemy, "chill", 2500 + (this.frostLevel - 1) * 300);
  } else if (source === "lightning" && this.synergies.has("firestorm")) {
    this.applyStatus(enemy, "burn", 2500);
  } else if (source === "aura") {
    if (this.synergies.has("fire-aura")) this.applyStatus(enemy, "burn", 2000);
    if (this.synergies.has("frost-aura")) this.applyStatus(enemy, "chill", 1500);
  }
}

private applyStatus(enemy: Enemy, kind: "burn" | "chill", durationMs: number) {
  if (!enemy.alive) return;

  const now = this.time.now;

  if (!enemy.status) {
    enemy.status = {
      burnUntil: 0,
      chillUntil: 0,
      nextBurnTick: 0,
      burnDamage: 1,
      burning: false,
      chilled: false,
    };
  }

  if (enemy.baseSpeed === undefined) enemy.baseSpeed = enemy.speed;

  const status = enemy.status;

  if (kind === "burn") {
    if (status.burnUntil <= now) status.nextBurnTick = now + 500;
    status.burnUntil = Math.max(status.burnUntil, now + durationMs);
    status.burnDamage = Math.max(1, Math.ceil(this.playerDamage / 2));
  } else {
    status.chillUntil = Math.max(status.chillUntil, now + durationMs);
  }

  status.burning = now < status.burnUntil;
  status.chilled = now < status.chillUntil;
  this.refreshStatusTint(enemy);
}

private updateStatuses() {
  const now = this.time.now;

  for (const enemy of [...this.enemies]) {
    const status = enemy.status;
    if (!enemy.alive || !status) continue;

    const burning = now < status.burnUntil;
    const chilled = now < status.chillUntil;

    if (burning && now >= status.nextBurnTick) {
      status.nextBurnTick = now + 500;
      this.statusDamage(enemy, status.burnDamage);
      if (!enemy.alive) continue;
    }

    // Gelo retarda; o chefe resiste mais.
    const slow = chilled ? (enemy.boss ? 0.8 : 0.55) : 1;
    enemy.speed = (enemy.baseSpeed ?? enemy.speed) * slow;

    if (burning !== status.burning || chilled !== status.chilled) {
      status.burning = burning;
      status.chilled = chilled;
      this.refreshStatusTint(enemy);
    }
  }
}

// Dano continuo: sem piscar nem som, para nao poluir a tela.
private statusDamage(enemy: Enemy, amount: number) {
  enemy.health -= amount;
  this.showDamageNumber(enemy.container.x, enemy.container.y, amount);
  this.updateEnemyHealthBar(enemy);

  if (enemy.health <= 0) this.handleEnemyDefeated(enemy);
}

private refreshStatusTint(enemy: Enemy) {
  const status = enemy.status;

  if (status?.burning) enemy.sprite.setTint(0xfb923c);
  else if (status?.chilled) enemy.sprite.setTint(0x7dd3fc);
  else if (enemy.boss) enemy.sprite.setTint(0xff6b6b);
  else if (enemy.shadow) enemy.sprite.setTint(0x2e1065);
  else enemy.sprite.clearTint();
}

// ---------------------------------------------------------------------
// Raio encadeado
// ---------------------------------------------------------------------

private castLightning() {
  const first = this.getNearestEnemy();
  if (!first) return;

  const maxTargets =
    2 + this.lightningLevel + (this.synergies.has("conductor") ? 2 : 0);
  const damage =
    Math.max(1, Math.ceil(this.playerDamage * 0.8)) + (this.lightningLevel - 1);

  const path: Enemy[] = [];
  let current: Enemy | undefined = first;

  while (current && path.length < maxTargets) {
    path.push(current);
    const from: Enemy = current;

    current = this.enemies
      .filter(
        (e) =>
          e.alive &&
          !path.includes(e) &&
          Math.hypot(e.x - from.x, e.y - from.y) < 2.8,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - from.x, a.y - from.y) -
          Math.hypot(b.x - from.x, b.y - from.y),
      )[0];
  }

  // Desenha antes do dano, enquanto os alvos ainda existem.
  this.drawLightning(path);

  for (const enemy of path) {
    this.hitEnemy(enemy, damage, "lightning");
  }
}

private drawLightning(targets: Enemy[]) {
  const g = this.add.graphics().setDepth(20000);

  let px = this.player.x;
  let py = this.player.y - 24;

  for (const enemy of targets) {
    const tx = enemy.container.x;
    const ty = enemy.container.y - 20;
    const segments = 5;

    let lx = px;
    let ly = py;

    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const jitter = i === segments ? 0 : Phaser.Math.Between(-8, 8);
      const nx = Phaser.Math.Linear(px, tx, t) + jitter;
      const ny = Phaser.Math.Linear(py, ty, t) + jitter;

      g.lineStyle(5, 0x8b5cf6, 0.5).lineBetween(lx, ly, nx, ny);
      g.lineStyle(2, 0xf5f3ff, 1).lineBetween(lx, ly, nx, ny);

      lx = nx;
      ly = ny;
    }

    px = tx;
    py = ty;
  }

  this.tweens.add({
    targets: g,
    alpha: 0,
    duration: 220,
    onComplete: () => g.destroy(),
  });
}

  private createUpgradeButton(
    x: number,
    y: number,
    onClick: () => void,
  ): UpgradeButton {
    const box = this.add
      .rectangle(x, y, 140, 38, 0x5b21b6)
      .setStrokeStyle(2, 0x8b5cf6)
      .setScrollFactor(0)
      .setDepth(20001)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(x, y, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20002);

    box.on("pointerdown", onClick);
    box.on("pointerover", () => {
      if (box.input?.enabled) box.setAlpha(0.85);
    });
    box.on("pointerout", () => box.setAlpha(1));

    this.upgradeObjects.push(box, label);

    return { box, label };
  }

  // Atualiza texto, cor e estado (ativo/desativado) dos 3 botões.
  private refreshUpgradeButtons() {
    const apply = (
      button: UpgradeButton | undefined,
      text: string,
      enabled: boolean,
      highlighted = false,
    ) => {
      if (!button) return;

      button.label.setText(text);
      button.label.setColor(enabled ? "#ffffff" : "#6b7280");
      button.box.setAlpha(1);
      button.box.setFillStyle(
        highlighted ? 0xb91c1c : enabled ? 0x5b21b6 : 0x1f1b2e,
      );
      button.box.setStrokeStyle(
        2,
        highlighted ? 0xf87171 : enabled ? 0x8b5cf6 : 0x374151,
      );

      if (enabled) {
        button.box.setInteractive({ useHandCursor: true });
      } else {
        button.box.disableInteractive();
      }
    };

    // Rerolar só faz sentido se existirem opções diferentes das da tela.
    const canReroll =
      this.rerollsLeft > 0 &&
      this.getAvailableUpgrades().length > this.currentUpgradeOptions.length;

    apply(
      this.rerollButton,
      `REROLAR ${this.rerollsLeft}/${this.maxUpgradeRerolls}`,
      canReroll,
    );

    apply(
      this.skipButton,
      `PULAR ${this.skipsLeft}/${this.maxUpgradeSkips}`,
      this.skipsLeft > 0,
    );

    apply(
      this.banishButton,
      this.banishMode
        ? "CANCELAR"
        : `BANIR ${this.banishesLeft}/${this.maxUpgradeBanishes}`,
      this.banishMode || this.banishesLeft > 0,
      this.banishMode,
    );
  }

  // Sorteia até 3 opções. Ao rerolar, prioriza opções que NÃO estavam na tela.
  private rollUpgradeOptions(avoidCurrent: boolean) {
    const currentIds = new Set(
      this.currentUpgradeOptions.map((option) => this.getUpgradeId(option)),
    );

    let pool: UpgradeOption[] = Phaser.Utils.Array.Shuffle(
      this.getAvailableUpgrades(),
    );

    const synergyIndex = pool.findIndex((o) => this.isSynergyOption(o));
    if (synergyIndex > 0) pool.unshift(...pool.splice(synergyIndex, 1));

    if (avoidCurrent) {
      pool = [
        ...pool.filter((option) => !currentIds.has(this.getUpgradeId(option))),
        ...pool.filter((option) => currentIds.has(this.getUpgradeId(option))),
      ];
    }

    this.currentUpgradeOptions = pool.slice(0, 3);

    this.renderUpgradeCards();
    this.refreshUpgradeButtons();
  }

   // Desenha as cartas, agora com um ícone à esquerda.
  // No modo banir elas ficam vermelhas.
  private renderUpgradeCards() {
    this.upgradeCardObjects.forEach((object) => object.destroy());
    this.upgradeCardObjects = [];

    const width = this.scale.width;
    const height = this.scale.height;

    const cardWidth = 400;
    const cardHeight = 64;
    const left = width / 2 - cardWidth / 2;

    const fill = this.banishMode ? 0x2a1215 : 0x1e1b2e;
    const stroke = this.banishMode ? 0xef4444 : 0x8b5cf6;
    const hover = this.banishMode ? 0x7f1d1d : 0x4c1d95;

    this.currentUpgradeOptions.forEach((option, index) => {
      const y = height / 2 - 45 + index * 75;

      const card = this.add
        .rectangle(width / 2, y, cardWidth, cardHeight, fill)
        .setStrokeStyle(2, stroke)
        .setScrollFactor(0)
        .setDepth(20001)
        .setInteractive({ useHandCursor: true });

      // destaque dourado nas cartas de sinergia
      if (this.isSynergyOption(option)) card.setStrokeStyle(2, 0xfbbf24);  

      // Moldura do ícone + ícone.
      const iconX = left + 38;

      const iconFrame = this.add
        .rectangle(iconX, y, 52, 52, 0x0f0a1f)
        .setStrokeStyle(1, stroke)
        .setScrollFactor(0)
        .setDepth(20002);

      const icon = this.createUpgradeIcon(
        this.getUpgradeId(option),
        iconX,
        y,
      );

      // Título e descrição (a descrição quebra de linha se for longa).
      const textX = left + 76;

      const title = this.add
        .text(textX, y - 26, `${index + 1}. ${option.title}`, {
          fontFamily: "monospace",
          fontSize: "13px",
          fontStyle: "bold",
          color: "#ffffff",
        })
        .setScrollFactor(0)
        .setDepth(20002);

      const description = this.add
        .text(textX, y - 7, option.description, {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#ddd6fe",
          lineSpacing: 2,
          wordWrap: { width: cardWidth - 76 - 12 },
        })
        .setScrollFactor(0)
        .setDepth(20002);

      card.on("pointerover", () => card.setFillStyle(hover));
      card.on("pointerout", () => card.setFillStyle(fill));
      card.on("pointerdown", () => {
        if (this.banishMode) {
          this.banishUpgrade(option);
        } else {
          this.chooseUpgrade(option);
        }
      });

      this.upgradeCardObjects.push(card, iconFrame, icon, title, description);
    });
  }

  // Usa o PNG da melhoria se ele foi carregado; senão, o emoji provisório.
  private createUpgradeIcon(
    id: string,
    x: number,
    y: number,
  ): Phaser.GameObjects.GameObject {
    const icon = this.upgradeIcons[id];

    if (icon && this.textures.exists(icon.key)) {
      return this.add
        .image(x, y, icon.key)
        .setScrollFactor(0)
        .setDepth(20003);
    }

    return this.add
      .text(x, y, icon?.emoji ?? "?", {
        fontFamily: "monospace",
        fontSize: "28px",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20003);
  }

  // REROLAR: sorteia 3 opções novas (gasta 1 carga).
  private rerollUpgrades() {
    if (!this.upgradePending || this.rerollsLeft <= 0) return;

    this.rerollsLeft -= 1;
    this.setBanishMode(false);
    this.rollUpgradeOptions(true);
  }

  // PULAR: consome o level-up sem escolher nada (gasta 1 carga).
  private skipUpgrade() {
    if (!this.upgradePending || this.skipsLeft <= 0) return;

    this.skipsLeft -= 1;
    this.finishUpgradeSelection();
  }

  // BANIR: liga/desliga o modo em que o próximo clique numa carta a bane.
  private toggleBanishMode() {
    if (!this.upgradePending) return;
    if (!this.banishMode && this.banishesLeft <= 0) return;

    this.setBanishMode(!this.banishMode);
    this.renderUpgradeCards();
    this.refreshUpgradeButtons();
  }

  private setBanishMode(active: boolean) {
    this.banishMode = active;

    this.upgradeTitle.setText(
      active ? "ESCOLHA UMA MELHORIA PARA BANIR" : "ESCOLHA UMA MELHORIA",
    );
    this.upgradeTitle.setColor(active ? "#f87171" : "#c4b5fd");
  }

  // Bane a melhoria pelo resto da partida (gasta 1 carga) e troca só essa carta.
  private banishUpgrade(option: UpgradeOption) {
    if (!this.upgradePending || this.banishesLeft <= 0) return;

    this.banishedUpgrades.add(this.getUpgradeId(option));
    this.banishesLeft -= 1;
    this.setBanishMode(false);

    const index = this.currentUpgradeOptions.indexOf(option);

    const shownIds = new Set(
      this.currentUpgradeOptions.map((shown) => this.getUpgradeId(shown)),
    );

    const candidates = this.getAvailableUpgrades().filter(
      (candidate) => !shownIds.has(this.getUpgradeId(candidate)),
    );

    if (candidates.length > 0) {
      this.currentUpgradeOptions[index] =
        candidates[Phaser.Math.Between(0, candidates.length - 1)];
    } else {
      this.currentUpgradeOptions.splice(index, 1);
    }

    // Nada sobrou para escolher: o nível é consumido sem gastar um "pular".
    if (this.currentUpgradeOptions.length === 0) {
      this.finishUpgradeSelection();
      return;
    }

    this.renderUpgradeCards();
    this.refreshUpgradeButtons();
  }

  // Fecha a tela e segue para o próximo level-up pendente, se houver.
  private finishUpgradeSelection() {
    this.upgradeObjects.forEach((object) => object.destroy());
    this.upgradeCardObjects.forEach((object) => object.destroy());
    this.upgradeObjects = [];
    this.upgradeCardObjects = [];
    this.currentUpgradeOptions = [];
    this.banishMode = false;

    this.pendingLevelUps -= 1;
    this.upgradePending = false;

    this.updateHUD();

    if (this.pendingLevelUps > 0) {
      this.showUpgradeSelection();
    }
  }

  private chooseUpgrade(option: UpgradeOption) {
    if (!this.upgradePending) return;

    option.apply();
    this.finishUpgradeSelection();
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
        this.arenaTiles.push(tile);
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
    if (this.gameOver || this.stagePhase !== "normal") return;

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
    if (this.gameOver || this.stagePhase !== "normal") return;

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
      "enemy-spitter": 54 / 64,
      "enemy-bomber": 52 / 64,
    };

    sprite.setOrigin(0.5, enemyOrigins[textureKey]);
    sprite.setScale(type === "brute" ? 1.3 : 1);
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
    this.onEnemyKilledSynergies(enemy);

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

    if (enemy.boss) this.onBossDefeated();

    if (!enemy.shadow && !enemy.boss) {
      this.enemiesRemainingInWave -= 1;
    }

    // Última criatura da onda: todas as gemas voam até o jogador.
    if (this.enemiesRemainingInWave <= 0) {
      this.attractAllGems();
    }

    this.playKillFeedback(enemy.type);
    this.registerComboKill();
    this.updateHUD();

    this.time.delayedCall(800, () => {
      if (this.gameOver || this.stagePhase !== "normal") return;

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

  // Cria as animações de um spritesheet de inimigo.
  // Layout padrão (zumbi, ghoul, inchado): 8 colunas, linha 0 = idle,
  // linhas 1-8 = caminhada e 9-16 = ataque, 8 quadros cada.
  // Os sprites novos usam 9 colunas/9 quadros e o ataque vem primeiro.
  private createPixelLabEnemyAnimations(
    textureKey: string,
    layout: {
      columns?: number;
      frames?: number;
      attackFirst?: boolean;
      attackFrameRate?: number;
      walkFrameRate?: number;
    } = {},
  ) {
    const columns = layout.columns ?? 8;
    const frames = layout.frames ?? 8;
    const attackFirst = layout.attackFirst ?? false;
    const attackFrameRate = layout.attackFrameRate ?? 16;
    const walkFrameRate = layout.walkFrameRate ?? 12;

    // Ordem das direções na folha: S, SE, E, NE, N, NO, O, SO.
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

      const walkRow = (attackFirst ? 9 : 1) + direction.index;
      const attackRow = (attackFirst ? 1 : 9) + direction.index;

      const walkStart = walkRow * columns;

      this.anims.create({
        key: `${textureKey}-walk-${direction.name}`,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: walkStart,
          end: walkStart + frames - 1,
        }),
        frameRate: walkFrameRate,
        repeat: -1,
      });

      const attackStart = attackRow * columns;

      this.anims.create({
        key: `${textureKey}-attack-${direction.name}`,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: attackStart,
          end: attackStart + frames - 1,
        }),
        frameRate: attackFrameRate,
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

    this.time.delayedCall(this.spitterShotDelay, () => {
      if (enemy.alive && !this.gameOver) {
        this.fireEnemyProjectile(enemy);
      }
    });
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

    // A animação de ataque do sprite (brilho e tremor) é o aviso visual;
    // aqui só esperamos o pavio acabar.

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
    this.playHitSfx(0.9);

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

    if (distance === 0 || distance > this.attackRange) continue;

    const dot = (dx / distance) * facingX + (dy / distance) * facingY;

    // Inimigo colado em você sempre é atingido; os demais precisam estar no cone.
    if (distance > 0.7 && dot < this.attackConeDot) continue;

      this.hitEnemy(enemy, this.playerDamage);
      this.healPlayer(this.lifeStealPerHit);
      this.hitStop(35);
    }
  }

  // Aplica dano a um inimigo (golpe, flecha, bola de fogo, dash ou explosão).
private hitEnemy(
  enemy: Enemy,
  amount: number,
  source: DamageSource = "melee",
) {
  if (!enemy.alive) return;

  if (source !== "synergy") {
    amount = this.resolveSynergies(enemy, amount, source);
  }

  enemy.health -= amount;
  this.playHitSfx(0.6);

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

  if (enemy.health > 0 && source !== "synergy") {
    this.applySourceStatus(enemy, source);
  }

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

    const origins: Record<string, number> = {
      hero: 56 / 68,
      "hero-assassin": 56 / 68,
      "hero-mage": 79 / 94,
    };

    this.player = this.add.sprite(
      position.x,
      position.y,
      this.heroTexture
    );

    this.player.setOrigin(0.5, origins[this.heroTexture] ?? 56 / 68);
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

        if (this.synergies.has("frost-nova")) {
          this.applyStatus(enemy, "chill", 3000);
        }
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

// Vira o personagem para o inimigo mais próximo dentro do alcance da auto-mira.
private aimAtNearestEnemy(): Enemy | null {
  let nearest: Enemy | null = null;
  let best = this.attackAimRange;

  for (const enemy of this.enemies) {
    if (!enemy.alive) continue;
    const d = Math.hypot(enemy.x - this.worldX, enemy.y - this.worldY);
    if (d < best) {
      best = d;
      nearest = enemy;
    }
  }

  if (!nearest) return null;

  const dx = nearest.x - this.worldX;
  const dy = nearest.y - this.worldY;

  this.facingX = dx;
  this.facingY = dy;

  if (Math.abs(dx) > Math.abs(dy)) {
    this.facingDirection = dx > 0 ? "east" : "west";
  } else {
    this.facingDirection = dy > 0 ? "south" : "north";
  }

  return nearest;
}

// Pequeno avanço na direção do alvo, para o golpe alcançar quem está se afastando.
private lungeToward(target: Enemy) {
  const dx = target.x - this.worldX;
  const dy = target.y - this.worldY;
  const dist = Math.hypot(dx, dy);

  if (dist < 0.9) return; // já está colado, não precisa avançar

  const step = Math.min(this.attackLungeDistance, dist - 0.8);
  const nextX = Phaser.Math.Clamp(
    this.worldX + (dx / dist) * step, 0.2, this.arenaSize - 0.2
  );
  const nextY = Phaser.Math.Clamp(
    this.worldY + (dy / dist) * step, 0.2, this.arenaSize - 0.2
  );

  if (!this.collidesAt(nextX, this.worldY)) this.worldX = nextX;
  if (!this.collidesAt(this.worldX, nextY)) this.worldY = nextY;

  this.updatePlayerPosition();
}

  private performAttack() {

   if (this.isAttacking) return;

   // Impede ataques muito rápidos.
    if (this.time.now < this.nextAttackTime) {
      return;
    }

    this.isAttacking = true;

    const target = this.aimAtNearestEnemy();
    if (target) this.lungeToward(target);

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

  // ---------------------------------------------------------------------
// Estágios, portal, sombras e chefe
// ---------------------------------------------------------------------

private formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

private createStageHUD() {
  this.stageText = this.add
    .text(this.scale.width / 2, 118, "", {
      fontFamily: "monospace",
      fontSize: "18px",
      fontStyle: "bold",
      color: "#e9d5ff",
      backgroundColor: "#0b0812",
      padding: { x: 14, y: 8 },
      align: "center",
    })
    .setOrigin(0.5, 0)
    .setScrollFactor(0)
    .setDepth(10001);

  this.bossBar = this.add.graphics().setScrollFactor(0).setDepth(10001);
}

private updateStageHUD() {
  const head = `ESTÁGIO ${this.currentStage}/${this.finalStage}`;

  if (this.stagePhase === "normal") {
    this.stageText.setText(
      `${head}   TEMPO ${this.formatTime(Math.ceil(this.stageTimeLeft / 1000))}`,
    );
  } else if (this.stagePhase === "boss") {
    this.stageText.setText(`${head}   GUARDIÃO DA FENDA`);
  } else {
    this.stageText.setText(
      this.bossDefeated
        ? "CHEFE DERROTADO - ENTRE NA SAÍDA OU SOBREVIVA ÀS SOMBRAS"
        : "O PORTAL ABRIU - ENTRE NELE ANTES QUE AS SOMBRAS CHEGUEM",
    );
  }

  // Barra de vida grande do chefe.
  this.bossBar.clear();
  const boss = this.bossEnemy;

  if (boss && boss.alive) {
    const w = Math.min(this.scale.width - 120, 520);
    const x = (this.scale.width - w) / 2;
    const ratio = Phaser.Math.Clamp(boss.health / boss.maxHealth, 0, 1);

    this.bossBar.fillStyle(0x1f2937, 0.95);
    this.bossBar.fillRoundedRect(x, 160, w, 16, 6);
    this.bossBar.fillStyle(0xdc2626, 1);
    this.bossBar.fillRoundedRect(x, 160, w * ratio, 16, 6);
    this.bossBar.lineStyle(2, 0xfecaca, 0.9);
    this.bossBar.strokeRoundedRect(x, 160, w, 16, 6);
  }
}

private showStageBanner(text: string) {
  const banner = this.add
    .text(this.scale.width / 2, this.scale.height * 0.3, text, {
      fontFamily: "monospace",
      fontSize: "32px",
      fontStyle: "bold",
      color: "#f5f3ff",
      stroke: "#2e1065",
      strokeThickness: 6,
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(10002);

  this.tweens.add({
    targets: banner,
    alpha: 0,
    y: banner.y - 30,
    delay: 1800,
    duration: 700,
    onComplete: () => banner.destroy(),
  });
}

private updateStageSystem(delta: number) {
  this.survivalMs += delta;

  if (this.stagePhase === "normal") {
    this.stageTimeLeft -= delta;
    if (this.stageTimeLeft <= 0) this.openPortal();
  } else if (this.stagePhase === "portal") {
    this.overtimeMs += delta;
    this.updateShadows(delta);
    this.checkPortalEntry();
  } else {
    this.updateBoss();
  }

  this.updateStageHUD();
}

// Procura um ponto livre ao redor do jogador.
private findSpawnPoint(minDist: number, maxDist: number) {
  const margin = 0.8;
  const max = this.arenaSize - margin;

  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.FloatBetween(minDist, maxDist);
    const x = this.worldX + Math.cos(angle) * distance;
    const y = this.worldY + Math.sin(angle) * distance;

    if (x < margin || y < margin || x > max || y > max) continue;
    if (this.collidesAt(x, y)) continue;
    if (this.enemies.some((e) => Math.hypot(e.x - x, e.y - y) < 1.2)) continue;

    return { x, y };
  }

  return { x: this.arenaSize / 2, y: this.arenaSize / 2 };
}

// ----- Portal -----

private openPortal() {
  this.stagePhase = "portal";
  this.overtimeMs = 0;
  this.shadowSpawnTimer = 0;
  this.enemiesToSpawn = 0; // para de agendar inimigos comuns

  const spot = this.findSpawnPoint(4, 6);
  const pos = this.projectPosition(spot.x, spot.y);

  const container = this.add.container(pos.x, pos.y).setDepth(pos.y);
  const glow = this.add.ellipse(0, -20, 70, 90, 0x7c3aed, 0.35);
  const core = this.add.ellipse(0, -20, 38, 56, 0x4c1d95, 0.95);
  const ring = this.add.ellipse(0, -20, 54, 74, 0x000000, 0);
  ring.setStrokeStyle(4, 0xc4b5fd);

  const label = this.add
    .text(0, -78, this.currentStage >= this.finalStage ? "SAÍDA" : "PORTAL", {
      fontFamily: "monospace",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#ede9fe",
    })
    .setOrigin(0.5);

  container.add([glow, core, ring, label]);

  this.tweens.add({
    targets: glow,
    scaleX: 1.3,
    scaleY: 1.15,
    alpha: 0.12,
    duration: 700,
    yoyo: true,
    repeat: -1,
  });
  this.tweens.add({
    targets: ring,
    scaleX: 1.12,
    scaleY: 1.08,
    duration: 500,
    yoyo: true,
    repeat: -1,
  });

  this.portal = { x: spot.x, y: spot.y, container };
  this.showStageBanner(
    this.currentStage >= this.finalStage ? "A SAÍDA SE ABRIU!" : "O PORTAL SE ABRIU!",
  );
}

private checkPortalEntry() {
  if (!this.portal) return;

  const dist = Math.hypot(this.portal.x - this.worldX, this.portal.y - this.worldY);
  if (dist > 0.8) return;

  this.portal.container.destroy();
  this.portal = undefined;

  if (this.currentStage >= this.finalStage) {
    this.endRun("victory");
    return;
  }

  this.startStage(this.currentStage + 1);
}

private startStage(stage: number) {
  this.currentStage = stage;
  this.overtimeMs = 0;

  this.clearAllEnemies();
  this.attractAllGems();

  this.worldX = this.arenaSize / 2;
  this.worldY = this.arenaSize / 2;
  this.updatePlayerPosition();

  this.applyStageTheme();
  this.cameras.main.flash(600, 196, 181, 253);

  if (stage >= this.finalStage) {
    this.stagePhase = "boss";
    this.enemiesRemainingInWave = 0;
    this.enemiesToSpawn = 0;
    this.showStageBanner("ESTÁGIO FINAL");

    this.time.delayedCall(2000, () => {
      if (!this.gameOver) this.spawnBoss();
    });
  } else {
    this.stagePhase = "normal";
    this.stageTimeLeft = this.stageDuration;
    this.enemiesRemainingInWave = this.getWaveEnemyCount(this.wave);
    this.enemiesToSpawn = this.enemiesRemainingInWave;
    this.showStageBanner(`ESTÁGIO ${stage}`);
    this.fillEnemies();
  }

  this.updateHUD();
}

private applyStageTheme() {
  const tints = [0xffffff, 0xd9a066, 0x9d8cff]; // estágios 1, 2, 3
  const tint = tints[this.currentStage - 1] ?? 0xffffff;

  for (const tile of this.arenaTiles) tile.setTint(tint);
}

private clearAllEnemies() {
  for (const enemy of [...this.enemies]) {
    enemy.alive = false;
    this.createEnemyDeathEffect(
      enemy.container.x,
      enemy.container.y,
      this.getEnemyColor(enemy.type),
    );
    enemy.container.destroy();
  }
  this.enemies = [];
  this.bossEnemy = undefined;

  for (const p of this.enemyProjectiles) p.shape.destroy();
  this.enemyProjectiles = [];
}

// ----- Sombras -----

private updateShadows(delta: number) {
  this.shadowSpawnTimer += delta;

  // Dificuldade cresce com o tempo no estágio e com o número do estágio.
  const minutes = this.overtimeMs / 60000 + (this.currentStage - 1) * 0.75;

  const interval = Math.max(450, 2200 - minutes * 450); // ms entre spawns
  const maxShadows = Math.min(6 + Math.floor(minutes * 3), 40);

  if (this.shadowSpawnTimer < interval) return;
  this.shadowSpawnTimer = 0;

  const alive = this.enemies.filter((e) => e.shadow).length;
  if (alive >= maxShadows) return;

  this.spawnShadow(minutes);
}

private spawnShadow(minutes: number) {
  const spot = this.findSpawnPoint(4, 7);
  const enemy = this.createEnemy(this.pickEnemyType(), spot.x, spot.y);

  const hpMult = 1 + minutes * 0.4;
  const speedMult = Math.min(1 + minutes * 0.08, 1.5);

  enemy.shadow = true;
  enemy.maxHealth = Math.ceil(enemy.maxHealth * hpMult);
  enemy.health = enemy.maxHealth;
  enemy.speed *= speedMult;
  enemy.sprite.setTint(0x2e1065);

  this.updateEnemyHealthBar(enemy);
  this.enemies.push(enemy);
}

// ----- Chefe -----

private spawnBoss() {
  const spot = this.findSpawnPoint(5, 7);
  const boss = this.createEnemy("brute", spot.x, spot.y);

  boss.boss = true;
  boss.maxHealth = 60 + this.wave * 5; // ajuste conforme o dano do jogador
  boss.health = boss.maxHealth;
  boss.speed = 1.1;
  boss.sprite.setScale(2.6).setTint(0xff6b6b);

  this.updateEnemyHealthBar(boss);
  this.enemies.push(boss);

  this.bossEnemy = boss;
  this.nextBossShotTime = this.time.now + 3000;
  this.showStageBanner("O GUARDIÃO DA FENDA APARECEU!");
}

// A cada 4 s dispara uma rajada de 3 projéteis na direção do jogador.
private updateBoss() {
  const boss = this.bossEnemy;
  if (!boss || !boss.alive) return;
  if (this.time.now < this.nextBossShotTime) return;

  this.nextBossShotTime = this.time.now + 4000;

  for (let i = 0; i < 3; i++) {
    this.time.delayedCall(i * 200, () => {
      if (boss.alive && !this.gameOver) this.fireEnemyProjectile(boss);
    });
  }
}

private onBossDefeated() {
  this.bossDefeated = true;
  this.bossEnemy = undefined;
  this.showStageBanner("CHEFE DERROTADO!");

  this.time.delayedCall(1200, () => {
    if (!this.gameOver) this.openPortal();
  });
}

// ----- Fim de jogo (vitória ou derrota) -----

private endRun(result: "victory" | "defeat") {
  if (this.gameOver) return;
  this.gameOver = true;

  const bestWave = saveBestWave(this.wave);
  const survivalTime = Math.floor(this.survivalMs / 1000);

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
    result,
    wave: this.wave,
    bestWave,
    survivalTime,
    stage: this.currentStage,
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

    this.createComboHUD();
    this.updateHUD();
  }

  // ---------------------------------------------------------------------
  // Combo de mortes seguidas
  // ---------------------------------------------------------------------

  // Cor do combo, que "esquenta" conforme ele cresce.
  private getComboColor(count: number): number {
    if (count >= 50) return 0xf87171; // vermelho
    if (count >= 20) return 0xfb923c; // laranja
    if (count >= 10) return 0xfbbf24; // âmbar
    if (count >= 5) return 0x67e8f9; // ciano
    return 0xe9d5ff; // lilás
  }

  private toCssColor(color: number): string {
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  private createComboHUD() {
    // Canto superior direito, logo abaixo do painel do HUD.
    const x = this.scale.width - 28;

    this.comboLabel = this.add
      .text(x, 118, "COMBO", {
        fontFamily: "monospace",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#e9d5ff",
        stroke: "#1f102e",
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(10001);

    this.comboText = this.add
      .text(x, 152, "x2", {
        fontFamily: "monospace",
        fontSize: "40px",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#1f102e",
        strokeThickness: 6,
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(10001);

    this.comboBar = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(10001);

    this.comboBestText = this.add
      .text(x, 190, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "bold",
        color: "#a78bfa",
        stroke: "#1f102e",
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(10001);

    this.refreshComboHUD();
  }

  // Barrinha que esvazia mostrando quanto tempo falta para o combo acabar.
  private drawComboBar() {
    const width = 120;
    const height = 5;
    const x = this.scale.width - 28 - width;
    const y = 178;

    const ratio = Phaser.Math.Clamp(this.comboTimeLeft / this.comboWindow, 0, 1);

    this.comboBar.clear();
    this.comboBar.fillStyle(0x1f102e, 0.85);
    this.comboBar.fillRect(x, y, width, height);
    this.comboBar.fillStyle(this.getComboColor(this.comboCount), 1);
    this.comboBar.fillRect(x, y, width * ratio, height);
  }

  // Mostra/esconde e atualiza os textos. O combo só aparece a partir de x2.
  private refreshComboHUD() {
    const active = this.comboCount >= 2;

    this.comboLabel.setVisible(active);
    this.comboText.setVisible(active);
    this.comboBar.setVisible(active);

    if (active) {
      const css = this.toCssColor(this.getComboColor(this.comboCount));

      this.comboText.setText(`x${this.comboCount}`);
      this.comboText.setColor(css);
      this.comboLabel.setColor(css);
      this.drawComboBar();
    }

    this.comboBestText.setText(
      this.bestCombo >= 2 ? `MELHOR: x${this.bestCombo}` : "",
    );
  }

  // Chamado a cada inimigo morto.
  private registerComboKill() {
    this.comboCount++;
    this.comboTimeLeft = this.comboWindow;

    if (this.comboCount > this.bestCombo) {
      this.bestCombo = this.comboCount;
    }

    this.refreshComboHUD();

    if (this.comboCount >= 2) {
      // "Pulinho" no número a cada morte; o combo maior fica um pouco maior.
      const baseScale = Math.min(1.5, 1 + this.comboCount / 60);

      this.tweens.killTweensOf(this.comboText);
      this.comboText.setScale(baseScale * 1.35);

      this.tweens.add({
        targets: this.comboText,
        scale: baseScale,
        duration: 180,
        ease: "Back.easeOut",
      });
    }

    const count = this.comboCount;

    if (count === 10 || count === 25 || (count >= 50 && count % 50 === 0)) {
      this.showComboMilestone(count);
    }
  }

  // Avança o tempo do combo. Fica parado enquanto não há inimigos na arena,
  // para o combo não acabar no intervalo entre as ondas.
  private updateCombo(delta: number) {
    if (this.comboCount === 0 || this.enemies.length === 0) return;

    this.comboTimeLeft -= delta;

    if (this.comboTimeLeft <= 0) {
      this.endCombo();
      return;
    }

    this.drawComboBar();
  }

  private endCombo() {
    const finalCount = this.comboCount;

    this.comboCount = 0;
    this.comboTimeLeft = 0;
    this.refreshComboHUD();

    // Resumo discreto de combos relevantes.
    if (finalCount >= 5) {
      const summary = this.add
        .text(this.scale.width - 28, 152, `${finalCount} MORTES SEGUIDAS`, {
          fontFamily: "monospace",
          fontSize: "14px",
          fontStyle: "bold",
          color: this.toCssColor(this.getComboColor(finalCount)),
          stroke: "#1f102e",
          strokeThickness: 4,
        })
        .setOrigin(1, 0.5)
        .setScrollFactor(0)
        .setDepth(10001);

      this.tweens.add({
        targets: summary,
        y: summary.y - 24,
        alpha: 0,
        duration: 1100,
        ease: "Cubic.easeOut",
        onComplete: () => summary.destroy(),
      });
    }
  }

  // Aviso grande no centro da tela nos marcos do combo (10, 25, 50, 100...).
  private showComboMilestone(count: number) {
    const css = this.toCssColor(this.getComboColor(count));

    const banner = this.add
      .text(this.scale.width / 2, 150, `COMBO x${count}!`, {
        fontFamily: "monospace",
        fontSize: "34px",
        fontStyle: "bold",
        color: css,
        stroke: "#1f102e",
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10002)
      .setScale(0.6);

    this.tweens.add({
      targets: banner,
      scale: 1.15,
      duration: 200,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          alpha: 0,
          y: banner.y - 20,
          delay: 500,
          duration: 450,
          ease: "Cubic.easeIn",
          onComplete: () => banner.destroy(),
        });
      },
    });
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
      // Matar o chefe já garante a vitória, mesmo morrendo para as sombras.
      this.endRun(this.bossDefeated ? "victory" : "defeat");
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

    if (this.frostLevel > 0 && now >= this.nextFrostTime) {
    this.nextFrostTime = now + Math.max(700, 1800 - (this.frostLevel - 1) * 200);

    const damage =
      Math.max(1, Math.ceil(this.playerDamage / 2)) + (this.frostLevel - 1);

    this.fireProjectile("frost", damage);
  }

  if (this.lightningLevel > 0 && now >= this.nextLightningTime) {
    this.nextLightningTime =
      now + Math.max(1200, 2600 - (this.lightningLevel - 1) * 300);

    this.castLightning();
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

    // Usa o sprite do PixelLab se ele foi carregado; senão, o desenho provisório.
  private createProjectileShape(
    kind: "arrow" | "fireball" | "frost",
  ):
    | Phaser.GameObjects.Shape
    | Phaser.GameObjects.Sprite
    | Phaser.GameObjects.Container {
    if (kind === "fireball") {
      if (this.textures.exists("proj-fireball")) {
        // O pivô do giro fica no miolo da bola (e não no centro do quadro),
        // assim a cauda gira ATRÁS da bola e o acerto continua no lugar certo.
        return this.add.sprite(0, 0, "proj-fireball").setOrigin(0.7, 0.48);
      }

      return this.add.circle(0, 0, 8, 0xf97316).setStrokeStyle(3, 0xef4444);
    }

    if (kind === "frost") {
      return this.add.circle(0, 0, 6, 0x7dd3fc).setStrokeStyle(2, 0xe0f2fe);
    }

    if (this.textures.exists("proj-arrow")) {
      // A flecha é escura e pequena: um brilho violeta atrás dela a mantém
      // visível sobre o chão da arena.
      const glow = this.add.circle(2, 0, 8, 0xc4b5fd, 0.3);
      const arrow = this.add.sprite(0, 0, "proj-arrow");

      return this.add.container(0, 0, [glow, arrow]);
    }

    return this.add.rectangle(0, 0, 16, 3, 0xfde68a);
  }

 private fireProjectile(kind: "arrow" | "fireball" | "frost", damage: number) {
  const target = this.getNearestEnemy();

  if (!target) return;

  const dx = target.x - this.worldX;
  const dy = target.y - this.worldY;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) return;

  const dirX = dx / distance;
  const dirY = dy / distance;

  const shape = this.createProjectileShape(kind);

  // Gira a flecha para apontar na direção visual (isométrica).
  shape.setRotation(
    Math.atan2(
      (dirX + dirY) * (this.tileHeight / 2),
      (dirX - dirY) * (this.tileWidth / 2),
    ),
  );

  const source: DamageSource =
    kind === "fireball" ? "fire" : kind === "frost" ? "ice" : "arrow";

  const statuses: ("burn" | "chill")[] = [];

  if (kind === "arrow" && this.synergies.has("elemental-arrows")) {
    if (this.fireballLevel > 0) statuses.push("burn");
    if (this.frostLevel > 0) statuses.push("chill");
  }

  const projectile: Projectile = {
    shape,
    x: this.worldX,
    y: this.worldY,
    dirX,
    dirY,
    speed: kind === "fireball" ? 5 : kind === "frost" ? 7 : 9,
    damage,
    expiresAt: this.time.now + 2000,
    source,
    statuses,
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
        this.hitEnemy(target, projectile.damage, projectile.source ?? "arrow");

        for (const status of projectile.statuses ?? []) {
          this.applyStatus(target, status, status === "burn" ? 3000 : 2500);
        }

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

    this.updateStageSystem(delta);
    if (this.gameOver) return;

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
    this.updateCombo(delta);
    this.updateEnemies(delta);
    this.updateEnemyProjectiles(delta);
    this.takeDamage();

    if (this.gameOver) {
      return;
    }

    this.updateAura();
    this.updateClassSynergies();
    this.updateStatuses();
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