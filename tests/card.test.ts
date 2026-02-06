import request from 'supertest';
import { app } from '../src/index';
import { prismaMock } from './vitest.setup';
import { beforeEach, describe, expect, it } from 'vitest';

// données de test pour les cartes
const cards = [
    { id: 1, name: 'Bulbasaur', hp: 45, attack: 49, type: 'Grass', pokedexNumber: 1, imgUrl: null },
    { id: 2, name: 'Ivysaur', hp: 60, attack: 62, type: 'Grass', pokedexNumber: 2, imgUrl: null },
];

// tests pour les endpoints de cartes
describe('Cards endpoints', () => {
    beforeEach(() => {
        prismaMock.card.findMany.mockReset();
    });

    // tests pour GET /api/cards
    it('GET /api/cards returns list of cards', async () => {
        prismaMock.card.findMany.mockResolvedValue(cards as any);
        const res = await request(app).get('/api/cards');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(cards);
    });

    it('GET /api/cards returns 500 on server error', async () => {
        prismaMock.card.findMany.mockRejectedValue(new Error('db error'));
        const res = await request(app).get('/api/cards');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Erreur serveur' });
    });
});
