import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { env } from '../env';

type JwtUserPayload = {
    userId: number;
    email: string;
};

/**
 * Socket.io middleware that validates JWT provided in socket.handshake.auth.token.
 *
 * On success, injects userId and email into socket.data.
 */
export function authenticateSocketToken(socket: Socket, next: (err?: Error) => void): void {
    const token = socket.handshake.auth?.token;

    if (!token || typeof token !== 'string') {
        next(new Error('Token manquant'));
        return;
    }

    try {
        const decoded = jwt.verify(token, env.JWT_SECRET);

        if (
            typeof decoded === 'string' ||
            typeof decoded.userId !== 'number' ||
            typeof decoded.email !== 'string'
        ) {
            next(new Error('Token invalide ou expiré'));
            return;
        }

        const payload = decoded as JwtUserPayload;
        socket.data.userId = payload.userId;
        socket.data.email = payload.email;
        next();
    } catch {
        next(new Error('Token invalide ou expiré'));
    }
}
