import request from 'supertest';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import { prismaMock } from './vitest.setup';

// données de test pour les utilisateurs
const baseUser = {
    id: 1,
    email: 'ash@example.com',
    username: 'ash',
    password: 'hashed-password',
    createdAt: new Date(),
    updatedAt: new Date(),
};

// tests pour les endpoints d'authentification
describe('Auth endpoints', () => {
    // réinitialiser les mocks avant chaque test
    beforeEach(() => {
        prismaMock.user.findUnique.mockReset();
        prismaMock.user.create.mockReset();
    });

    // restaurer les mocks après chaque test
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // tests pour POST /api/auth/sign-up
    it('POST /api/auth/sign-up returns 400 when missing data', async () => {
        const res = await request(app).post('/api/auth/sign-up').send({});
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Données manquantes' });
    });

    it('POST /api/auth/sign-up returns 409 when email exists', async () => {
        prismaMock.user.findUnique.mockResolvedValue(baseUser as any);
        const res = await request(app)
            .post('/api/auth/sign-up')
            .send({ email: baseUser.email, username: 'new', password: 'secret' });
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'Email déjà utilisé' });
    });

    it('POST /api/auth/sign-up returns 201 with token and user', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);
        vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
        prismaMock.user.create.mockResolvedValue(baseUser as any);

        const res = await request(app)
            .post('/api/auth/sign-up')
            .send({ email: baseUser.email, username: baseUser.username, password: 'secret' });

        expect(res.status).toBe(201);
        expect(res.body.token).toBeTypeOf('string');
        expect(res.body.user.email).toBe(baseUser.email);
        expect(res.body.user.password).toBeUndefined();
    });

    it('POST /api/auth/sign-up returns 500 on server error', async () => {
        prismaMock.user.findUnique.mockRejectedValue(new Error('db error'));
        const res = await request(app)
            .post('/api/auth/sign-up')
            .send({ email: baseUser.email, username: baseUser.username, password: 'secret' });
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Erreur serveur' });
    });

    // tests pour POST /api/auth/sign-in
    it('POST /api/auth/sign-in returns 400 when missing data', async () => {
        const res = await request(app).post('/api/auth/sign-in').send({});
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Données manquantes' });
    });

    it('POST /api/auth/sign-in returns 401 when email does not exist', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);
        const res = await request(app)
            .post('/api/auth/sign-in')
            .send({ email: baseUser.email, password: 'secret' });
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Email inexistant' });
    });

    it('POST /api/auth/sign-in returns 401 when password is invalid', async () => {
        prismaMock.user.findUnique.mockResolvedValue(baseUser as any);
        vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
        const res = await request(app)
            .post('/api/auth/sign-in')
            .send({ email: baseUser.email, password: 'wrong' });
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Mot de passe incorrect' });
    });

    it('POST /api/auth/sign-in returns 200 with token and user', async () => {
        prismaMock.user.findUnique.mockResolvedValue(baseUser as any);
        vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
        const res = await request(app)
            .post('/api/auth/sign-in')
            .send({ email: baseUser.email, password: 'secret' });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTypeOf('string');
        expect(res.body.user.email).toBe(baseUser.email);
        expect(res.body.user.password).toBeUndefined();
    });

    it('POST /api/auth/sign-in returns 500 on server error', async () => {
        prismaMock.user.findUnique.mockRejectedValue(new Error('db error'));
        const res = await request(app)
            .post('/api/auth/sign-in')
            .send({ email: baseUser.email, password: 'secret' });
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Erreur serveur' });
    });
});
