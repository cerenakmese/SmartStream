// src/middleware/admin.js

module.exports = (req, res, next) => {
    // Önceki middleware (auth.js) sayesinde req.user dolu geliyor.

    // 1. Role kontrolü yap
    if (req.user && req.user.role === 'admin') {
        next(); // Geç patron, kapılar açık.
    } else {
        // 403: Forbidden (Giremezsin, yetkin yok)
        return res.status(403).json({
            success: false,
            message: '⛔ Bu işlem için Admin yetkisi gerekiyor!'
        });
    }
};