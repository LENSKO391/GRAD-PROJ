import { db, storage } from './FirebaseAuth';
import { collection, addDoc, getDocs, deleteDoc, query, where, serverTimestamp, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

export class HistoryStore {
    static async addRecord(email, record) {
        if (!db) throw new Error("Firebase DB not initialized. Please configure API Keys in FirebaseAuth.js");

        let downloadURL = null;
        let storagePath = null;
        
        let fileBlob = null;
        if (record.data) {
            if (record.data instanceof Blob || record.data instanceof File) {
                fileBlob = record.data;
            } else if (typeof record.data === 'string' || record.data instanceof Uint8Array) {
                fileBlob = new Blob([record.data], { type: record.mimeType || 'application/octet-stream' });
            }
        }

        // 1. Upload heavy file if included
        if (fileBlob) {
            if (!storage) throw new Error("Firebase Storage not initialized.");
            const safeName = record.file.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const fileId = Date.now().toString() + Math.floor(Math.random() * 1000);
            storagePath = `user-files/${email}/${fileId}_${safeName}`;
            
            const fileRef = ref(storage, storagePath);
            await uploadBytes(fileRef, fileBlob);
            downloadURL = await getDownloadURL(fileRef);
        }

        // 2. Save document to Cloud Firestore
        const historyRef = collection(db, "historyRecords");
        const docData = {
            email,
            file: record.file,
            action: record.action,
            mimeType: record.mimeType,
            date: serverTimestamp(),
            // Don't save raw data/base64 to firestore since we have the URL instead!
            data: null, 
            downloadURL,
            storagePath
        };
        
        const docRef = await addDoc(historyRef, docData);
        return docRef.id;
    }

    static async getRecords(email) {
        if (!db) return [];
        const historyRef = collection(db, "historyRecords");
        const q = query(historyRef, where("email", "==", email));
        const querySnapshot = await getDocs(q);
        
        const records = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            records.push({
                id: doc.id,
                ...data,
                // Convert timestamp fallback
                date: data.date ? data.date.toDate().toISOString() : new Date().toISOString()
            });
        });
        
        // Sorting strictly by date desc
        return records.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    static async deleteRecord(id, storagePath = null) {
        if (!db) return;
        
        // Clean up from Firebase Storage bucket first
        if (storagePath && storage) {
            try {
                const fileRef = ref(storage, storagePath);
                await deleteObject(fileRef);
            } catch (err) {
                console.warn("Could not delete from cloud storage bucket:", err);
            }
        }
        
        // Delete the Firestore document
        await deleteDoc(doc(db, "historyRecords", id));
    }
}
