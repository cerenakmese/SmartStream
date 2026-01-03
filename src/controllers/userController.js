const User = require('../models/User'); 


// @desc    Kullanıcı profilini getir
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    console.log("Token'dan gelen ID:", req.user.id); 
    // Middleware'den gelen req.user.id ile veritabanından kullanıcıyı buluyoruz
    // .select('-password') diyerek şifrenin geri dönmesini engelliyoruz (Güvenlik)
    const user = await User.findById(req.user.id).select('-password');

    if (user) {
      res.status(200).json({
        success: true,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          // Buraya settings vs. de ekleyebilirsin
          settings: user.settings 
        }
      });
    } else {
      res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Kullanıcı Ayarlarını Güncelle
// @route   PUT /api/users/settings
// @access  Private
const updateSettings = async (req, res) => {
    try {
        // req.user.id auth middleware'inden gelir
        const userId = req.user.userId || req.user.id;
        const updates = req.body; // { theme: "dark", notifications: false }

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: { settings: updates } }, // Ayarları güncelle
            { new: true, runValidators: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
        }

        res.status(200).json({
            success: true,
            message: 'Ayarlar güncellendi.',
            data: user.settings
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


module.exports = {
    getUserProfile,
    updateSettings
};