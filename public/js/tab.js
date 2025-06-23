function openTab(tabName) {
    // Ẩn tất cả các tab content
    var tabContents = document.getElementsByClassName('tab-content');
    for (var i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove('active');
    }

    // Ẩn tất cả các tab buttons
    var tabButtons = document.getElementsByClassName('tab');
    for (var i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove('active');
    }

    // Hiển thị tab content và active tab button tương ứng
    document.getElementById(tabName + 'Tab').classList.add('active');
    event.currentTarget.classList.add('active');
}

// Mặc định hiển thị tab "info" khi tải trang
window.onload = function() {
    openTab('info');
};