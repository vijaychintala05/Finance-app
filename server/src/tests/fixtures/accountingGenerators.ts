import fc from 'fast-check';

// Boundary monetary values in cents to guarantee testing tricky decimal and rounding boundaries
const MONETARY_BOUNDARY_VALUES = [
  0.01,
  0.02,
  0.05,
  0.10,
  0.33,
  0.99,
  1.00,
  33.33,
  99.99,
  100.00,
  999.99,
  10000.00,
  100000.00,
  1000000.00
];

/**
 * Arbitrary generating positive monetary amounts (in rupees with up to 2 decimal places)
 * Biased towards common boundary cents and random safe monetary numbers.
 */
export const moneyArbitrary = (min = 1, max = 500000): fc.Arbitrary<number> => {
  const boundaries = MONETARY_BOUNDARY_VALUES.filter((v) => v >= min && v <= max);
  const randomArb = fc.integer({ min: Math.round(min * 100), max: Math.round(max * 100) }).map((cents) => cents / 100);
  if (boundaries.length > 0) {
    return fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom(...boundaries) },
      { weight: 7, arbitrary: randomArb }
    );
  }
  return randomArb;
};

/**
 * Arbitrary generating quantities: positive integers and fractional decimals (e.g. 0.5, 1.25, 10)
 */
export const quantityArbitrary = (min = 1, max = 500): fc.Arbitrary<number> =>
  fc.oneof(
    { weight: 4, arbitrary: fc.constantFrom(0.5, 1, 1.5, 2, 3, 5, 7, 10, 25, 50, 100) },
    { weight: 6, arbitrary: fc.integer({ min, max }) }
  );

/**
 * Arbitrary generating only officially supported GST tax brackets: 0%, 5%, 12%, 18%, 28%
 */
export const gstRateArbitrary = (): fc.Arbitrary<number> =>
  fc.constantFrom(0, 5, 12, 18, 28);

/**
 * Arbitrary generating valid line-level discount percentages (0% to 50%)
 */
export const discountPercentArbitrary = (): fc.Arbitrary<number> =>
  fc.oneof(
    { weight: 5, arbitrary: fc.constant(0) },
    { weight: 3, arbitrary: fc.constantFrom(1, 2.5, 5, 10, 12.5, 15, 20, 25, 33.33, 50) },
    { weight: 2, arbitrary: fc.integer({ min: 1, max: 40 }) }
  );

/**
 * Arbitrary generating valid line items for sales invoices or purchase bills
 */
export const invoiceLineItemArbitrary = (): fc.Arbitrary<{
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent?: number;
}> =>
  fc.record({
    description: fc.constantFrom(
      'Commercial Plywood 18mm',
      'Teak Wood Veneer 4mm',
      'Architectural Design Consultation',
      'Modular Kitchen Hardware',
      'Acoustic Ceiling Panels',
      'LED Track Lighting Fixture'
    ),
    quantity: quantityArbitrary(1, 50),
    unitPrice: moneyArbitrary(50, 25000),
    taxRate: gstRateArbitrary(),
    discountPercent: discountPercentArbitrary(),
  });

/**
 * Arbitrary generating full multi-line invoice payloads with 1 to 10 line items
 */
export const multiLineInvoicePayloadArbitrary = (maxLines = 8): fc.Arbitrary<{
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    discountPercent?: number;
  }>;
  overallDiscountPercent: number;
}> =>
  fc.record({
    lineItems: fc.array(invoiceLineItemArbitrary(), { minLength: 1, maxLength: maxLines }),
    overallDiscountPercent: fc.constantFrom(0, 0, 0, 2, 5, 10, 15),
  });
