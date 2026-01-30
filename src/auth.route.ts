import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './database';
import { env } from './env';

export const authRouter = Router();

authRouter.post('/sign-up', async (req: Request, res: Response) => {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
        return res.status(400).json({ error: 'Données manquantes' });
    }
    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(409).json({ error: 'Email déjà utilisé' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { email, username, password: hashedPassword },
        });
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        const { password: _, ...userSafe } = user;
        return res.status(201).json({ token, user: userSafe });
    } catch (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

authRouter.post('/sign-in', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Données manquantes' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Email inexistant' });
        }
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Mot de passe incorrect' });
        }
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        const { password: _, ...userSafe } = user;
        return res.status(200).json({ token, user: userSafe });
    } catch (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});
