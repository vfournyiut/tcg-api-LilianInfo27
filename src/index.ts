import {createServer} from "http";
import {env} from "./env";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from 'socket.io';
import swaggerUi from "swagger-ui-express";
import { swaggerDocument } from "./docs";

import { authRouter } from "./auth.route";

import { prisma } from "./database";

import { deckRouter } from "./deck.route";
import { authenticateSocketToken } from './sockets/auth.socket';

// Create Express app
export const app = express();

// Middlewares
app.use(
    cors({
        origin: true,  // Autorise toutes les origines
        credentials: true,
    }),
);

app.use(express.json());

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'TCG API Documentation',
}));

// Serve static files (Socket.io test client)
app.use(express.static('public'));


// Health check endpoint
/**
 * Health check endpoint.
 *
 * Route params: none
 * Request body: none
 *
 * @param {express.Request} _req - Express request (unused).
 * @param {express.Response} res - Express response.
 * @returns {void} JSON response with server status.
 * @throws {Error} When response serialization fails.
 */
app.get("/api/health", (_req, res) => {
    res.json({status: "ok", message: "TCG Backend Server is running"});
});


// Auth routes
app.use("/api/auth", authRouter);

// Decks routes
app.use("/api/decks", deckRouter);

// GET /api/cards : catalogue public
/**
 * Return the public card catalog ordered by Pokedex number.
 *
 * Route params: none
 * Request body: none
 *
 * @param {express.Request} _req - Express request (unused).
 * @param {express.Response} res - Express response.
 * @returns {Promise<void>} JSON response with cards or error.
 * @throws {Error} When database operations fail.
 */
app.get("/api/cards", async (_req, res) => {
    try {
        const cards = await prisma.card.findMany({
            orderBy: { pokedexNumber: "asc" }
        });
        res.status(200).json(cards);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Démarre le serveur HTTP et Socket.io si ce fichier est exécuté directement
if (require.main === module) {
    // Crée le serveur HTTP et intègre Socket.io
    const httpServer = createServer(app);

    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: true,
            credentials: true,
        },
    });

    io.use(authenticateSocketToken);

    io.on('connection', (socket) => {
        const { userId, email } = socket.data as { userId: number; email: string };
        console.log(`🔌 Socket connected: ${socket.id} (userId=${userId}, email=${email})`);
    });


    // Démarre le serveur HTTP et Socket.io
    try {
        httpServer.listen(env.PORT, () => {
            console.log(`\n🚀 Server is running on http://localhost:${env.PORT}`);
            console.log(`🧪 Socket.io Test Client available at http://localhost:${env.PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}
