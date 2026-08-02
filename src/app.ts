import express, { Application } from 'express';
import cors from 'cors';
//import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { errorMiddleware } from './middleware/error.middleware.js';
import { sendError } from './utils/response.js';
import { corsOriginChecker } from './utils/cors.js';
import apiRouter from './routes/index.js';

const app: Application = express();

app.use(cors({
  origin: corsOriginChecker,
  credentials: true,
}));
//app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(cookieParser());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', apiRouter);

app.use((_req, res) => {
  sendError(res, 'Route not found', 404);
});

app.use(errorMiddleware);

export default app;
