
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { ArenaScene } from "../game/scenes/ArenaScene";
import { MenuScene } from "../game/scenes/MenuScene";
import { EndScene } from "../game/scenes/EndScene";
import { PauseScene } from "../game/scenes/PauseScene";
import { StatisticsScene } from "../game/scenes/StatisticsScene";
import { AchievementsScene } from "../game/scenes/AchievementsScene";
import { SelectionScene } from "../game/scenes/SelectionScene";

// Calcula o tamanho do jogo conforme o dispositivo e orientação.
function getGameSize() {
  const isTouch = window.matchMedia("(pointer: coarse)").matches;

  if (!isTouch) return { width: 960, height: 640 };

  const portrait = window.innerHeight > window.innerWidth;

  if (portrait) {
    const ratio = window.innerHeight / window.innerWidth;

    return {
      width: 600,
      height: Math.round(Math.min(Math.max(600 * ratio, 800), 1100)),
    };
  }

  const ratio = window.innerWidth / window.innerHeight;

  return {
    width: Math.round(Math.min(Math.max(480 * ratio, 720), 1100)),
    height: 480,
  };
}

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    // Calcula o tamanho inicial do jogo.
    const size = getGameSize();

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: size.width,
      height: size.height,
      backgroundColor: "#0f172a",
      pixelArt: true,
      antialias: false,
      scene: [
        MenuScene,
        ArenaScene,
        EndScene,
        PauseScene,
        StatisticsScene,
        AchievementsScene,
        SelectionScene,
      ],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        fullscreenTarget: container,
      },
    });

    // Detecta mudanças de orientação do celular.
    let lastPortrait = window.innerHeight > window.innerWidth;
    let timer: number | undefined;

    const onResize = () => {
      window.clearTimeout(timer);

      timer = window.setTimeout(() => {
        const portrait = window.innerHeight > window.innerWidth;

        if (portrait === lastPortrait) return;

        lastPortrait = portrait;

        const next = getGameSize();

        game.scale.setGameSize(next.width, next.height);

        // Menu, pausa, fim etc. refazem o layout.
        // A ArenaScene não é reiniciada.
        game.scene.getScenes(true).forEach((s) => {
          if (s.scene.key === "ArenaScene") return;
          if (s.scene.key === "MenuScene") game.registry.set("menuRelayout", true);
          s.scene.restart();
        });
      }, 250);
    };

    if (window.matchMedia("(pointer: coarse)").matches) {
      window.addEventListener("resize", onResize);
    }

    // Mobile: no primeiro toque entra em tela cheia e trava na horizontal.
    // No iOS Safari pode não funcionar; o try/catch ignora a falta de suporte.
    const isTouch = window.matchMedia("(pointer: coarse)").matches;

    const enterFullscreen = async () => {
      try {
        if (!document.fullscreenElement) {
          await container.requestFullscreen();
        }

        await (screen.orientation as any).lock?.("landscape");
      } catch {
        // Sem suporte: segue o jogo normalmente.
      }
    };

    if (isTouch) {
      container.addEventListener("pointerdown", enterFullscreen, {
        once: true,
      });
    }

    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(timer);
      container.removeEventListener("pointerdown", enterFullscreen);
      game.destroy(true);
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full bg-slate-950" />;
}
