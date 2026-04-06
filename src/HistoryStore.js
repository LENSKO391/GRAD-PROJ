export class HistoryStore {
    static DB_NAME = 'CipherVaultDB';
    static STORE_NAME = 'historyRecords';
    static VERSION = 1;
    static db = null;

    static async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.VERSION);
            request.onerror = (e) => reject(`IndexedDB Error: ${e.target.error}`);
            request.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('email', 'email', { unique: false });
                }
            };
        });
    }

    static async addRecord(email, record) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const data = { email, ...record, date: new Date().toISOString() };
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(`Add Error: ${e.target.error}`);
        });
    }

    static async getRecords(email) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const index = store.index('email');
            const request = index.getAll(email);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(`Get Error: ${e.target.error}`);
        });
    }

    static async deleteRecord(id) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(`Delete Error: ${e.target.error}`);
        });
    }
}
