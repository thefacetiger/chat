import 'https://cdn.jsdelivr.net/npm/emoji-picker-element@^1/index.js';

// Khởi tạo kết nối socket
const socket = io();
let currentChatUser = null;
let currentGroupId = null;
let currentUser = null;

// Bộ nhớ tạm để kiểm tra thông báo trùng lặp
const notificationCache = new Set();
const NOTIFICATION_TIMEOUT = 5000; // Thời gian lưu cache thông báo (ms)

// Debounce để giới hạn tần suất requestGroups
const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};
const debouncedRequestGroups = debounce(() => socket.emit('requestGroups'), 500);

// Hàm khởi tạo người dùng hiện tại
async function initUser() {
    try {
        const res = await fetch('/api/user', { credentials: 'include' });
        if (res.ok) {
            currentUser = await res.json();
            document.getElementById('currentUsername').textContent = currentUser.username;
            socket.emit('userConnected', currentUser.username);
        } else {
            console.error('Not logged in, redirecting to login page');
            window.location.href = '/html/login.html';
        }
    } catch (error) {
        console.error('Lỗi khi lấy người dùng:', error);
        window.location.href = '/html/login.html';
    }
}

// Cập nhật danh sách nhóm trong sidebar
function updateGroupList(groups) {
    console.log('Updating group list:', groups);
    const groupList = document.getElementById('groupList');
    groupList.innerHTML = '';
    const deletedGroups = JSON.parse(localStorage.getItem('deletedGroups') || '{}');
    const filteredGroups = groups.filter(group => !deletedGroups[group._id]);
    if (filteredGroups.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Không có nhóm nào';
        li.className = 'group-item';
        groupList.appendChild(li);
    } else {
        filteredGroups.forEach(group => {
            const li = document.createElement('li');
            li.textContent = group.name;
            li.className = `group-item ${group.hasUnread ? 'unread' : ''}`;
            li.onclick = () => selectGroup(group._id, group.name);
            groupList.appendChild(li);
        });
    }
}

// Cập nhật danh sách người dùng online
socket.on('updateUsers', (users) => {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
    if (users.length <= 1) {
        const li = document.createElement('li');
        li.textContent = 'Không có người online';
        li.className = 'user-item';
        userList.appendChild(li);
    } else {
        users.forEach(({ username, hasUnread }) => {
            if (username !== currentUser.username) {
                const li = document.createElement('li');
                li.textContent = username;
                li.className = `user-item ${hasUnread ? 'unread' : ''}`;
                li.onclick = () => selectUser(username);
                userList.appendChild(li);
            }
        });
    }
});

// Cập nhật danh sách nhóm từ server
socket.on('updateGroups', (groups) => {
    updateGroupList(groups);
});

// Chọn người dùng để chat
async function selectUser(username) {
    if (username === currentUser.username) return;
    currentChatUser = username;
    currentGroupId = null;
    document.getElementById('chatWith').textContent = username;
    document.getElementById('groupActions').style.display = 'none';
    document.getElementById('messages').innerHTML = '';
    socket.emit('setCurrentChat', { username });
    document.querySelectorAll('.user-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.group-item').forEach(item => item.classList.remove('active'));
    const selectedUserItem = Array.from(document.querySelectorAll('.user-item')).find(item => item.textContent === username);
    if (selectedUserItem) {
        selectedUserItem.classList.add('active');
        selectedUserItem.classList.remove('unread');
    }
    try {
        const res = await fetch(`/api/messages/${username}`, { credentials: 'include' });
        if (res.ok) {
            const messages = await res.json();
            messages.forEach(displayMessage);
            socket.emit('markAsRead', { from: username, to: currentUser.username });
        }
    } catch (error) {
        console.error('Lỗi khi lấy tin nhắn:', error);
    }
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Chọn nhóm để chat
async function selectGroup(groupId, groupName) {
    currentChatUser = null;
    currentGroupId = groupId;
    document.getElementById('chatWith').textContent = groupName;
    document.getElementById('groupActions').style.display = 'flex';
    document.getElementById('messages').innerHTML = '';
    socket.emit('setCurrentChat', { groupId });
    document.querySelectorAll('.user-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.group-item').forEach(item => item.classList.remove('active'));
    const selectedGroupItem = Array.from(document.querySelectorAll('.group-item')).find(item => item.textContent === groupName);
    if (selectedGroupItem) {
        selectedGroupItem.classList.add('active');
        selectedGroupItem.classList.remove('unread');
    }
    try {
        const res = await fetch(`/api/group-messages/${groupId}`, { credentials: 'include' });
        if (res.ok) {
            let messages = await res.json();
            const deletedGroups = JSON.parse(localStorage.getItem('deletedGroups') || '{}');
            const deletedAt = deletedGroups[groupId];
            if (deletedAt) {
                messages = messages.filter(msg => new Date(msg.timestamp) > new Date(deletedAt));
            }
            messages.forEach(displayMessage);
            socket.emit('markGroupAsRead', { groupId, username: currentUser.username });
        } else {
            const error = await res.json();
            console.error('Lỗi tải tin nhắn nhóm:', error);
        }
    } catch (error) {
        console.error('Lỗi khi lấy tin nhắn nhóm:', error);
    }
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Xóa lịch sử nhóm (chỉ cho client hiện tại)
function deleteGroupHistory() {
    if (!confirm('Bạn có chắc muốn xóa nhóm này? Nhóm sẽ biến mất khỏi danh sách của bạn cho đến khi có tin nhắn mới.')) return;
    if (!currentGroupId) {
        return;
    }
    const deletedGroups = JSON.parse(localStorage.getItem('deletedGroups') || '{}');
    deletedGroups[currentGroupId] = new Date().toISOString();
    localStorage.setItem('deletedGroups', JSON.stringify(deletedGroups));
    showNotification(`Đã xóa lịch sử nhóm ${document.getElementById('chatWith').textContent}`);
    currentGroupId = null;
    document.getElementById('chatWith').textContent = 'Chọn người hoặc nhóm để chat';
    document.getElementById('messages').innerHTML = '';
    document.getElementById('groupActions').style.display = 'none';
    debouncedRequestGroups();
}

// Hiển thị tin nhắn
const displayedMessages = new Set();

function displayMessage({ messageId, sender, content, type, timestamp }) {
    if (messageId && displayedMessages.has(messageId)) {
        console.log(`Skipping duplicate message with ID: ${messageId}`);
        return;
    }
    if (messageId) displayedMessages.add(messageId);
    console.log('Displaying message:', { messageId, sender, content, type, timestamp });
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    const isSent = sender === currentUser.username;
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    const senderDiv = document.createElement('div');
    senderDiv.className = 'message-sender';
    senderDiv.textContent = sender;
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    if (type === 'text') {
        const p = document.createElement('p');
        p.textContent = content;
        contentDiv.appendChild(p);
    } else if (type === 'image') {
        const img = document.createElement('img');
        img.src = content;
        img.className = 'chat-image';
        img.onclick = () => openModal(content);
        const downloadBtn = document.createElement('a');
        downloadBtn.href = content;
        downloadBtn.download = content.split('/').pop();
        downloadBtn.textContent = 'Tải ảnh';
        downloadBtn.className = 'download-btn';
        downloadBtn.onclick = (e) => {
            if (!confirm('Bạn có chắc muốn tải ảnh này không?')) {
                e.preventDefault();
            }
        };
        contentDiv.appendChild(img);
        contentDiv.appendChild(downloadBtn);
    } else if (type === 'file') {
        const fileName = content.split('/').pop();
        const fileExt = fileName.split('.').pop().toLowerCase();
        let iconClass = 'fas fa-file-alt';
        if (fileExt === 'pdf') iconClass = 'fas fa-file-pdf';
        else if (['doc', 'docx'].includes(fileExt)) iconClass = 'fas fa-file-word';
        else if (['xls', 'xlsx'].includes(fileExt)) iconClass = 'fas fa-file-excel';
        else if (['zip', 'rar'].includes(fileExt)) iconClass = 'fas fa-file-archive';
        const a = document.createElement('a');
        a.href = content;
        a.download = fileName;
        a.className = 'file-download';
        const icon = document.createElement('i');
        icon.className = iconClass + ' file-icon';
        const span = document.createElement('span');
        span.textContent = fileName;
        a.appendChild(icon);
        a.appendChild(span);
        a.onclick = (e) => {
            if (!confirm('Bạn có chắc muốn tải file này không?')) {
                e.preventDefault();
            }
        };
        contentDiv.appendChild(a);
    }
    const timeSpan = document.createElement('div');
    timeSpan.className = 'timestamp';
    timeSpan.textContent = new Date(timestamp).toLocaleTimeString();
    messageDiv.appendChild(senderDiv);
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timeSpan);
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Gửi tin nhắn
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');
    const content = input.value.trim();
    const file = fileInput.files[0];
    if (!file && !content) {
        alert("Vui lòng nhập tin nhắn hoặc chọn file!");
        return;
    }
    if (!currentChatUser && !currentGroupId) {
        alert('Vui lòng chọn người hoặc nhóm để chat!');
        return;
    }
    const formData = new FormData();
    if (file) formData.append('file', file);
    if (content) formData.append('content', content);
    try {
        let res;
        if (currentGroupId) {
            res = await fetch(`/api/group-messages/${currentGroupId}`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
        } else {
            formData.append('receiver', currentChatUser);
            res = await fetch('/api/messages', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
        }
        if (res.ok) {
            const message = await res.json();
            displayMessage(message);
            if (currentGroupId) {
                socket.emit('sendGroupMessage', { groupId: currentGroupId, message });
            } else {
                socket.emit('sendMessage', message);
            }
            input.value = '';
            fileInput.value = '';
            previewArea.innerHTML = '';
        } else {
            const error = await res.json();
            alert(`Gửi tin nhắn thất bại: ${error.error}`);
        }
    } catch (error) {
        console.error('Lỗi khi gửi tin nhắn:', error);
        alert('Lỗi khi gửi tin nhắn!');
    }
}

document.addEventListener('keydown', (e) => {
    const isTyping = document.activeElement.id === 'messageInput';
    if (isTyping && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

socket.on('receiveMessage', (message) => {
    if (message.sender === currentChatUser || message.receiver === currentChatUser) {
        displayMessage(message);
    } else if (message.sender !== currentUser.username) {
        showNotification(`${message.sender} đã nhắn tin cho bạn`);
        socket.emit('markAsUnread', { from: message.sender, to: currentUser.username });
    }
});

socket.on('receiveGroupMessage', ({ groupId, name, message }) => {
    console.log('Received group message:', { groupId, name, message });
    const deletedGroups = JSON.parse(localStorage.getItem('deletedGroups') || '{}');
    console.log('Current deletedGroups:', deletedGroups);
    if (deletedGroups[groupId]) {
        console.log(`Group ${groupId} was deleted, removing from deletedGroups to show it again`);
        delete deletedGroups[groupId];
        localStorage.setItem('deletedGroups', JSON.stringify(deletedGroups));
        console.log('Updated deletedGroups:', deletedGroups);
    }
    if (groupId === currentGroupId) {
        console.log(`Displaying message in current group ${groupId}`);
        displayMessage(message);
        socket.emit('markGroupAsRead', { groupId, username: currentUser.username });
    } else if (message.sender !== currentUser.username) {
        console.log(`Showing notification and marking group ${groupId} as unread`);
        showNotification(`Tin nhắn mới trong nhóm ${name || 'Không tên'}`);
        socket.emit('markAsUnread', { from: `group:${groupId}`, to: currentUser.username });
        socket.emit('requestGroups'); // Làm mới để áp dụng trạng thái unread
    }
});

// Hiển thị thông báo với kiểm tra trùng lặp
function showNotification(message, eventId) {
    if (eventId && notificationCache.has(eventId)) {
        console.log(`Skipping duplicate notification with eventId: ${eventId}`);
        return;
    }
    if (eventId) {
        notificationCache.add(eventId);
        setTimeout(() => notificationCache.delete(eventId), NOTIFICATION_TIMEOUT);
    } else {
        if (notificationCache.has(message)) {
            console.log(`Skipping duplicate notification: ${message}`);
            return;
        }
        notificationCache.add(message);
        setTimeout(() => notificationCache.delete(message), NOTIFICATION_TIMEOUT);
    }
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
}

// Mở modal xem ảnh
function openModal(src) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    const modalImg = document.createElement('img');
    modalImg.src = src;
    modalImg.className = 'modal-image';
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-modal';
    closeBtn.textContent = '×';
    modal.appendChild(closeBtn);
    modal.appendChild(modalImg);
    document.body.appendChild(modal);
    closeBtn.onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

// Mở modal tạo nhóm
function openCreateGroupModal() {
    const modal = document.getElementById('createGroupModal');
    const membersContainer = document.getElementById('groupMembers');
    membersContainer.innerHTML = '<p>Đang tải...</p>';
    socket.emit('requestUsers');
    socket.once('updateUsers', (users) => {
        console.log('Users for group creation:', users);
        membersContainer.innerHTML = '';
        if (users.length <= 1) {
            membersContainer.innerHTML = '<p>Không có người online</p>';
        } else {
            users.forEach(({ username }) => {
                if (username !== currentUser.username) {
                    const label = document.createElement('label');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.name = 'members';
                    checkbox.value = username;
                    const span = document.createElement('span');
                    span.textContent = username;
                    label.appendChild(checkbox);
                    label.appendChild(span);
                    membersContainer.appendChild(label);
                }
            });
            if (!membersContainer.hasChildNodes()) {
                membersContainer.innerHTML = '<p>Không có người nào khác online</p>';
            }
        }
    });
    modal.style.display = 'flex';
}

// Đóng modal tạo nhóm
function closeCreateGroupModal() {
    document.getElementById('createGroupModal').style.display = 'none';
    document.getElementById('groupName').value = '';
    document.getElementById('groupMembers').innerHTML = '';
}

// Tạo nhóm
async function createGroup() {
    const groupName = document.getElementById('groupName').value.trim();
    const members = Array.from(document.querySelectorAll('#groupMembers input[name="members"]:checked')).map(input => input.value);
    if (!groupName || members.length === 0) {
        alert('Vui lòng nhập tên nhóm và chọn ít nhất một thành viên.');
        return;
    }
    try {
        console.log('Gửi yêu cầu tạo nhóm:', { name: groupName, members });
        const res = await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: groupName, members }),
            credentials: 'include'
        });
        const data = await res.json();
        if (res.ok) {
            closeCreateGroupModal();
            showNotification('Tạo nhóm thành công!');
            debouncedRequestGroups();
        } else {
            alert(data.error || 'Tạo nhóm thất bại');
        }
    } catch (error) {
        console.error('Lỗi khi tạo nhóm:', error);
        alert('Lỗi khi tạo nhóm!');
    }
}

// Mở modal thêm thành viên
function openAddMembersModal() {
    const modal = document.getElementById('addMembersModal');
    const membersContainer = document.getElementById('availableMembers');
    membersContainer.innerHTML = '<p>Đang tải...</p>';
    socket.emit('requestUsers');
    socket.once('updateUsers', (users) => {
        console.log('Users for adding to group:', users);
        membersContainer.innerHTML = '';
        fetch(`/api/groups`, { credentials: 'include' })
            .then(res => res.json())
            .then(groups => {
                const group = groups.find(g => g._id === currentGroupId);
                if (!group) {
                    membersContainer.innerHTML = '<p>Nhóm không tồn tại</p>';
                    return;
                }
                const currentMembers = group.members || [];
                if (users.length <= 1) {
                    membersContainer.innerHTML = '<p>Không có người online để thêm</p>';
                } else {
                    users.forEach(({ username }) => {
                        if (username !== currentUser.username && !currentMembers.includes(username)) {
                            const label = document.createElement('label');
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.name = 'members';
                            checkbox.value = username;
                            const span = document.createElement('span');
                            span.textContent = username;
                            label.appendChild(checkbox);
                            label.appendChild(span);
                            membersContainer.appendChild(label);
                        }
                    });
                    if (!membersContainer.hasChildNodes()) {
                        membersContainer.innerHTML = '<p>Không có người nào khác để thêm</p>';
                    }
                }
            })
            .catch(error => {
                console.error('Lỗi khi lấy thông tin nhóm:', error);
                membersContainer.innerHTML = '<p>Lỗi khi tải danh sách thành viên</p>';
            });
    });
    modal.style.display = 'flex';
}

// Đóng modal thêm thành viên
function closeAddMembersModal() {
    document.getElementById('addMembersModal').style.display = 'none';
    document.getElementById('availableMembers').innerHTML = '';
}

// Thêm thành viên vào nhóm
async function addMembers() {
    const members = Array.from(document.querySelectorAll('#availableMembers input[name="members"]:checked')).map(input => input.value);
    if (members.length === 0) {
        alert('Vui lòng chọn ít nhất một thành viên để thêm.');
        return;
    }
    try {
        console.log('Gửi yêu cầu thêm thành viên:', { groupId: currentGroupId, members });
        const res = await fetch(`/api/groups/${currentGroupId}/add-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ members }),
            credentials: 'include'
        });
        const data = await res.json();
        if (res.ok) {
            closeAddMembersModal();
            showNotification(data.message || 'Đã thêm thành viên vào nhóm!');
            debouncedRequestGroups();
        } else {
            alert(data.error || 'Lỗi khi thêm thành viên');
        }
    } catch (error) {
        console.error('Lỗi khi thêm thành viên:', error);
    }
}

// Rời nhóm
async function leaveGroup() {
    if (!confirm('Bạn có chắc muốn rời nhóm này?')) return;
    try {
        console.log('Gửi yêu cầu rời nhóm:', currentGroupId);
        const res = await fetch(`/api/groups/${currentGroupId}/leave`, {
            method: 'POST',
            credentials: 'include'
        });
        const data = await res.json();
        if (res.ok) {
            showNotification(data.message || 'Đã rời nhóm!');
            currentGroupId = null;
            document.getElementById('chatWith').textContent = 'Chọn người hoặc nhóm để chat';
            document.getElementById('messages').innerHTML = '';
            document.getElementById('groupActions').style.display = 'none';
            debouncedRequestGroups();
        } else {
            alert(data.error || 'Lỗi khi rời nhóm');
        }
    } catch (error) {
        console.error('Lỗi khi rời nhóm:', error);
    }
}

// Xử lý sự kiện groupUpdated
socket.on('groupUpdated', ({ groupId, name, members, message, eventId }) => {
    console.log('Received groupUpdated:', { groupId, name, members, message, eventId });
    if (members.includes(currentUser.username)) {
        showNotification(message, eventId);
        if (groupId === currentGroupId) {
            document.getElementById('chatWith').textContent = name;
        }
    }
    debouncedRequestGroups();
});

// Xử lý sự kiện groupLeft
socket.on('groupLeft', ({ groupId, message, eventId }) => {
    console.log('Received groupLeft:', { groupId, message, eventId });
    showNotification(message, eventId);
    if (groupId === currentGroupId) {
        currentGroupId = null;
        document.getElementById('chatWith').textContent = 'Chọn người hoặc nhóm để chat';
        document.getElementById('messages').innerHTML = '';
        document.getElementById('groupActions').style.display = 'none';
    }
    debouncedRequestGroups();
});

// Xử lý sự kiện groupCreated
socket.on('groupCreated', (group) => {
    console.log('Group created event received:', group);
    debouncedRequestGroups();
});

// Xử lý preview file
const previewArea = document.getElementById('previewArea');
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', () => {
    previewArea.innerHTML = '';
    const file = fileInput.files[0];
    if (!file) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-wrapper';
    const removeBtn = document.createElement('span');
    removeBtn.className = 'remove-preview';
    removeBtn.textContent = '×';
    removeBtn.title = 'Xóa file';
    removeBtn.onclick = () => {
        previewArea.innerHTML = '';
        fileInput.value = '';
    };
    if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.className = 'preview-image';
        wrapper.appendChild(img);
    } else {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-preview';
        fileDiv.textContent = file.name;
        wrapper.appendChild(fileDiv);
    }
    wrapper.appendChild(removeBtn);
    previewArea.appendChild(wrapper);
});

// Xử lý emoji
const emojiToggle = document.getElementById('emojiToggle');
const emojiWrapper = document.querySelector('.emoji-wrapper');
const emojiPicker = document.getElementById('emojiPicker');
const closeEmoji = document.getElementById('closeEmoji');
emojiToggle.addEventListener('click', () => {
    emojiWrapper.classList.toggle('active');
    emojiWrapper.style.display = emojiWrapper.classList.contains('active') ? 'block' : 'none';
});
emojiPicker.addEventListener('emoji-click', (event) => {
    document.getElementById('messageInput').value += event.detail.unicode;
    document.getElementById('messageInput').focus();
});
closeEmoji.addEventListener('click', () => {
    emojiWrapper.classList.remove('active');
    emojiWrapper.style.display = 'none';
});

// Khởi tạo và export hàm
initUser();
window.sendMessage = sendMessage;
window.openCreateGroupModal = openCreateGroupModal;
window.closeCreateGroupModal = closeCreateGroupModal;
window.createGroup = createGroup;
window.openAddMembersModal = openAddMembersModal;
window.closeAddMembersModal = closeAddMembersModal;
window.addMembers = addMembers;
window.leaveGroup = leaveGroup;
window.deleteGroupHistory = deleteGroupHistory;