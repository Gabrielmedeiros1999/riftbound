import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { ArenaScene } from "../game/scenes/ArenaScene";
import { MenuScene } from "../game/scenes/MenuScene";
import { EndScene } from "../game/scenes/EndScene";
import { PauseScene } from "../game/scenes/PauseScene";
import { loadSettings } from "../game/utils/settings";

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const settings = loadSettings();

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
      scene: [MenuScene, ArenaScene, EndScene, PauseScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    return () => {
      game.destroy(true);
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}