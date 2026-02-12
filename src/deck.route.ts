import { Router, Request, Response } from 'express';
import { prisma } from './database';
import { authenticateToken } from './middleware';
import { env } from './env';

export const deckRouter = Router();

/**
 * Create a deck for the authenticated user.
 *
 * Route params: none
 * Request body:
 * - name: string
 * - cards: number[] (must contain exactly 10 card ids)
 *
 * @param {Request} req - Express request; expects body with name and cards.
 * @param {Response} res - Express response.
 * @returns {Promise<Response>} JSON response with created deck or error.
 * @throws {Error} When database operations fail.
 */
deckRouter.post('/', authenticateToken, async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { name, cards } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom manquant' });
    if (!Array.isArray(cards) || cards.length !== 10) {
        return res.status(400).json({ error: 'Il faut exactement 10 cartes' });
    }
    if (typeof userId !== 'number') {
        return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }
    try {
        // Vérifier que toutes les cartes existent
        const found = await prisma.card.findMany({ where: { id: { in: cards } } });
        if (found.length !== 10) {
            return res.status(400).json({ error: 'Cartes invalides/inexistantes' });
        }
        // Créer le deck
        const deck = await prisma.deck.create({
            data: {
                name,
                userId: userId,
                cards: {
                    create: cards.map(cardId => ({ cardId }))
                }
            },
            include: { cards: { include: { card: true } } }
        });
        return res.status(201).json(deck);
    } catch (err) {
        console.error('Create deck failed:', err);
        return res.status(500).json({
            error: 'Erreur serveur',
            details: env.NODE_ENV === 'development' ? String(err) : undefined,
        });
    }
});

/**
 * List decks for the authenticated user.
 *
 * Route params: none
 * Request body: none
 *
 * @param {Request} req - Express request; uses authenticated user id.
 * @param {Response} res - Express response.
 * @returns {Promise<void>} JSON response with decks or error.
 * @throws {Error} When database operations fail.
 */
deckRouter.get('/mine', authenticateToken, async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    try {
        const decks = await prisma.deck.findMany({
            where: { userId },
            include: { cards: { include: { card: true } } }
        });
        res.status(200).json(decks);
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

/**
 * Get a specific deck owned by the authenticated user.
 *
 * Route params:
 * - id: number (deck id)
 * Request body: none
 *
 * @param {Request} req - Express request; expects params.id.
 * @param {Response} res - Express response.
 * @returns {Promise<Response>} JSON response with deck or error.
 * @throws {Error} When database operations fail.
 */
deckRouter.get('/:id', authenticateToken, async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const deckId = Number(req.params.id);
    try {
        const deck = await prisma.deck.findUnique({
            where: { id: deckId },
            include: { cards: { include: { card: true } } }
        });
        if (!deck) {
            return res.status(404).json({ error: 'Deck inexistant' });
        }
        if (deck.userId !== userId) {
            return res.status(403).json({ error: 'Deck interdit' });
        }
        return res.status(200).json(deck);
    } catch (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

/**
 * Update a deck name and/or its cards for the authenticated user.
 *
 * Route params:
 * - id: number (deck id)
 * Request body (optional):
 * - name: string
 * - cards: number[] (must contain exactly 10 card ids when provided)
 *
 * @param {Request} req - Express request; expects params.id and optional body.
 * @param {Response} res - Express response.
 * @returns {Promise<Response>} JSON response with updated deck or error.
 * @throws {Error} When database operations fail.
 */
deckRouter.patch('/:id', authenticateToken, async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const deckId = Number(req.params.id);
    const { name, cards } = req.body;
    if (typeof userId !== 'number') {
        return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }
    if (cards && (!Array.isArray(cards) || cards.length !== 10)) {
        return res.status(400).json({ error: 'Il faut exactement 10 cartes' });
    }
    try {
        const deck = await prisma.deck.findUnique({ where: { id: deckId } });
        if (!deck) return res.status(404).json({ error: 'Deck inexistant' });
        if (deck.userId !== userId) return res.status(403).json({ error: 'Deck interdit' });
        // Si on modifie les cartes
        if (cards) {
            const found = await prisma.card.findMany({ where: { id: { in: cards } } });
            if (found.length !== 10) {
                return res.status(400).json({ error: 'Cartes invalides/inexistantes' });
            }
            // Supprimer les anciennes associations puis ajouter les nouvelles
            await prisma.deckCard.deleteMany({ where: { deckId } });
            await prisma.deckCard.createMany({ data: cards.map((cardId: number) => ({ deckId, cardId })) });
        }
        // Modifier le nom si fourni
        const updated = await prisma.deck.update({
            where: { id: deckId },
            data: name ? { name } : {},
            include: { cards: { include: { card: true } } }
        });
        return res.status(200).json(updated);
    } catch (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

/**
 * Delete a deck owned by the authenticated user.
 *
 * Route params:
 * - id: number (deck id)
 * Request body: none
 *
 * @param {Request} req - Express request; expects params.id.
 * @param {Response} res - Express response.
 * @returns {Promise<Response>} JSON response with confirmation or error.
 * @throws {Error} When database operations fail.
 */
deckRouter.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const deckId = Number(req.params.id);
    try {
        const deck = await prisma.deck.findUnique({ where: { id: deckId } });
        if (!deck) return res.status(404).json({ error: 'Deck inexistant' });
        if (deck.userId !== userId) return res.status(403).json({ error: 'Deck interdit' });
        await prisma.deckCard.deleteMany({ where: { deckId } });
        await prisma.deck.delete({ where: { id: deckId } });
        return res.status(200).json({ message: 'Deck supprimé' });
    } catch (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
