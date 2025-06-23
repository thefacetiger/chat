// Bắt sự kiện submit của form đăng nhập
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); // Ngăn trình duyệt reload trang khi submit

    const form = e.target;

    // Lấy dữ liệu từ form
    const data = {
        email: form.email.value,
        password: form.password.value
    };

    try {
        // Gửi yêu cầu POST tới server để đăng nhập
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, // Gửi dữ liệu dạng JSON
            body: JSON.stringify(data) // Chuyển dữ liệu thành chuỗi JSON
        });

        const result = await res.json(); // Chuyển phản hồi thành JSON

        if (res.ok) {
            alert("Đăng nhập thành công!");
            window.location.href = "/html/chat.html"; // Chuyển hướng sang trang chat nếu đăng nhập thành công
        } else {
            // Hiển thị thông báo lỗi từ server (nếu có), hoặc báo lỗi chung
            alert(result.message || "Đăng nhập thất bại!");
        }
    } catch (err) {
        // Trường hợp không kết nối được tới server (mạng, server down,...)
        alert("Lỗi kết nối server!");
    }
});
