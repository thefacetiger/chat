const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const messageRoutes = require('./routes/messages');
const authRoutes = require('./routes/auth');
const http = require('http');
const { Server } = require('socket.io');
const Group = require('./models/Group');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Cấu hình multer để upload file
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: 'your-secure-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: 'mongodb://localhost:27017/chat-app' }),
  cookie: { secure: false, httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB
mongoose.connect('mongodb://localhost:27017/chat-app')
  .then(() => console.log('Đã kết nối MongoDB'))
  .catch((err) => console.error('Lỗi kết nối MongoDB:', err));


// Routes
app.use('/auth', authRoutes);
app.use('/api/messages', messageRoutes);

app.get('/api/user', (req, res) => {
  // console.log('GET /api/user, session:', req.session.user);
  if (req.session.user) {
    const { username, email, avatarUrl } = req.session.user;
    res.json({ username, email, avatarUrl });
  } else {
    res.status(401).json({ error: 'Not logged in' });
  }
});

// API tạo nhóm
app.post('/api/groups', async (req, res) => {
  // console.log('POST /api/groups called with body:', req.body);
  // console.log('Session user:', req.session.user);
  try {
    if (!req.session.user || !req.session.user.username) {
      return res.status(401).json({ error: 'Not logged in' });
    }
    const { name, members } = req.body;
    if (!name || !members || !Array.isArray(members)) {
      return res.status(400).json({ error: 'Invalid group name or members' });
    }
    const group = new Group({
      name,
      members: [...new Set([...members, req.session.user.username])]
    });
    await group.save();
    console.log('Group created:', group);
    // Lấy danh sách nhóm mới nhất cho tất cả thành viên
    const groupMembers = group.members;
    for (const member of groupMembers) {
      const socketId = onlineUsers.get(member);
      if (socketId) {
        const groups = await Group.find({ members: member });
        console.log(`Sending updateGroups to ${member}:`, groups);
        io.to(socketId).emit('updateGroups', groups.map(g => ({
          _id: g._id.toString(),
          name: g.name,
          members: g.members,
          hasUnread: false
        })));
        io.to(socketId).emit('groupCreated', {
          _id: group._id.toString(),
          name: group.name,
          members: group.members
        });
      }
    }
    res.json({
      _id: group._id.toString(),
      name: group.name,
      members: group.members
    });
  } catch (error) {
    console.error('Error creating group:', error.message);
    res.status(500).json({ error: `Error creating group: ${error.message}` });
  }
});

// API lấy danh sách nhóm
app.get('/api/groups', async (req, res) => {
  console.log('GET /api/groups called, session:', req.session.user);
  try {
    if (!req.session.user || !req.session.user.username) {
      return res.status(401).json({ error: 'Not logged in' });
    }
    const groups = await Group.find({ members: req.session.user.username });
    console.log('Groups fetched:', groups);
    res.json(groups.map(g => ({
      _id: g._id.toString(),
      name: g.name,
      members: g.members,
      hasUnread: false
    })));
  } catch (error) {
    console.error('Error fetching groups:', error.message);
    res.status(500).json({ error: `Error fetching groups: ${error.message}` });
  }
});

// API gửi tin nhắn nhóm
// API gửi tin nhắn nhóm
app.post('/api/group-messages/:groupId', upload.single('file'), async (req, res) => {
  console.log('POST /api/group-messages called, groupId:', req.params.groupId);
  try {
      if (!req.session.user || !req.session.user.username) {
          return res.status(401).json({ error: 'Not logged in' });
      }
      const { groupId } = req.params;
      const { content } = req.body;
      const group = await Group.findById(groupId);
      if (!group) {
          return res.status(404).json({ error: 'Group not found' });
      }
      if (!group.members.includes(req.session.user.username)) {
          return res.status(403).json({ error: 'Not a group member' });
      }
      let message = {
          messageId: new mongoose.Types.ObjectId().toString(),
          sender: req.session.user.username,
          content: content || '',
          type: 'text',
          timestamp: new Date()
      };
      if (req.file) {
          message.content = `/uploads/${req.file.filename}`;
          message.type = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
      }
      group.messages.push(message);
      await group.save();
      console.log(`Message saved to group ${groupId}:`, message);

      // Gửi tin nhắn qua Socket.IO và cập nhật unreadMessages
      group.members.forEach(member => {
          if (member !== req.session.user.username) {
              const socketId = onlineUsers.get(member);
              if (socketId) {
                  console.log(`Sending receiveGroupMessage to ${member} (socket: ${socketId})`);
                  io.to(socketId).emit('receiveGroupMessage', {
                      groupId,
                      name: group.name,
                      message
                  });
                  if (!unreadMessages.has(member)) {
                      unreadMessages.set(member, new Set());
                  }
                  const currentGroup = userCurrentChat.get(member);
                  console.log(`Member ${member} currentGroup: ${currentGroup}, groupId: ${groupId}`);
                  if (currentGroup !== groupId) {
                      unreadMessages.get(member).add(`group:${groupId}`);
                      console.log(`Added group:${groupId} to unreadMessages for ${member}:`, Array.from(unreadMessages.get(member)));
                  }
                  updateGroups(member); // Cập nhật danh sách nhóm ngay lập tức
              } else {
                  console.log(`No socket found for member ${member}`);
                  if (!unreadMessages.has(member)) {
                      unreadMessages.set(member, new Set());
                  }
                  unreadMessages.get(member).add(`group:${groupId}`);
                  console.log(`Added group:${groupId} to unreadMessages for ${member} (offline):`, Array.from(unreadMessages.get(member)));
              }
          }
      });
      res.json(message);
  } catch (error) {
      console.error('Error sending group message:', error.message, error.stack);
      res.status(500).json({ error: `Error sending group message: ${error.message}` });
  }
});
// API thêm thành viên vào nhóm
app.post('/api/groups/:groupId/add-members', async (req, res) => {
  console.log('POST /api/groups/:groupId/add-members called, groupId:', req.params.groupId);
  try {
      if (!req.session.user || !req.session.user.username) {
          return res.status(401).json({ error: 'Not logged in' });
      }
      const { groupId } = req.params;
      const { members } = req.body; // Danh sách username cần thêm
      if (!members || !Array.isArray(members) || members.length === 0) {
          return res.status(400).json({ error: 'Invalid members list' });
      }
      const group = await Group.findById(groupId);
      if (!group) {
          return res.status(404).json({ error: 'Group not found' });
      }
      if (!group.members.includes(req.session.user.username)) {
          return res.status(403).json({ error: 'Not a group member' });
      }
      // Thêm các thành viên mới, loại bỏ trùng lặp
      const newMembers = [...new Set(members.filter(m => !group.members.includes(m)))];
      if (newMembers.length === 0) {
          return res.status(400).json({ error: 'No new members to add' });
      }
      group.members.push(...newMembers);
      await group.save();
      console.log(`Added members ${newMembers} to group ${groupId}`);

      // Thông báo cập nhật danh sách nhóm cho tất cả thành viên
      group.members.forEach(member => {
          const socketId = onlineUsers.get(member);
          if (socketId) {
              updateGroups(member);
              io.to(socketId).emit('groupUpdated', {
                  groupId,
                  name: group.name,
                  members: group.members,
                  message: `thành viên mới đã được thêm: ${newMembers.join(', ')}`
              });
          }
      });
  } catch (error) {
      console.error('Error adding members to group:', error.message, error.stack);
      res.status(500).json({ error: `Error adding members: ${error.message}` });
  }
});
// API rời nhóm
app.post('/api/groups/:groupId/leave', async (req, res) => {
  try {
      if (!req.session.user || !req.session.user.username) {
          return res.status(401).json({ error: 'Not logged in' });
      }
      const { groupId } = req.params;
      const username = req.session.user.username;
      const group = await Group.findById(groupId);
      if (!group) {
          return res.status(404).json({ error: 'Group not found' });
      }
      if (!group.members.includes(username)) {
          return res.status(403).json({ error: 'Not a group member' });
      }
      // Xóa người dùng khỏi nhóm
      group.members = group.members.filter(member => member !== username);
      if (group.members.length === 0) {
          // Xóa nhóm nếu không còn thành viên
          await Group.deleteOne({ _id: groupId });
          console.log(`Group ${groupId} deleted as no members remain`);
      } else {
          await group.save();
          console.log(`User ${username} left group ${groupId}`);
      }
      // Thông báo cập nhật danh sách nhóm cho tất cả thành viên còn lại
      group.members.forEach(member => {
          const socketId = onlineUsers.get(member);
          if (socketId) {
              updateGroups(member);
              io.to(socketId).emit('groupUpdated', {
                  groupId,
                  name: group.name,
                  members: group.members,
                  message: `${username} đã rời nhóm`
              });
          }
      });
      // Thông báo cho người rời nhóm
      const socketId = onlineUsers.get(username);
      if (socketId) {
          updateGroups(username);
          io.to(socketId).emit('groupLeft', { groupId, message: `Bạn đã rời nhóm ${group.name}` });
      }
  } catch (error) {
      console.error('Error leaving group:', error.message, error.stack);
      res.status(500).json({ error: `Error leaving group: ${error.message}` });
  }
});
// API lấy tin nhắn nhóm
app.get('/api/group-messages/:groupId', async (req, res) => {
  // console.log('GET /api/group-messages called, groupId:', req.params.groupId);
  try {
    if (!req.session.user || !req.session.user.username) {
      return res.status(401).json({ error: 'Not logged in' });
    }
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    if (!group.members.includes(req.session.user.username)) {
      return res.status(403).json({ error: 'Not a group member' });
    }
    res.json(group.messages);
  } catch (error) {
    console.error('Error fetching group messages:', error.message);
    res.status(500).json({ error: `Error fetching group messages: ${error.message}` });
  }
});

// Socket.IO
const onlineUsers = new Map();
const unreadMessages = new Map();
const userCurrentChat = new Map();

function updateAllUsersList() {
  for (const [username, socketId] of onlineUsers) {
    const unreadFrom = unreadMessages.get(username) || new Set();
    const userList = Array.from(onlineUsers.keys()).map(u => ({
      username: u,
      hasUnread: unreadFrom.has(u)
    }));
    io.to(socketId).emit('updateUsers', userList);
  }
}

function updateGroups(username) {
  const socketId = onlineUsers.get(username);
  if (socketId) {
    Group.find({ members: username }).then(groups => {
      const unreadFrom = unreadMessages.get(username) || new Set();
      const groupList = groups.map(group => ({
        _id: group._id.toString(),
        name: group.name,
        members: group.members,
        hasUnread: unreadFrom.has(`group:${group._id}`)
      }));
      // console.log(`Sending updateGroups to ${username}:`, groupList);
      io.to(socketId).emit('updateGroups', groupList);
    }).catch(err => console.error('Error updating groups:', err));
  }
}

io.on('connection', (socket) => {
  // console.log('Socket connected:', socket.id);

  socket.on('userConnected', (username) => {
    onlineUsers.set(username, socket.id);
    const unreadFrom = unreadMessages.get(username) || new Set();
    const userList = Array.from(onlineUsers.keys()).map(u => ({
      username: u,
      hasUnread: unreadFrom.has(u)
    }));
    io.to(socket.id).emit('updateUsers', userList);
    updateAllUsersList();
    updateGroups(username);
  });

  socket.on('requestUsers', () => {
    console.log('Request users:', Array.from(onlineUsers.keys()));
    const userList = Array.from(onlineUsers.keys()).map(u => ({
      username: u,
      hasUnread: unreadMessages.get(u)?.has(u) || false
    }));
    socket.emit('updateUsers', userList);
  });
// Sự kiện mới để cập nhật username
socket.on('updateUsername', async ({ oldUsername, newUsername }) => {
  if (onlineUsers.has(oldUsername)) {
      const socketId = onlineUsers.get(oldUsername);
      onlineUsers.delete(oldUsername);
      onlineUsers.set(newUsername, socketId);

      // Cập nhật userCurrentChat
      if (userCurrentChat.has(oldUsername)) {
          const currentChat = userCurrentChat.get(oldUsername);
          userCurrentChat.delete(oldUsername);
          userCurrentChat.set(newUsername, currentChat);
      }

      // Cập nhật unreadMessages
      if (unreadMessages.has(oldUsername)) {
          const unreadSet = unreadMessages.get(oldUsername);
          unreadMessages.delete(oldUsername);
          unreadMessages.set(newUsername, unreadSet);
      }

      // Cập nhật danh sách người dùng và nhóm
      updateAllUsersList();
      updateGroups(newUsername);
  }
});
  socket.on('requestGroups', () => {
    // console.log('Request groups for socket:', socket.id);
    const username = Array.from(onlineUsers.entries()).find(([_, id]) => id === socket.id)?.[0];
    if (username) {
      Group.find({ members: username }).then(groups => {
        const unreadFrom = unreadMessages.get(username) || new Set();
        const groupList = groups.map(group => ({
          _id: group._id.toString(),
          name: group.name,
          members: group.members,
          hasUnread: unreadFrom.has(`group:${group._id}`)
        }));
        console.log(`Sending updateGroups to ${username}:`, groupList);
        socket.emit('updateGroups', groupList);
      }).catch(err => console.error('Error fetching groups:', err));
    }
  });

  socket.on('sendMessage', (message) => {
    const receiverSocket = onlineUsers.get(message.receiver);
    if (receiverSocket) {
      io.to(receiverSocket).emit('receiveMessage', message);
    }
    if (!unreadMessages.has(message.receiver)) {
      unreadMessages.set(message.receiver, new Set());
    }
    const currentChat = userCurrentChat.get(message.receiver);
    if (currentChat !== message.sender) {
      unreadMessages.get(message.receiver).add(message.sender);
    }
    updateAllUsersList();
  });

  socket.on('sendGroupMessage', ({ groupId, message }) => {
    Group.findById(groupId).then(group => {
      if (group) {
        group.members.forEach(member => {
          if (member !== message.sender) {
            const socketId = onlineUsers.get(member);
            if (socketId) {
              io.to(socketId).emit('receiveGroupMessage', {
                groupId,
                name: group.name,
                message
              });
              if (!unreadMessages.has(member)) {
                unreadMessages.set(member, new Set());
              }
              const currentGroup = userCurrentChat.get(member);
              if (currentGroup !== groupId) {
                unreadMessages.get(member).add(`group:${groupId}`);
              }
              updateGroups(member);
            }
          }
        });
      }
    }).catch(err => console.error('Error sending group message:', err));
  });

  socket.on('markAsUnread', ({ from, to }) => {
    if (!unreadMessages.has(to)) {
      unreadMessages.set(to, new Set());
    }
    unreadMessages.get(to).add(from);
    updateAllUsersList();
  });

  socket.on('markAsRead', ({ from, to }) => {
    if (unreadMessages.has(to)) {
      unreadMessages.get(to).delete(from);
      if (unreadMessages.get(to).size === 0) {
        unreadMessages.delete(to);
      }
    }
    updateAllUsersList();
  });

  socket.on('markGroupAsRead', ({ groupId, username }) => {
    if (unreadMessages.has(username)) {
      unreadMessages.get(username).delete(`group:${groupId}`);
      if (unreadMessages.get(username).size === 0) {
        unreadMessages.delete(username);
      }
    }
    updateGroups(username);
  });

  socket.on('setCurrentChat', ({ username, groupId }) => {
    for (const [user, id] of onlineUsers) {
      if (id === socket.id) {
        userCurrentChat.set(user, groupId || username);
        break;
      }
    }
  });

  socket.on('disconnect', () => {
    for (const [username, id] of onlineUsers) {
      if (id === socket.id) {
        onlineUsers.delete(username);
        userCurrentChat.delete(username);
        updateAllUsersList();
        updateGroups(username);
        break;
      }
    }
  });
});

// File tĩnh
app.use('/uploads', express.static('public/uploads'));
// Xử lý lỗi chung
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: `Internal server error: ${err.message}` });
});

// Server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}/html/index.html`);
});
module.exports = { onlineUsers, io };