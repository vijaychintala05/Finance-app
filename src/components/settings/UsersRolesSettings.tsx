import React, { useState } from 'react';
import { CheckCircle, Lock, Monitor } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

interface UsersRolesSettingsProps {
  subTab: 'users' | 'roles' | 'preferences';
}

export const UsersRolesSettings: React.FC<UsersRolesSettingsProps> = ({ subTab }) => {
  const { settings, updateSettings } = useBooks();
  const preferences = settings.userPreferences!;
  const [theme, setTheme] = useState(preferences.theme);
  const [language, setLanguage] = useState(preferences.language);
  const [dateFormat, setDateFormat] = useState(preferences.dateFormat);
  const [timezone, setTimezone] = useState(preferences.timezone);
  const [saved, setSaved] = useState(false);

  if (subTab !== 'preferences') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3">
        <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900">Membership and role changes require a verified server invitation and audit workflow.</p>
      </div>
    );
  }

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    updateSettings({
      userPreferences: {
        ...preferences,
        theme,
        language,
        dateFormat,
        timezone,
      },
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <Monitor className="w-5 h-5 text-blue-600" />
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Display preferences</h3>
          <p className="text-[11px] text-slate-500">These non-financial preferences are stored in this browser.</p>
        </div>
      </div>

      {saved && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs font-bold text-emerald-800 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Preferences saved on this device.</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <label className="font-bold text-slate-700 dark:text-slate-300">Theme
          <select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)} className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 font-normal">
            <option>Light</option><option>Dark</option><option>System</option>
          </select>
        </label>
        <label className="font-bold text-slate-700 dark:text-slate-300">Language
          <select value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 font-normal">
            <option>English (US)</option><option>English (UK)</option>
          </select>
        </label>
        <label className="font-bold text-slate-700 dark:text-slate-300">Date format
          <select value={dateFormat} onChange={(event) => setDateFormat(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 font-normal">
            <option>YYYY-MM-DD</option><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option>
          </select>
        </label>
        <label className="font-bold text-slate-700 dark:text-slate-300">Timezone
          <input value={timezone} onChange={(event) => setTimezone(event.target.value)} maxLength={100} className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 font-normal" />
        </label>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">Save preferences</button>
      </div>
    </form>
  );
};
