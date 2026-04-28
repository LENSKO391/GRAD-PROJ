import React, { useEffect, useState } from 'react';
import { Clock, Download, Trash2 } from 'lucide-react';
import {
  uploadEncryptedFile,
  getHistoryRecords,
  deleteHistoryRecord,
  deleteAllHistoryRecords,
} from './FirebaseStorage';

// =========================================================================
// SECTION 1: David
// =========================================================================
export class HistoryStore {
  // Legacy init kept for backwards compatibility (no-op now)
  static async init() { return null; }

  // =========================================================================
  // SECTION 2: George
  // =========================================================================
  /**
   * Upload an encrypted file to Firebase Storage and record it in Firestore.
   * @param {string} email
   * @param {{ file: string, action: string, blob: Blob, mimeType: string }} record
   */
  static async addRecord(email, record) {
    try {
      const blob = record.blob instanceof Blob
        ? record.blob
        : new Blob(
            [typeof record.data === 'string' ? record.data : record.data],
            { type: record.mimeType || 'application/octet-stream' }
          );
      await uploadEncryptedFile(email, blob, record.file, record.action, record.mimeType || 'application/octet-stream');
    } catch (e) {
      console.error('HistoryStore.addRecord error:', e);
    }
  }

  // =========================================================================
  // SECTION 3: Hana
  // =========================================================================
  static async getRecords(email) {
    try {
      return await getHistoryRecords(email);
    } catch (e) {
      console.error('HistoryStore.getRecords error:', e);
      return [];
    }
  }

  // =========================================================================
  // SECTION 4: Eyad
  // =========================================================================
  static async deleteRecord(record) {
    try {
      await deleteHistoryRecord(record);
    } catch (e) {
      console.error('HistoryStore.deleteRecord error:', e);
    }
  }

  static async deleteAllRecords(email) {
    try {
      await deleteAllHistoryRecords(email);
    } catch (e) {
      console.error('HistoryStore.deleteAllRecords error:', e);
    }
  }
}

// =========================================================================
// SECTION 5: Gamal
// =========================================================================
export const HistoryPanel = ({ user, HistoryStore }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  useEffect(() => {
    setLoading(true);
    HistoryStore.getRecords(user.email)
      .then(records => setHistory(records))
      .finally(() => setLoading(false));
  }, [user.email, HistoryStore]);

  const handleDownload = (record) => {
    if (!record.downloadURL) return alert('Download link not available.');
    window.open(record.downloadURL, '_blank');
  };

  // =========================================================================
  // SECTION 6: Moaz
  // =========================================================================
  const handleDelete = (record) => {
    setDeleteRecord(record);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteRecord) return;
    try {
      await HistoryStore.deleteRecord(deleteRecord);
      setHistory(history.filter(r => r.id !== deleteRecord.id));
    } catch (e) {
      alert('Failed to delete record: ' + e);
    } finally {
      setShowDeleteConfirm(false);
      setDeleteRecord(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteRecord(null);
  };

  const handleDeleteAll = () => setShowDeleteAllConfirm(true);

  const confirmDeleteAll = async () => {
    try {
      await HistoryStore.deleteAllRecords(user.email);
      setHistory([]);
    } catch (e) {
      alert('Failed to delete all records: ' + e);
    } finally {
      setShowDeleteAllConfirm(false);
    }
  };

  const cancelDeleteAll = () => setShowDeleteAllConfirm(false);

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="text-center py-8 text-slate-400">
          <Clock size={48} className="mx-auto mb-3 opacity-20 animate-pulse" />
          <p>Loading history from cloud…</p>
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Clock size={48} className="mx-auto mb-3 opacity-20" />
          <p>No activity history found for this account.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header with Delete All button */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-200">Activity History</h3>
            <button
              onClick={handleDeleteAll}
              disabled={history.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-700/20 hover:bg-red-700/80 disabled:bg-slate-700 disabled:text-slate-500 text-red-400 hover:text-white rounded-md text-sm font-medium transition-colors"
            >
              <Trash2 size={16} />
              Delete All
            </button>
          </div>

          <div className="rounded-lg border border-slate-600/60 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800">
                  <th className="px-4 py-3 text-left text-cyan-400 font-semibold border-b border-slate-700">Date &amp; Time</th>
                  <th className="px-4 py-3 text-left text-cyan-400 font-semibold border-b border-slate-700">Action</th>
                  <th className="px-4 py-3 text-left text-cyan-400 font-semibold border-b border-slate-700">File / Target</th>
                  <th className="px-4 py-3 text-right text-cyan-400 font-semibold border-b border-slate-700">Actions</th>
                </tr>
              </thead>
              {/* =========================================================================
              SECTION 7: Eslam
              ========================================================================= */}
              <tbody>
                {history.map((record, i) => (
                  <tr key={record.id ?? i} className={i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/70'}>
                    <td className="px-4 py-3 text-slate-300 border-b border-slate-800/60 whitespace-nowrap">
                      {new Date(record.date).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-300 border-b border-slate-800/60">
                      <span className="inline-flex items-center px-2 py-1 rounded bg-slate-800 text-xs font-medium">
                        {record.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 border-b border-slate-800/60 truncate max-w-[200px]" title={record.file}>
                      {record.file}
                    </td>
                    <td className="px-4 py-3 text-slate-300 border-b border-slate-800/60 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleDownload(record)} disabled={!record.downloadURL} title="Download from Cloud"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-md text-xs font-semibold transition-colors">
                          <Download size={12} />
                          <span className="hidden sm:inline">Download</span>
                        </button>
                        <button onClick={() => handleDelete(record)} title="Delete Log"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-red-700/20 hover:bg-red-700/80 text-red-500 hover:text-white rounded-md text-xs font-semibold transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-200 mb-4">Confirm Deletion</h3>
            <p className="text-slate-300 mb-6">Are you sure you want to delete this history log and its file from cloud storage? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={cancelDelete} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md font-medium transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-md font-medium transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Dialog */}
      {showDeleteAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-200 mb-4">Confirm Delete All</h3>
            <p className="text-slate-300 mb-2">Are you sure you want to delete all {history.length} history logs?</p>
            <p className="text-red-400 text-sm mb-6">This will permanently delete all files from cloud storage and cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={cancelDeleteAll} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md font-medium transition-colors">Cancel</button>
              <button onClick={confirmDeleteAll} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-md font-medium transition-colors">Delete All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
