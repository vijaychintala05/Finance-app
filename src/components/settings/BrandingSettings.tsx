import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Save,
  Trash2,
  Palette,
  Building2,
  Sparkles,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { apiClient } from '../../api/client';

const PRESET_PALETTES = [
  {
    name: 'Executive Navy',
    primary: '#1e40af',
    accent: '#0f172a',
    description: 'Corporate, authoritative & trusted',
  },
  {
    name: 'Forest Emerald',
    primary: '#059669',
    accent: '#064e3b',
    description: 'Fresh, growth-focused & advisory',
  },
  {
    name: 'Obsidian Slate',
    primary: '#0f172a',
    accent: '#334155',
    description: 'Modern, minimalist & sleek',
  },
  {
    name: 'Imperial Violet',
    primary: '#6b21a8',
    accent: '#3b0764',
    description: 'Creative, premium & refined',
  },
  {
    name: 'Crimson Ruby',
    primary: '#991b1b',
    accent: '#450a0a',
    description: 'Bold, distinctive & decisive',
  },
  {
    name: 'Charcoal Minimal',
    primary: '#27272a',
    accent: '#18181b',
    description: 'Timeless monochrome elegance',
  },
];

export const BrandingSettings: React.FC<{ onNavigateToPdfTemplates?: () => void }> = ({
  onNavigateToPdfTemplates,
}) => {
  const { currentOrg, settings, updateSettings, refreshOrganizations } = useBooks();

  const [primaryColor, setPrimaryColor] = useState('#1e40af');
  const [accentColor, setAccentColor] = useState('#0f172a');
  const [logoUrl, setLogoUrl] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load current branding
  useEffect(() => {
    let mounted = true;
    const fetchBranding = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<any>('/organizations/current');
        if (!mounted) return;
        if (res.data?.profile) {
          const prof = res.data.profile;
          let branding = prof.branding || {};
          if (typeof branding === 'string') {
            try { branding = JSON.parse(branding); } catch { branding = {}; }
          }
          setPrimaryColor(branding.primaryColor || '#1e40af');
          setAccentColor(branding.accentColor || '#0f172a');
          setLogoUrl(prof.logoUrl || branding.logoUrl || '');
        }
      } catch (err: any) {
        if (!mounted) return;
        console.error('Failed to load branding settings:', err);
        setError('Could not load current branding settings from server.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchBranding();
    return () => { mounted = false; };
  }, []);

  const handleFile = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (PNG, JPG, SVG, or WebP).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo image exceeds 2MB limit. Please upload an optimized image.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setLogoUrl(dataUrl);
      setSuccessMsg('Logo updated in preview. Click "Save Branding" to apply.');
      setTimeout(() => setSuccessMsg(null), 4000);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    if (!hexRegex.test(primaryColor)) {
      setError('Primary brand color must be a valid hex code (e.g. #1e40af).');
      setSaving(false);
      return;
    }
    if (!hexRegex.test(accentColor)) {
      setError('Accent brand color must be a valid hex code (e.g. #0f172a).');
      setSaving(false);
      return;
    }

    try {
      // Retain other existing branding fields from context
      const existingBranding = settings.branding || {};
      const payload = {
        logoUrl,
        branding: {
          ...existingBranding,
          primaryColor,
          accentColor,
          logoUrl,
        },
      };

      const res = await apiClient.patch<any>('/organizations/current', payload);
      if (res.error) throw new Error(res.error);

      updateSettings({
        branding: {
          ...existingBranding,
          primaryColor,
          accentColor,
          logoUrl,
        },
      });

      await refreshOrganizations();

      setSuccessMsg('Brand identity and colors saved successfully! In-app views and PDF exports now reflect these colors.');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Failed to save branding:', err);
      setError(err.message || 'Failed to save branding settings.');
    } finally {
      setSaving(false);
    }
  };

  const removeLogo = () => {
    setLogoUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSuccessMsg('Logo cleared from preview. Click "Save Branding" to persist.');
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-current border-t-transparent text-blue-600 rounded-full mb-3" />
        <p className="font-medium text-sm">Loading brand identity settings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Palette size={22} />
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Company Branding
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload your firm logo and customize primary and accent brand colors across the application.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all duration-150 disabled:opacity-50 cursor-pointer"
          >
            <Save size={16} />
            <span>{saving ? 'Saving Changes…' : 'Save Branding'}</span>
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle size={16} className="text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 text-sm">×</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600 text-sm">×</button>
        </div>
      )}

      {/* Main Branding Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Logo & Color Controls */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Logo Management */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <ImageIcon size={18} className="text-blue-600 dark:text-blue-400" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Company Logo
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">PNG, JPG, SVG, WebP up to 2MB</span>
            </div>

            {logoUrl ? (
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700">
                <div className="flex items-center space-x-4">
                  <div className="w-28 h-16 bg-white dark:bg-slate-900 rounded-lg p-2 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shadow-xs">
                    <img
                      src={logoUrl}
                      alt="Brand Logo Preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                      <CheckCircle2 size={14} />
                      <span>Active Brand Logo</span>
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">Used on official tax invoices, estimates, emails & PDF exports</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                    title="Remove logo"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 bg-slate-50/50 dark:bg-slate-800/40'
                }`}
              >
                <Upload size={32} className="mx-auto text-slate-400 mb-2" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Click to browse or drag and drop your logo
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Recommended size: 300 × 80 px (high-resolution PNG or vector SVG with transparent background)
                </p>
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              accept="image/png, image/jpeg, image/webp, image/svg+xml"
              className="hidden"
            />
          </div>

          {/* 2. Color Palette Studio */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Palette size={18} className="text-blue-600 dark:text-blue-400" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Brand Color Palette
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Applied to header bars, accents & highlights</span>
            </div>

            {/* Custom Hex Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Primary Brand Color
                </label>
                <div className="flex items-center space-x-2">
                  <div
                    className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner shrink-0 relative overflow-hidden cursor-pointer"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <input
                      type="color"
                      aria-label="Primary Brand Color Picker"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    />
                  </div>
                  <input
                    type="text"
                    aria-label="Primary Brand Color Hex"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl uppercase text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="#1e40af"
                    maxLength={7}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Used for document headers, major action buttons & banners</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Accent Color
                </label>
                <div className="flex items-center space-x-2">
                  <div
                    className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner shrink-0 relative overflow-hidden cursor-pointer"
                    style={{ backgroundColor: accentColor }}
                  >
                    <input
                      type="color"
                      aria-label="Accent Brand Color Picker"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    />
                  </div>
                  <input
                    type="text"
                    aria-label="Accent Brand Color Hex"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl uppercase text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="#0f172a"
                    maxLength={7}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Secondary borders, text titles & subtle contrast</p>
              </div>
            </div>

            {/* Curated Presets */}
            <div className="pt-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Curated Executive Palettes
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {PRESET_PALETTES.map((p) => {
                  const isSelected = primaryColor.toLowerCase() === p.primary.toLowerCase();
                  return (
                    <button
                      type="button"
                      key={p.name}
                      onClick={() => {
                        setPrimaryColor(p.primary);
                        setAccentColor(p.accent);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center space-x-2.5 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                      }`}
                    >
                      <div className="flex -space-x-1 shrink-0">
                        <span className="w-5 h-5 rounded-full border border-white shadow-xs" style={{ backgroundColor: p.primary }} />
                        <span className="w-5 h-5 rounded-full border border-white shadow-xs" style={{ backgroundColor: p.accent }} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">{p.name}</div>
                        <div className="text-[9px] text-slate-400 truncate">{p.primary}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Brand Identity Showcase Card */}
        <div className="lg:col-span-5 sticky top-6 space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Sparkles size={16} className="text-amber-500" />
                <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Live Brand Identity Card
                </h3>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200/60 dark:border-emerald-800">
                Interactive Preview
              </span>
            </div>

            {/* Simulated Corporate Header */}
            <div
              className="rounded-xl overflow-hidden border shadow-sm"
              style={{ borderColor: primaryColor }}
            >
              <div className="h-2 w-full" style={{ backgroundColor: primaryColor }} />
              <div className="p-4 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  {logoUrl ? (
                    <div className="h-10 max-w-[140px] flex items-center">
                      <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div
                      className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold text-sm shadow-xs"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Building2 size={20} />
                    </div>
                  )}
                  <span
                    className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white rounded-md shadow-xs"
                    style={{ backgroundColor: primaryColor }}
                  >
                    TAX INVOICE
                  </span>
                </div>

                <div className="border-t border-slate-100 pt-2">
                  <div className="font-bold text-xs text-slate-900">
                    {currentOrg.name || 'Your Business Name'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {settings.firmAddress || '100 Business Boulevard, Suite 400'}
                  </div>
                </div>

                {/* Sample Styled Component Elements */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500">Brand Primary:</span>
                    <span className="font-mono font-bold" style={{ color: primaryColor }}>{primaryColor}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500">Brand Accent:</span>
                    <span className="font-mono font-bold" style={{ color: accentColor }}>{accentColor}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <div
                    className="w-full py-1.5 text-center text-white text-[11px] font-bold rounded-lg shadow-xs"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Sample Branded Call-to-Action
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Link Card to PDF Templates */}
            {onNavigateToPdfTemplates && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <Layers size={14} className="text-blue-600" />
                  <span>Configure PDF & Print Templates</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Customize layout themes, signatory titles, terms, running footers, and live document previews on the PDF Templates page.
                </p>
                <button
                  type="button"
                  onClick={onNavigateToPdfTemplates}
                  className="inline-flex items-center space-x-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline pt-1 cursor-pointer"
                >
                  <span>Open PDF & Document Templates</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
