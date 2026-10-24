import { Router } from 'express';
import { healthRoutes } from './health.routes';

const apiRouter = Router();

// Platform System Routes
apiRouter.use('/health', healthRoutes);

// Business Domain Module Routes (Future modules will be registered here)
// e.g.:
// apiRouter.use('/auth', authRoutes);
// apiRouter.use('/users', usersRoutes);
// apiRouter.use('/students', studentsRoutes);
// apiRouter.use('/attendance', attendanceRoutes);
// apiRouter.use('/fees', feesRoutes);

export default apiRouter;
