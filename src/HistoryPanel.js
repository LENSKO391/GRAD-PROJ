import React, { useEffect, useState } from 'react';
import { Clock, Download, Trash2 } from 'lucide-react';

export const HistoryPanel = ({ user, HistoryStore, FileProcessor, fromB64 }) => {
    const [history, setHistory] = useState([]);

    useEffect(() => {
        HistoryStore.getRecords(user.email).then(records => setHistory(records));
    }, [user.email, HistoryStore]);

    const handleDownload = (record) => {
        if (!record.data) return alert("File data missing from this record.");
        if (record.isBase64) {
            FileProcessor.downloadBytes({ bytes: fromB64(record.data), name: record.file, mimeType: record.mimeType });
        } else {
            FileProcessor.download({ text: record.data, name: record.file, mimeType: record.mimeType });
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this history log?")) return;
        try {
            await HistoryStore.deleteRecord(id);
            setHistory(history.filter(r => r.id !== id));
        } catch (e) {
            alert("Failed to delete record: " + e);
        }
    };

    return (
        <div className="space-y-4">
            {history.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                    <Clock size={48} className="mx-auto mb-3 opacity-20" />
                    <p>No activity history found for this account.</p>
                </div>
            ) : (
                <div className="rounded-lg border border-slate-600/60 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-800">
                                    <th className="px-4 py-3 text-left text-cyan-400 font-semibold border-b border-slate-700">Date & Time</th>
                                    <th className="px-4 py-3 text-left text-cyan-400 font-semibold border-b border-slate-700">Action</th>
                                    <th className="px-4 py-3 text-left text-cyan-400 font-semibold border-b border-slate-700">File / Target</th>
                                    <th className="px-4 py-3 text-right text-cyan-400 font-semibold border-b border-slate-700">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.slice().reverse().map((record, i) => (
                                    <tr key={i} className={i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/70'}>
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
                                                <button onClick={() => handleDownload(record)} disabled={!record.data} title="Download"
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-md text-xs font-semibold transition-colors">
                                                    <Download size={12} />
                                                    <span className="hidden sm:inline">Download</span>
                                                </button>
                                                <button onClick={() => handleDelete(record.id)} title="Delete Log"
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
            )}
        </div>
    );
};
