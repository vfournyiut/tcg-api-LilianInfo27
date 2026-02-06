import request from 'supertest';
import { beforeAll } from 'vitest';
import { prismaMock } from './vitest.setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env';

// auth middleware pour injecter un utilisateur dans les tests
vi.mock('../src/middleware', () => ({
    authenticateToken: (req: any, _res: any, next: any) => {
        const raw = req.headers['x-user-id'];
        if (typeof raw === 'string' && raw !== 'none') {
            req.user = { userId: Number(raw), email: 'user@test.com' };
        }
        next();
    },
}));

// importer l'app après avoir mocké le middleware pour que les tests utilisent le mock
let app: typeof import('../src/index').app;

// fonctions utilitaires pour construire des cartes et des decks de test
beforeAll(async () => {
    ({ app } = await import('../src/index'));
});

// fonctions utilitaires pour construire des cartes et des decks de test
const buildCards = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        name: `Card ${index + 1}`,
        hp: 10,
        attack: 5,
        type: 'Fire',
        pokedexNumber: index + 1,
        imgUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }));

const buildDeck = (userId: number) => ({
    id: 1,
    name: 'Starter Deck',
    userId,
    cards: [
        {
            id: 1,
            deckId: 1,
            cardId: 1,
            card: buildCards(1)[0],
        },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
});

// tests pour les endpoints de gestion des decks
describe('Deck endpoints', () => {
    beforeEach(() => {
        prismaMock.card.findMany.mockReset();
        prismaMock.deck.create.mockReset();
        prismaMock.deck.findMany.mockReset();
        prismaMock.deck.findUnique.mockReset();
        prismaMock.deck.update.mockReset();
        prismaMock.deck.delete.mockReset();
        prismaMock.deckCard.deleteMany.mockReset();
        prismaMock.deckCard.createMany.mockReset();
    });

    // tests pour POST /api/decks
    it('POST /api/decks returns 400 when name is missing', async () => {
        const res = await request(app)
            .post('/api/decks')
            .set('x-user-id', '1')
            .send({ cards: buildCards(10).map(card => card.id) });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Nom manquant' });
    });

    it('POST /api/decks returns 400 when cards are invalid', async () => {
        const res = await request(app)
            .post('/api/decks')
            .set('x-user-id', '1')
            .send({ name: 'My Deck', cards: buildCards(9).map(card => card.id) });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Il faut exactement 10 cartes' });
    });

    it('POST /api/decks returns 401 when user is missing', async () => {
        const res = await request(app)
            .post('/api/decks')
            .set('x-user-id', 'none')
            .send({ name: 'My Deck', cards: buildCards(10).map(card => card.id) });
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Utilisateur non authentifié' });
    });

    it('POST /api/decks returns 400 when some cards are missing', async () => {
        prismaMock.card.findMany.mockResolvedValue(buildCards(9) as any);
        const res = await request(app)
            .post('/api/decks')
            .set('x-user-id', '1')
            .send({ name: 'My Deck', cards: buildCards(10).map(card => card.id) });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Cartes invalides/inexistantes' });
    });

    it('POST /api/decks returns 201 when deck is created', async () => {
        prismaMock.card.findMany.mockResolvedValue(buildCards(10) as any);
        prismaMock.deck.create.mockResolvedValue(buildDeck(1) as any);
        const res = await request(app)
            .post('/api/decks')
            .set('x-user-id', '1')
            .send({ name: 'My Deck', cards: buildCards(10).map(card => card.id) });
        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Starter Deck');
    });

    it('POST /api/decks returns 500 on server error with details in development', async () => {
        const previousEnv = env.NODE_ENV;
        env.NODE_ENV = 'development';
        try {
            prismaMock.card.findMany.mockResolvedValue(buildCards(10) as any);
            prismaMock.deck.create.mockRejectedValue(new Error('db error'));
            const res = await request(app)
                .post('/api/decks')
                .set('x-user-id', '1')
                .send({ name: 'My Deck', cards: buildCards(10).map(card => card.id) });
            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Erreur serveur');
            expect(res.body.details).toBe('Error: db error');
        } finally {
            env.NODE_ENV = previousEnv;
        }
    });

    it('POST /api/decks returns 500 on server error without details in production', async () => {
        const previousEnv = env.NODE_ENV;
        env.NODE_ENV = 'production';
        try {
            prismaMock.card.findMany.mockResolvedValue(buildCards(10) as any);
            prismaMock.deck.create.mockRejectedValue(new Error('db error'));
            const res = await request(app)
                .post('/api/decks')
                .set('x-user-id', '1')
                .send({ name: 'My Deck', cards: buildCards(10).map(card => card.id) });
            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Erreur serveur');
            expect(res.body.details).toBeUndefined();
        } finally {
            env.NODE_ENV = previousEnv;
        }
    });

    // tests pour GET /api/decks/mine
    it('GET /api/decks/mine returns 200 with decks', async () => {
        prismaMock.deck.findMany.mockResolvedValue([buildDeck(1)] as any);
        const res = await request(app)
            .get('/api/decks/mine')
            .set('x-user-id', '1');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it('GET /api/decks/mine returns 500 on server error', async () => {
        prismaMock.deck.findMany.mockRejectedValue(new Error('db error'));
        const res = await request(app)
            .get('/api/decks/mine')
            .set('x-user-id', '1');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Erreur serveur' });
    });

    // tests pour GET /api/decks/:id
    it('GET /api/decks/:id returns 404 when deck is missing', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(null);
        const res = await request(app)
            .get('/api/decks/1')
            .set('x-user-id', '1');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Deck inexistant' });
    });

    it('GET /api/decks/:id returns 403 when deck is forbidden', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(buildDeck(2) as any);
        const res = await request(app)
            .get('/api/decks/1')
            .set('x-user-id', '1');
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Deck interdit' });
    });

    it('GET /api/decks/:id returns 200 with deck', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(buildDeck(1) as any);
        const res = await request(app)
            .get('/api/decks/1')
            .set('x-user-id', '1');
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Starter Deck');
    });

    it('GET /api/decks/:id returns 500 on server error', async () => {
        prismaMock.deck.findUnique.mockRejectedValue(new Error('db error'));
        const res = await request(app)
            .get('/api/decks/1')
            .set('x-user-id', '1');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Erreur serveur' });
    });

    // tests pour PATCH /api/decks/:id
    it('PATCH /api/decks/:id returns 401 when user is missing', async () => {
        const res = await request(app)
            .patch('/api/decks/1')
            .set('x-user-id', 'none')
            .send({ name: 'Updated' });
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Utilisateur non authentifié' });
    });

    it('PATCH /api/decks/:id returns 400 when cards are invalid', async () => {
        const res = await request(app)
            .patch('/api/decks/1')
            .set('x-user-id', '1')
            .send({ cards: buildCards(9).map(card => card.id) });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Il faut exactement 10 cartes' });
    });

    it('PATCH /api/decks/:id returns 404 when deck is missing', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(null);
        const res = await request(app)
            .patch('/api/decks/1')
            .set('x-user-id', '1')
            .send({ name: 'Updated' });
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Deck inexistant' });
    });

    it('PATCH /api/decks/:id returns 403 when deck is forbidden', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(buildDeck(2) as any);
        const res = await request(app)
            .patch('/api/decks/1')
            .set('x-user-id', '1')
            .send({ name: 'Updated' });
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Deck interdit' });
    });

    it('PATCH /api/decks/:id returns 400 when cards are missing in db', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(buildDeck(1) as any);
        prismaMock.card.findMany.mockResolvedValue(buildCards(9) as any);
        const res = await request(app)
            .patch('/api/decks/1')
            .set('x-user-id', '1')
            .send({ cards: buildCards(10).map(card => card.id) });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Cartes invalides/inexistantes' });
    });

    it('PATCH /api/decks/:id returns 200 when deck cards are updated', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(buildDeck(1) as any);
        prismaMock.card.findMany.mockResolvedValue(buildCards(10) as any);
        prismaMock.deckCard.deleteMany.mockResolvedValue({ count: 10 } as any);
        prismaMock.deckCard.createMany.mockResolvedValue({ count: 10 } as any);
        prismaMock.deck.update.mockResolvedValue(buildDeck(1) as any);
        const res = await request(app)
            .patch('/api/decks/1')
            .set('x-user-id', '1')
            .send({ cards: buildCards(10).map(card => card.id) });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Starter Deck');
    });

    it('PATCH /api/decks/:id returns 200 when deck name is updated', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(buildDeck(1) as any);
        prismaMock.deck.update.mockResolvedValue(buildDeck(1) as any);
        const res = await request(app)
            .patch('/api/decks/1')
            .set('x-user-id', '1')
            .send({ name: 'Updated' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Starter Deck');
    });

    it('PATCH /api/decks/:id returns 500 on server error', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(buildDeck(1) as any);
        prismaMock.deck.update.mockRejectedValue(new Error('db error'));
        const res = await request(app)
            .patch('/api/decks/1')
            .set('x-user-id', '1')
            .send({ name: 'Updated' });
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Erreur serveur' });
    });

    // tests pour DELETE /api/decks/:id
    it('DELETE /api/decks/:id returns 404 when deck is missing', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(null);
        const res = await request(app)
            .delete('/api/decks/1')
            .set('x-user-id', '1');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Deck inexistant' });
    });

    it('DELETE /api/decks/:id returns 403 when deck is forbidden', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(buildDeck(2) as any);
        const res = await request(app)
            .delete('/api/decks/1')
            .set('x-user-id', '1');
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Deck interdit' });
    });

    it('DELETE /api/decks/:id returns 200 when deck is deleted', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(buildDeck(1) as any);
        prismaMock.deckCard.deleteMany.mockResolvedValue({ count: 10 } as any);
        prismaMock.deck.delete.mockResolvedValue(buildDeck(1) as any);
        const res = await request(app)
            .delete('/api/decks/1')
            .set('x-user-id', '1');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'Deck supprimé' });
    });

    it('DELETE /api/decks/:id returns 500 on server error', async () => {
        prismaMock.deck.findUnique.mockResolvedValue(buildDeck(1) as any);
        prismaMock.deck.delete.mockRejectedValue(new Error('db error'));
        const res = await request(app)
            .delete('/api/decks/1')
            .set('x-user-id', '1');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Erreur serveur' });
    });
});