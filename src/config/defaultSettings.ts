import { FirmSettings } from '../types';

/**
 * Presentation-only defaults. No tenant identity, tax registration, plan,
 * integration, workflow, credential, or financial data belongs in this object.
 */
export function createSafeDefaultSettings(): FirmSettings {
  return {
    firmName: '',
    firmEmail: '',
    firmPhone: '',
    firmAddress: '',
    taxId: '',
    currencySymbol: '',
    currencyCode: '',
    defaultTaxRate: 0,
    fiscalYearStart: 'January',
    logoText: '',
    userPreferences: {
      theme: 'Light',
      language: 'English',
      dateFormat: 'YYYY-MM-DD',
      timezone: 'UTC',
      currencyFormat: '1,234,567.89',
    },
    orgProfileDetails: {
      organizationName: '',
      industry: '',
      locationCountry: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zipCode: '',
      phone: '',
      faxNumber: '',
      websiteUrl: '',
      hasDifferentPaymentStubAddress: false,
      primaryContactName: '',
      primaryContactEmail: '',
      emailsSentThrough: '',
      baseCurrency: '',
      fiscalYear: '',
      reportBasis: 'Accrual',
      organizationLanguage: 'English',
      communicationLanguages: ['English'],
      timeZone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      companyId: '',
      addressFormat: '',
      additionalFields: [],
    },
  };
}
