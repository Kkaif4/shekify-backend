/**
 * Admin role authorization middleware.
 * Must be chained AFTER authGuard — requires req.user to exist.
 * Rejects non-admin users with 403.
 */
export function adminGuard(req, res, next) {
  if (!req.user || req.user.role?.toUpperCase() !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
