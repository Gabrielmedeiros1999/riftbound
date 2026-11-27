
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { ArenaScene } from "../game/scenes/ArenaScene";
import { MenuScene } from "../game/scenes/MenuScene";
import { EndScene } from "../game/scenes/EndScene";
import { PauseScene } from "../game/scenes/PauseScene";
import { StatisticsScene } from "../game/scenes/StatisticsScene";
import { AchievementsScene } from "../game/scenes/AchievementsScene";
import { SelectionScene } from "../game/scenes/SelectionScene";

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: 960,
      height: 640,
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
      container.removeEventListener("pointerdown", enterFullscreen);
      game.destroy(true);
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full bg-slate-950" />;
}
