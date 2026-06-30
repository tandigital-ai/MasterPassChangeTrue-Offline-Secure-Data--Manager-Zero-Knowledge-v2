// config.js — Hằng số toàn cục & cấu hình hệ thống
// File này phải được nạp TRƯỚC api.js và app.js trong index.html

const DB_NAME = "SecureVaultDB";
const DB_VERSION = 1;
const STORE_VAULT_DATA = "VaultData";
const STORE_CATEGORIES = "Categories";
const AUTO_LOCK_TIMEOUT = 300000;      // 5 phút (ms) - giá trị mặc định
const CLIPBOARD_CLEAR_DELAY = 30000;   // 30 giây (ms)
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_HASH_ALGORITHM = "SHA-512";
const ENCRYPTION_ALGORITHM = "AES-GCM";
const ENCRYPTION_KEY_LENGTH = 256;

window.DB_NAME = DB_NAME;
window.DB_VERSION = DB_VERSION;
window.STORE_VAULT_DATA = STORE_VAULT_DATA;
window.STORE_CATEGORIES = STORE_CATEGORIES;
window.AUTO_LOCK_TIMEOUT = AUTO_LOCK_TIMEOUT;
window.CLIPBOARD_CLEAR_DELAY = CLIPBOARD_CLEAR_DELAY;
window.PBKDF2_ITERATIONS = PBKDF2_ITERATIONS;
window.PBKDF2_HASH_ALGORITHM = PBKDF2_HASH_ALGORITHM;
window.ENCRYPTION_ALGORITHM = ENCRYPTION_ALGORITHM;
window.ENCRYPTION_KEY_LENGTH = ENCRYPTION_KEY_LENGTH;

// Danh mục mặc định khi chạy lần đầu
const DEFAULT_CATEGORIES = [
  {
    id: "cat-logins",
    name: "Tài khoản Đăng nhập",
    fields: [
      { name: "title", type: "text", label: "Tiêu đề / Ứng dụng" },
      { name: "username", type: "text", label: "Tên đăng nhập / Email" },
      { name: "password", type: "password", label: "Mật khẩu" },
      { name: "website", type: "text", label: "Địa chỉ Website" },
      { name: "notes", type: "textarea", label: "Ghi chú thêm" }
    ],
    createdAt: 1700000000001
  },
  {
    id: "cat-api-keys",
    name: "API Keys & Tokens",
    fields: [
      { name: "serviceName", type: "text", label: "Tên dịch vụ (OpenAI, AWS...)" },
      { name: "apiKey", type: "password", label: "Khóa API Key / Token" },
      { name: "apiUrl", type: "text", label: "API Endpoint" },
      { name: "notes", type: "textarea", label: "Ghi chú sử dụng" }
    ],
    createdAt: 1700000000002
  },
  {
    id: "cat-secure-notes",
    name: "Ghi chú bảo mật",
    fields: [
      { name: "title", type: "text", label: "Tiêu đề ghi chú" },
      { name: "secureContent", type: "password", label: "Nội dung bí mật" },
      { name: "tags", type: "text", label: "Thẻ phân loại (Tags)" }
    ],
    createdAt: 1700000000003
  },
  {
    id: "cat-bank-cards",
    name: "Thẻ ngân hàng",
    fields: [
      { name: "bankName", type: "text", label: "Tên ngân hàng" },
      { name: "cardHolder", type: "text", label: "Tên chủ thẻ (không dấu)" },
      { name: "cardNumber", type: "text", label: "Số thẻ" },
      { name: "expiryDate", type: "text", label: "Ngày hết hạn (MM/YY)" },
      { name: "cvv", type: "password", label: "Mã bảo mật CVV/CVC" }
    ],
    createdAt: 1700000000004
  }
];

window.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;
