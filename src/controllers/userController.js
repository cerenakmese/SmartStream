const User = require('../models/User');
const sessionStateService = require('../services/sessionState');



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


const updateSettings = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const updates = req.body; // { qosPreference: "video-only" }


    const updateQuery = {};
    if (updates.qosPreference) updateQuery['settings.qosPreference'] = updates.qosPreference;


    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateQuery },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    // 2. CANLI REDIS GÜNCELLEMESİ (Sihirli Dokunuş ✨)
    if (updates.qosPreference) {
      // Kullanıcı şu an bir odada mı?
      const activeSessionId = await sessionStateService.recoverUserSession(userId);

      if (activeSessionId) {
        // Evet odada, Redis'teki tercihini de anında değiştir!
        await sessionStateService.updateUserPreferenceOnly(
          activeSessionId,
          userId,
          updates.qosPreference
        );
        console.log(`[Settings] Canlı oturum güncellendi: ${userId} -> ${updates.qosPreference}`);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Ayarlar güncellendi ve canlı oturuma yansıtıldı.',
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