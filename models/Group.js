const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  members: [{ type: String }], // Danh sách username của thành viên
  messages: [{
    sender: String,
    content: String,
    type: { type: String, default: 'text' },
    timestamp: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('Group', groupSchema);