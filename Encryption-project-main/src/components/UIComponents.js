import React from 'react';
import { Key, CheckCircle, Download, Shield, AlertCircle } from 'lucide-react';

export const TabBtn = ({ active, onClick, children, icon: Icon }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${active ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/50' : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/80'
      }`}
  >
    {Icon && <Icon size={15} />}
    {children}
  </button>
);

export const ModeToggle = ({ value, onChange }) => (
  <div className="flex gap-2 p-1 bg-slate-900/60 rounded-xl border border-slate-700/50 shadow-inner">
    {['encrypt', 'decrypt'].map(m => (
      <button
        key={m}
        type="button"
        onClick={() => onChange(m)}
        className={`flex-1 py-2.5 rounded-lg font-bold text-sm capitalize transition-all border ${
          value === m 
            ? 'bg-cyan-600 text-white shadow-md border-cyan-300/60' 
            : 'text-slate-400 hover:text-slate-200 border-slate-600/80 hover:border-slate-500 hover:bg-slate-800/40'
        }`}
      >
        {m}
      </button>
    ))}
  </div>
);

export const Notice = ({ type, children }) => {
  const isError = type === 'error';
  const theme = {
    bg: isError ? '#2d0a0a' : '#062c22',
    border: isError ? '#ef4444' : '#10b981',
    text: isError ? '#fecaca' : '#a7f3d0'
  };

  return (
    <div 
      className="p-4 rounded-xl text-sm font-bold flex items-center gap-3 transition-all border-2"
      style={{
        backgroundColor: theme.bg,
        borderColor: theme.border,
        color: theme.text
      }}
    >
      <div className="shrink-0">
        {type === 'success' 
          ? <CheckCircle size={20} style={{ color: theme.border }} /> 
          : <AlertCircle size={20} style={{ color: theme.border }} />
        }
      </div>
      <span className="flex-1 leading-relaxed" style={{ color: theme.text }}>{children}</span>
    </div>
  );
};

export const KeyInput = ({ value, onChange, placeholder = 'Enter encryption/decryption password' }) => (
  <div className="relative">
    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
    <input
      type="password"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600/80 text-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-sm"
      required
    />
  </div>
);

export const SubmitBtn = ({ processing, mode, label }) => (
  <button
    type="submit"
    disabled={processing}
    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-lg hover:from-cyan-500 hover:to-blue-500 font-semibold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
  >
    <Download size={15} />
    {processing ? 'Processing…' : label || (mode === 'encrypt' ? 'Encrypt & Download' : 'Decrypt & Download')}
  </button>
);
