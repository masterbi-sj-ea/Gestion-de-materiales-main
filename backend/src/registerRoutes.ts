import app from './app';
import routes from './routes';

// Registrar rutas principales en la app
app.use('/api', routes);

export default app;
