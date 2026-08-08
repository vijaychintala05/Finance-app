import React, { useState } from 'react';
import {
  Hash,
  FileCode,
  Mail,
  MessageSquare,
  Tag,
  Layout,
  PenTool,
  Plus,
  CheckCircle,
  Trash2,
  Printer,
  Download,
  Eye,
  Palette,
  Type,
  FileText,
  Sliders,
  QrCode,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { ReportingTagSetting, WebTabSetting } from '../../types';

interface CustomizationSettingsProps {
  subTab: 'number-series' | 'pdf-templates' | 'email-notifications' | 'sms-notifications' | 'reporting-tags' | 'web-tabs' | 'digital-signature';
}

export const CustomizationSettings: React.FC<CustomizationSettingsProps> = ({ subTab }) => {
  const { settings, updateSettings, organization } = useBooks();
  const [successMsg, setSuccessMsg] = useState('');

  const triggerSave = (newValues: Partial<typeof settings>) => {
    updateSettings(newValues);
    setSuccessMsg('Customization saved!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Number series state
  const [invPrefix, setInvPrefix] = useState(settings.numberSeries?.invoicePrefix || 'INV-2026-');
  const [invNext, setInvNext] = useState(settings.numberSeries?.invoiceNext || 104);
  const [billPrefix, setBillPrefix] = useState(settings.numberSeries?.billPrefix || 'BILL-2026-');
  const [billNext, setBillNext] = useState(settings.numberSeries?.billNext || 82);
  const [estPrefix, setEstPrefix] = useState(settings.numberSeries?.estimatePrefix || 'EST-2026-');
  const [estNext, setEstNext] = useState(settings.numberSeries?.estimateNext || 45);

  // PDF Template state
  const [pdfStyle, setPdfStyle] = useState<'Modern' | 'Classic' | 'Minimalist' | 'Elegance' | 'Bold'>(
    settings.pdfTemplate?.style || 'Modern'
  );
  const [primaryColor, setPrimaryColor] = useState(settings.pdfTemplate?.primaryColor || '#2563eb');
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>(settings.pdfTemplate?.fontFamily || 'sans');
  const [fontSize, setFontSize] = useState<'Small' | 'Medium' | 'Large'>(settings.pdfTemplate?.fontSize || 'Medium');
  const [paperSize, setPaperSize] = useState<'A4' | 'Letter' | 'Legal'>(settings.pdfTemplate?.paperSize || 'A4');
  const [headerTitle, setHeaderTitle] = useState(settings.pdfTemplate?.headerTitle || 'TAX INVOICE');
  const [logoPosition, setLogoPosition] = useState<'left' | 'center' | 'right'>(settings.pdfTemplate?.logoPosition || 'left');
  const [showLogo, setShowLogo] = useState(settings.pdfTemplate?.showLogo ?? true);
  const [showTaxId, setShowTaxId] = useState(settings.pdfTemplate?.showTaxId ?? true);
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(settings.pdfTemplate?.showTaxBreakdown ?? true);
  const [showPaymentDetails, setShowPaymentDetails] = useState(settings.pdfTemplate?.showPaymentDetails ?? true);
  const [showQrCode, setShowQrCode] = useState(settings.pdfTemplate?.showQrCode ?? true);
  const [showSignatureBlock, setShowSignatureBlock] = useState(settings.pdfTemplate?.showSignatureBlock ?? true);
  const [pdfFooter, setPdfFooter] = useState(
    settings.pdfTemplate?.footerTerms || 'Payment due within 30 days. Thank you for your business!'
  );
  const [previewDocType, setPreviewDocType] = useState<'Invoice' | 'Estimate' | 'Purchase Order'>('Invoice');

  // Email Notifications state
  const [invSentSubj, setInvSentSubj] = useState(settings.emailNotifications?.invoiceSentSubject || 'Invoice {{invoice_number}} from {{firm_name}}');
  const [invSentBody, setInvSentBody] = useState(settings.emailNotifications?.invoiceSentBody || 'Dear {{client_name}},\n\nPlease find attached invoice {{invoice_number}}.');

  // SMS state
  const [smsEnabled, setSmsEnabled] = useState(settings.smsNotifications?.enabled ?? true);
  const [smsGatewayKey, setSmsGatewayKey] = useState(settings.smsNotifications?.gatewayKey || 'tw_live_984128913');

  // Reporting Tags state
  const [reportingTags, setReportingTags] = useState<ReportingTagSetting[]>(
    settings.reportingTags || [
      { id: 'tag-1', category: 'Cost Center', name: 'Tech Consulting' },
      { id: 'tag-2', category: 'Cost Center', name: 'Design Services' },
      { id: 'tag-3', category: 'Department', name: 'Sales & Marketing' },
    ]
  );
  const [newTagCat, setNewTagCat] = useState('Cost Center');
  const [newTagName, setNewTagName] = useState('');

  // Web Tabs state
  const [webTabs, setWebTabs] = useState<WebTabSetting[]>(
    settings.webTabs || [
      { id: 'tab-1', title: 'PowerBI Financial Dashboard', url: 'https://app.powerbi.com' },
      { id: 'tab-2', title: 'CRM Client Sync', url: 'https://hubspot.com' },
    ]
  );
  const [newTabTitle, setNewTabTitle] = useState('');
  const [newTabUrl, setNewTabUrl] = useState('');

  // Digital Signature state
  const [sigEnabled, setSigEnabled] = useState(settings.digitalSignature?.enabled ?? true);
  const [signerName, setSignerName] = useState(settings.digitalSignature?.signerName || 'Alexander Wright');
  const [designation, setDesignation] = useState(settings.digitalSignature?.designation || 'Managing Director & CFO');

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName) return;
    const tag: ReportingTagSetting = { id: `tag-${Date.now()}`, category: newTagCat, name: newTagName };
    const updated = [...reportingTags, tag];
    setReportingTags(updated);
    triggerSave({ reportingTags: updated });
    setNewTagName('');
  };

  const handleAddWebTab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTabTitle || !newTabUrl) return;
    const tab: WebTabSetting = { id: `tab-${Date.now()}`, title: newTabTitle, url: newTabUrl };
    const updated = [...webTabs, tab];
    setWebTabs(updated);
    triggerSave({ webTabs: updated });
    setNewTabTitle('');
    setNewTabUrl('');
  };

  const colorPresets = [
    { name: 'Royal Blue', hex: '#2563eb' },
    { name: 'Emerald Green', hex: '#059669' },
    { name: 'Deep Violet', hex: '#7c3aed' },
    { name: 'Crimson Red', hex: '#dc2626' },
    { name: 'Slate Gray', hex: '#334155' },
    { name: 'Amber Gold', hex: '#d97706' },
    { name: 'Sky Cyan', hex: '#0284c7' },
  ];

  const handlePrintPreview = () => {
    window.print();
  };

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 p-3 rounded-xl font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Number Series */}
      {subTab === 'number-series' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Hash className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Transaction Number Auto-Sequencing</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <h4 className="font-bold text-slate-800 dark:text-slate-100">Invoices Series</h4>
              <input
                type="text"
                value={invPrefix}
                onChange={(e) => setInvPrefix(e.target.value)}
                placeholder="Prefix"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded p-1.5 font-mono text-xs"
              />
              <input
                type="number"
                value={invNext}
                onChange={(e) => setInvNext(Number(e.target.value))}
                placeholder="Next Number"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded p-1.5 font-mono text-xs"
              />
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <h4 className="font-bold text-slate-800 dark:text-slate-100">Bills Series</h4>
              <input
                type="text"
                value={billPrefix}
                onChange={(e) => setBillPrefix(e.target.value)}
                placeholder="Prefix"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded p-1.5 font-mono text-xs"
              />
              <input
                type="number"
                value={billNext}
                onChange={(e) => setBillNext(Number(e.target.value))}
                placeholder="Next Number"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded p-1.5 font-mono text-xs"
              />
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <h4 className="font-bold text-slate-800 dark:text-slate-100">Estimates Series</h4>
              <input
                type="text"
                value={estPrefix}
                onChange={(e) => setEstPrefix(e.target.value)}
                placeholder="Prefix"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded p-1.5 font-mono text-xs"
              />
              <input
                type="number"
                value={estNext}
                onChange={(e) => setEstNext(Number(e.target.value))}
                placeholder="Next Number"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded p-1.5 font-mono text-xs"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() =>
                triggerSave({
                  numberSeries: {
                    invoicePrefix: invPrefix,
                    invoiceNext: invNext,
                    billPrefix,
                    billNext,
                    estimatePrefix: estPrefix,
                    estimateNext: estNext,
                    creditNotePrefix: 'CN-2026-',
                    creditNoteNext: 12,
                  },
                })
              }
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
            >
              Save Number Series
            </button>
          </div>
        </div>
      )}

      {/* PDF Templates with Live Preview */}
      {subTab === 'pdf-templates' && (
        <div className="space-y-4">
          {/* Header Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileCode className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-800">PDF Document Layout & Print Customization</h3>
                <p className="text-[11px] text-slate-500">
                  Configure visual themes, brand accents, font typography, and layout options with live real-time preview.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrintPreview}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer border border-slate-300 transition-all text-xs"
              >
                <Printer className="w-3.5 h-3.5" /> Print / Test PDF
              </button>
              <button
                onClick={() =>
                  triggerSave({
                    pdfTemplate: {
                      style: pdfStyle,
                      primaryColor,
                      fontFamily,
                      fontSize,
                      paperSize,
                      headerTitle,
                      logoPosition,
                      showLogo,
                      showTaxId,
                      showTaxBreakdown,
                      showPaymentDetails,
                      showQrCode,
                      showSignatureBlock,
                      footerTerms: pdfFooter,
                    },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all text-xs"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Save PDF Layout Settings
              </button>
            </div>
          </div>

          {/* Main Grid: Left Controls, Right Preview */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left Controls (5 Cols) */}
            <div className="xl:col-span-5 space-y-4">
              {/* Theme & Palette Card */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                  <Palette className="w-4 h-4 text-blue-600" />
                  <span>Theme Style & Color Palette</span>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Layout Template Theme</label>
                  <select
                    value={pdfStyle}
                    onChange={(e) => setPdfStyle(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-bold"
                  >
                    <option value="Modern">Modern Minimalist Accent Header</option>
                    <option value="Classic">Classic Corporate Table Grid</option>
                    <option value="Minimalist">Ultra Clean Executive Layout</option>
                    <option value="Elegance">Elegance Luxury Border Box</option>
                    <option value="Bold">Bold High-Contrast Block</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Primary Brand Accent Color</label>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0 bg-transparent"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-28 bg-slate-50 border border-slate-300 rounded p-1.5 font-mono text-xs text-slate-800 font-bold"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {colorPresets.map((preset) => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => setPrimaryColor(preset.hex)}
                        title={preset.name}
                        className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${
                          primaryColor === preset.hex ? 'border-slate-800 scale-110 shadow-xs' : 'border-white'
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      >
                        {primaryColor === preset.hex && <Check className="w-3 h-3 text-white stroke-[3]" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Typography & Header Card */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                  <Type className="w-4 h-4 text-indigo-600" />
                  <span>Typography & Header Styling</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Font Family</label>
                    <select
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-bold"
                    >
                      <option value="sans">Sans-Serif (Modern)</option>
                      <option value="serif">Classic Serif (Editorial)</option>
                      <option value="mono">Monospace (Technical)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Font Size Scale</label>
                    <select
                      value={fontSize}
                      onChange={(e) => setFontSize(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                    >
                      <option value="Small">Compact (11px)</option>
                      <option value="Medium">Standard (12px)</option>
                      <option value="Large">Spacious (14px)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Document Header Title</label>
                  <input
                    type="text"
                    value={headerTitle}
                    onChange={(e) => setHeaderTitle(e.target.value)}
                    placeholder="TAX INVOICE"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Paper Size</label>
                    <select
                      value={paperSize}
                      onChange={(e) => setPaperSize(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                    >
                      <option value="A4">A4 (Standard ISO)</option>
                      <option value="Letter">US Letter</option>
                      <option value="Legal">US Legal</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Logo Placement</label>
                    <select
                      value={logoPosition}
                      onChange={(e) => setLogoPosition(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                    >
                      <option value="left">Left Aligned</option>
                      <option value="center">Centered Top</option>
                      <option value="right">Right Aligned</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Display Components Toggles */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                  <Sliders className="w-4 h-4 text-emerald-600" />
                  <span>Document Content Toggles</span>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <span className="font-bold text-slate-700">Display Organization Logo</span>
                    <input
                      type="checkbox"
                      checked={showLogo}
                      onChange={(e) => setShowLogo(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <span className="font-bold text-slate-700">Display Tax Registration (GSTIN / Tax ID)</span>
                    <input
                      type="checkbox"
                      checked={showTaxId}
                      onChange={(e) => setShowTaxId(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <span className="font-bold text-slate-700">Display Itemized Tax & HSN/SAC Breakdown</span>
                    <input
                      type="checkbox"
                      checked={showTaxBreakdown}
                      onChange={(e) => setShowTaxBreakdown(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <span className="font-bold text-slate-700">Display Bank Payment Transfer Details</span>
                    <input
                      type="checkbox"
                      checked={showPaymentDetails}
                      onChange={(e) => setShowPaymentDetails(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <span className="font-bold text-slate-700">Display Instant UPI / Direct Payment QR Code</span>
                    <input
                      type="checkbox"
                      checked={showQrCode}
                      onChange={(e) => setShowQrCode(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <span className="font-bold text-slate-700">Display Digital Signature & CFO E-Stamp Block</span>
                    <input
                      type="checkbox"
                      checked={showSignatureBlock}
                      onChange={(e) => setShowSignatureBlock(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </label>
                </div>
              </div>

              {/* Legal Terms & Footer Text */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2">
                <label className="block text-slate-800 font-bold">PDF Footer Terms & Legal Conditions</label>
                <textarea
                  value={pdfFooter}
                  onChange={(e) => setPdfFooter(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 resize-none text-xs"
                />
              </div>
            </div>

            {/* Right Interactive Preview (7 Cols) */}
            <div className="xl:col-span-7 space-y-3">
              {/* Preview Bar Switcher */}
              <div className="bg-slate-800 text-white p-3 rounded-xl flex items-center justify-between flex-wrap gap-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-400" />
                  <span className="font-bold text-xs">Live Printable Document Canvas</span>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-lg">
                  {(['Invoice', 'Estimate', 'Purchase Order'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setPreviewDocType(type)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        previewDocType === type
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live A4 Sheet Container */}
              <div className="bg-slate-200/70 p-4 sm:p-6 rounded-2xl border border-slate-300 min-h-[680px] flex justify-center items-start overflow-x-auto shadow-inner">
                <div
                  className={`bg-white text-slate-800 shadow-2xl rounded-sm p-6 sm:p-8 w-full max-w-[650px] space-y-6 transition-all duration-300 border border-slate-200/80 ${
                    fontFamily === 'serif' ? 'font-serif' : fontFamily === 'mono' ? 'font-mono' : 'font-sans'
                  } ${
                    fontSize === 'Small' ? 'text-[10px]' : fontSize === 'Large' ? 'text-[13px]' : 'text-[11px]'
                  }`}
                  style={
                    pdfStyle === 'Elegance'
                      ? { border: `2px solid ${primaryColor}` }
                      : undefined
                  }
                >
                  {/* Top Header Block */}
                  <div
                    className={`flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 ${
                      pdfStyle === 'Modern'
                        ? 'border-b-2'
                        : pdfStyle === 'Bold'
                        ? 'p-4 rounded-lg text-white'
                        : pdfStyle === 'Classic'
                        ? 'border-b border-slate-300'
                        : 'border-b border-slate-100'
                    }`}
                    style={{
                      borderColor: pdfStyle === 'Modern' ? primaryColor : undefined,
                      backgroundColor: pdfStyle === 'Bold' ? primaryColor : undefined,
                    }}
                  >
                    {/* Brand / Logo */}
                    <div
                      className={`space-y-1 ${
                        logoPosition === 'center'
                          ? 'w-full text-center'
                          : logoPosition === 'right'
                          ? 'sm:order-2 text-right'
                          : ''
                      }`}
                    >
                      {showLogo && (
                        <div
                          className={`flex items-center gap-2 font-black text-lg ${
                            logoPosition === 'center' ? 'justify-center' : ''
                          }`}
                          style={{ color: pdfStyle === 'Bold' ? '#ffffff' : primaryColor }}
                        >
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-xs"
                            style={{ backgroundColor: pdfStyle === 'Bold' ? '#ffffff' : primaryColor, color: pdfStyle === 'Bold' ? primaryColor : '#ffffff' }}
                          >
                            {organization?.name ? organization.name.charAt(0) : 'A'}
                          </div>
                          <span>{organization?.name || 'Apex Books Financial Corp.'}</span>
                        </div>
                      )}
                      <p className={pdfStyle === 'Bold' ? 'text-slate-100' : 'text-slate-500'}>
                        {organization?.address || '100 Financial Center Blvd, Suite 400, New York, NY 10001'}
                      </p>
                      {showTaxId && (
                        <p className={`font-mono ${pdfStyle === 'Bold' ? 'text-slate-200' : 'text-slate-600'}`}>
                          Tax ID / GSTIN: {organization?.taxId || '27AAACA1234B1Z5'}
                        </p>
                      )}
                    </div>

                    {/* Document Header Title & Meta */}
                    <div className={`space-y-1 text-right ${logoPosition === 'right' ? 'sm:order-1 text-left' : ''}`}>
                      <h1
                        className="text-lg sm:text-xl font-black uppercase tracking-wider"
                        style={{ color: pdfStyle === 'Bold' ? '#ffffff' : primaryColor }}
                      >
                        {headerTitle || previewDocType.toUpperCase()}
                      </h1>
                      <div className="font-mono space-y-0.5">
                        <p className="font-bold text-slate-800">
                          # {previewDocType === 'Invoice' ? 'INV-2026-0042' : previewDocType === 'Estimate' ? 'EST-2026-0018' : 'PO-2026-0009'}
                        </p>
                        <p className={pdfStyle === 'Bold' ? 'text-slate-200' : 'text-slate-500'}>Date: Jul 27, 2026</p>
                        <p className={pdfStyle === 'Bold' ? 'text-slate-200' : 'text-slate-500'}>Due Date: Aug 26, 2026</p>
                      </div>
                    </div>
                  </div>

                  {/* Bill To / Vendor Grid */}
                  <div className="grid grid-cols-2 gap-4 bg-slate-50/80 p-3 rounded-lg border border-slate-200/60">
                    <div>
                      <p className="font-bold text-slate-400 uppercase text-[9px] tracking-wider mb-0.5">Billed To / Client</p>
                      <p className="font-bold text-slate-800">Acme Global Enterprise Inc.</p>
                      <p className="text-slate-500">Attn: Finance & Accounts Payable</p>
                      <p className="text-slate-500">742 Evergreen Terrace, San Francisco, CA</p>
                      <p className="font-mono text-slate-600">Tax ID: US-984120938</p>
                    </div>

                    <div>
                      <p className="font-bold text-slate-400 uppercase text-[9px] tracking-wider mb-0.5">Payment Terms & Status</p>
                      <p className="font-bold text-slate-800">Net 30 Days Direct Transfer</p>
                      <p className="text-slate-500">PO Ref: PO-ACME-8841</p>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        Payment Pending
                      </span>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr
                          className="border-b-2"
                          style={{
                            borderColor: primaryColor,
                            backgroundColor: pdfStyle === 'Classic' ? `${primaryColor}10` : 'transparent',
                          }}
                        >
                          <th className="py-2 px-1 font-bold uppercase text-[9px]" style={{ color: primaryColor }}>
                            Item Description
                          </th>
                          <th className="py-2 px-1 text-center font-bold uppercase text-[9px]" style={{ color: primaryColor }}>
                            Qty
                          </th>
                          <th className="py-2 px-1 text-right font-bold uppercase text-[9px]" style={{ color: primaryColor }}>
                            Rate ($)
                          </th>
                          {showTaxBreakdown && (
                            <th className="py-2 px-1 text-right font-bold uppercase text-[9px]" style={{ color: primaryColor }}>
                              Tax Rate
                            </th>
                          )}
                          <th className="py-2 px-1 text-right font-bold uppercase text-[9px]" style={{ color: primaryColor }}>
                            Amount ($)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr>
                          <td className="py-2.5 px-1 font-bold text-slate-800">
                            Enterprise ERP Software License & Cloud Architecture Setup
                            <span className="block text-[10px] text-slate-400 font-normal">Annual SaaS Subscription (SAC: 998313)</span>
                          </td>
                          <td className="py-2.5 px-1 text-center font-mono">1</td>
                          <td className="py-2.5 px-1 text-right font-mono">$4,500.00</td>
                          {showTaxBreakdown && <td className="py-2.5 px-1 text-right font-mono text-slate-500">18% GST</td>}
                          <td className="py-2.5 px-1 text-right font-bold font-mono text-slate-800">$4,500.00</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-1 font-bold text-slate-800">
                            Custom Financial Module Integration & API Webhooks
                            <span className="block text-[10px] text-slate-400 font-normal">25 Hours Senior Engineering (SAC: 998314)</span>
                          </td>
                          <td className="py-2.5 px-1 text-center font-mono">25</td>
                          <td className="py-2.5 px-1 text-right font-mono">$120.00</td>
                          {showTaxBreakdown && <td className="py-2.5 px-1 text-right font-mono text-slate-500">18% GST</td>}
                          <td className="py-2.5 px-1 text-right font-bold font-mono text-slate-800">$3,000.00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Summary & Bank / QR Block */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    {/* Left Payment Info & QR */}
                    <div className="space-y-3">
                      {showPaymentDetails && (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-[10px] space-y-0.5">
                          <p className="font-bold text-slate-800 uppercase tracking-wider text-[9px] mb-1" style={{ color: primaryColor }}>
                            Wire / Bank Transfer Details
                          </p>
                          <p><span className="text-slate-400">Bank Name:</span> Chase JP Morgan Corp</p>
                          <p><span className="text-slate-400">Account No:</span> 9841-2091-8842</p>
                          <p><span className="text-slate-400">IFSC / Swift:</span> CHASUS33XXX</p>
                        </div>
                      )}

                      {showQrCode && (
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                          <div className="w-12 h-12 bg-white p-1 border border-slate-300 rounded flex items-center justify-center shrink-0">
                            <QrCode className="w-9 h-9 text-slate-800" />
                          </div>
                          <div className="text-[10px]">
                            <p className="font-bold text-slate-800">Scan to Pay Instantly</p>
                            <p className="text-slate-500">UPI / Direct Debit Mobile Payment</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Totals Breakdown */}
                    <div className="space-y-1.5 text-right font-mono text-[11px] bg-slate-50/50 p-3 rounded-lg border border-slate-200/80">
                      <div className="flex justify-between text-slate-600">
                        <span>Sub Total:</span>
                        <span>$7,500.00</span>
                      </div>
                      {showTaxBreakdown && (
                        <>
                          <div className="flex justify-between text-slate-500 text-[10px]">
                            <span>CGST (9%):</span>
                            <span>$675.00</span>
                          </div>
                          <div className="flex justify-between text-slate-500 text-[10px]">
                            <span>SGST (9%):</span>
                            <span>$675.00</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                        <span>Total Tax Amount:</span>
                        <span>$1,350.00</span>
                      </div>
                      <div
                        className="flex justify-between font-black text-sm pt-2 border-t-2 text-slate-900"
                        style={{ borderColor: primaryColor }}
                      >
                        <span>Grand Total:</span>
                        <span style={{ color: primaryColor }}>$8,850.00</span>
                      </div>
                    </div>
                  </div>

                  {/* Digital Signature Block */}
                  {showSignatureBlock && (
                    <div className="pt-4 border-t border-slate-200 flex justify-between items-end gap-4">
                      <div className="space-y-1 text-[10px] text-slate-500">
                        <p className="flex items-center gap-1 font-bold text-emerald-700">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Tamper-Proof Cryptographic E-Stamp
                        </p>
                        <p className="font-mono">Hash: 8f92a11b092e4421d891</p>
                      </div>

                      <div className="text-center space-y-1 border-b border-slate-300 pb-1 w-40">
                        <p className="font-serif italic text-sm text-indigo-900 font-bold">{signerName}</p>
                        <p className="text-[9px] font-bold text-slate-500 uppercase">{designation}</p>
                      </div>
                    </div>
                  )}

                  {/* Footer Terms */}
                  <div className="pt-3 border-t border-slate-200 text-center text-[10px] text-slate-500 italic">
                    <p>{pdfFooter}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Notifications */}
      {subTab === 'email-notifications' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Mail className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">Email Notification Templates</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Invoice Dispatch Email Subject</label>
              <input
                type="text"
                value={invSentSubj}
                onChange={(e) => setInvSentSubj(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Email Body Text</label>
              <textarea
                value={invSentBody}
                onChange={(e) => setInvSentBody(e.target.value)}
                rows={4}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 resize-none"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    emailNotifications: {
                      invoiceSentSubject: invSentSubj,
                      invoiceSentBody: invSentBody,
                      paymentReceiptSubject: 'Payment Confirmation for Invoice {{invoice_number}}',
                      paymentReceiptBody: 'Dear {{client_name}},\n\nWe received your payment!',
                    },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Email Templates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMS Notifications */}
      {subTab === 'sms-notifications' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <MessageSquare className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">SMS Gateway & Automated Text Alerts</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={smsEnabled}
                onChange={(e) => setSmsEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div>
                <span className="font-bold text-slate-800 block">Enable Automated SMS Payment Alerts</span>
                <span className="text-[11px] text-slate-500">Dispatch instant text message receipts on client payments</span>
              </div>
            </label>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Twilio / Telephony Gateway Live API Key</label>
              <input
                type="password"
                value={smsGatewayKey}
                onChange={(e) => setSmsGatewayKey(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-slate-800"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    smsNotifications: { enabled: smsEnabled, gatewayKey: smsGatewayKey, senderId: 'APEXBK', autoSmsOnPayment: true },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save SMS Gateway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reporting Tags */}
      {subTab === 'reporting-tags' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Tag className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-800">Reporting Tags & Cost Centers</h3>
          </div>

          <form onSubmit={handleAddTag} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800">Add New Tag</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={newTagCat}
                onChange={(e) => setNewTagCat(e.target.value)}
                className="bg-white border border-slate-300 rounded p-2 text-xs font-bold"
              >
                <option value="Cost Center">Cost Center</option>
                <option value="Department">Department</option>
                <option value="Branch Location">Branch Location</option>
              </select>
              <input
                type="text"
                placeholder="Tag Name (e.g. Design Services)"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                required
                className="bg-white border border-slate-300 rounded p-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Save Tag
            </button>
          </form>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-2.5">Category</th>
                  <th className="p-2.5">Tag Name</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportingTags.map((tag) => (
                  <tr key={tag.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-slate-800">{tag.category}</td>
                    <td className="p-2.5 font-mono">{tag.name}</td>
                    <td className="p-2.5 text-right">
                      <button
                        onClick={() => {
                          const updated = reportingTags.filter((t) => t.id !== tag.id);
                          setReportingTags(updated);
                          triggerSave({ reportingTags: updated });
                        }}
                        className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Web Tabs */}
      {subTab === 'web-tabs' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Layout className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Embedded Web Tabs</h3>
          </div>

          <form onSubmit={handleAddWebTab} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800">Add External Web Tab</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Tab Title (e.g. CRM Sync)"
                value={newTabTitle}
                onChange={(e) => setNewTabTitle(e.target.value)}
                required
                className="bg-white border border-slate-300 rounded p-2 text-xs font-bold"
              />
              <input
                type="url"
                placeholder="URL (e.g. https://crm.company.com)"
                value={newTabUrl}
                onChange={(e) => setNewTabUrl(e.target.value)}
                required
                className="bg-white border border-slate-300 rounded p-2 text-xs font-mono"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Web Tab
            </button>
          </form>

          <div className="space-y-2">
            {webTabs.map((tab) => (
              <div key={tab.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                <div>
                  <p className="font-bold text-slate-800">{tab.title}</p>
                  <p className="text-[11px] text-blue-600 font-mono">{tab.url}</p>
                </div>
                <button
                  onClick={() => {
                    const updated = webTabs.filter((t) => t.id !== tab.id);
                    setWebTabs(updated);
                    triggerSave({ webTabs: updated });
                  }}
                  className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Digital Signature */}
      {subTab === 'digital-signature' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <PenTool className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Digital Signature & Document Sealing</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={sigEnabled}
                onChange={(e) => setSigEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div>
                <span className="font-bold text-slate-800 block">Enable Digital E-Signatures on Invoices & Purchase Orders</span>
                <span className="text-[11px] text-slate-500">Stamp authorized CFO digital seal on output PDFs</span>
              </div>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Authorized Signer Name</label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Signer Designation</label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    digitalSignature: {
                      enabled: sigEnabled,
                      signerName,
                      designation,
                      signatureText: `Digitally signed by ${signerName}`,
                    },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Signature Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
