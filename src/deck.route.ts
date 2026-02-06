import { Router, Request, Response } from 'express';
import { prisma } from './database';
import { authenticateToken } from './middleware';
import { env } from './env';

export const deckRouter = Router();

// POST /api/decks - Créer un deck
// Protégé par JWT
// Payload: { name: string, cards: number[] }
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

// GET /api/decks/mine - Lister les decks de l'utilisateur connecté
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

// GET /api/decks/:id - Consulter un deck spécifique
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

// PATCH /api/decks/:id - Modifier un deck
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

// DELETE /api/decks/:id - Supprimer un deck
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
