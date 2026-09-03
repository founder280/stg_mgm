import { Router } from 'express';
import { PERMISSIONS, syncPullSchema, syncPushSchema } from '@mgms/shared';
import { asyncHandler } from '../middleware/error-handler.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { buildSyncBundle, processSyncPush } from '../services/sync.service.js';
import { assertCampAccess } from '../services/scope.service.js';

export const syncRouter: Router = Router();

/** Upload a batch of operations queued while the device was offline. */
syncRouter.post(
  '/push',
  requirePermission(PERMISSIONS.SYNC_PUSH),
  validate(syncPushSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as import('@mgms/shared').SyncPushInput;

    const campIds = new Set(
      input.operations.filter((o) => o.kind === 'REGISTRATION').map((o) => o.payload.campId),
    );
    for (const campId of campIds) {
      await assertCampAccess(req.principal!.scope, campId);
    }

    const result = await processSyncPush(input, {
      userId: req.principal!.userId,
      ipAddress: req.ip,
    });
    res.status(207).json(result);
  }),
);

/** Download everything the camp device needs to work with no connectivity. */
syncRouter.get(
  '/pull',
  requirePermission(PERMISSIONS.SYNC_PULL),
  validate(syncPullSchema, 'query'),
  asyncHandler(async (req, res) => {
    const campId = String(req.query.campId);
    await assertCampAccess(req.principal!.scope, campId);
    res.json(await buildSyncBundle(campId));
  }),
);
