// api.js — Lõi mã hóa, IndexedDB, import/export, tạo mật khẩu
// Lưu ý: hằng số đã được khai báo trong config.js (nạp trước file này)

// === SESSION MEMORY (RAM) ===
window.vaultSession = {
  cryptoKey: null,
  lastActivityTime: 0
};

// === TIỆN ÍCH CHUYỂN ĐỔI ===
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// === INDEXEDDB (bản DUY NHẤT cho toàn ứng dụng) ===
function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_VAULT_DATA)) {
        db.createObjectStore(STORE_VAULT_DATA, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
        db.createObjectStore(STORE_CATEGORIES, { keyPath: "id" });
      }
    };
  });
}

// === MÃ HÓA & BẢO MẬT ===
async function deriveKeyFromPassword(password, salt) {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = base64ToBuffer(salt);

  const baseKey = await window.crypto.subtle.importKey(
    "raw", passwordBuffer, "PBKDF2", false, ["deriveBits", "deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBuffer, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH_ALGORITHM },
    baseKey,
    { name: ENCRYPTION_ALGORITHM, length: ENCRYPTION_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(data, key) {
  const encoder = new TextEncoder();
  const encodedData = encoder.encode(JSON.stringify(data));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv: iv }, key, encodedData
  );
  return { encryptedData: bufferToBase64(encryptedBuffer), iv: bufferToBase64(iv) };
}

async function decryptData(encryptedData, iv, key) {
  const encryptedBuffer = base64ToBuffer(encryptedData);
  const ivBuffer = base64ToBuffer(iv);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: ENCRYPTION_ALGORITHM, iv: ivBuffer }, key, encryptedBuffer
  );
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decryptedBuffer));
}

async function setupMasterPassword(masterPassword) {
  try {
    const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
    const saltBase64 = bufferToBase64(saltBytes);
    const key = await deriveKeyFromPassword(masterPassword, saltBase64);

    const verificationPayload = { verified: true, timestamp: Date.now() };
    const { encryptedData, iv } = await encryptData(verificationPayload, key);

    localStorage.setItem("vault_salt", saltBase64);
    localStorage.setItem("vault_verification_iv", iv);
    localStorage.setItem("vault_verification_data", encryptedData);
    // QUAN TRỌNG: đánh dấu đã khởi tạo để lần sau hiện màn hình MỞ KHÓA, tránh ghi đè salt làm mất dữ liệu
    localStorage.setItem("vault_initialized", "true");

    window.vaultSession.cryptoKey = key;
    window.vaultSession.lastActivityTime = Date.now();
    return true;
  } catch (error) {
    console.error("Lỗi thiết lập mật khẩu chính:", error);
    return false;
  }
}

async function unlockVault(masterPassword) {
  try {
    const saltBase64 = localStorage.getItem("vault_salt");
    const ivBase64 = localStorage.getItem("vault_verification_iv");
    const encryptedVerification = localStorage.getItem("vault_verification_data");
    if (!saltBase64 || !ivBase64 || !encryptedVerification) return false;

    const key = await deriveKeyFromPassword(masterPassword, saltBase64);
    const decrypted = await decryptData(encryptedVerification, ivBase64, key);

    if (decrypted && decrypted.verified === true) {
      window.vaultSession.cryptoKey = key;
      window.vaultSession.lastActivityTime = Date.now();
      return true;
    }
    return false;
  } catch (error) {
    // Sai mật khẩu -> AES-GCM xác thực thất bại -> ném lỗi (đây là hành vi an toàn, đúng)
    console.warn("Mật khẩu chính không chính xác.");
    return false;
  }
}

// Đổi Master Password: xác minh mật khẩu cũ, giải mã lại toàn bộ bằng khóa cũ,
// mã hóa lại bằng khóa mới, rồi cập nhật salt & khối xác thực.
async function changeMasterPassword(oldPassword, newPassword) {
  const saltBase64 = localStorage.getItem("vault_salt");
  const ivBase64 = localStorage.getItem("vault_verification_iv");
  const encVerify = localStorage.getItem("vault_verification_data");
  if (!saltBase64 || !ivBase64 || !encVerify) {
    throw new Error("Chưa thiết lập mật khẩu chính.");
  }

  // 1. Xác minh mật khẩu cũ bằng cách dẫn xuất khóa cũ và thử giải mã khối xác thực
  const oldKey = await deriveKeyFromPassword(oldPassword, saltBase64);
  try {
    const v = await decryptData(encVerify, ivBase64, oldKey);
    if (!v || v.verified !== true) throw new Error("invalid");
  } catch {
    throw new Error("Mật khẩu hiện tại không chính xác.");
  }

  // 2. Đọc & giải mã toàn bộ bản ghi bằng khóa cũ
  const db = await getDB();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VAULT_DATA, "readonly");
    const r = tx.objectStore(STORE_VAULT_DATA).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

  const plainList = [];
  for (const rec of records) {
    const payload = await decryptData(rec.encryptedData, rec.iv, oldKey);
    plainList.push({ rec, payload });
  }

  // 3. Tạo salt mới + khóa mới, mã hóa lại tất cả
  const newSaltBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const newSalt = bufferToBase64(newSaltBytes);
  const newKey = await deriveKeyFromPassword(newPassword, newSalt);

  const reEncrypted = [];
  for (const { rec, payload } of plainList) {
    const { encryptedData, iv } = await encryptData(payload, newKey);
    reEncrypted.push({ ...rec, encryptedData, iv, updatedAt: Date.now() });
  }

  // 4. Ghi lại tất cả bản ghi đã mã hóa lại (trong một transaction)
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VAULT_DATA, "readwrite");
    const store = tx.objectStore(STORE_VAULT_DATA);
    for (const r of reEncrypted) store.put(r);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // 5. Cập nhật khối xác thực + salt mới
  const newVerify = await encryptData({ verified: true, timestamp: Date.now() }, newKey);
  localStorage.setItem("vault_salt", newSalt);
  localStorage.setItem("vault_verification_iv", newVerify.iv);
  localStorage.setItem("vault_verification_data", newVerify.encryptedData);

  // 6. Cập nhật khóa trong phiên hiện tại
  window.vaultSession.cryptoKey = newKey;
  window.vaultSession.lastActivityTime = Date.now();
  return true;
}

function lockVault() {
  window.vaultSession.cryptoKey = null;
  window.vaultSession.lastActivityTime = 0;
}

function isVaultUnlocked() {
  return window.vaultSession.cryptoKey !== null;
}

// === DỮ LIỆU VAULT ===
async function saveVaultData(data) {
  if (!window.vaultSession.cryptoKey) throw new Error("Vault đang bị khóa.");

  const payloadToEncrypt = { fields: data.fields || {} };
  const { encryptedData, iv } = await encryptData(payloadToEncrypt, window.vaultSession.cryptoKey);

  const recordId = data.id || crypto.randomUUID();
  const record = {
    id: recordId,
    categoryId: data.categoryId,
    encryptedData: encryptedData,
    iv: iv,
    isFavorite: !!data.isFavorite,
    createdAt: data.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VAULT_DATA, "readwrite");
    const store = tx.objectStore(STORE_VAULT_DATA);
    const request = store.put(record);
    request.onsuccess = () => resolve(recordId);
    request.onerror = () => reject(request.error);
  });
}

async function loadVaultData() {
  if (!window.vaultSession.cryptoKey) throw new Error("Vault đang bị khóa.");

  const db = await getDB();
  const encryptedRecords = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VAULT_DATA, "readonly");
    const store = tx.objectStore(STORE_VAULT_DATA);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const decryptedRecords = [];
  for (const record of encryptedRecords) {
    try {
      const payload = await decryptData(record.encryptedData, record.iv, window.vaultSession.cryptoKey);
      decryptedRecords.push({
        id: record.id,
        categoryId: record.categoryId,
        isFavorite: record.isFavorite,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        fields: payload.fields
      });
    } catch (error) {
      console.error(`Không thể giải mã bản ghi ${record.id}:`, error);
    }
  }
  return decryptedRecords;
}

async function deleteVaultData(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VAULT_DATA, "readwrite");
    const store = tx.objectStore(STORE_VAULT_DATA);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// === DANH MỤC ===
async function loadCategories() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CATEGORIES, "readonly");
    const store = tx.objectStore(STORE_CATEGORIES);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveCategory(category) {
  const db = await getDB();
  const categoryId = category.id || crypto.randomUUID();
  const record = {
    id: categoryId,
    name: category.name,
    fields: category.fields || [],
    createdAt: category.createdAt || Date.now()
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CATEGORIES, "readwrite");
    const store = tx.objectStore(STORE_CATEGORIES);
    const request = store.put(record);
    request.onsuccess = () => resolve(categoryId);
    request.onerror = () => reject(request.error);
  });
}

async function deleteCategory(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CATEGORIES, "readwrite");
    const store = tx.objectStore(STORE_CATEGORIES);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// === CẤU HÌNH NGƯỜI DÙNG ===
function saveUserSettings(settings) {
  localStorage.setItem("UserSettings", JSON.stringify(settings));
}

function loadUserSettings() {
  try {
    return JSON.parse(localStorage.getItem("UserSettings")) || { autoLockTime: 5, theme: "dark" };
  } catch {
    return { autoLockTime: 5, theme: "dark" };
  }
}

// === IMPORT / EXPORT ===
async function exportVaultData() {
  const db = await getDB();
  const vaultData = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VAULT_DATA, "readonly");
    const r = tx.objectStore(STORE_VAULT_DATA).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const categories = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CATEGORIES, "readonly");
    const r = tx.objectStore(STORE_CATEGORIES).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

  const backup = {
    salt: localStorage.getItem("vault_salt"),
    verificationIv: localStorage.getItem("vault_verification_iv"),
    verificationData: localStorage.getItem("vault_verification_data"),
    vaultData, categories, exportedAt: Date.now()
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `secure_vault_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importVaultData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backup = JSON.parse(event.target.result);
        if (!backup.salt || !backup.verificationIv || !backup.verificationData) {
          throw new Error("Định dạng file sao lưu không hợp lệ.");
        }
        const currentSalt = localStorage.getItem("vault_salt");
        if (currentSalt && currentSalt !== backup.salt) {
          throw new Error("Mật khẩu chính của file sao lưu không khớp với ứng dụng hiện tại!");
        }
        if (!currentSalt) {
          localStorage.setItem("vault_salt", backup.salt);
          localStorage.setItem("vault_verification_iv", backup.verificationIv);
          localStorage.setItem("vault_verification_data", backup.verificationData);
          localStorage.setItem("vault_initialized", "true");
        }

        const db = await getDB();
        if (Array.isArray(backup.categories)) {
          const tx = db.transaction(STORE_CATEGORIES, "readwrite");
          const store = tx.objectStore(STORE_CATEGORIES);
          for (const cat of backup.categories) store.put(cat);
        }
        if (Array.isArray(backup.vaultData)) {
          const tx = db.transaction(STORE_VAULT_DATA, "readwrite");
          const store = tx.objectStore(STORE_VAULT_DATA);
          for (const item of backup.vaultData) store.put(item);
        }
        resolve(true);
      } catch (error) {
        console.error("Lỗi nhập sao lưu:", error);
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// === TẠO MẬT KHẨU ===
function generateRandomPassword(length = 16, options = {}) {
  const U = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const L = "abcdefghijklmnopqrstuvwxyz";
  const N = "0123456789";
  const S = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  let pool = "";
  let guaranteed = [];
  const pick = (set) => set[window.crypto.getRandomValues(new Uint32Array(1))[0] % set.length];

  if (options.uppercase !== false) { pool += U; guaranteed.push(pick(U)); }
  if (options.lowercase !== false) { pool += L; guaranteed.push(pick(L)); }
  if (options.numbers   !== false) { pool += N; guaranteed.push(pick(N)); }
  if (options.special) { pool += S; guaranteed.push(pick(S)); }
  if (pool.length === 0) pool = L + N;

  const remaining = Math.max(0, length - guaranteed.length);
  const rand = new Uint32Array(remaining);
  if (remaining > 0) window.crypto.getRandomValues(rand);

  let gen = "";
  for (let i = 0; i < remaining; i++) gen += pool[rand[i] % pool.length];

  const arr = [...guaranteed, ...gen.split("")];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = window.crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("").slice(0, length);
}

// === GẮN VÀO WINDOW ===
window.getDB = getDB;
window.deriveKeyFromPassword = deriveKeyFromPassword;
window.encryptData = encryptData;
window.decryptData = decryptData;
window.setupMasterPassword = setupMasterPassword;
window.unlockVault = unlockVault;
window.changeMasterPassword = changeMasterPassword;
window.lockVault = lockVault;
window.isVaultUnlocked = isVaultUnlocked;
window.saveVaultData = saveVaultData;
window.loadVaultData = loadVaultData;
window.deleteVaultData = deleteVaultData;
window.loadCategories = loadCategories;
window.saveCategory = saveCategory;
window.deleteCategory = deleteCategory;
window.saveUserSettings = saveUserSettings;
window.loadUserSettings = loadUserSettings;
window.exportVaultData = exportVaultData;
window.importVaultData = importVaultData;
window.generateRandomPassword = generateRandomPassword;

window.dispatchEvent(new Event("secure-api-ready"));
console.log("api.js đã sẵn sàng.");
