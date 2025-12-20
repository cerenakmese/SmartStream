const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- Kullanıcı Kaydı (Register) ---
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 1. Gelen veriler dolu mu kontrol et
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Lütfen tüm alanları doldurun.' });
    }

    // 2. Kullanıcı zaten var mı kontrol et
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'Bu email zaten kayıtlı.' });
    }

    // 3. Şifreyi hashle (Kriptola)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Yeni kullanıcıyı oluştur
    user = new User({
      username,
      email,
      password: hashedPassword
    });

    await user.save();

    // 5. Token oluştur
    const secret = process.env.JWT_SECRET || 'gizli_anahtar';
    const token = jwt.sign({ userId: user.id }, secret, {
      expiresIn: '1d'
    });

    res.status(201).json({
      message: 'Kullanıcı başarıyla oluşturuldu 🚀',
      token
    });

  } catch (error) {
    console.error('Register Hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
};

// --- Kullanıcı Girişi (Login) ---
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Veri kontrolü
    if (!email || !password) {
      return res.status(400).json({ message: 'Lütfen email ve şifrenizi girin.' });
    }

    // 2. Kullanıcıyı bul
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    // 👇 DEBUG BAŞLANGIÇ: Veritabanından ne geliyor görelim 👇
    console.log('--------------------------------');
    console.log('🔍 [Login Debug] Bulunan Kullanıcı:', user);
    console.log('🔑 [Login Debug] Hashli Şifre:', user.password);
    console.log('--------------------------------');
    // 👆 DEBUG BİTİŞ 👆

    // 🛡️ GÜVENLİK KONTROLÜ: Şifre alanı boş mu?
    // (Eski veya hatalı kayıtları yakalamak için)
    if (!user.password) {
      console.error('❌ HATA: Bu kullanıcının şifresi veritabanında yok (Dirty Data).');
      return res.status(500).json({ 
        message: 'Veritabanı hatası: Kullanıcı kaydı bozuk (şifre eksik).' 
      });
    }

    // 3. Şifreyi doğrula
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Geçersiz email veya şifre.' });
    }

    // 4. Token üret
    const secret = process.env.JWT_SECRET || 'gizli_anahtar';
    const token = jwt.sign({ userId: user.id }, secret, {
      expiresIn: '1d'
    });

    res.json({
      success: true,
      message: 'Giriş başarılı! 🎉',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Login Hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
};