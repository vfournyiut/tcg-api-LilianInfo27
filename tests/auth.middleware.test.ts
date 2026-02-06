import request from 'supertest';
import express, { Request } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../src/middleware';
import { env } from '../src/env';
import { describe, expect, it } from 'vitest';

// étendre l'interface request pour inclure le champ user
declare global {
    namespace Express {
        interface Request {
            user?: { userId: number; email: string };
        }
    }
}

describe('Auth middleware', () => {
    // tests pour le middleware d'authentification
    const testApp = express();

    // route de test protégée par le middleware
    testApp.get('/protected', authenticateToken, (req, res) => {
        res.status(200).json({ user: req.user });
    });

    // tests pour le middleware d'authentification
    it('returns 401 when token is missing', async () => {
        const res = await request(testApp).get('/protected');
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Token manquant' });
    });

    it('returns 401 when token is invalid', async () => {
        const res = await request(testApp)
            .get('/protected')
            .set('Authorization', 'Bearer invalid');
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Token invalide ou expiré' });
    });

    it('allows request when token is valid', async () => {
        const token = jwt.sign({ userId: 123, email: 'test@example.com' }, env.JWT_SECRET);
        const res = await request(testApp)
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ user: { userId: 123, email: 'test@example.com' } });
    });
});
