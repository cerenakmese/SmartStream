const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Kullanıcı Kaydı (Register)
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

    // 5. Token oluştur (JWT - Kimlik Kartı)
    // process.env.JWT_SECRET henüz tanımlı değilse hata vermesin diye geçici bir string koyduk
    const secret = process.env.JWT_SECRET || 'gizli_anahtar'; 
    
    const token = jwt.sign({ userId: user.id }, secret, {
      expiresIn: '1d' // 1 gün geçerli
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