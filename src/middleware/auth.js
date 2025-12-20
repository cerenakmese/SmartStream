// src/middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  // 1. Token'ı Header'dan al
  // Beklenen format: "Bearer <TOKEN>"
  const token = req.header('Authorization');

  // 2. Token var mı kontrol et
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Erişim reddedildi. Token bulunamadı.' 
    });
  }

  try {
    // 3. "Bearer " kısmını temizle (Sadece şifreli kısmı al)
    // Eğer istemci "Bearer " prefix'i kullanmıyorsa direkt token'ı alabiliriz.
    const tokenString = token.startsWith('Bearer ') ? token.slice(7, token.length) : token;

    // 4. Token'ı doğrula
    const secret = process.env.JWT_SECRET || 'gizli_anahtar';
    const decoded = jwt.verify(tokenString, secret);

    // 5. Deşifre edilen kullanıcı bilgisini isteğe (req) ekle
    // Böylece sonraki aşamada "req.user.id" diyerek kim olduğunu bileceğiz.
    req.user = decoded;
    
    next(); // Devam et (Kapıyı aç)

  } catch (err) {
    res.status(401).json({ 
      success: false, 
      message: 'Geçersiz Token.' 
    });
  }
};