// Bắt sự kiện submit của form đăng ký
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault(); // Ngăn trang bị reload khi submit form

    const form = e.target;

    // Thu thập dữ liệu từ form
    const data = {
        username: form.username.value,
        email: form.email.value,
        phone: form.phone.value,
        password: form.password.value,
        confirmPassword: form.confirmPassword.value
    };

    // Kiểm tra mật khẩu nhập lại có khớp không
    if (data.password !== data.confirmPassword) {
        return alert("Mật khẩu không khớp!");
    }

    try {
        // Gửi yêu cầu POST để đăng ký tài khoản
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, // Định dạng dữ liệu là JSON
            body: JSON.stringify(data) // Chuyển object thành chuỗi JSON
        });

        const result = await res.json(); // Chuyển phản hồi từ server thành JSON

        if (res.ok) {
            alert("Đăng ký thành công!");
            // Chuyển sang trang đăng nhập hoặc trang khác sau khi đăng ký thành công
            window.location.href = "/html/login.html";
        } else {
            // Hiển thị thông báo lỗi từ server
            alert(result.message);
        }
    } catch (err) {
        // Nếu không kết nối được đến server
        alert("Lỗi kết nối server!");
    }
});
