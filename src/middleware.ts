import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from './env';

/**
 * Express middleware to validate a JWT from the Authorization header.
 *
 * Expected header:
 * - Authorization: Bearer <token>
 *
 * @param {Request} req - Express request; expects Authorization header.
 * @param {Response} res - Express response.
 * @param {NextFunction} next - Next middleware function.
 * @returns {Response | void} Sends 401 on failure or calls next() on success.
 * @throws {Error} When JWT verification fails.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number; email: string };
        req.user = { userId: decoded.userId, email: decoded.email };
        next();
        return;
    } catch (err: any) {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
}
