const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Message = require('../models/Message');
const User = require('../models/User');

// -------------------- CẤU HÌNH LƯU FILE (MULTER) --------------------
// Thiết lập nơi lưu file và cách đặt tên file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'), // Lưu file vào thư mục public/uploads/
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)) // Tên file: timestamp + đuôi gốc
});
const upload = multer({ storage });

// -------------------- GỬI TIN NHẮN --------------------
router.post('/', upload.single('file'), async (req, res) => {
    // Kiểm tra đăng nhập
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });

    const { content, receiver } = req.body;

    // Tạo dữ liệu tin nhắn
    let messageData = {
        sender: req.session.user.username, // người gửi
        receiver,                          // người nhận
        timestamp: new Date()              // thời gian gửi
    };

    // Nếu là tin nhắn văn bản
    if (content) {
        messageData.content = content;
        messageData.type = 'text';
    }
    // Nếu có file đính kèm
    else if (req.file) {
        messageData.content = `/uploads/${req.file.filename}`; // đường dẫn file để truy cập từ frontend
        messageData.type = req.file.mimetype.startsWith('image/') ? 'image' : 'file'; // loại file: hình ảnh hay file thường
    }

    try {
        // Lưu tin nhắn vào database
        const message = await Message.create(messageData);
        res.json(message); // Trả lại tin nhắn mới cho client
    } catch (error) {
        console.error('Lỗi khi gửi tin nhắn:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// -------------------- LẤY LỊCH SỬ TIN NHẮN --------------------
router.get('/:username', async (req, res) => {
    // Kiểm tra đăng nhập
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });

    const { username } = req.params;

    try {
        // Tìm tất cả tin nhắn giữa người dùng hiện tại và người dùng `username`
        const messages = await Message.find({
            $or: [
                { sender: req.session.user.username, receiver: username },
                { sender: username, receiver: req.session.user.username }
            ]
        }).sort({ timestamp: 1 }); // Sắp xếp theo thời gian tăng dần

        res.json(messages); // Trả về danh sách tin nhắn
    } catch (error) {
        console.error('Lỗi khi lấy tin nhắn:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
