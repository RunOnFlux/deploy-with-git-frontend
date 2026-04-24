/**
 * Secure Binary Storage with Non-Extractable Keys
 * Uses Web Crypto API with non-extractable keys stored in IndexedDB
 * Key cannot be extracted even with console access
 */

class SecureStorage {
  constructor() {
    this.dbName = '_secure_storage';
    this.keyStoreName = 'keys';
    this.keyName = 'encryption_key';
    this.dbPromise = this.initDB();
    this.keyPromise = this.getOrGenerateKey();
  }

  /**
   * Initialize IndexedDB for storing non-extractable keys
   */
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.keyStoreName)) {
          db.createObjectStore(this.keyStoreName);
        }
      };
    });
  }

  /**
   * Get key from IndexedDB
   */
  async getKeyFromDB() {
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.keyStoreName], 'readonly');
        const store = transaction.objectStore(this.keyStoreName);
        const request = store.get(this.keyName);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to get key from DB:', error);
      return null;
    }
  }

  /**
   * Store key in IndexedDB
   */
  async storeKeyInDB(key) {
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.keyStoreName], 'readwrite');
        const store = transaction.objectStore(this.keyStoreName);
        const request = store.put(key, this.keyName);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to store key in DB:', error);
    }
  }

  /**
   * Generate or retrieve non-extractable encryption key
   */
  async getOrGenerateKey() {
    try {
      // Try to get existing key from IndexedDB
      let key = await this.getKeyFromDB();

      if (key) {
        return key;
      }

      // Generate new NON-EXTRACTABLE key
      key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // ← NON-EXTRACTABLE! Cannot be exported/read
        ['encrypt', 'decrypt']
      );

      // Store CryptoKey object in IndexedDB
      await this.storeKeyInDB(key);

      console.log('✅ Non-extractable encryption key generated');
      return key;
    } catch (error) {
      console.error('Key generation failed:', error);
      throw error;
    }
  }

  /**
   * Encrypt and store as binary
   */
  async setItem(key, value) {
    try {
      const cryptoKey = await this.keyPromise;

      // Serialize to JSON
      const jsonStr = JSON.stringify(value);
      const data = new TextEncoder().encode(jsonStr);

      // Generate IV
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Encrypt with NON-EXTRACTABLE key
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        data
      );

      // Combine IV + encrypted data as binary
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Convert to binary string (raw bytes as characters)
      let binaryStr = '';
      for (let i = 0; i < combined.length; i++) {
        binaryStr += String.fromCharCode(combined[i]);
      }

      // Store as raw binary string (no base64)
      localStorage.setItem(key, binaryStr);

      return true;
    } catch (error) {
      console.error('Storage failed:', error);
      return false;
    }
  }

  /**
   * Retrieve and decrypt binary data
   */
  async getItem(key) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const cryptoKey = await this.keyPromise;

      // Convert binary string to Uint8Array
      const combined = new Uint8Array(stored.length);
      for (let i = 0; i < stored.length; i++) {
        combined[i] = stored.charCodeAt(i);
      }

      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      // Decrypt with NON-EXTRACTABLE key
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        encrypted
      );

      // Parse JSON
      const jsonStr = new TextDecoder().decode(decrypted);
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Retrieval failed:', error);
      return null;
    }
  }

  /**
   * Remove item
   */
  removeItem(key) {
    localStorage.removeItem(key);
  }

  /**
   * Clear all data AND encryption key
   */
  async clear() {
    // Clear encrypted data
    ['zelidauth', 'user_session', 'user_data'].forEach(key => this.removeItem(key));

    // Clear encryption key from IndexedDB
    try {
      const db = await this.dbPromise;
      const transaction = db.transaction([this.keyStoreName], 'readwrite');
      const store = transaction.objectStore(this.keyStoreName);
      store.delete(this.keyName);
    } catch (error) {
      console.error('Failed to clear key:', error);
    }
  }

  /**
   * Check existence
   */
  hasItem(key) {
    return localStorage.getItem(key) !== null;
  }
}

export default new SecureStorage();
