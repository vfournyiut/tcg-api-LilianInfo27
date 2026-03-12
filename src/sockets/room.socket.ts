import { Server, Socket } from "socket.io";
import { prisma } from "../database";
import { gameService } from "../utils/game.service";
import { Card } from "../generated/prisma/client";

/**
 * Interface pour les paramètres de création de room
 */
export interface CreateRoomPayload {
    deckId: number;
}

/**
 * Interface pour les paramètres de jointure de room
 */
export interface JoinRoomPayload {
    roomId: number;
    deckId: number;
    username: string;
}

/**
 * Map pour stocker les rooms avec les joueurs qui attendent
 */
interface WaitingRoom {
    roomId: number;
    player1: {
        userId: number;
        socketId: string;
        username: string;
        deckId: number;
    };
    createdAt: Date;
}

const waitingRooms: Map<number, WaitingRoom> = new Map();
let nextRoomId = 1;

/**
 * Configure les événements Socket.io pour la gestion des rooms
 */
export function setupRoomSocket(io: Server): void {
    io.on("connection", (socket: Socket) => {
        /**
         * Event: createRoom
         * Crée une nouvelle room et attend un deuxième joueur
         */
        socket.on("createRoom", async (payload: CreateRoomPayload, callback) => {
            try {
                const { deckId } = payload;

                // Vérifier que le deck existe
                const deck = await prisma.deck.findUnique({
                    where: { id: deckId },
                    include: { cards: { include: { card: true } }, user: true },
                });

                if (!deck) {
                    return callback({
                        success: false,
                        message: "Deck non trouvé",
                    });
                }

                if (!deck.user) {
                    return callback({
                        success: false,
                        message: "Utilisateur du deck non trouvé",
                    });
                }

                const roomId = nextRoomId++;

                const waitingRoom: WaitingRoom = {
                    roomId,
                    player1: {
                        userId: deck.userId,
                        socketId: socket.id,
                        username: deck.user.username,
                        deckId,
                    },
                    createdAt: new Date(),
                };

                waitingRooms.set(roomId, waitingRoom);

                // Joindre la room
                socket.join(`room-${roomId}`);

                callback({
                    success: true,
                    data: { roomId },
                });

                console.log(`[Room] Créée: ${roomId} par ${deck.user.username}`);
            } catch (err) {
                console.error("Create room error:", err);
                callback({
                    success: false,
                    message: "Erreur serveur",
                });
            }
        });

        /**
         * Event: joinRoom
         * Joint une room existante et lance la partie si les deux joueurs sont présents
         */
        socket.on("joinRoom", async (payload: JoinRoomPayload, callback) => {
            try {
                const { roomId, deckId } = payload;

                const waitingRoom = waitingRooms.get(roomId);

                if (!waitingRoom) {
                    return callback({
                        success: false,
                        message: "Room non trouvée",
                    });
                }

                // Vérifier que le joueur n'est pas le créateur
                if (waitingRoom.player1.socketId === socket.id) {
                    return callback({
                        success: false,
                        message: "Vous êtes déjà dans cette room",
                    });
                }

                // Récupérer le deck du joueur 2
                const deck2 = await prisma.deck.findUnique({
                    where: { id: deckId },
                    include: { cards: { include: { card: true } }, user: true },
                });

                if (!deck2) {
                    return callback({
                        success: false,
                        message: "Votre deck n'a pas été trouvé",
                    });
                }

                // Récupérer le deck du joueur 1
                const deck1 = await prisma.deck.findUnique({
                    where: { id: waitingRoom.player1.deckId },
                    include: { cards: { include: { card: true } }, user: true },
                });

                if (!deck1) {
                    return callback({
                        success: false,
                        message: "Deck du joueur 1 non trouvé",
                    });
                }

                if (!deck1.user || !deck2.user) {
                    return callback({
                        success: false,
                        message: "Erreur utilisateur",
                    });
                }

                // Joindre la room
                socket.join(`room-${roomId}`);

                // Créer le jeu
                const cards1: Card[] = deck1.cards.map((dc) => dc.card);
                const cards2: Card[] = deck2.cards.map((dc) => dc.card);

                const game = gameService.createGame(
                    roomId,
                    deck1.user.id,
                    waitingRoom.player1.socketId,
                    deck1.user.username,
                    deck2.user.id,
                    socket.id,
                    deck2.user.username,
                    {
                        [deck1.user.id]: cards1,
                        [deck2.user.id]: cards2,
                    }
                );

                // Supprimer la room de la liste d'attente
                waitingRooms.delete(roomId);

                callback({
                    success: true,
                    message: "Partie lancée",
                });

                // Notifier les deux joueurs que la partie a commencé
                io.to(`room-${roomId}`).emit("gameStarted", {
                    success: true,
                    data: {
                        roomId: game.roomId,
                        players: {
                            player1: {
                                userId: game.player1.userId,
                                username: game.player1.username,
                            },
                            player2: {
                                userId: game.player2.userId,
                                username: game.player2.username,
                            },
                        },
                        currentPlayerSocketId: game.currentPlayerSocketId,
                    },
                });

                // Envoyer l'état du jeu initial aux deux joueurs
                gameService.broadcastGameState(io, roomId);

                console.log(
                    `[Game] Lancée: ${roomId} - ${deck1.user.username} vs ${deck2.user.username}`
                );
            } catch (err) {
                console.error("Join room error:", err);
                callback({
                    success: false,
                    message: "Erreur serveur",
                });
            }
        });

        /**
         * Event: listWaitingRooms
         * Liste toutes les rooms en attente
         */
        socket.on("listWaitingRooms", (callback) => {
            const rooms = Array.from(waitingRooms.values()).map((room) => ({
                roomId: room.roomId,
                player1Username: room.player1.username,
                createdAt: room.createdAt,
            }));

            callback({
                success: true,
                data: rooms,
            });
        });

        /**
         * Event: disconnect
         */
        socket.on("disconnect", () => {
            console.log(`[Socket.IO] Joueur déconnecté: ${socket.id}`);
            // Nettoyer les rooms si le joueur était en attente
            for (const [roomId, room] of waitingRooms.entries()) {
                if (room.player1.socketId === socket.id) {
                    waitingRooms.delete(roomId);
                    console.log(`[Room] Supprimée: ${roomId}`);
                }
            }
        });
    });
}
