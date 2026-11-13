# ⚔️ Riftbound

**Riftbound** é um jogo de ação e sobrevivência com elementos de roguelite, desenvolvido com **React, TypeScript e Phaser 3**.

O jogador enfrenta ondas infinitas de inimigos em uma arena, acumula experiência, evolui seu personagem e escolhe melhorias para sobreviver pelo maior tempo possível.

O projeto foi desenvolvido com o objetivo de praticar desenvolvimento de jogos, lógica de programação, TypeScript e integração entre tecnologias web e uma engine de jogos.

## 🛠️ Tecnologias utilizadas

- **React** — construção da interface.
- **TypeScript** — tipagem e organização do código.
- **Phaser 3** — engine responsável pela lógica e renderização do jogo.
- **Vite** — ambiente de desenvolvimento e build.
- **Tailwind CSS** — estilização das interfaces.

## ✨ Funcionalidades

### ⚔️ Sistema de combate
- Movimentação do personagem em arena isométrica.
- Ataques manuais.
- Esquiva.
- Colisões com obstáculos.
- Sistema de vida e dano.
- Efeitos visuais de combate e números de dano.

### 👾 Sistema de inimigos
- Ondas infinitas de inimigos.
- Diferentes tipos de inimigos, incluindo:
  - Normais.
  - Velozes.
  - Resistentes.
- Aumento progressivo da dificuldade.

### 🧙 Classes de personagens

O jogador pode escolher entre três classes:

| Classe | Características | Habilidade especial |
|---|---|---|
| Guerreiro | Maior resistência | Escudo defensivo |
| Assassino | Maior velocidade | Investida sombria |
| Mago | Maior dano | Explosão arcana |

### ⭐ Progressão
- Sistema de experiência.
- Evolução de nível.
- Melhorias de atributos durante a partida.
- Histórico das últimas partidas.
- Recorde de maior onda alcançada.

### 🏆 Estatísticas e conquistas
- Total de partidas.
- Tempo total de sobrevivência.
- Maior onda alcançada.
- Maior nível atingido.
- Total de inimigos derrotados.
- Sistema de conquistas desbloqueáveis.

### ⚙️ Configurações
- Controle de volume dos efeitos sonoros.
- Controle de música.
- Persistência das configurações.
- Modo de tela cheia.
- Menu de pausa.

### 💾 Persistência de dados
O jogo utiliza `localStorage` para armazenar informações localmente, incluindo:

- Recordes.
- Histórico de partidas.
- Estatísticas acumuladas.
- Conquistas desbloqueadas.
- Configurações de áudio.

## 🎯 Controles

| Tecla | Ação |
|---|---|
| W | Movimentar para cima |
| A | Movimentar para esquerda |
| S | Movimentar para baixo |
| D | Movimentar para direita |
| J | Atacar |
| K | Ativar habilidade especial |
| Espaço | Esquivar |
| ESC | Pausar o jogo |

## 🚀 Como executar o projeto

### Pré-requisitos

- Node.js instalado.
- npm instalado.
- Git instalado.

### 1. Clonar o repositório

```bash
git clone https://github.com/Gabrielmedeiros1999/riftbound.git
```

### 2. Entrar na pasta do projeto

```bash
cd Riftbound
```

### 3. Instalar as dependências

```bash
npm install
```

### 4. Executar em ambiente de desenvolvimento

```bash
npm run dev
```

O Vite exibirá o endereço local para acessar o jogo pelo navegador.

### 5. Gerar a versão de produção

```bash
npm run build
```

## 📁 Estrutura do projeto

```text
src/
├── game/
│   ├── scenes/
│   │   ├── MenuScene.ts
│   │   ├── ArenaScene.ts
│   │   ├── EndScene.ts
│   │   ├── PauseScene.ts
│   │   ├── SelectionScene.ts
│   │   ├── StatisticsScene.ts
│   │   └── AchievementsScene.ts
│   │
│   └── utils/
│       ├── abilities.ts
│       ├── achievements.ts
│       ├── characterClasses.ts
│       ├── history.ts
│       ├── permanentStats.ts
│       ├── records.ts
│       ├── statistics.ts
│       └── settings.ts
│
public/
└── assets/
    ├── audio/
    ├── characters/
    ├── terrain/
    └── enemies/
```

*Estrutura baseada nos arquivos e sistemas atualmente desenvolvidos; outros arquivos podem existir no projeto.*

## 📌 Objetivos de desenvolvimento

O Riftbound é um projeto de aprendizado contínuo, com foco em:

- Aprimorar conhecimentos em TypeScript.
- Trabalhar com Phaser 3 e desenvolvimento de jogos.
- Desenvolver sistemas de combate e progressão.
- Praticar organização de código e separação de responsabilidades.
- Implementar interfaces e sistemas de persistência.
- Trabalhar com animações, colisões e efeitos visuais.

## 👨‍💻 Desenvolvedor

**Gabriel C. Medeiros**

Estudante de Análise e Desenvolvimento de Sistemas, interessado em desenvolvimento de software, aplicações web e desenvolvimento de jogos.

- GitHub: [Gabrielmedeiros1999](https://github.com/Gabrielmedeiros1999)
- Portfólio: [Meu portfólio](https://portfolio-weld-omega-83.vercel.app/)

---

*Riftbound — Sobreviva às ondas, evolua e enfrente seus limites.*
