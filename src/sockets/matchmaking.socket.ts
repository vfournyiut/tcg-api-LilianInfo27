import { Server, Socket } from 'socket.io';
import { prisma } from '../database';

// Types et structures de données pour le matchmaking
type RoomStatus = 'waiting' | 'in_game';

// Types pour les cartes, les joueurs et les rooms
type MatchCard = {
    id: number;
    name: string;
    hp: number;
    attack: number;
    type: string;
    pokedexNumber: number;
    imgUrl: string | null;
};

type RoomPlayer = {
    userId: number;
    username: string;
    deckId: number;
    cards: MatchCard[];
    socketId: string;
};

type MatchRoom = {
    id: number;
    status: RoomStatus;
    host: RoomPlayer;
    guest: RoomPlayer | null;
    createdAt: string;
};

// Types pour les états de joueur visibles et cachés
type VisiblePlayerState = {
    userId: number;
    username: string;
    deckId: number;
    hand: MatchCard[];
    remainingDeckCount: number;
};

type HiddenCard = {
    hidden: true;
};

type HiddenPlayerState = {
    userId: number;
    username: string;
    deckId: number;
    hand: HiddenCard[];
    remainingDeckCount: number;
};

const HAND_SIZE = 5;

const rooms = new Map<number, MatchRoom>();
let nextRoomId = 1;

// Helper functions
function roomChannel(roomId: number): string {
    return `matchmaking:${roomId}`;
}

// Convertit une valeur en entier positif ou retourne null si ce n'est pas possible
function toPositiveInt(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}

// Sérialise les rooms disponibles pour les clients (sans exposer les cartes)
function serializeAvailableRooms(): Array<{
    roomId: number;
    status: RoomStatus;
    createdAt: string;
    host: {
        userId: number;
        username: string;
    };
}> {
    return Array.from(rooms.values())
        .filter((room) => room.status === 'waiting' && room.guest === null)
        .map((room) => ({
            roomId: room.id,
            status: room.status,
            createdAt: room.createdAt,
            host: {
                userId: room.host.userId,
                username: room.host.username,
            },
        }));
}

// Diffuse la liste des rooms disponibles à tous les clients connectés
function broadcastRoomsList(io: Server): void {
    io.emit('roomsListUpdated', serializeAvailableRooms());
}

// Émet une erreur de matchmaking à un client spécifique
function emitMatchmakingError(socket: Socket, message: string): void {
    socket.emit('matchmakingError', { message });
}

// Valide le deckId fourni, vérifie que le deck appartient à l'utilisateur 
// et contient exactement 10 cartes, puis retourne les cartes du deck
async function getValidatedDeckForUser(userId: number, rawDeckId: unknown): Promise<{ deckId: number; cards: MatchCard[] }> {
    const deckId = toPositiveInt(rawDeckId);
    if (deckId === null) {
        throw new Error('deckId invalide');
    }

    const deck = await prisma.deck.findUnique({
        where: { id: deckId },
        include: {
            cards: {
                include: {
                    card: true,
                },
            },
        },
    });

    if (!deck) {
        throw new Error('Deck introuvable');
    }

    if (deck.userId !== userId) {
        throw new Error('Ce deck ne vous appartient pas');
    }

    if (deck.cards.length !== 10) {
        throw new Error('Deck invalide : il faut exactement 10 cartes');
    }

    const cards: MatchCard[] = deck.cards.map((deckCard) => ({
        id: deckCard.card.id,
        name: deckCard.card.name,
        hp: deckCard.card.hp,
        attack: deckCard.card.attack,
        type: deckCard.card.type,
        pokedexNumber: deckCard.card.pokedexNumber,
        imgUrl: deckCard.card.imgUrl,
    }));

    return { deckId, cards };
}

// Récupère les informations d'affichage d'un utilisateur à partir de son userId, 
// ou lance une erreur si l'utilisateur n'existe pas
async function getUserDisplay(userId: number): Promise<{ userId: number; username: string }>{
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            username: true,
        },
    });

    if (!user) {
        throw new Error('Utilisateur introuvable');
    }

    return {
        userId: user.id,
        username: user.username,
    };
}

// Construit l'état de joueur visible pour le client 
// (main révélée et nombre de cartes restantes dans le deck)
function buildVisiblePlayerState(player: RoomPlayer): VisiblePlayerState {
    const hand = player.cards.slice(0, HAND_SIZE);

    return {
        userId: player.userId,
        username: player.username,
        deckId: player.deckId,
        hand,
        remainingDeckCount: Math.max(player.cards.length - hand.length, 0),
    };
}

// Construit l'état de joueur caché pour l'adversaire 
// (main cachée et nombre de cartes restantes dans le deck)
function buildHiddenPlayerState(player: RoomPlayer): HiddenPlayerState {
    const handSize = Math.min(HAND_SIZE, player.cards.length);
    const hiddenHand: HiddenCard[] = Array.from({ length: handSize }, () => ({ hidden: true }));

    return {
        userId: player.userId,
        username: player.username,
        deckId: player.deckId,
        hand: hiddenHand,
        remainingDeckCount: Math.max(player.cards.length - hiddenHand.length, 0),
    };
}

// Émet l'événement 'gameStarted' aux deux joueurs d'une room lorsque le guest rejoint, 
// en incluant les états de joueur visibles et cachés appropriés
function emitGameStarted(io: Server, room: MatchRoom): void {
    if (!room.guest) {
        return;
    }

    io.to(room.host.socketId).emit('gameStarted', {
        roomId: room.id,
        turnPlayerId: room.host.userId,
        self: buildVisiblePlayerState(room.host),
        opponent: buildHiddenPlayerState(room.guest),
    });

    io.to(room.guest.socketId).emit('gameStarted', {
        roomId: room.id,
        turnPlayerId: room.host.userId,
        self: buildVisiblePlayerState(room.guest),
        opponent: buildHiddenPlayerState(room.host),
    });
}

// Supprime les rooms en statut 'waiting' dont le host correspond au socketId fourni (lorsqu'un client se déconnecte), et diffuse la liste mise à jour des rooms disponibles
function removeWaitingRoomsForSocket(io: Server, socketId: string): void {
    let updated = false;

    for (const [roomId, room] of rooms.entries()) {
        if (room.status === 'waiting' && room.host.socketId === socketId) {
            rooms.delete(roomId);
            updated = true;
        }
    }

    if (updated) {
        broadcastRoomsList(io);
    }
}

// Enregistre les handlers de matchmaking sur le serveur Socket.io
export function registerMatchmakingHandlers(io: Server): void {
    io.on('connection', (socket) => {
        socket.emit('roomsList', serializeAvailableRooms());

        socket.on('getRooms', () => {
            socket.emit('roomsList', serializeAvailableRooms());
        });

        socket.on('createRoom', async (payload: { deckId?: unknown }) => {
            try {
                const userId = toPositiveInt(socket.data.userId);
                if (userId === null) {
                    emitMatchmakingError(socket, 'Utilisateur non authentifié');
                    return;
                }

                const [user, deck] = await Promise.all([
                    getUserDisplay(userId),
                    getValidatedDeckForUser(userId, payload?.deckId),
                ]);

                const roomId = nextRoomId;
                nextRoomId += 1;

                const room: MatchRoom = {
                    id: roomId,
                    status: 'waiting',
                    host: {
                        userId: user.userId,
                        username: user.username,
                        deckId: deck.deckId,
                        cards: deck.cards,
                        socketId: socket.id,
                    },
                    guest: null,
                    createdAt: new Date().toISOString(),
                };

                rooms.set(roomId, room);
                socket.join(roomChannel(roomId));

                socket.emit('roomCreated', {
                    roomId: room.id,
                    status: room.status,
                    createdAt: room.createdAt,
                    host: {
                        userId: room.host.userId,
                        username: room.host.username,
                    },
                });

                broadcastRoomsList(io);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Erreur lors de la création de room';
                emitMatchmakingError(socket, message);
            }
        });

        socket.on('joinRoom', async (payload: { roomId?: unknown; deckId?: unknown }) => {
            try {
                const userId = toPositiveInt(socket.data.userId);
                if (userId === null) {
                    emitMatchmakingError(socket, 'Utilisateur non authentifié');
                    return;
                }

                const roomId = toPositiveInt(payload?.roomId);
                if (roomId === null) {
                    emitMatchmakingError(socket, 'roomId invalide');
                    return;
                }

                const room = rooms.get(roomId);
                if (!room) {
                    emitMatchmakingError(socket, 'Room inexistante');
                    return;
                }

                if (room.status !== 'waiting' || room.guest !== null) {
                    emitMatchmakingError(socket, 'Room déjà complète');
                    return;
                }

                if (room.host.userId === userId) {
                    emitMatchmakingError(socket, 'Le host ne peut pas rejoindre sa propre room');
                    return;
                }

                const [user, deck] = await Promise.all([
                    getUserDisplay(userId),
                    getValidatedDeckForUser(userId, payload?.deckId),
                ]);

                room.guest = {
                    userId: user.userId,
                    username: user.username,
                    deckId: deck.deckId,
                    cards: deck.cards,
                    socketId: socket.id,
                };
                room.status = 'in_game';

                socket.join(roomChannel(room.id));
                emitGameStarted(io, room);
                broadcastRoomsList(io);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Erreur lors de la jonction de room';
                emitMatchmakingError(socket, message);
            }
        });

        socket.on('disconnect', () => {
            removeWaitingRoomsForSocket(io, socket.id);
        });
    });
}
