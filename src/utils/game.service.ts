import { Card } from "../generated/prisma/client";
import {
    GameState,
    GamePlayer,
    GameStatus,
    ActiveCard,
    GameStateView,
} from "../types/game";
import { calculateDamage } from "../utils/rules.util";
import { Server } from "socket.io";

/**
 * Service de gestion de la logique du jeu
 */
export class GameService {
    private games: Map<number, GameState> = new Map();

    /**
     * Crée un nouvel état de jeu
     */
    createGame(
        roomId: number,
        userId1: number,
        socketId1: string,
        username1: string,
        userId2: number,
        socketId2: string,
        username2: string,
        decks: { [key: number]: Card[] }
    ): GameState {
        // Shuffle et copier les decks
        const shuffleDeck = (deck: Card[]): Card[] => {
            const shuffled = [...deck];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        };

        const game: GameState = {
            roomId,
            player1: {
                userId: userId1,
                socketId: socketId1,
                username: username1,
                hand: [],
                activeCard: null,
                deck: shuffleDeck(decks[userId1]),
                score: 0,
            },
            player2: {
                userId: userId2,
                socketId: socketId2,
                username: username2,
                hand: [],
                activeCard: null,
                deck: shuffleDeck(decks[userId2]),
                score: 0,
            },
            currentPlayerSocketId: socketId1, // Le créateur commence
            status: GameStatus.STARTED,
            winner: null,
            createdAt: new Date(),
        };

        this.games.set(roomId, game);
        return game;
    }

    /**
     * Récupère l'état du jeu
     */
    getGame(roomId: number): GameState | undefined {
        return this.games.get(roomId);
    }

    /**
     * Obtient la vue adaptée du jeu pour un joueur spécifique
     */
    getGameView(roomId: number, socketId: string): GameStateView | null {
        const game = this.getGame(roomId);
        if (!game) return null;

        const isPlayer1 = game.player1.socketId === socketId;
        const player = isPlayer1 ? game.player1 : game.player2;
        const opponent = isPlayer1 ? game.player2 : game.player1;

        return {
            roomId: game.roomId,
            player: {
                userId: player.userId,
                username: player.username,
                handSize: player.hand.length,
                hand: player.hand, // Les cartes du joueur actuel
                activeCard: player.activeCard,
                deckSize: player.deck.length,
                score: player.score,
            },
            opponent: {
                userId: opponent.userId,
                username: opponent.username,
                handSize: opponent.hand.length, // Nombre visible, pas le contenu
                activeCard: opponent.activeCard,
                deckSize: opponent.deck.length,
                score: opponent.score,
            },
            currentPlayerSocketId: game.currentPlayerSocketId,
            status: game.status,
            winner: game.winner,
            createdAt: game.createdAt,
        };
    }

    /**
     * Envoie l'état du jeu aux deux joueurs (avec vues adaptées)
     */
    broadcastGameState(io: Server, roomId: number): void {
        const game = this.getGame(roomId);
        if (!game) return;

        // Vue pour le joueur 1
        const view1 = this.getGameView(roomId, game.player1.socketId);
        if (view1) {
            io.to(game.player1.socketId).emit("gameStateUpdated", {
                success: true,
                data: view1,
            });
        }

        // Vue pour le joueur 2
        const view2 = this.getGameView(roomId, game.player2.socketId);
        if (view2) {
            io.to(game.player2.socketId).emit("gameStateUpdated", {
                success: true,
                data: view2,
            });
        }
    }

    /**
     * Pioche des cartes jusqu'à atteindre 5
     */
    drawCards(roomId: number, socketId: string): { success: boolean; message?: string } {
        const game = this.getGame(roomId);
        if (!game) return { success: false, message: "Partie non trouvée" };

        // Vérifier que c'est le tour du joueur
        if (game.currentPlayerSocketId !== socketId) {
            return { success: false, message: "Ce n'est pas votre tour" };
        }

        const player = game.player1.socketId === socketId ? game.player1 : game.player2;

        // Piocher jusqu'à 5 cartes
        while (player.hand.length < 5 && player.deck.length > 0) {
            const card = player.deck.shift();
            if (card) player.hand.push(card);
        }

        return { success: true };
    }

    /**
     * Place une carte de la main sur le terrain
     */
    playCard(
        roomId: number,
        socketId: string,
        cardIndex: number
    ): { success: boolean; message?: string } {
        const game = this.getGame(roomId);
        if (!game) return { success: false, message: "Partie non trouvée" };

        // Vérifier que c'est le tour du joueur
        if (game.currentPlayerSocketId !== socketId) {
            return { success: false, message: "Ce n'est pas votre tour" };
        }

        const player = game.player1.socketId === socketId ? game.player1 : game.player2;

        // Vérifier l'index
        if (cardIndex < 0 || cardIndex >= player.hand.length) {
            return { success: false, message: "Index de carte invalide" };
        }

        // Retirer l'ancienne carte active si elle existe
        if (player.activeCard) {
            // La carte est simplement remplacée
        }

        // Placer la nouvelle carte
        const card = player.hand.splice(cardIndex, 1)[0];
        player.activeCard = {
            card,
            currentHp: card.hp,
        };

        return { success: true };
    }

    /**
     * Attaque avec la carte active du joueur
     */
    attack(
        roomId: number,
        socketId: string
    ): {
        success: boolean;
        message?: string;
        gameEnded?: boolean;
        winner?: GamePlayer | null;
    } {
        const game = this.getGame(roomId);
        if (!game) return { success: false, message: "Partie non trouvée" };

        // Vérifier que c'est le tour du joueur
        if (game.currentPlayerSocketId !== socketId) {
            return { success: false, message: "Ce n'est pas votre tour" };
        }

        const attacker = game.player1.socketId === socketId ? game.player1 : game.player2;
        const defender = game.player1.socketId === socketId ? game.player2 : game.player1;

        // Vérifier que les deux joueurs ont une carte active
        if (!attacker.activeCard) {
            return { success: false, message: "Vous n'avez pas de carte active" };
        }

        if (!defender.activeCard) {
            return { success: false, message: "L'adversaire n'a pas de carte active" };
        }

        // Calculer les dégâts
        const damage = calculateDamage(
            attacker.activeCard.card.attack,
            attacker.activeCard.card.type,
            defender.activeCard.card.type
        );

        // Infliger les dégâts
        defender.activeCard.currentHp -= damage;

        // Vérifier si la carte est KO
        if (defender.activeCard.currentHp <= 0) {
            attacker.score += 1;
            defender.activeCard = null;

            // Vérifier si la partie est gagnée
            if (attacker.score >= 3) {
                game.status = GameStatus.ENDED;
                game.winner = attacker;
                return {
                    success: true,
                    gameEnded: true,
                    winner: attacker,
                };
            }
        }

        // Changer de tour
        game.currentPlayerSocketId =
            game.currentPlayerSocketId === game.player1.socketId
                ? game.player2.socketId
                : game.player1.socketId;

        return { success: true };
    }

    /**
     * Termine le tour du joueur
     */
    endTurn(roomId: number, socketId: string): { success: boolean; message?: string } {
        const game = this.getGame(roomId);
        if (!game) return { success: false, message: "Partie non trouvée" };

        // Vérifier que c'est le tour du joueur
        if (game.currentPlayerSocketId !== socketId) {
            return { success: false, message: "Ce n'est pas votre tour" };
        }

        // Changer de tour
        game.currentPlayerSocketId =
            game.currentPlayerSocketId === game.player1.socketId
                ? game.player2.socketId
                : game.player1.socketId;

        return { success: true };
    }

    /**
     * Supprime un jeu
     */
    deleteGame(roomId: number): void {
        this.games.delete(roomId);
    }
}

// Instance unique du service
export const gameService = new GameService();
