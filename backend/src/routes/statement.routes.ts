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
    fileSize: 15 * 1024 * 1024, // 15MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    const isPdf = ext === 'pdf' || mime.includes('pdf') || mime === 'application/x-pdf';
    const isCsv =
      ext === 'csv' ||
      ext === 'txt' ||
      mime.includes('csv') ||
      mime.includes('text') ||
      mime === 'application/vnd.ms-excel';
    const isImage =
      mime.startsWith('image/') ||
      ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'heic'].includes(ext || '');
    const isGenericBinary = mime === 'application/octet-stream' || mime === 'binary/octet-stream';

    if (isPdf || isCsv || isImage || isGenericBinary || !ext) {
      cb(null, true);
    } else {
      cb(
        new BadRequestError(
          'Supported file formats: PDF (.pdf), CSV (.csv), or Image screenshots (.jpg, .jpeg, .png, .webp)',
        ),
      );
    }
  },
});

const handleUpload = (req: any, res: any, next: any) => {
  if (req.is('multipart/form-data')) {
    upload.single('file')(req, res, (err: any) => {
      if (err) return next(err);
      next();
    });
  } else {
    next();
  }
};

const statementRouter = Router();

statementRouter.use(authenticate);

statementRouter.post('/preview', handleUpload, statementController.preview);
statementRouter.post('/confirm', validateRequest({ body: confirmStatementImportSchema }), statementController.confirm);
statementRouter.get('/history', statementController.getHistory);

export default statementRouter;
