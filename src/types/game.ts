import { Card } from "../generated/prisma/client";

/**
 * État d'une carte en jeu sur le terrain
 */
export interface ActiveCard {
    card: Card;
    currentHp: number;
}

/**
 * État d'un joueur dans la partie
 */
export interface GamePlayer {
    userId: number;
    socketId: string;
    username: string;
    hand: Card[];
    activeCard: ActiveCard | null;
    deck: Card[];
    score: number;
}

/**
 * États possibles d'une partie
 */
export enum GameStatus {
    WAITING = "waiting",
    STARTED = "started",
    ENDED = "ended",
}

/**
 * État complet d'une partie
 */
export interface GameState {
    roomId: number;
    player1: GamePlayer;
    player2: GamePlayer;
    currentPlayerSocketId: string;
    status: GameStatus;
    winner: GamePlayer | null;
    createdAt: Date;
}

/**
 * Vue de la partie adaptée au joueur actuel
 * (cache la main et le deck de l'adversaire)
 */
export interface GameStateView {
    roomId: number;
    player: {
        userId: number;
        username: string;
        handSize: number; // Nombre de cartes en main, pas les cartes elles-mêmes
        hand: Card[]; // Les cartes en main du joueur actuel uniquement
        activeCard: ActiveCard | null;
        deckSize: number; // Nombre de cartes restantes dans le deck
        score: number;
    };
    opponent: {
        userId: number;
        username: string;
        handSize: number; // Nombre de cartes en main (hidden)
        activeCard: ActiveCard | null; // Pas de détails sur les cartes cachées
        deckSize: number;
        score: number;
    };
    currentPlayerSocketId: string;
    status: GameStatus;
    winner: GamePlayer | null;
    createdAt: Date;
}

/**
 * Réponse standard pour les événements Socket.io
 */
export interface SocketResponse<T = null> {
    success: boolean;
    message?: string;
    data?: T;
}

/**
 * Payload pour les actions de jeu
 */
export interface DrawCardsPayload {
    roomId: number;
}

export interface PlayCardPayload {
    roomId: number;
    cardIndex: number;
}

export interface AttackPayload {
    roomId: number;
}

export interface EndTurnPayload {
    roomId: number;
}
