import { Server, Socket } from "socket.io";
import { gameService } from "../utils/game.service";
import {
    DrawCardsPayload,
    PlayCardPayload,
    AttackPayload,
    EndTurnPayload
} from "../types/game";

/**
 * Configure les événements Socket.io pour le système de jeu
 */
export function setupGameSocket(io: Server): void {
    io.on("connection", (socket: Socket) => {
        console.log(`[Socket.IO] Joueur connecté: ${socket.id}`);

        /**
         * Event: drawCards
         * Pioche des cartes depuis le deck jusqu'à 5 en main
         */
        socket.on("drawCards", (payload: DrawCardsPayload, callback) => {
            const { roomId } = payload;

            const result = gameService.drawCards(roomId, socket.id);

            if (result.success) {
                // Envoyer l'état mis à jour aux deux joueurs
                gameService.broadcastGameState(io, roomId);

                callback({ success: true });
            } else {
                callback({ success: false, message: result.message });
            }
        });

        /**
         * Event: playCard
         * Place une carte de la main sur le terrain
         */
        socket.on("playCard", (payload: PlayCardPayload, callback) => {
            const { roomId, cardIndex } = payload;

            const result = gameService.playCard(roomId, socket.id, cardIndex);

            if (result.success) {
                // Envoyer l'état mis à jour aux deux joueurs
                gameService.broadcastGameState(io, roomId);

                callback({ success: true });
            } else {
                callback({ success: false, message: result.message });
            }
        });

        /**
         * Event: attack
         * Attaque avec la carte active
         */
        socket.on("attack", (payload: AttackPayload, callback) => {
            const { roomId } = payload;

            const result = gameService.attack(roomId, socket.id);

            if (result.success) {
                if (result.gameEnded) {
                    // Envoyer l'événement de fin de partie aux deux joueurs
                    io.to(`room-${roomId}`).emit("gameEnded", {
                        success: true,
                        data: {
                            winner: result.winner,
                        },
                    });
                } else {
                    // Envoyer la mise à jour d'état
                    gameService.broadcastGameState(io, roomId);
                }

                callback({ success: true });
            } else {
                callback({ success: false, message: result.message });
            }
        });

        /**
         * Event: endTurn
         * Termine le tour du joueur
         */
        socket.on("endTurn", (payload: EndTurnPayload, callback) => {
            const { roomId } = payload;

            const result = gameService.endTurn(roomId, socket.id);

            if (result.success) {
                // Envoyer l'état mis à jour aux deux joueurs
                gameService.broadcastGameState(io, roomId);

                callback({ success: true });
            } else {
                callback({ success: false, message: result.message });
            }
        });

        /**
         * Event: disconnect
         * Gère la déconnexion d'un joueur
         */
        socket.on("disconnect", () => {
            console.log(`[Socket.IO] Joueur déconnecté: ${socket.id}`);
            // Ajouter la logique pour terminer la partie si un joueur se déconnecte
        });
    });
}
