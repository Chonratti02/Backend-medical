import { Router } from 'express';
import * as patientController from '../controllers/patient.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// GET    /api/v1/patients
router.get('/', patientController.getAll);

// GET    /api/v1/patients/search?national_id=xxx
router.get('/search', patientController.searchByNationalId);

// GET    /api/v1/patients/:id
router.get('/:id', patientController.getById);

// POST   /api/v1/patients
router.post('/', patientController.create);

// PUT    /api/v1/patients/:id
router.put('/:id', patientController.update);

// GET    /api/v1/patients/:id/visits
router.get('/:id/visits', patientController.getVisitHistory);

export default router;
