const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Group = require('../models/Group'); // Import mô hình Group
const { onlineUsers, io } = require('../server'); // Import onlineUsers và io từ app.js
const multer = require('multer');
const path = require('path');

const router = express.Router();

// -------------------- ĐĂNG KÝ NGƯỜI DÙNG --------------------
router.post('/register', async (req, res) => {
    const { username, email, phone, password } = req.body;

    try {
        // Kiểm tra xem username hoặc email đã tồn tại chưa
        const existing = await User.findOne({ $or: [{ username }, { email }] });
        if (existing) return res.status(400).json({ message: "Tên người dùng hoặc email đã tồn tại!" });

        // Mã hóa mật khẩu trước khi lưu
        const hashedPassword = await bcrypt.hash(password, 10);

        // Tạo người dùng mới
        const newUser = new User({ username, email, phone, password: hashedPassword });

        await newUser.save();
        res.status(201).json({ message: "Đăng ký thành công!" });
    } catch (err) {
        console.error('Error in /auth/register:', err.message);
        res.status(500).json({ message: "Lỗi server!" });
    }
});

// -------------------- ĐĂNG NHẬP NGƯỜI DÙNG --------------------
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Tìm người dùng theo email
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "Email không tồn tại!" });

        // So sánh mật khẩu
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Sai mật khẩu!" });

        // Lưu thông tin người dùng vào session
        req.session.user = {
            id: user._id,
            username: user.username,
            email: user.email,
            avatarUrl: user.avatarUrl
        };

        res.status(200).json({ message: "Đăng nhập thành công!" });
    } catch (err) {
        console.error('Error in /auth/login:', err.message);
        res.status(500).json({ message: "Lỗi server!" });
    }
});

// -------------------- LẤY THÔNG TIN NGƯỜI DÙNG HIỆN TẠI --------------------
router.get('/me', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Chưa đăng nhập!" });
    }

    try {
        // Tìm người dùng theo ID trong session và chỉ lấy các trường cần thiết
        const user = await User.findById(req.session.user.id).select('username email phone avatarUrl');
        if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng!" });

        res.json(user);
    } catch (err) {
        console.error('Error in /auth/me:', err.message);
        res.status(500).json({ message: "Lỗi server!" });
    }
});

// -------------------- CẬP NHẬT THÔNG TIN NGƯỜI DÙNG --------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/avatars'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
    }
});
const upload = multer({ storage });

router.post('/update-info', upload.single('avatar'), async (req, res) => {
    const { email, password, newUsername } = req.body;
    if (!req.session.user) return res.status(401).json({ message: "Chưa đăng nhập!" });

    try {
        const user = await User.findById(req.session.user.id);
        if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng!" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(403).json({ message: "Mật khẩu xác nhận không đúng!" });

        const oldUsername = user.username; // Lưu username cũ
        if (email) user.email = email;
        if (newUsername) user.username = newUsername;
        if (req.file) user.avatarUrl = `/uploads/avatars/${req.file.filename}`;
        await user.save();

        // Cập nhật username trong tất cả các nhóm
        if (newUsername && oldUsername !== newUsername) {
            console.log(`Updating groups: replacing ${oldUsername} with ${newUsername}`);
            await Group.updateMany(
                { members: oldUsername },
                { $set: { "members.$": newUsername } }
            );
        }

        // Cập nhật session
        req.session.user.email = user.email;
        req.session.user.username = user.username;
        req.session.user.avatarUrl = user.avatarUrl;

        // Lấy danh sách nhóm của người dùng
        const groups = await Group.find({ members: user.username });
        console.log(`Fetched groups for ${user.username}:`, groups);
        const groupList = groups.map(g => ({
            _id: g._id.toString(),
            name: g.name,
            members: g.members,
            hasUnread: false
        }));

        // Gửi sự kiện updateGroups đến người dùng hiện tại
        if (onlineUsers && io) {
            const socketId = onlineUsers.get(user.username);
            if (socketId) {
                console.log(`Sending updateGroups to ${user.username} (socket: ${socketId})`);
                io.to(socketId).emit('updateGroups', groupList);
            } else {
                console.warn(`No socket found for user ${user.username}`);
            }

            // Gửi sự kiện updateGroups đến các thành viên khác trong nhóm
            for (const group of groups) {
                for (const member of group.members) {
                    if (member !== user.username) {
                        const memberSocketId = onlineUsers.get(member);
                        if (memberSocketId) {
                            const memberGroups = await Group.find({ members: member });
                            const memberGroupList = memberGroups.map(g => ({
                                _id: g._id.toString(),
                                name: g.name,
                                members: g.members,
                                hasUnread: false
                            }));
                            console.log(`Sending updateGroups to ${member} (socket: ${memberSocketId})`);
                            io.to(memberSocketId).emit('updateGroups', memberGroupList);
                        }
                    }
                }
            }
        } else {
            console.warn('Socket.IO (onlineUsers or io) not available');
        }

        res.json({ message: "Cập nhật thành công!", avatarUrl: user.avatarUrl });
    } catch (err) {
        console.error('Error in /auth/update-info:', err.message, err.stack);
        res.status(500).json({ message: `Lỗi server: ${err.message}` });
    }
});

router.post('/update-avatar', upload.single('avatar'), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: "Chưa đăng nhập!" });

    try {
        const user = await User.findById(req.session.user.id);
        if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng!" });

        if (!req.file) return res.status(400).json({ message: "Không có ảnh được chọn!" });

        user.avatarUrl = `/uploads/avatars/${req.file.filename}`;
        await user.save();

        // Cập nhật lại session
        req.session.user.avatarUrl = user.avatarUrl;

        res.json({ message: "Đã cập nhật ảnh đại diện!", avatarUrl: user.avatarUrl });
    } catch (err) {
        console.error('Error in /auth/update-avatar:', err.message);
        res.status(500).json({ message: "Lỗi server!" });
    }
});

// -------------------- ĐỔI MẬT KHẨU --------------------
router.post('/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!req.session.user) {
        return res.status(401).json({ message: "Chưa đăng nhập!" });
    }

    try {
        // Tìm người dùng
        const user = await User.findById(req.session.user.id);
        if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng!" });

        // Kiểm tra mật khẩu hiện tại
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ message: "Mật khẩu hiện tại không đúng!" });

        // Mã hóa và cập nhật mật khẩu mới
        const hashed = await bcrypt.hash(newPassword, 10);
        user.password = hashed;

        await user.save();
        res.json({ message: "Đổi mật khẩu thành công!" });
    } catch (err) {
        console.error('Error in /auth/change-password:', err.message);
        res.status(500).json({ message: "Lỗi server!" });
    }
});

// -------------------- ĐĂNG XUẤT --------------------
router.post('/logout', (req, res) => {
    // Hủy session và xóa cookie
    req.session.destroy();
    res.clearCookie('connect.sid');
    res.json({ message: "Đã đăng xuất!" });
});

module.exports = router;