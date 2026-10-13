import { Router } from 'express';
import multer from 'multer';
import { statementController } from '../controllers/statement.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { BadRequestError } from '../errors/app-error.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { confirmStatementImportSchema } from '../schemas/statement.schema.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (ext === 'csv' || ext === 'pdf' || file.mimetype === 'text/csv' || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only CSV (.csv) and PDF (.pdf) files are supported for statement ingestion'));
    }
  },
});

const statementRouter = Router();

statementRouter.use(authenticate);

statementRouter.post('/preview', upload.single('file'), statementController.preview);
statementRouter.post('/confirm', validateRequest({ body: confirmStatementImportSchema }), statementController.confirm);
statementRouter.get('/history', statementController.getHistory);

export default statementRouter;
