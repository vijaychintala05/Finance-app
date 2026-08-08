import React, { useRef, useState } from 'react';
import {
  Building2,
  Globe,
  MapPin,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Plus,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Upload,
  Image as ImageIcon,
  Trash2,
  Info,
  Mail,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Layers,
  HelpCircle,
  Moon,
  Sun,
  Check,
  Save,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { LocationSetting, OrgAdditionalField, OrgProfileDetails } from '../../types';

interface OrganizationSettingsProps {
  subTab: 'profile' | 'branding' | 'custom-domain' | 'locations' | 'ai-integration' | 'subscription';
}

export const OrganizationSettings: React.FC<OrganizationSettingsProps> = ({ subTab }) => {
  const { settings, updateSettings } = useBooks();
  const [successMsg, setSuccessMsg] = useState('');
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const triggerSave = (newValues: Partial<typeof settings>) => {
    updateSettings(newValues);
    setSuccessMsg('Organization Profile updated successfully!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Detailed Organization Profile State initialized from settings.orgProfileDetails or defaults
  const orgDetails: OrgProfileDetails = settings.orgProfileDetails || {
    logoUrl: '',
    logoFileName: '',
    organizationName: 'Sense studios design',
    industry: 'Construction',
    locationCountry: 'India',
    addressLine1: 'Chintalarayudu1',
    addressLine2: 'Taraka Ramanagar 3rd line, Siri nilayam.',
    city: 'Guntur',
    state: 'Andhra Pradesh',
    zipCode: '522006',
    phone: '',
    faxNumber: '',
    websiteUrl: '',
    hasDifferentPaymentStubAddress: false,
    paymentStubAddress: {
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'India',
    },
    primaryContactName: 'Sender Chintalarayudu1',
    primaryContactEmail: 'chintalarayudu1@gmail.com',
    emailsSentThrough: 'message-service@sender.zoho-books.in',
    baseCurrency: 'INR - Indian Rupee (₹)',
    fiscalYear: 'April - March',
    reportBasis: 'Accrual',
    organizationLanguage: 'English',
    communicationLanguages: ['English'],
    timeZone: '(GMT +05:30) India Standard Time (Asia/Kolkata)',
    dateFormat: 'dd/MM/yyyy',
    companyId: 'CIN-522006-SSD',
    addressFormat: '${Organization.Name}\n${Organization.AddressLine1}\n${Organization.AddressLine2}\n${Organization.City} - ${Organization.ZipCode}, ${Organization.State}\n${Organization.Country}',
    additionalFields: [
      { id: 'f-1', label: 'GSTIN', value: '37AAAAA0000A1Z5' },
    ],
  };

  const [orgLogoUrl, setOrgLogoUrl] = useState(orgDetails.logoUrl || '');
  const [orgLogoFileName, setOrgLogoFileName] = useState(orgDetails.logoFileName || '');
  const [orgName, setOrgName] = useState(orgDetails.organizationName || settings.firmName || 'Sense studios design');
  const [industry, setIndustry] = useState(orgDetails.industry || 'Construction');
  const [locationCountry, setLocationCountry] = useState(orgDetails.locationCountry || 'India');
  const [addressLine1, setAddressLine1] = useState(orgDetails.addressLine1 || 'Chintalarayudu1');
  const [addressLine2, setAddressLine2] = useState(orgDetails.addressLine2 || 'Taraka Ramanagar 3rd line, Siri nilayam.');
  const [city, setCity] = useState(orgDetails.city || 'Guntur');
  const [state, setState] = useState(orgDetails.state || 'Andhra Pradesh');
  const [zipCode, setZipCode] = useState(orgDetails.zipCode || '522006');
  const [phone, setPhone] = useState(orgDetails.phone || '');
  const [faxNumber, setFaxNumber] = useState(orgDetails.faxNumber || '');
  const [websiteUrl, setWebsiteUrl] = useState(orgDetails.websiteUrl || '');
  const [hasDifferentPaymentStubAddress, setHasDifferentPaymentStubAddress] = useState(
    orgDetails.hasDifferentPaymentStubAddress || false
  );
  const [stubAddressLine1, setStubAddressLine1] = useState(orgDetails.paymentStubAddress?.addressLine1 || '');
  const [stubAddressLine2, setStubAddressLine2] = useState(orgDetails.paymentStubAddress?.addressLine2 || '');
  const [stubCity, setStubCity] = useState(orgDetails.paymentStubAddress?.city || '');
  const [stubState, setStubState] = useState(orgDetails.paymentStubAddress?.state || '');
  const [stubZipCode, setStubZipCode] = useState(orgDetails.paymentStubAddress?.zipCode || '');
  const [stubCountry, setStubCountry] = useState(orgDetails.paymentStubAddress?.country || 'India');

  const [primaryContactName, setPrimaryContactName] = useState(orgDetails.primaryContactName || 'Sender Chintalarayudu1');
  const [primaryContactEmail, setPrimaryContactEmail] = useState(orgDetails.primaryContactEmail || 'chintalarayudu1@gmail.com');
  const [emailsSentThrough, setEmailsSentThrough] = useState(orgDetails.emailsSentThrough || 'message-service@sender.zoho-books.in');

  const [baseCurrency, setBaseCurrency] = useState(orgDetails.baseCurrency || 'INR - Indian Rupee (₹)');
  const [fiscalYear, setFiscalYear] = useState(orgDetails.fiscalYear || 'April - March');
  const [reportBasis, setReportBasis] = useState<'Accrual' | 'Cash'>(orgDetails.reportBasis || 'Accrual');
  const [organizationLanguage, setOrganizationLanguage] = useState(orgDetails.organizationLanguage || 'English');
  const [communicationLanguages, setCommunicationLanguages] = useState<string[]>(
    orgDetails.communicationLanguages || ['English']
  );
  const [timeZone, setTimeZone] = useState(orgDetails.timeZone || '(GMT +05:30) India Standard Time (Asia/Kolkata)');
  const [dateFormat, setDateFormat] = useState(orgDetails.dateFormat || 'dd/MM/yyyy');
  const [companyId, setCompanyId] = useState(orgDetails.companyId || 'CIN-522006-SSD');
  const [addressFormat, setAddressFormat] = useState(
    orgDetails.addressFormat ||
      '${Organization.Name}\n${Organization.AddressLine1}\n${Organization.AddressLine2}\n${Organization.City} - ${Organization.ZipCode}, ${Organization.State}\n${Organization.Country}'
  );
  const [additionalFields, setAdditionalFields] = useState<OrgAdditionalField[]>(
    orgDetails.additionalFields || []
  );

  // State for Branding
  const [logoText, setLogoText] = useState(settings.logoText || 'Sense Studios Design');
  const [primaryColor, setPrimaryColor] = useState(settings.branding?.primaryColor || '#2563eb');
  const [watermarkText, setWatermarkText] = useState(settings.branding?.watermarkText || 'ORIGINAL COPY');
  const [appearancePane, setAppearancePane] = useState<'DARK PANE' | 'LIGHT PANE'>('LIGHT PANE');
  const [accentColor, setAccentColor] = useState<'blue' | 'green' | 'red' | 'orange' | 'purple'>('blue');
  const [keepBranding, setKeepBranding] = useState(true);

  // State for Custom Domain
  const [domainName, setDomainName] = useState(settings.customDomain?.domainName || 'billing.sensestudios.in');
  const [sslActive, setSslActive] = useState(settings.customDomain?.sslActive ?? true);

  // State for Locations
  const [locations, setLocations] = useState<LocationSetting[]>(settings.locations || []);
  const [newLocName, setNewLocName] = useState('');
  const [newLocCode, setNewLocCode] = useState('');
  const [newLocAddr, setNewLocAddr] = useState('');

  // State for AI Integration
  const [aiEnabled, setAiEnabled] = useState(settings.aiIntegration?.enabled ?? true);
  const [smartOcr, setSmartOcr] = useState(settings.aiIntegration?.smartOcr ?? true);
  const [autoCategorize, setAutoCategorize] = useState(settings.aiIntegration?.autoCategorize ?? true);
  const [apiKey, setApiKey] = useState(settings.aiIntegration?.apiKey || '');

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert('File size exceeds 1MB limit. Please upload a smaller logo image.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const logoDataUrl = reader.result as string;
        setOrgLogoUrl(logoDataUrl);
        setOrgLogoFileName(file.name);

        // Auto save immediately so header, sidebar, and org switcher reflect logo
        triggerSave({
          branding: {
            ...settings.branding,
            primaryColor,
            watermarkText,
            headerLayout: 'Compact Modern',
            logoUrl: logoDataUrl,
          },
          orgProfileDetails: {
            ...(settings.orgProfileDetails || {}),
            logoUrl: logoDataUrl,
            logoFileName: file.name,
          },
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveBranding = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    triggerSave({
      logoText,
      branding: {
        primaryColor,
        watermarkText,
        headerLayout: 'Compact Modern',
        logoUrl: orgLogoUrl,
      },
      orgProfileDetails: {
        ...(settings.orgProfileDetails || {}),
        logoUrl: orgLogoUrl,
        logoFileName: orgLogoFileName,
      },
    });
  };

  const handleAddAdditionalField = () => {
    setAdditionalFields((prev) => [
      ...prev,
      { id: `field-${Date.now()}`, label: 'Label', value: '' },
    ]);
  };

  const handleRemoveAdditionalField = (id: string) => {
    setAdditionalFields((prev) => prev.filter((f) => f.id !== id));
  };

  const handleUpdateAdditionalField = (id: string, key: 'label' | 'value', val: string) => {
    setAdditionalFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [key]: val } : f))
    );
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedProfile: OrgProfileDetails = {
      logoUrl: orgLogoUrl,
      logoFileName: orgLogoFileName,
      organizationName: orgName,
      industry,
      locationCountry,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      phone,
      faxNumber,
      websiteUrl,
      hasDifferentPaymentStubAddress,
      paymentStubAddress: {
        addressLine1: stubAddressLine1,
        addressLine2: stubAddressLine2,
        city: stubCity,
        state: stubState,
        zipCode: stubZipCode,
        country: stubCountry,
      },
      primaryContactName,
      primaryContactEmail,
      emailsSentThrough,
      baseCurrency,
      fiscalYear,
      reportBasis,
      organizationLanguage,
      communicationLanguages,
      timeZone,
      dateFormat,
      companyId,
      addressFormat,
      additionalFields,
    };

    let parsedCode = 'INR';
    let parsedSymbol = '₹';
    if (baseCurrency.includes('USD')) { parsedCode = 'USD'; parsedSymbol = '$'; }
    else if (baseCurrency.includes('EUR')) { parsedCode = 'EUR'; parsedSymbol = '€'; }
    else if (baseCurrency.includes('GBP')) { parsedCode = 'GBP'; parsedSymbol = '£'; }
    else if (baseCurrency.includes('AED')) { parsedCode = 'AED'; parsedSymbol = 'AED'; }
    else if (baseCurrency.includes('CAD')) { parsedCode = 'CAD'; parsedSymbol = 'C$'; }
    else if (baseCurrency.includes('AUD')) { parsedCode = 'AUD'; parsedSymbol = 'A$'; }
    else if (baseCurrency.includes('INR')) { parsedCode = 'INR'; parsedSymbol = '₹'; }

    triggerSave({
      firmName: orgName,
      firmEmail: primaryContactEmail,
      firmPhone: phone,
      firmAddress: `${addressLine1}, ${addressLine2 ? addressLine2 + ', ' : ''}${city}, ${state} - ${zipCode}, ${locationCountry}`,
      taxId: additionalFields.find((f) => f.label.toUpperCase().includes('GST'))?.value || companyId,
      currencyCode: parsedCode,
      currencySymbol: parsedSymbol,
      orgProfileDetails: updatedProfile,
    });
  };

  const handleAddLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocName) return;
    const newLoc: LocationSetting = {
      id: `loc-${Date.now()}`,
      name: newLocName,
      code: newLocCode || 'LOC-01',
      address: newLocAddr,
      isDefault: locations.length === 0,
    };
    const updated = [...locations, newLoc];
    setLocations(updated);
    triggerSave({ locations: updated });
    setNewLocName('');
    setNewLocCode('');
    setNewLocAddr('');
  };

  return (
    <div className="space-y-6 text-xs text-slate-700 dark:text-slate-300">
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 p-3.5 rounded-xl font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Subtab 1: Profile */}
      {subTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* Top Banner Header */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-950 text-blue-600 rounded-xl border border-blue-200 dark:border-blue-800">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                  Organization Profile
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure primary business details, address format, tax IDs, logo, and regional presets
                </p>
              </div>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Save Profile Settings
            </button>
          </div>

          {/* 1. Organization Logo & Specs Box */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center space-x-2">
              <ImageIcon className="w-4 h-4 text-blue-500" />
              <span>Organization Logo</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* Logo Box */}
              <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800/50 min-h-[160px]">
                {orgLogoUrl ? (
                  <div className="relative group flex flex-col items-center">
                    <img
                      src={orgLogoUrl}
                      alt="Organization Logo"
                      className="max-h-24 max-w-full object-contain rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1"
                    />
                    <div className="text-[11px] font-semibold text-slate-500 mt-2 truncate max-w-[180px]">
                      {orgLogoFileName || 'Uploaded_Logo.png'}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOrgLogoUrl('');
                        setOrgLogoFileName('');
                      }}
                      className="mt-2 px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 rounded-lg text-[10px] font-bold flex items-center space-x-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove Logo</span>
                    </button>
                  </div>
                ) : (
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 flex items-center justify-center mx-auto font-bold text-lg">
                      {orgName ? orgName.substring(0, 2).toUpperCase() : 'SD'}
                    </div>
                    <p className="text-slate-500 text-[11px]">No custom logo uploaded</p>
                  </div>
                )}

                <input
                  type="file"
                  ref={logoInputRef}
                  onChange={handleLogoChange}
                  accept=".jpg,.jpeg,.png,.gif,.bmp"
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="mt-3 px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{orgLogoUrl ? 'Change Logo' : 'Upload Logo'}</span>
                </button>
              </div>

              {/* Specification Requirements Box */}
              <div className="md:col-span-2 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 p-4 rounded-xl space-y-2">
                <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-300 font-extrabold text-xs">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Logo Specifications & Requirements</span>
                </div>
                <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1 pl-6 list-disc font-medium">
                  <li>
                    <strong className="text-slate-800 dark:text-slate-200">Preferred Image Dimensions:</strong> 240 x 240 pixels @ 72 DPI
                  </li>
                  <li>
                    <strong className="text-slate-800 dark:text-slate-200">Supported Files:</strong> jpg, jpeg, png, gif, bmp
                  </li>
                  <li>
                    <strong className="text-slate-800 dark:text-slate-200">Maximum File Size:</strong> 1MB
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* 2. Organization Name, Industry & Location */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
              General Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Organization Name *
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Industry *
                </label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="Construction">Construction</option>
                  <option value="Architecture & Design">Architecture & Design</option>
                  <option value="Consulting">Consulting & Professional Services</option>
                  <option value="Financial Services">Financial Services & Banking</option>
                  <option value="Healthcare">Healthcare & Pharmaceuticals</option>
                  <option value="IT & Software">IT & Software Engineering</option>
                  <option value="Manufacturing">Manufacturing & Production</option>
                  <option value="Real Estate">Real Estate & Property Management</option>
                  <option value="Retail">Retail & E-commerce</option>
                  <option value="Wholesale & Distribution">Wholesale & Distribution</option>
                  <option value="Education">Education & Academic</option>
                  <option value="Advertising & Media">Advertising & Media</option>
                  <option value="Hospitality">Hospitality & Travel</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Organization Location *
                </label>
                <select
                  value={locationCountry}
                  onChange={(e) => setLocationCountry(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="India">India</option>
                  <option value="United States">United States</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="Canada">Canada</option>
                  <option value="Australia">Australia</option>
                  <option value="United Arab Emirates">United Arab Emirates</option>
                  <option value="Singapore">Singapore</option>
                  <option value="Germany">Germany</option>
                </select>
              </div>
            </div>
          </div>

          {/* 3. Address & Address Format */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-rose-500" />
              <span>Organization Address & PDF Format</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Street 1 / Address Line 1
                  </label>
                  <input
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="Chintalarayudu1"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Street 2 / Address Line 2
                  </label>
                  <input
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="Taraka Ramanagar 3rd line, Siri nilayam."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Guntur"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      State / Province
                    </label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="Andhra Pradesh"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Zip / Postal Code
                    </label>
                    <input
                      type="text"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      placeholder="522006"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Fax Number
                  </label>
                  <input
                    type="text"
                    value={faxNumber}
                    onChange={(e) => setFaxNumber(e.target.value)}
                    placeholder="Optional Fax Number"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>

              {/* Address Format Template Box */}
              <div className="space-y-2 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center justify-between">
                  <span>Organization Address Format</span>
                  <span className="text-[10px] text-slate-400 font-normal">PDF Placeholder Layout</span>
                </label>
                <textarea
                  value={addressFormat}
                  onChange={(e) => setAddressFormat(e.target.value)}
                  rows={8}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-mono text-xs text-slate-800 dark:text-slate-200"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    '${Organization.Name}',
                    '${Organization.AddressLine1}',
                    '${Organization.City}',
                    '${Organization.ZipCode}',
                    '${Company ID}',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setAddressFormat((prev) => prev + '\n' + chip)}
                      className="text-[10px] bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 px-2 py-0.5 rounded font-mono cursor-pointer"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Website & Payment Stub Address Option */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
              Website & Payment Stub Address
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Website URL
                </label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://sensestudiosdesign.com"
                  className="w-full md:w-1/2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <label className="block font-bold text-slate-800 dark:text-slate-200">
                  Would you like to add a different address for payment stubs?
                </label>
                <div className="flex items-center space-x-6 text-xs font-bold">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hasDifferentPaymentStubAddress"
                      checked={!hasDifferentPaymentStubAddress}
                      onChange={() => setHasDifferentPaymentStubAddress(false)}
                      className="text-blue-600"
                    />
                    <span>No</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hasDifferentPaymentStubAddress"
                      checked={hasDifferentPaymentStubAddress}
                      onChange={() => setHasDifferentPaymentStubAddress(true)}
                      className="text-blue-600"
                    />
                    <span>Yes</span>
                  </label>
                </div>

                {hasDifferentPaymentStubAddress && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 mt-3">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                      Payment Stub Address
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Stub Address Line 1"
                        value={stubAddressLine1}
                        onChange={(e) => setStubAddressLine1(e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="Stub Address Line 2"
                        value={stubAddressLine2}
                        onChange={(e) => setStubAddressLine2(e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="City"
                        value={stubCity}
                        onChange={(e) => setStubCity(e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="State / Province"
                        value={stubState}
                        onChange={(e) => setStubState(e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="Zip Code"
                        value={stubZipCode}
                        onChange={(e) => setStubZipCode(e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="Country"
                        value={stubCountry}
                        onChange={(e) => setStubCountry(e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 5. Primary Contact & Emails Are Sent Through */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center space-x-2">
              <Mail className="w-4 h-4 text-purple-500" />
              <span>Primary Contact & Email Delivery Configuration</span>
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Primary Contact *
                  </label>
                  <input
                    type="text"
                    value={primaryContactName}
                    onChange={(e) => setPrimaryContactName(e.target.value)}
                    required
                    placeholder="Sender Chintalarayudu1"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-900 dark:text-slate-100"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">({primaryContactEmail})</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Emails Are Sent Through
                  </label>
                  <select
                    value={emailsSentThrough}
                    onChange={(e) => setEmailsSentThrough(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-800 dark:text-slate-200"
                  >
                    <option value="message-service@sender.zoho-books.in">
                      Email address of Zoho Books (message-service@sender.zoho-books.in)
                    </option>
                    <option value="custom-domain-smtp">
                      Custom Domain SMTP Server
                    </option>
                  </select>
                </div>
              </div>

              {/* Public Domain Email Notice Banner */}
              <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-4 rounded-xl flex items-start space-x-3 text-amber-800 dark:text-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold leading-relaxed">
                    Your primary contact's email address belongs to a public domain. So, emails will be sent from <strong className="font-extrabold underline">{emailsSentThrough}</strong> to prevent them from landing in the Spam folder.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 6. Base Currency, Fiscal Year, Report Basis, Languages, Timezone, Date Format */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
              Regional, Fiscal & Language Settings
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Base Currency *
                </label>
                <select
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-800 dark:text-slate-200"
                >
                  <option value="INR - Indian Rupee (₹)">INR - Indian Rupee (₹)</option>
                  <option value="USD - US Dollar ($)">USD - US Dollar ($)</option>
                  <option value="EUR - Euro (€)">EUR - Euro (€)</option>
                  <option value="GBP - British Pound (£)">GBP - British Pound (£)</option>
                  <option value="AED - UAE Dirham (AED)">AED - UAE Dirham (AED)</option>
                  <option value="CAD - Canadian Dollar ($)">CAD - Canadian Dollar ($)</option>
                  <option value="AUD - Australian Dollar ($)">AUD - Australian Dollar ($)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Fiscal Year *
                </label>
                <select
                  value={fiscalYear}
                  onChange={(e) => setFiscalYear(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-800 dark:text-slate-200"
                >
                  <option value="April - March">April - March</option>
                  <option value="January - December">January - December</option>
                  <option value="October - September">October - September</option>
                  <option value="July - June">July - June</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Date Format
                </label>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold font-mono text-slate-800 dark:text-slate-200"
                >
                  <option value="dd/MM/yyyy">dd/MM/yyyy (e.g. 27/07/2026)</option>
                  <option value="MM/dd/yyyy">MM/dd/yyyy (e.g. 07/27/2026)</option>
                  <option value="yyyy-MM-dd">yyyy-MM-dd (e.g. 2026-07-27)</option>
                  <option value="dd-MMM-yyyy">dd-MMM-yyyy (e.g. 27-Jul-2026)</option>
                </select>
              </div>
            </div>

            {/* Report Basis Options */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <label className="block font-bold text-slate-800 dark:text-slate-200">
                Report Basis
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label
                  onClick={() => setReportBasis('Accrual')}
                  className={`p-3.5 rounded-xl border flex items-center space-x-3 cursor-pointer transition-all ${
                    reportBasis === 'Accrual'
                      ? 'bg-blue-50/80 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-100 font-bold'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportBasis"
                    checked={reportBasis === 'Accrual'}
                    onChange={() => setReportBasis('Accrual')}
                    className="text-blue-600"
                  />
                  <div>
                    <div className="font-extrabold text-xs">Accrual Basis</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                      You owe tax as of invoice date
                    </div>
                  </div>
                </label>

                <label
                  onClick={() => setReportBasis('Cash')}
                  className={`p-3.5 rounded-xl border flex items-center space-x-3 cursor-pointer transition-all ${
                    reportBasis === 'Cash'
                      ? 'bg-blue-50/80 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-100 font-bold'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportBasis"
                    checked={reportBasis === 'Cash'}
                    onChange={() => setReportBasis('Cash')}
                    className="text-blue-600"
                  />
                  <div>
                    <div className="font-extrabold text-xs">Cash Basis</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                      You owe tax upon payment receipt
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Organization Language
                </label>
                <select
                  value={organizationLanguage}
                  onChange={(e) => setOrganizationLanguage(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-800 dark:text-slate-200"
                >
                  <option value="English">English</option>
                  <option value="English (UK)">English (UK)</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Time Zone
                </label>
                <select
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-semibold text-slate-800 dark:text-slate-200"
                >
                  <option value="(GMT +05:30) India Standard Time (Asia/Kolkata)">
                    (GMT +05:30) India Standard Time (Asia/Kolkata)
                  </option>
                  <option value="(GMT -07:00) Pacific Time (US & Canada)">
                    (GMT -07:00) Pacific Time (US & Canada)
                  </option>
                  <option value="(GMT -05:00) Eastern Time (US & Canada)">
                    (GMT -05:00) Eastern Time (US & Canada)
                  </option>
                  <option value="(GMT +00:00) Greenwich Mean Time (Europe/London)">
                    (GMT +00:00) Greenwich Mean Time (Europe/London)
                  </option>
                  <option value="(GMT +04:00) Gulf Standard Time (Asia/Dubai)">
                    (GMT +04:00) Gulf Standard Time (Asia/Dubai)
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Communication Languages
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {['English', 'Hindi', 'Telugu', 'Tamil', 'Spanish'].map((lang) => {
                    const active = communicationLanguages.includes(lang);
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() =>
                          setCommunicationLanguages((prev) =>
                            active ? prev.filter((l) => l !== lang) : [...prev, lang]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          active
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {active ? '✓ ' : ''}
                        {lang}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 7. Company ID & Additional Custom Fields */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
              Company Identification & Custom Header Fields
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Company ID :
                </label>
                <input
                  type="text"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  placeholder="CIN-522006-SSD"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold font-mono text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Additional Fields Table */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 dark:text-slate-200">
                  Additional Fields
                </label>
                <button
                  type="button"
                  onClick={handleAddAdditionalField}
                  className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 text-blue-600 dark:text-blue-300 font-bold rounded-xl text-xs flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ New Field</span>
                </button>
              </div>

              {additionalFields.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] font-bold">
                      <tr>
                        <th className="p-3">Label Name</th>
                        <th className="p-3">Value</th>
                        <th className="p-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {additionalFields.map((field) => (
                        <tr key={field.id}>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) =>
                                handleUpdateAdditionalField(field.id, 'label', e.target.value)
                              }
                              placeholder="e.g. GSTIN, MSME No"
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-semibold"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={field.value}
                              onChange={(e) =>
                                handleUpdateAdditionalField(field.id, 'value', e.target.value)
                              }
                              placeholder="Value"
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-mono"
                            />
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveAdditionalField(field.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed italic">
                You can include the Company ID and additional fields in your organization address which will be displayed in your transaction PDFs. Configure this by selecting the required placeholders in your Organization Address Format.
              </p>
            </div>

            {/* Bottom Save Action */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xs transition-colors cursor-pointer text-xs"
              >
                Save Organization Profile
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Subtab 2: Branding */}
      {subTab === 'branding' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-xs space-y-7 animate-fade-in text-xs">
          {/* Top Title */}
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Branding
          </h2>

          {/* Section 1: Organization Logo */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
              Organization Logo
            </h3>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              {/* Logo Upload Box */}
              <div
                onClick={() => logoInputRef.current?.click()}
                className="w-full sm:w-72 h-28 border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 flex flex-col items-center justify-center p-4 cursor-pointer transition-all group shrink-0"
              >
                <input
                  type="file"
                  ref={logoInputRef}
                  onChange={handleLogoChange}
                  accept=".jpg,.jpeg,.png,.gif,.bmp"
                  className="hidden"
                />
                {orgLogoUrl ? (
                  <div className="relative flex flex-col items-center justify-center">
                    <img
                      src={orgLogoUrl}
                      alt="Organization Logo"
                      className="max-h-16 max-w-full object-contain rounded"
                    />
                    <span className="text-[10px] text-blue-600 font-bold mt-1 group-hover:underline">
                      Click to change
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs">
                    <Upload className="w-4 h-4 stroke-[2.5]" />
                    <span>Upload Your Organization Logo</span>
                  </div>
                )}
              </div>

              {/* Specs and Details */}
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed max-w-lg">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  This logo will be displayed in transaction PDFs and email notifications.
                </p>
                <div className="space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <p>Preferred Image Dimensions: <span className="font-normal">240 × 240 pixels @ 72 DPI</span></p>
                  <p>Supported Files: <span className="font-normal">jpg, jpeg, png, gif, bmp</span></p>
                  <p>Maximum File Size: <span className="font-normal">1MB</span></p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 my-6" />

          {/* Section 2: Appearance */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
              Appearance
            </h3>

            <div className="flex flex-wrap gap-4">
              {/* Dark Pane Card */}
              <button
                type="button"
                onClick={() => setAppearancePane('DARK PANE')}
                className={`relative w-44 rounded-xl p-2.5 border-2 transition-all cursor-pointer text-left bg-white dark:bg-slate-900 ${
                  appearancePane === 'DARK PANE'
                    ? 'border-blue-500 ring-2 ring-blue-500/10 shadow-2xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="w-full h-20 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex bg-white mb-1.5">
                  {/* Left Dark Sidebar */}
                  <div className="w-1/3 bg-[#1e222e] p-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="w-full h-1 bg-slate-600 rounded-xs" />
                      <div className="w-full h-1.5 bg-blue-500 rounded-xs" />
                      <div className="w-full h-1 bg-slate-600 rounded-xs" />
                    </div>
                    <div className="w-full h-1 bg-slate-700 rounded-xs" />
                  </div>
                  {/* Main Light Area */}
                  <div className="w-2/3 bg-slate-50 p-2 flex flex-col items-center justify-center gap-1">
                    <Moon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[9px] font-bold tracking-wider uppercase text-slate-500">
                      DARK PANE
                    </span>
                  </div>
                </div>
              </button>

              {/* Light Pane Card */}
              <button
                type="button"
                onClick={() => setAppearancePane('LIGHT PANE')}
                className={`relative w-44 rounded-xl p-2.5 border-2 transition-all cursor-pointer text-left bg-white dark:bg-slate-900 ${
                  appearancePane === 'LIGHT PANE'
                    ? 'border-blue-500 ring-2 ring-blue-500/10 shadow-2xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="w-full h-20 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex bg-white mb-1.5">
                  {/* Left Light Sidebar */}
                  <div className="w-1/3 bg-[#f3f5f8] p-1 flex flex-col justify-between border-r border-slate-200">
                    <div className="space-y-1">
                      <div className="w-full h-1 bg-slate-300 rounded-xs" />
                      <div className="w-full h-1.5 bg-blue-500 rounded-xs" />
                      <div className="w-full h-1 bg-slate-300 rounded-xs" />
                    </div>
                    <div className="w-full h-1 bg-slate-300 rounded-xs" />
                  </div>
                  {/* Main Light Area */}
                  <div className="w-2/3 bg-white p-2 flex flex-col items-center justify-center gap-1">
                    <Sun className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-[9px] font-bold tracking-wider uppercase text-slate-600">
                      LIGHT PANE
                    </span>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 my-6" />

          {/* Section 3: Accent Color */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
              Accent Color
            </h3>

            <div className="flex items-center flex-wrap gap-2.5">
              {/* Blue Swatch */}
              <button
                type="button"
                onClick={() => setAccentColor('blue')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  accentColor === 'blue'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {accentColor === 'blue' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                <span>Blue</span>
              </button>

              {/* Green Swatch */}
              <button
                type="button"
                onClick={() => setAccentColor('green')}
                className={`w-8 h-8 rounded-lg bg-emerald-500 hover:opacity-90 transition-all flex items-center justify-center text-white cursor-pointer ${
                  accentColor === 'green' ? 'ring-2 ring-emerald-500 ring-offset-2' : ''
                }`}
                title="Green Accent"
              >
                {accentColor === 'green' && <Check className="w-4 h-4 stroke-[3]" />}
              </button>

              {/* Red / Coral Swatch */}
              <button
                type="button"
                onClick={() => setAccentColor('red')}
                className={`w-8 h-8 rounded-lg bg-rose-500 hover:opacity-90 transition-all flex items-center justify-center text-white cursor-pointer ${
                  accentColor === 'red' ? 'ring-2 ring-rose-500 ring-offset-2' : ''
                }`}
                title="Red Accent"
              >
                {accentColor === 'red' && <Check className="w-4 h-4 stroke-[3]" />}
              </button>

              {/* Orange Swatch */}
              <button
                type="button"
                onClick={() => setAccentColor('orange')}
                className={`w-8 h-8 rounded-lg bg-amber-500 hover:opacity-90 transition-all flex items-center justify-center text-white cursor-pointer ${
                  accentColor === 'orange' ? 'ring-2 ring-amber-500 ring-offset-2' : ''
                }`}
                title="Orange Accent"
              >
                {accentColor === 'orange' && <Check className="w-4 h-4 stroke-[3]" />}
              </button>

              {/* Purple/Gradient Swatch */}
              <button
                type="button"
                onClick={() => setAccentColor('purple')}
                className={`w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-500 to-pink-500 hover:opacity-90 transition-all flex items-center justify-center text-white cursor-pointer ${
                  accentColor === 'purple' ? 'ring-2 ring-indigo-500 ring-offset-2' : ''
                }`}
                title="Gradient Accent"
              >
                {accentColor === 'purple' && <Check className="w-4 h-4 stroke-[3]" />}
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Note: These preferences will be applied across Zoho Finance apps, including the customer and vendor portals.
            </p>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 my-6" />

          {/* Section 4: Keep Branding Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <label className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                I'd like to keep Zoho branding for this organization
              </label>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={() => setKeepBranding(!keepBranding)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  keepBranding ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    keepBranding ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-3xl">
              Retain non-obtrusive Zoho Branding, which will be visible to your customers in places like transactional emails and PDFs.
            </p>

            <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-1">
              Notes: This option cannot be disabled in your current plan.
            </p>
          </div>

          {/* Action Bar / Save Button */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleSaveBranding}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-sm cursor-pointer active:scale-95 flex items-center gap-2 text-xs"
            >
              <Save className="w-4 h-4" />
              <span>Save Branding</span>
            </button>
          </div>
        </div>
      )}

      {/* Subtab 3: Custom Domain */}
      {subTab === 'custom-domain' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Globe className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Custom Domain & SSL Configuration</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">Custom Portal Subdomain</label>
              <input
                type="text"
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-800 dark:text-slate-200 font-bold"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">SSL Certificate Protection</span>
                <p className="text-slate-500 text-[11px]">Enforce HTTPS encryption across client transaction portals</p>
              </div>
              <input
                type="checkbox"
                checked={sslActive}
                onChange={(e) => setSslActive(e.target.checked)}
                className="w-4 h-4 text-blue-600"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  triggerSave({
                    customDomain: { domainName, sslActive, cnameVerified: true },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl transition-colors cursor-pointer"
              >
                Save Custom Domain
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 4: Locations */}
      {subTab === 'locations' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <MapPin className="w-5 h-5 text-rose-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Branch & Office Locations</h3>
          </div>

          <form onSubmit={handleAddLocation} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <input
              type="text"
              placeholder="Branch Name (e.g. Guntur HQ)"
              value={newLocName}
              onChange={(e) => setNewLocName(e.target.value)}
              required
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg"
            />
            <input
              type="text"
              placeholder="Location Code (e.g. GTR-01)"
              value={newLocCode}
              onChange={(e) => setNewLocCode(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg"
            />
            <button
              type="submit"
              className="bg-blue-600 text-white font-bold rounded-lg p-2 hover:bg-blue-700 flex items-center justify-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>Add Location</span>
            </button>
          </form>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {locations.map((loc) => (
              <div key={loc.id} className="p-3.5 flex justify-between items-center bg-white dark:bg-slate-900">
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">{loc.name} <span className="text-slate-400 font-mono">({loc.code})</span></div>
                  <div className="text-[11px] text-slate-500">{loc.address || 'No physical address recorded'}</div>
                </div>
                {loc.isDefault && (
                  <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded">
                    Primary Default
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subtab 5: AI Integration */}
      {subTab === 'ai-integration' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">AI Document Parser & Auto-Categorization</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">Enable Gemini Smart Document OCR</span>
                <p className="text-slate-500 text-[11px]">Auto-extract line items, vendor tax IDs & dates from uploaded receipts</p>
              </div>
              <input
                type="checkbox"
                checked={smartOcr}
                onChange={(e) => setSmartOcr(e.target.checked)}
                className="w-4 h-4 text-blue-600"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">AI Auto-Categorization</span>
                <p className="text-slate-500 text-[11px]">Automatically assign chart of account rules to incoming journal entries</p>
              </div>
              <input
                type="checkbox"
                checked={autoCategorize}
                onChange={(e) => setAutoCategorize(e.target.checked)}
                className="w-4 h-4 text-blue-600"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  triggerSave({
                    aiIntegration: { enabled: true, smartOcr, autoCategorize, apiKey },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl transition-colors cursor-pointer"
              >
                Save AI Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 6: Subscription */}
      {subTab === 'subscription' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Subscription & Usage Limits</h3>
          </div>

          <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-200">Current Active Plan</span>
              <span className="bg-emerald-500 text-slate-900 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                ENTERPRISE PRO
              </span>
            </div>
            <div className="text-xl font-black">Unlimited Organization Suite</div>
            <p className="text-xs text-blue-200">
              Includes full project time tracking, multi-currency invoicing, GST/tax compliance & AI OCR.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

